import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface PipedriveSettings {
  pipedrive_api_token: string | null;
  pipedrive_domain: string | null;
  pipedrive_enabled: boolean | null;
  pipedrive_token_in_vault: boolean | null;
  pipedrive_field_mappings: {
    person_fields?: Record<string, string>;
  } | null;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { contactId, dealId } = await req.json();
    
    if (!contactId) {
      throw new Error('contactId is required');
    }

    console.log('[sync-pipedrive] Starting sync for contact:', contactId);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch Pipedrive settings
    const { data: settings, error: settingsError } = await supabase
      .from('nina_settings')
      .select('pipedrive_api_token, pipedrive_domain, pipedrive_enabled, pipedrive_token_in_vault, pipedrive_field_mappings')
      .single();

    if (settingsError) {
      console.error('[sync-pipedrive] Error fetching settings:', settingsError);
      throw new Error('Failed to fetch Pipedrive settings');
    }

    const pipedriveSettings = settings as PipedriveSettings;

    if (!pipedriveSettings.pipedrive_enabled) {
      throw new Error('Pipedrive integration is not enabled');
    }

    // Get API token (from vault or settings)
    let apiToken = pipedriveSettings.pipedrive_api_token;
    
    if (pipedriveSettings.pipedrive_token_in_vault) {
      const { data: vaultToken } = await supabase.rpc('get_vault_secret', {
        secret_name: 'PIPEDRIVE_API_TOKEN'
      });
      if (vaultToken) {
        apiToken = vaultToken;
      }
    }

    if (!apiToken || !pipedriveSettings.pipedrive_domain) {
      throw new Error('Pipedrive API token or domain not configured');
    }

    const pipedriveBaseUrl = `https://${pipedriveSettings.pipedrive_domain}.pipedrive.com/api/v1`;

    // Fetch contact data
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .single();

    if (contactError || !contact) {
      console.error('[sync-pipedrive] Error fetching contact:', contactError);
      throw new Error('Contact not found');
    }

    console.log('[sync-pipedrive] Contact data:', contact.name, contact.phone_number);

    // Fetch deal owner if dealId provided
    let ownerName: string | null = null;
    if (dealId) {
      const { data: deal } = await supabase
        .from('deals')
        .select('owner_id, owner:team_members!deals_owner_id_fkey(name)')
        .eq('id', dealId)
        .single();
      
      if (deal?.owner) {
        ownerName = (deal.owner as any).name;
        console.log('[sync-pipedrive] Deal owner:', ownerName);
      }
    }

    // Build person data with field mappings
    const fieldMappings = pipedriveSettings.pipedrive_field_mappings?.person_fields || {};
    
    const personData: Record<string, any> = {
      name: contact.name || contact.call_name || 'Sem nome',
      phone: [{ value: contact.phone_number, primary: true }],
    };

    if (contact.email) {
      personData.email = [{ value: contact.email, primary: true }];
    }

    // Map system fields to Pipedrive custom fields
    const systemFieldValues: Record<string, any> = {
      company: contact.company,
      cnpj: contact.cnpj,
      tags: contact.tags?.join(', '),
      owner: ownerName,
      city: contact.city,
      state: contact.state,
      address: [contact.street, contact.number, contact.complement, contact.neighborhood]
        .filter(Boolean).join(', '),
      cep: contact.cep,
      notes: contact.notes,
    };

    // Apply field mappings
    for (const [systemField, pipedriveField] of Object.entries(fieldMappings)) {
      if (pipedriveField && systemFieldValues[systemField]) {
        personData[pipedriveField] = systemFieldValues[systemField];
      }
    }

    console.log('[sync-pipedrive] Person data to send:', JSON.stringify(personData));

    // Check if person already exists
    if (contact.pipedrive_person_id) {
      // Update existing person
      console.log('[sync-pipedrive] Updating existing person:', contact.pipedrive_person_id);
      
      const updateResponse = await fetch(
        `${pipedriveBaseUrl}/persons/${contact.pipedrive_person_id}?api_token=${apiToken}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(personData),
        }
      );

      const updateResult = await updateResponse.json();
      
      if (!updateResult.success) {
        console.error('[sync-pipedrive] Error updating person:', updateResult);
        throw new Error(`Failed to update person: ${updateResult.error || 'Unknown error'}`);
      }

      console.log('[sync-pipedrive] Person updated successfully');
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Contato atualizado no Pipedrive',
          personId: contact.pipedrive_person_id 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create new person
    console.log('[sync-pipedrive] Creating new person in Pipedrive');
    
    const createResponse = await fetch(
      `${pipedriveBaseUrl}/persons?api_token=${apiToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(personData),
      }
    );

    const createResult = await createResponse.json();

    if (!createResult.success) {
      console.error('[sync-pipedrive] Error creating person:', createResult);
      
      // Retry without custom fields if they caused the error
      if (createResult.error?.includes('field')) {
        console.log('[sync-pipedrive] Retrying with basic fields only');
        
        const basicPersonData = {
          name: personData.name,
          phone: personData.phone,
          email: personData.email,
        };

        const retryResponse = await fetch(
          `${pipedriveBaseUrl}/persons?api_token=${apiToken}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(basicPersonData),
          }
        );

        const retryResult = await retryResponse.json();
        
        if (!retryResult.success) {
          throw new Error(`Failed to create person: ${retryResult.error || 'Unknown error'}`);
        }

        createResult.data = retryResult.data;
        console.log('[sync-pipedrive] Person created with basic fields (custom fields skipped)');
      } else {
        throw new Error(`Failed to create person: ${createResult.error || 'Unknown error'}`);
      }
    }

    const personId = createResult.data.id;
    console.log('[sync-pipedrive] Person created with ID:', personId);

    // Save Pipedrive person ID to contact
    await supabase
      .from('contacts')
      .update({ pipedrive_person_id: String(personId) })
      .eq('id', contactId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Contato enviado para Pipedrive',
        personId 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[sync-pipedrive] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
