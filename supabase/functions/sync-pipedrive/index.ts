import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PipedriveSettings {
  pipedrive_enabled: boolean;
  pipedrive_api_token: string;
  pipedrive_domain: string;
  pipedrive_default_pipeline_id: string;
  pipedrive_field_mappings: {
    person_fields: Record<string, string>;
    deal_fields: Record<string, string>;
    custom_fields: any[];
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { dealId } = await req.json();
    
    if (!dealId) {
      console.error('[sync-pipedrive] Missing dealId');
      return new Response(
        JSON.stringify({ error: 'dealId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[sync-pipedrive] Starting sync for deal: ${dealId}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch Pipedrive settings
    const { data: settings, error: settingsError } = await supabase
      .from('nina_settings')
      .select('pipedrive_enabled, pipedrive_api_token, pipedrive_domain, pipedrive_default_pipeline_id, pipedrive_field_mappings')
      .single();

    if (settingsError) {
      console.error('[sync-pipedrive] Error fetching settings:', settingsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch settings', details: settingsError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const pipedriveSettings = settings as PipedriveSettings;

    // Check if Pipedrive is enabled
    if (!pipedriveSettings.pipedrive_enabled) {
      console.log('[sync-pipedrive] Pipedrive integration is disabled');
      return new Response(
        JSON.stringify({ success: false, message: 'Pipedrive integration is disabled' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate Pipedrive credentials
    if (!pipedriveSettings.pipedrive_api_token || !pipedriveSettings.pipedrive_domain) {
      console.error('[sync-pipedrive] Missing Pipedrive credentials');
      return new Response(
        JSON.stringify({ error: 'Pipedrive API token and domain are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch deal with contact data
    const { data: deal, error: dealError } = await supabase
      .from('deals')
      .select(`
        *,
        contact:contacts(*)
      `)
      .eq('id', dealId)
      .single();

    if (dealError || !deal) {
      console.error('[sync-pipedrive] Error fetching deal:', dealError);
      return new Response(
        JSON.stringify({ error: 'Deal not found', details: dealError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if deal is already synced
    if (deal.pipedrive_deal_id) {
      console.log(`[sync-pipedrive] Deal already synced with Pipedrive ID: ${deal.pipedrive_deal_id}`);
      return new Response(
        JSON.stringify({ success: true, message: 'Deal already synced', pipedrive_deal_id: deal.pipedrive_deal_id }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const contact = deal.contact;
    const fieldMappings = pipedriveSettings.pipedrive_field_mappings || {
      person_fields: { name: 'name', phone_number: 'phone', email: 'email', company: 'org_name' },
      deal_fields: { title: 'title', value: 'value', notes: 'notes' },
      custom_fields: []
    };

    const apiToken = pipedriveSettings.pipedrive_api_token;
    const domain = pipedriveSettings.pipedrive_domain;
    const baseUrl = `https://${domain}.pipedrive.com/api/v1`;

    let pipedrivePersonId = contact?.pipedrive_person_id;

    // Create or find person in Pipedrive
    if (!pipedrivePersonId && contact) {
      console.log('[sync-pipedrive] Creating person in Pipedrive...');
      
      // Build person data based on field mappings
      const personData: Record<string, any> = {};
      
      // Map standard fields
      if (contact.name || contact.call_name) {
        personData.name = contact.name || contact.call_name || 'Sem nome';
      } else {
        personData.name = 'Sem nome';
      }
      
      if (contact.phone_number) {
        personData.phone = [{ value: contact.phone_number, primary: true }];
      }
      
      if (contact.email) {
        personData.email = [{ value: contact.email, primary: true }];
      }

      // Map CNPJ to custom field if configured
      if (fieldMappings.person_fields?.cnpj && contact.cnpj) {
        const cnpjFieldKey = fieldMappings.person_fields.cnpj;
        personData[cnpjFieldKey] = contact.cnpj;
        console.log(`[sync-pipedrive] Mapping CNPJ ${contact.cnpj} to field ${cnpjFieldKey}`);
      }

      console.log('[sync-pipedrive] Person data:', JSON.stringify(personData));

      const personResponse = await fetch(`${baseUrl}/persons?api_token=${apiToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(personData)
      });

      const personResult = await personResponse.json();
      
      if (!personResponse.ok || !personResult.success) {
        console.error('[sync-pipedrive] Error creating person:', personResult);
        return new Response(
          JSON.stringify({ error: 'Failed to create person in Pipedrive', details: personResult }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      pipedrivePersonId = personResult.data.id.toString();
      console.log(`[sync-pipedrive] Person created with ID: ${pipedrivePersonId}`);

      // Update contact with Pipedrive person ID
      if (contact?.id) {
        await supabase
          .from('contacts')
          .update({ pipedrive_person_id: pipedrivePersonId })
          .eq('id', contact.id);
      }
    }

    // Create deal in Pipedrive
    console.log('[sync-pipedrive] Creating deal in Pipedrive...');
    
    const dealData: Record<string, any> = {
      title: deal.title || 'Novo Negócio',
      person_id: pipedrivePersonId ? parseInt(pipedrivePersonId) : undefined,
    };

    // Add value if present
    if (deal.value) {
      dealData.value = deal.value;
      dealData.currency = 'BRL';
    }

    // Add pipeline if configured
    if (pipedriveSettings.pipedrive_default_pipeline_id) {
      dealData.pipeline_id = parseInt(pipedriveSettings.pipedrive_default_pipeline_id);
    }

    console.log('[sync-pipedrive] Deal data:', JSON.stringify(dealData));

    const dealResponse = await fetch(`${baseUrl}/deals?api_token=${apiToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dealData)
    });

    const dealResult = await dealResponse.json();

    if (!dealResponse.ok || !dealResult.success) {
      console.error('[sync-pipedrive] Error creating deal:', dealResult);
      return new Response(
        JSON.stringify({ error: 'Failed to create deal in Pipedrive', details: dealResult }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const pipedriveDealId = dealResult.data.id.toString();
    console.log(`[sync-pipedrive] Deal created with ID: ${pipedriveDealId}`);

    // Update deal with Pipedrive ID
    await supabase
      .from('deals')
      .update({ pipedrive_deal_id: pipedriveDealId })
      .eq('id', dealId);

    // Add note with qualification data if available
    if (contact?.client_memory) {
      const memory = contact.client_memory;
      let noteContent = '📋 **Dados de Qualificação (Nina AI)**\n\n';
      
      if (memory.lead_profile) {
        const profile = memory.lead_profile;
        if (profile.qualification_score) noteContent += `🎯 Score: ${profile.qualification_score}/100\n`;
        if (profile.lead_stage) noteContent += `📊 Estágio: ${profile.lead_stage}\n`;
        if (profile.interests?.length) noteContent += `💡 Interesses: ${profile.interests.join(', ')}\n`;
        if (profile.products_discussed?.length) noteContent += `📦 Produtos: ${profile.products_discussed.join(', ')}\n`;
      }
      
      if (memory.sales_intelligence) {
        const sales = memory.sales_intelligence;
        if (sales.pain_points?.length) noteContent += `⚠️ Objeções: ${sales.pain_points.join(', ')}\n`;
        if (sales.budget_indication !== 'unknown') noteContent += `💰 Budget: ${sales.budget_indication}\n`;
      }

      if (noteContent.length > 50) {
        await fetch(`${baseUrl}/notes?api_token=${apiToken}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deal_id: parseInt(pipedriveDealId),
            content: noteContent
          })
        });
        console.log('[sync-pipedrive] Added qualification note to deal');
      }
    }

    console.log(`[sync-pipedrive] Successfully synced deal ${dealId} -> Pipedrive ${pipedriveDealId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Deal synced successfully',
        pipedrive_deal_id: pipedriveDealId,
        pipedrive_person_id: pipedrivePersonId
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[sync-pipedrive] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
