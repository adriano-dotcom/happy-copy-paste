import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get WhatsApp settings
    const { data: settings, error: settingsError } = await supabase
      .from('nina_settings')
      .select('whatsapp_access_token, whatsapp_phone_number_id, whatsapp_waba_id')
      .single();

    if (settingsError || !settings) {
      throw new Error('Failed to load WhatsApp settings');
    }

    if (!settings.whatsapp_access_token) {
      throw new Error('WhatsApp Access Token não configurado');
    }

    // Use WABA ID from settings
    const wabaId = settings.whatsapp_waba_id;

    if (!wabaId) {
      throw new Error('WABA ID não configurado. Vá em Configurações → APIs → WhatsApp e preencha o WABA ID. Encontre-o no Meta Business Manager → Contas → WhatsApp Business.');
    }

    console.log(`Syncing templates for WABA ID: ${wabaId}`);

    // Fetch templates from Meta API
    const templatesResponse = await fetch(
      `https://graph.facebook.com/v21.0/${wabaId}/message_templates?fields=id,name,language,status,category,components`,
      {
        headers: {
          'Authorization': `Bearer ${settings.whatsapp_access_token}`,
        },
      }
    );

    if (!templatesResponse.ok) {
      const errorText = await templatesResponse.text();
      console.error('Error fetching templates:', errorText);
      throw new Error(`Failed to fetch templates: ${templatesResponse.status}`);
    }

    const templatesData = await templatesResponse.json();
    const templates = templatesData.data || [];

    console.log(`Found ${templates.length} templates from Meta`);

    let synced = 0;
    let updated = 0;
    let errors = 0;

    for (const template of templates) {
      try {
        // Count variables in body component
        let variablesCount = 0;
        const bodyComponent = template.components?.find((c: any) => c.type === 'BODY');
        if (bodyComponent?.text) {
          const matches = bodyComponent.text.match(/\{\{\d+\}\}/g);
          variablesCount = matches ? matches.length : 0;
        }

        // Upsert template
        const { error: upsertError } = await supabase
          .from('whatsapp_templates')
          .upsert({
            meta_template_id: template.id,
            name: template.name,
            language: template.language,
            status: template.status,
            category: template.category,
            components: template.components || [],
            variables_count: variablesCount,
            last_synced_at: new Date().toISOString(),
          }, {
            onConflict: 'meta_template_id',
          });

        if (upsertError) {
          console.error(`Error upserting template ${template.name}:`, upsertError);
          errors++;
        } else {
          synced++;
        }
      } catch (err) {
        console.error(`Error processing template ${template.name}:`, err);
        errors++;
      }
    }

    // Mark templates not in Meta as disabled
    const metaTemplateIds = templates.map((t: any) => t.id);
    if (metaTemplateIds.length > 0) {
      const { data: localTemplates } = await supabase
        .from('whatsapp_templates')
        .select('meta_template_id')
        .not('meta_template_id', 'in', `(${metaTemplateIds.join(',')})`);

      if (localTemplates && localTemplates.length > 0) {
        for (const local of localTemplates) {
          await supabase
            .from('whatsapp_templates')
            .update({ status: 'DISABLED', last_synced_at: new Date().toISOString() })
            .eq('meta_template_id', local.meta_template_id);
          updated++;
        }
      }
    }

    console.log(`Sync complete: ${synced} synced, ${updated} disabled, ${errors} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        synced,
        updated,
        errors,
        total: templates.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in sync-whatsapp-templates:', error);
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
