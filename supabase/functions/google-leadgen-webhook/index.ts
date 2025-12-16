import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-google-key',
};

// Mapa DDD → Cidade/Estado
const dddMap: Record<string, { city: string; state: string }> = {
  "11": { city: "São Paulo", state: "SP" },
  "21": { city: "Rio de Janeiro", state: "RJ" },
  "31": { city: "Belo Horizonte", state: "MG" },
  "41": { city: "Curitiba", state: "PR" },
  "43": { city: "Londrina", state: "PR" },
  "44": { city: "Maringá", state: "PR" },
  "45": { city: "Foz do Iguaçu", state: "PR" },
  "46": { city: "Francisco Beltrão", state: "PR" },
  "47": { city: "Joinville", state: "SC" },
  "48": { city: "Florianópolis", state: "SC" },
  "49": { city: "Chapecó", state: "SC" },
  "51": { city: "Porto Alegre", state: "RS" },
  "61": { city: "Brasília", state: "DF" },
  "62": { city: "Goiânia", state: "GO" },
  "71": { city: "Salvador", state: "BA" },
  "81": { city: "Recife", state: "PE" },
  "85": { city: "Fortaleza", state: "CE" },
};

function getRegionFromDDD(phoneNumber: string): { city: string; state: string } | null {
  const digits = phoneNumber.replace(/\D/g, '');
  let ddd = '';
  
  if (digits.startsWith('55') && digits.length >= 4) {
    ddd = digits.substring(2, 4);
  } else if (digits.length >= 2) {
    ddd = digits.substring(0, 2);
  }
  
  return dddMap[ddd] || null;
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  
  if (digits.startsWith('55')) {
    return digits;
  }
  
  return '55' + digits;
}

