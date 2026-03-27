import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendTemplateRequest {
  contact_id: string;
  conversation_id: string;
  template_name: string;
  language?: string;
  variables?: string[]; // Variables for body component
  header_variables?: string[]; // Variables for header (if any)
  is_prospecting?: boolean; // Flag to mark as active prospecting
}

function normalizeFirstName(fullName: string | null | undefined): string {
  if (!fullName) return '';
  const firstName = fullName.trim().split(/\s+/)[0];
  if (firstName.length < 3) return firstName;
  return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
}

function countExpectedParamsFromText(text?: string | null): number {
  if (!text) return 0;
  // WhatsApp templates use placeholders like {{1}}, {{2}}...
  const matches = [...text.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])).filter((n) => Number.isFinite(n));
  return matches.length ? Math.max(...matches) : 0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body: SendTemplateRequest = await req.json();
    const { contact_id, conversation_id, template_name, language = 'pt_BR', variables = [], header_variables = [], is_prospecting = false } = body;

    console.log(`Sending template ${template_name} to contact ${contact_id} (prospecting: ${is_prospecting})`);

    // Get WhatsApp settings
    const { data: settings, error: settingsError } = await supabase
      .from('nina_settings')
      .select('whatsapp_access_token, whatsapp_phone_number_id, whatsapp_token_in_vault')
      .single();

    if (settingsError || !settings) {
      throw new Error('Failed to load WhatsApp settings');
    }

    // Get access token from Vault or fallback to table
    let accessToken = settings.whatsapp_access_token;
    if (settings.whatsapp_token_in_vault) {
      try {
        const { data: vaultToken } = await supabase.rpc('get_vault_secret', { 
          secret_name: 'vault_whatsapp_token' 
        });
        if (vaultToken) {
          accessToken = vaultToken;
          console.log('Usando WhatsApp token do Vault');
        }
      } catch (e) {
        console.log('Falha ao buscar do Vault, usando tabela');
      }
    }

    if (!accessToken || !settings.whatsapp_phone_number_id) {
      throw new Error('WhatsApp não configurado');
    }

    // Get contact phone number and blocked status
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('phone_number, name, is_blocked, blocked_reason')
      .eq('id', contact_id)
      .single();

    if (contactError || !contact) {
      throw new Error('Contact not found');
    }

    // Skip blocked contacts (e.g. no WhatsApp on number)
    if (contact.is_blocked) {
      console.log(`[SendTemplate] Skipping blocked contact ${contact_id}: ${contact.blocked_reason}`);
      return new Response(
        JSON.stringify({ success: false, skipped: true, reason: contact.blocked_reason || 'contact_blocked' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Compute normalized first name for this contact
    const contactFirstName = normalizeFirstName(contact.name);
    const fullContactName = (contact.name || '').trim();

    // Get template details from local DB
    const { data: template, error: templateError } = await supabase
      .from('whatsapp_templates')
      .select('*')
      .eq('name', template_name)
      .eq('language', language)
      .eq('status', 'APPROVED')
      .single();

    if (templateError || !template) {
      throw new Error(`Template ${template_name} não encontrado ou não aprovado`);
    }

    // Clean phone number (remove non-digits)
    const phoneNumber = contact.phone_number.replace(/\D/g, '');

    // Infer expected parameter counts from template definition
    const tplHeaderComponent = template.components?.find((c: any) => c.type === 'HEADER');
    const tplBodyComponent = template.components?.find((c: any) => c.type === 'BODY');

    const headerExpected = countExpectedParamsFromText(tplHeaderComponent?.text);
    const bodyExpected = countExpectedParamsFromText(tplBodyComponent?.text);

    // Heuristic: if template expects header params but body expects none, treat provided `variables`
    // as header variables (common in prospecting templates).
    let effectiveHeaderVars = header_variables;
    let effectiveBodyVars = variables;

    if (headerExpected > 0 && bodyExpected === 0 && effectiveHeaderVars.length === 0 && effectiveBodyVars.length > 0) {
      effectiveHeaderVars = effectiveBodyVars;
      effectiveBodyVars = [];
    }

    // Auto-normalize: if any variable equals the full contact name (case-insensitive), replace with first name
    const normalizeIfContactName = (v: string): string => {
      if (fullContactName && v.trim().toLowerCase() === fullContactName.toLowerCase()) {
        return contactFirstName;
      }
      return v;
    };
    effectiveHeaderVars = effectiveHeaderVars.map(normalizeIfContactName);
    effectiveBodyVars = effectiveBodyVars.map(normalizeIfContactName);

    // Truncate header variables to respect WhatsApp's 60-char limit (fixed text + params)
    if (headerExpected > 0 && tplHeaderComponent?.text && effectiveHeaderVars.length > 0) {
      const fixedHeaderText = tplHeaderComponent.text.replace(/\{\{\d+\}\}/g, '');
      const maxVarLength = Math.max(0, 60 - fixedHeaderText.length);
      effectiveHeaderVars = effectiveHeaderVars.map((v) =>
        v.length > maxVarLength ? v.substring(0, maxVarLength).trim() : v
      );
      console.log(`Header var truncation: fixed="${fixedHeaderText}" (${fixedHeaderText.length}), maxVar=${maxVarLength}`);
    }

    // Build components array for the API
    const components: any[] = [];

    if (headerExpected > 0) {
      if (effectiveHeaderVars.length !== headerExpected) {
        throw new Error(`Template ${template_name} exige ${headerExpected} variável(is) no HEADER, mas recebeu ${effectiveHeaderVars.length}.`);
      }
      components.push({
        type: 'header',
        parameters: effectiveHeaderVars.map((v) => ({ type: 'text', text: v }))
      });
    }

    if (bodyExpected > 0) {
      if (effectiveBodyVars.length !== bodyExpected) {
        throw new Error(`Template ${template_name} exige ${bodyExpected} variável(is) no BODY, mas recebeu ${effectiveBodyVars.length}.`);
      }
      components.push({
        type: 'body',
        parameters: effectiveBodyVars.map((v) => ({ type: 'text', text: v }))
      });
    }

    // Build the WhatsApp API payload
    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phoneNumber,
      type: 'template',
      template: {
        name: template_name,
        language: {
          code: language
        }
      }
    };

    // Only add components if we have any
    if (components.length > 0) {
      payload.template.components = components;
    }

    console.log('Sending WhatsApp template:', JSON.stringify(payload, null, 2));

    // Send via WhatsApp Cloud API
    const waResponse = await fetch(
      `https://graph.facebook.com/v21.0/${settings.whatsapp_phone_number_id}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    const waData = await waResponse.json();

    if (!waResponse.ok) {
      console.error('WhatsApp API error:', JSON.stringify(waData));
      console.error('Payload that failed:', JSON.stringify(payload));
      
      const errorCode = waData.error?.code;
      const is131049 = Number(errorCode) === 131049;

      // Auto-block contact on error 131026 (number has no WhatsApp)
      if (Number(errorCode) === 131026) {
        console.log(`[SendTemplate] Error 131026 — marking contact ${contact_id} as blocked`);
        await supabase
          .from('contacts')
          .update({
            is_blocked: true,
            blocked_reason: 'whatsapp_not_found_131026',
            blocked_at: new Date().toISOString()
          })
          .eq('id', contact_id);
      }

      // Track 131049 in whatsapp_metrics
      if (is131049) {
        console.log(`[SendTemplate] Error 131049 (healthy ecosystem) for contact ${contact_id}`);
        try {
          await supabase
            .from('whatsapp_metrics')
            .upsert({
              phone_number_id: settings.whatsapp_phone_number_id,
              metric_date: new Date().toISOString().split('T')[0],
              metric_hour: new Date().getHours(),
              error_131049_count: 1
            }, {
              onConflict: 'phone_number_id,metric_date,metric_hour'
            });
        } catch (metricsErr) {
          console.log('[SendTemplate] Failed to update 131049 metrics:', metricsErr);
        }
      }
      
      // Return error as 200 so frontend can handle gracefully
      const errorMessage = waData.error?.message || 'Failed to send template';
      const errorDetail = waData.error?.error_data?.details || '';
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMessage,
          error_detail: errorDetail,
          error_code: errorCode,
          phone: phoneNumber,
          is_rate_limited: is131049
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('WhatsApp API response:', waData);

    // Get template body text for message content
    const templateBodyComponent = template.components?.find((c: any) => c.type === 'BODY');
    let messageContent = templateBodyComponent?.text || `[Template: ${template_name}]`;

    // Replace variables in content for display (BODY vars)
    effectiveBodyVars.forEach((v, i) => {
      messageContent = messageContent.replace(`{{${i + 1}}}`, v);
    });

    // Record the message in the database
    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert({
        conversation_id,
        content: messageContent,
        from_type: 'nina',
        type: 'text',
        status: 'sent',
        whatsapp_message_id: waData.messages?.[0]?.id,
        metadata: {
          is_template: true,
          template_name,
          template_language: language,
          variables: effectiveBodyVars,
          header_variables: effectiveHeaderVars,
          is_prospecting
        }
      })
      .select()
      .single();

    if (messageError) {
      console.error('Error recording message:', messageError);
      // Don't fail the request, message was sent
    }

    // If this is a prospecting template, mark conversation and create/update deal
    if (is_prospecting) {
      console.log('Marking conversation as prospecting...');
      
      // Get Atlas agent
      const { data: atlasAgent } = await supabase
        .from('agents')
        .select('id')
        .eq('slug', 'atlas')
        .single();

      // Get prospecting pipeline and "Template Enviado" stage
      const { data: prospectingPipeline } = await supabase
        .from('pipelines')
        .select('id')
        .eq('slug', 'prospeccao')
        .single();

      if (prospectingPipeline) {
        const { data: templateSentStage } = await supabase
          .from('pipeline_stages')
          .select('id')
          .eq('pipeline_id', prospectingPipeline.id)
          .eq('title', 'Template Enviado')
          .single();

        // Update conversation with prospecting metadata and Atlas agent
        // CRITICAL: Set status to 'nina' to keep AI agent active (not open to human)
        await supabase
          .from('conversations')
          .update({
            status: 'nina',
            current_agent_id: atlasAgent?.id || null,
            metadata: {
              origin: 'prospeccao',
              agent_slug: 'atlas',
              template_sent: template_name,
              template_sent_at: new Date().toISOString()
            }
          })
          .eq('id', conversation_id);

        // Update contact status to 'prospecting' (only if still 'new')
        await supabase
          .from('contacts')
          .update({ lead_status: 'prospecting' })
          .eq('id', contact_id)
          .eq('lead_status', 'new');
        console.log('Updated contact lead_status to prospecting (if was new)');

        // Check if deal exists for this contact, if not create one
        const { data: existingDeal } = await supabase
          .from('deals')
          .select('id')
          .eq('contact_id', contact_id)
          .maybeSingle();

        if (!existingDeal && templateSentStage) {
          // Create new deal in prospecting pipeline
          await supabase
            .from('deals')
            .insert({
              contact_id,
              title: contact.name || 'Lead Prospecção',
              stage_id: templateSentStage.id,
              pipeline_id: prospectingPipeline.id,
              priority: 'medium'
            });
          console.log('Created deal in Prospecção pipeline - Template Enviado stage');
        } else if (existingDeal && templateSentStage) {
          // Update existing deal to Template Enviado stage
          await supabase
            .from('deals')
            .update({
              stage_id: templateSentStage.id,
              pipeline_id: prospectingPipeline.id
            })
            .eq('id', existingDeal.id);
          console.log('Updated deal to Template Enviado stage');
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        whatsapp_message_id: waData.messages?.[0]?.id,
        message_id: message?.id,
        content: messageContent
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in send-whatsapp-template:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
