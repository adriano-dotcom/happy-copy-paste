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

interface Message {
  content: string | null;
  from_type: string;
  sent_at: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Create or find an Organization in Pipedrive
async function getOrCreateOrganization(
  baseUrl: string,
  apiToken: string,
  companyName: string,
  contact: any
): Promise<number | null> {
  try {
    // Search for existing organization by name
    console.log('[sync-pipedrive] Searching for organization:', companyName);
    const searchResponse = await fetch(
      `${baseUrl}/organizations/search?term=${encodeURIComponent(companyName)}&limit=1&api_token=${apiToken}`
    );

    if (searchResponse.ok) {
      const searchResult = await searchResponse.json();
      if (searchResult.data?.items?.length > 0) {
        const existingOrgId = searchResult.data.items[0].item.id;
        console.log('[sync-pipedrive] Found existing organization:', existingOrgId);
        return existingOrgId;
      }
    }

    // Create new organization
    console.log('[sync-pipedrive] Creating new organization:', companyName);
    const address = [contact.street, contact.number, contact.complement, contact.neighborhood, contact.city, contact.state]
      .filter(Boolean).join(', ');

    const orgData: Record<string, any> = { name: companyName };
    if (address) orgData.address = address;

    const createResponse = await fetch(
      `${baseUrl}/organizations?api_token=${apiToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orgData),
      }
    );

    const createResult = await createResponse.json();
    if (createResult.success) {
      console.log('[sync-pipedrive] Organization created with ID:', createResult.data.id);
      return createResult.data.id;
    } else {
      console.warn('[sync-pipedrive] Failed to create organization:', createResult);
      return null;
    }
  } catch (error) {
    console.error('[sync-pipedrive] Error with organization:', error);
    return null;
  }
}

// Get or create a Lead Label in Pipedrive
async function getOrCreateLeadLabel(
  baseUrl: string,
  apiToken: string,
  labelName: string
): Promise<string | null> {
  try {
    console.log('[sync-pipedrive] Searching for lead label:', labelName);
    const listResponse = await fetch(
      `${baseUrl}/leadLabels?api_token=${apiToken}`
    );

    if (listResponse.ok) {
      const listResult = await listResponse.json();
      const existing = listResult.data?.find((l: any) => l.name === labelName);
      if (existing) {
        console.log('[sync-pipedrive] Found existing lead label:', existing.id);
        return existing.id;
      }
    }

    console.log('[sync-pipedrive] Creating lead label:', labelName);
    const createResponse = await fetch(
      `${baseUrl}/leadLabels?api_token=${apiToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: labelName, color: 'blue' }),
      }
    );

    const createResult = await createResponse.json();
    if (createResult.success) {
      console.log('[sync-pipedrive] Lead label created:', createResult.data.id);
      return createResult.data.id;
    }

    console.warn('[sync-pipedrive] Failed to create lead label:', createResult);
    return null;
  } catch (error) {
    console.error('[sync-pipedrive] Error with lead label:', error);
    return null;
  }
}

// Create a Lead in Pipedrive linked to a Person (and optionally Organization)
async function createPipedriveLead(
  baseUrl: string,
  apiToken: string,
  title: string,
  personId: number,
  organizationId: number | null
): Promise<{ id: string } | null> {
  try {
    console.log('[sync-pipedrive] Creating lead in Pipedrive for person:', personId);

    const labelId = await getOrCreateLeadLabel(baseUrl, apiToken, 'Leads Campanha Iris');

    const leadData: Record<string, any> = {
      title,
      person_id: personId,
    };

    if (labelId) {
      leadData.label_ids = [labelId];
    }

    if (organizationId) {
      leadData.organization_id = organizationId;
    }

    const response = await fetch(
      `${baseUrl}/leads?api_token=${apiToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leadData),
      }
    );

    const result = await response.json();

    if (result.success) {
      console.log('[sync-pipedrive] Lead created with ID:', result.data.id);
      return { id: result.data.id };
    } else {
      console.warn('[sync-pipedrive] Failed to create lead:', result);
      return null;
    }
  } catch (error) {
    console.error('[sync-pipedrive] Error creating lead:', error);
    return null;
  }
}

// Create a Note in Pipedrive linked to a Person
async function createPipedriveNote(
  baseUrl: string, 
  apiToken: string, 
  personId: string, 
  content: string
): Promise<boolean> {
  try {
    console.log('[sync-pipedrive] Checking for existing recent notes for person:', personId);
    
    const existingNotesResponse = await fetch(
      `${baseUrl}/notes?person_id=${personId}&api_token=${apiToken}&limit=10`
    );
    
    if (existingNotesResponse.ok) {
      const existingNotes = await existingNotesResponse.json();
      const oneHourAgo = Date.now() - 3600000;
      
      const hasRecentNote = existingNotes.data?.some((note: any) => {
        const noteTime = new Date(note.add_time).getTime();
        return noteTime > oneHourAgo;
      });
      
      if (hasRecentNote) {
        console.log('[sync-pipedrive] Recent note already exists, skipping note creation');
        return false;
      }
    }
    
    console.log('[sync-pipedrive] Creating note in Pipedrive...');
    
    const noteData = {
      content: content,
      person_id: parseInt(personId),
      pinned_to_person_flag: 1
    };
    
    const noteResponse = await fetch(
      `${baseUrl}/notes?api_token=${apiToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(noteData),
      }
    );
    
    const noteResult = await noteResponse.json();
    
    if (noteResult.success) {
      console.log('[sync-pipedrive] Note created with ID:', noteResult.data.id);
      return true;
    } else {
      console.warn('[sync-pipedrive] Failed to create note:', noteResult);
      return false;
    }
  } catch (error) {
    console.error('[sync-pipedrive] Error creating note:', error);
    return false;
  }
}