serve(async (req) => {
  console.log('[google-leadgen-webhook] Received request:', req.method);
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validar API Key (diferente do Facebook)
    const googleKey = req.headers.get('x-google-key');
    const expectedKey = Deno.env.get('GOOGLE_LEADGEN_KEY');
    
    if (!expectedKey) {
      console.error('[google-leadgen-webhook] GOOGLE_LEADGEN_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Webhook not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (googleKey !== expectedKey) {
      console.error('[google-leadgen-webhook] Invalid API key');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse payload
    const payload = await req.json();
    console.log('[google-leadgen-webhook] Payload:', JSON.stringify(payload));
    
    const { 
      name, phone, email, company, city, state,
      utm_source, utm_campaign, utm_content, utm_term,
      template_name // Optional: template to send, defaults to google_lead_template setting
    } = payload;
    
    // Validar campos obrigatórios
    if (!name || !phone) {
      console.error('[google-leadgen-webhook] Missing required fields: name or phone');
      return new Response(
        JSON.stringify({ error: 'Missing required fields: name and phone are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Normalizar telefone
    const normalizedPhone = normalizePhone(phone);
    console.log('[google-leadgen-webhook] Normalized phone:', normalizedPhone);
    
    // Inicializar Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Verificar se contato já existe
    const { data: existingContact, error: searchError } = await supabase
      .from('contacts')
      .select('id, name, email, company')
      .eq('phone_number', normalizedPhone)
      .maybeSingle();
    
    if (searchError) {
      console.error('[google-leadgen-webhook] Error searching contact:', searchError);
      throw searchError;
    }
    
    let contactId: string;
    let action: 'created' | 'updated';
    
    // Inferir região do DDD se não fornecida
    const region = getRegionFromDDD(normalizedPhone);
    const finalCity = city || region?.city || null;
    const finalState = state || region?.state || null;
    
    if (existingContact) {
      // Atualizar contato existente
      console.log('[google-leadgen-webhook] Updating existing contact:', existingContact.id);
      
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      
      // Só atualiza campos que estão vazios ou se vieram novos dados
      if (email && !existingContact.email) updateData.email = email;
      if (company && !existingContact.company) updateData.company = company;
      if (finalCity) updateData.city = finalCity;
      if (finalState) updateData.state = finalState;
      if (utm_source) updateData.utm_source = utm_source;
      if (utm_campaign) updateData.utm_campaign = utm_campaign;
      if (utm_content) updateData.utm_content = utm_content;
      if (utm_term) updateData.utm_term = utm_term;
      
      const { error: updateError } = await supabase
        .from('contacts')
        .update(updateData)
        .eq('id', existingContact.id);
      
      if (updateError) {
        console.error('[google-leadgen-webhook] Error updating contact:', updateError);
        throw updateError;
      }
      
      contactId = existingContact.id;
      action = 'updated';
      
    } else {
      // Criar novo contato com lead_source: 'google'
      console.log('[google-leadgen-webhook] Creating new contact');
      
      const { data: newContact, error: insertError } = await supabase
        .from('contacts')
        .insert({
          name,
          phone_number: normalizedPhone,
          email: email || null,
          company: company || null,
          city: finalCity,
          state: finalState,
          lead_source: 'google', // ← DIFERENÇA: lead_source é 'google'
          utm_source: utm_source || 'google',
          utm_campaign: utm_campaign || null,
          utm_content: utm_content || null,
          utm_term: utm_term || null,
          first_contact_date: new Date().toISOString(),
          last_activity: new Date().toISOString(),
        })
        .select('id')
        .single();
      
      if (insertError) {
        console.error('[google-leadgen-webhook] Error creating contact:', insertError);
        throw insertError;
      }
      
      contactId = newContact.id;
      action = 'created';
      
      console.log('[google-leadgen-webhook] Contact created with ID:', contactId);
      // Deal será criado automaticamente pelo trigger create_deal_for_new_contact
    }
    
    // ========================================
    // AUTOMAÇÃO: Criar conversa e enviar template WhatsApp
    // ========================================
    
    let conversationId: string | null = null;
    let templateSent = false;
    
    try {
      // Buscar configurações (incluindo template do Google e email)
      const { data: settings } = await supabase
        .from('nina_settings')
        .select('google_lead_template, google_lead_email_template')
        .single();
      
      // Buscar agente Adri (default agent)
      const { data: adri, error: adriError } = await supabase
        .from('agents')
        .select('id')
        .eq('is_default', true)
        .eq('is_active', true)
        .single();
      
      if (adriError || !adri) {
        console.error('[google-leadgen-webhook] Could not find default agent:', adriError);
      } else {
        console.log('[google-leadgen-webhook] Found Adri agent:', adri.id);
        
        // Verificar se já existe conversa ativa para este contato
        const { data: existingConversations } = await supabase
          .from('conversations')
          .select('id')
          .eq('contact_id', contactId)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1);
        
        if (existingConversations && existingConversations.length > 0) {
          // Usar conversa existente
          conversationId = existingConversations[0].id;
          console.log('[google-leadgen-webhook] Using existing conversation:', conversationId);
        } else {
          // Criar nova conversa apenas se não existir
          const { data: conversation, error: convError } = await supabase
            .from('conversations')
            .insert({
              contact_id: contactId,
              status: 'nina',
              is_active: true,
              current_agent_id: adri.id,
              metadata: { 
                origin: 'google_landing_page', // ← DIFERENÇA: origin é 'google_landing_page'
                utm_source: utm_source || 'google',
                utm_campaign: utm_campaign || null
              },
              last_message_at: new Date().toISOString(),
              started_at: new Date().toISOString()
            })
            .select('id')
            .single();
          
          if (convError) {
            console.error('[google-leadgen-webhook] Error creating conversation:', convError);
          } else {
            conversationId = conversation.id;
            console.log('[google-leadgen-webhook] Conversation created:', conversationId);
          }
        }
        
        // Só enviar template se temos conversationId
        if (conversationId) {
          
          // Usar template do payload > configuração do banco > fallback padrão
          const selectedTemplate = template_name || settings?.google_lead_template || 'lead_google_ads';
          const firstName = name.split(' ')[0];
          
          console.log('[google-leadgen-webhook] Sending WhatsApp template:', selectedTemplate);
          
          // Invocar send-whatsapp-template edge function
          const templateResponse = await fetch(
            `${supabaseUrl}/functions/v1/send-whatsapp-template`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`
              },
              body: JSON.stringify({
                contact_id: contactId,
                conversation_id: conversationId,
                template_name: selectedTemplate,
                header_variables: [firstName], // Nome no HEADER do template
                variables: [], // Sem variáveis no BODY
                language: 'pt_BR'
              })
            }
          );
          
          if (templateResponse.ok) {
            templateSent = true;
            console.log('[google-leadgen-webhook] WhatsApp template sent successfully');
          } else {
            const errorText = await templateResponse.text();
            console.error('[google-leadgen-webhook] Error sending template:', errorText);
          }
        }
      }
      
      // ========================================
      // AUTOMAÇÃO 2: Enviar Email (se configurado e lead tem email)
      // ========================================
      let emailSent = false;
      
      if (email && settings?.google_lead_email_template) {
        try {
          console.log('[google-leadgen-webhook] Email template configured, fetching...');
          
          // Buscar template de email
          const { data: emailTemplate, error: emailTemplateError } = await supabase
            .from('email_templates')
            .select('subject, body_html')
            .eq('id', settings.google_lead_email_template)
            .single();
          
          if (emailTemplateError) {
            console.error('[google-leadgen-webhook] Error fetching email template:', emailTemplateError);
          } else if (emailTemplate) {
            // Substituir variáveis no template
            const firstName = name.split(' ')[0];
            const processedSubject = emailTemplate.subject
              .replace(/\{\{nome\}\}/gi, firstName)
              .replace(/\{\{empresa\}\}/gi, company || '');
            const processedBody = emailTemplate.body_html
              .replace(/\{\{nome\}\}/gi, firstName)
              .replace(/\{\{empresa\}\}/gi, company || '');
            
            // Assinatura profissional completa
            const emailSignature = `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
  <tr>
    <td style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.7;">
      <p style="margin: 0 0 12px 0; font-weight: 500; color: #475569;">Atenciosamente,</p>
      <strong style="font-size: 15px; color: #1e293b; display: block;">Adriano Jacometo</strong>
      <span style="color: #64748b; display: block; margin-bottom: 4px;">Corretor de Seguros</span>
      <strong style="color: #334155; display: block; margin-bottom: 16px;">Jacometo Corretora de Seguros</strong>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📱 WhatsApp: <a href="https://wa.me/5543991434002" style="color: #25D366; text-decoration: none;">+55 43 9 9143 4002</a></span>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📞 Telefone: (43) 3321‑5007</span>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📍 Rua Souza Naves, 612 – Sala 51 – Centro – Londrina/PR</span>
      <span style="display: block; margin-top: 10px;">🌐 <a href="https://jacometoseguros.com.br" style="color: #6366f1; text-decoration: none;">jacometoseguros.com.br</a></span>
    </td>
  </tr>
</table>`;
            
            const finalBody = processedBody + emailSignature;
            
            console.log('[google-leadgen-webhook] Sending email to:', email);
            
            // Enviar email via send-email edge function
            const emailResponse = await fetch(
              `${supabaseUrl}/functions/v1/send-email`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${supabaseKey}`
                },
                body: JSON.stringify({
                  to: email,
                  subject: processedSubject,
                  html: finalBody,
                  bcc: ['adriano@jacometo.com.br']
                })
              }
            );
            
            if (emailResponse.ok) {
              emailSent = true;
              console.log('[google-leadgen-webhook] Email sent successfully to:', email);
            } else {
              const errorText = await emailResponse.text();
              console.error('[google-leadgen-webhook] Error sending email:', errorText);
            }
          }
        } catch (emailError) {
          console.error('[google-leadgen-webhook] Email automation error:', emailError);
          // Não falha a requisição principal, apenas loga o erro
        }
      } else {
        console.log('[google-leadgen-webhook] Email not sent:', {
          hasEmail: !!email,
          hasEmailTemplate: !!settings?.google_lead_email_template
        });
      }
      
      console.log('[google-leadgen-webhook] Success:', { contactId, action, conversationId, templateSent, emailSent });
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          contact_id: contactId, 
          action,
          phone: normalizedPhone,
          conversation_id: conversationId,
          template_sent: templateSent,
          email_sent: emailSent
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
      
    } catch (autoError) {
      console.error('[google-leadgen-webhook] Automation error:', autoError);
      // Retorna sucesso parcial mesmo com erro na automação
      return new Response(
        JSON.stringify({ 
          success: true, 
          contact_id: contactId, 
          action,
          phone: normalizedPhone,
          conversation_id: conversationId,
          template_sent: templateSent,
          automation_error: true
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
  } catch (error: unknown) {
    console.error('[google-leadgen-webhook] Unexpected error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
