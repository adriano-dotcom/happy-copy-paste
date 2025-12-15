import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-zapier-key',
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
  console.log('[zapier-leadgen-webhook] Received request:', req.method);
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validar API Key
    const zapierKey = req.headers.get('x-zapier-key');
    const expectedKey = Deno.env.get('ZAPIER_LEADGEN_KEY');
    
    if (!expectedKey) {
      console.error('[zapier-leadgen-webhook] ZAPIER_LEADGEN_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Webhook not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (zapierKey !== expectedKey) {
      console.error('[zapier-leadgen-webhook] Invalid API key');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse payload
    const payload = await req.json();
    console.log('[zapier-leadgen-webhook] Payload:', JSON.stringify(payload));
    
    const { 
      name, phone, email, company, city, state,
      utm_source, utm_campaign, utm_content, utm_term 
    } = payload;
    
    // Validar campos obrigatórios
    if (!name || !phone) {
      console.error('[zapier-leadgen-webhook] Missing required fields: name or phone');
      return new Response(
        JSON.stringify({ error: 'Missing required fields: name and phone are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Normalizar telefone
    const normalizedPhone = normalizePhone(phone);
    console.log('[zapier-leadgen-webhook] Normalized phone:', normalizedPhone);
    
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
      console.error('[zapier-leadgen-webhook] Error searching contact:', searchError);
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
      console.log('[zapier-leadgen-webhook] Updating existing contact:', existingContact.id);
      
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
        console.error('[zapier-leadgen-webhook] Error updating contact:', updateError);
        throw updateError;
      }
      
      contactId = existingContact.id;
      action = 'updated';
      
    } else {
      // Criar novo contato
      console.log('[zapier-leadgen-webhook] Creating new contact');
      
      const { data: newContact, error: insertError } = await supabase
        .from('contacts')
        .insert({
          name,
          phone_number: normalizedPhone,
          email: email || null,
          company: company || null,
          city: finalCity,
          state: finalState,
          lead_source: 'facebook',
          utm_source: utm_source || null,
          utm_campaign: utm_campaign || null,
          utm_content: utm_content || null,
          utm_term: utm_term || null,
          first_contact_date: new Date().toISOString(),
          last_activity: new Date().toISOString(),
        })
        .select('id')
        .single();
      
      if (insertError) {
        console.error('[zapier-leadgen-webhook] Error creating contact:', insertError);
        throw insertError;
      }
      
      contactId = newContact.id;
      action = 'created';
      
      console.log('[zapier-leadgen-webhook] Contact created with ID:', contactId);
      // Deal será criado automaticamente pelo trigger create_deal_for_new_contact
    }
    
    console.log('[zapier-leadgen-webhook] Success:', { contactId, action });
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        contact_id: contactId, 
        action,
        phone: normalizedPhone
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
    
  } catch (error: unknown) {
    console.error('[zapier-leadgen-webhook] Unexpected error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