// Generate summary using Lovable AI Gateway
async function generateSummary(
  messages: Message[], 
  contactName: string | null, 
  agentName: string | null
): Promise<string> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) {
    console.log('[sync-pipedrive] No LOVABLE_API_KEY, skipping auto-summary');
    return '';
  }

  const conversationText = messages
    .filter(m => m.content)
    .map(m => {
      const role = m.from_type === 'user' ? (contactName || 'Cliente') : 
                   m.from_type === 'nina' ? (agentName || 'Agente') : 'Operador';
      return `${role}: ${m.content}`;
    })
    .join('\n');

  if (!conversationText.trim()) {
    return '';
  }

  const systemPrompt = `Você é um assistente que gera resumos de conversas de vendas B2B.

REGRAS:
1. Seja CONCISO - máximo 150 palavras total
2. Use formato estruturado com seções
3. Foque em informações actionables para vendas
4. Não invente informações não mencionadas

FORMATO DO RESUMO:
📌 SITUAÇÃO
[Contexto geral do lead - quem é, o que busca - 1-2 linhas]

🎯 NECESSIDADES  
[O que o cliente precisa/quer - 1-2 linhas]

📋 DADOS COLETADOS
[Lista de informações já obtidas: CNPJ, carga, estados, etc]

⏭️ PRÓXIMOS PASSOS
[O que precisa ser feito - 1-2 linhas]

💡 OBSERVAÇÕES
[Detalhes relevantes, tom do cliente, urgência - se houver]`;

  try {
    console.log('[sync-pipedrive] Calling AI Gateway for summary generation...');
    
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Gere um resumo desta conversa entre ${agentName || 'Agente'} e ${contactName || 'Cliente'}:\n\n${conversationText}` }
        ],
        max_tokens: 500
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[sync-pipedrive] AI API error:', response.status, errorText);
      return '';
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content || '';
    console.log('[sync-pipedrive] Summary generated, length:', summary.length);
    return summary;
  } catch (error) {
    console.error('[sync-pipedrive] Error generating summary:', error);
    return '';
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { contactId, dealId, notes, pipedriveTag, conversationId, forceRegenerateSummary } = await req.json();
    
    if (!contactId) {
      throw new Error('contactId is required');
    }

    console.log('[sync-pipedrive] Starting sync for contact:', contactId, 'with tag:', pipedriveTag);

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

    // Generate summary if contact has no notes (or force regenerate) and we have a conversation
    let contactNotes = contact.notes;
    
    if ((!contactNotes || forceRegenerateSummary) && conversationId) {
      console.log('[sync-pipedrive] Generating summary...', { forceRegenerate: forceRegenerateSummary, hasExisting: !!contactNotes });
      
      const { data: conversation } = await supabase
        .from('conversations')
        .select('current_agent_id, agents:current_agent_id(name)')
        .eq('id', conversationId)
        .single();
      
      const agentName = (conversation?.agents as any)?.name || 'Agente';
      
      const { data: messages } = await supabase
        .from('messages')
        .select('content, from_type, sent_at')
        .eq('conversation_id', conversationId)
        .order('sent_at', { ascending: true })
        .limit(50);
      
      if (messages && messages.length > 0) {
        const generatedSummary = await generateSummary(
          messages as Message[], 
          contact.name || contact.call_name, 
          agentName
        );
        
        if (generatedSummary) {
          console.log('[sync-pipedrive] Summary generated successfully');
          contactNotes = generatedSummary;
          
          await supabase
            .from('contacts')
            .update({ notes: generatedSummary })
            .eq('id', contactId);
        }
      }
    }

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

    // Build combined notes (operator notes + contact/generated notes)
    const combinedNotes = [
      notes,
      contactNotes ? `--- Resumo da Conversa ---\n${contactNotes}` : null
    ].filter(Boolean).join('\n\n');

    // Map system fields to Pipedrive custom fields
    const tagsValue = pipedriveTag || contact.tags?.join(', ');
    
    const systemFieldValues: Record<string, any> = {
      company: contact.company,
      cnpj: contact.cnpj,
      tags: tagsValue,
      owner: ownerName,
      city: contact.city,
      state: contact.state,
      address: [contact.street, contact.number, contact.complement, contact.neighborhood]
        .filter(Boolean).join(', '),
      cep: contact.cep,
      notes: combinedNotes || null,
    };

    // Apply field mappings
    for (const [systemField, pipedriveField] of Object.entries(fieldMappings)) {
      if (pipedriveField && systemFieldValues[systemField]) {
        personData[pipedriveField] = systemFieldValues[systemField];
        console.log(`[sync-pipedrive] Mapped ${systemField} -> ${pipedriveField}:`, systemFieldValues[systemField]);
      }
    }

    console.log('[sync-pipedrive] Notes content:', {
      hasOperatorNotes: !!notes,
      hasContactNotes: !!contactNotes,
      combinedNotesLength: combinedNotes?.length || 0,
      notesFieldMapping: fieldMappings['notes'] || 'NOT_MAPPED'
    });

    console.log('[sync-pipedrive] Person data to send:', JSON.stringify(personData));

    // === Step 1: Create/Update Organization if company exists ===
    let organizationId: number | null = null;
    if (contact.company) {
      organizationId = await getOrCreateOrganization(pipedriveBaseUrl, apiToken, contact.company, contact);
      if (organizationId) {
        personData.org_id = organizationId;
      }
    }

    // === Step 2: Create/Update Person ===
    let personId: number;
    let isNewPerson = false;

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

      personId = parseInt(contact.pipedrive_person_id);
      console.log('[sync-pipedrive] Person updated successfully');
    } else {
      // Create new person
      console.log('[sync-pipedrive] Creating new person in Pipedrive');
      isNewPerson = true;
      
      const createResponse = await fetch(
        `${pipedriveBaseUrl}/persons?api_token=${apiToken}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(personData),
        }
      );

      let createResult = await createResponse.json();

      if (!createResult.success) {
        console.error('[sync-pipedrive] Error creating person:', createResult);
        
        if (createResult.error?.includes('field')) {
          console.log('[sync-pipedrive] Retrying with basic fields only');
          
          const basicPersonData: Record<string, any> = {
            name: personData.name,
            phone: personData.phone,
            email: personData.email,
          };
          if (organizationId) basicPersonData.org_id = organizationId;

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

      personId = createResult.data.id;
      console.log('[sync-pipedrive] Person created with ID:', personId);

      // Save Pipedrive person ID to contact
      await supabase
        .from('contacts')
        .update({ pipedrive_person_id: String(personId) })
        .eq('id', contactId);
    }

    // === Step 3: Create Lead in Pipedrive ===
    let leadCreated = false;
    let leadId: string | null = null;

    const leadTitle = contact.name || contact.call_name || 'Novo Lead';
    const lead = await createPipedriveLead(
      pipedriveBaseUrl,
      apiToken,
      leadTitle,
      personId,
      organizationId,
      combinedNotes || null
    );

    if (lead) {
      leadCreated = true;
      leadId = lead.id;

      // Save lead ID to local deal if dealId provided
      if (dealId) {
        await supabase
          .from('deals')
          .update({ pipedrive_deal_id: leadId })
          .eq('id', dealId);
        console.log('[sync-pipedrive] Saved pipedrive_lead_id to deal:', dealId);
      }
    }

    // === Step 4: Create Note ===
    let noteCreated = false;
    if (combinedNotes && combinedNotes.trim()) {
      noteCreated = await createPipedriveNote(
        pipedriveBaseUrl, 
        apiToken, 
        String(personId), 
        combinedNotes
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: isNewPerson ? 'Contato, Lead e Organização enviados para Pipedrive' : 'Contato atualizado e Lead criado no Pipedrive',
        personId,
        organizationId,
        leadId,
        leadCreated,
        noteCreated
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
