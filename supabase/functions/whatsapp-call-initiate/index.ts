import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { contact_id, to_number, sdp_offer, conversation_id } = await req.json();

    if (!to_number || !sdp_offer) {
      return new Response(
        JSON.stringify({ error: 'to_number and sdp_offer are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get WhatsApp credentials from Vault first, then fallback to nina_settings
    const { data: settings } = await supabase
      .from('nina_settings')
      .select('whatsapp_access_token, whatsapp_phone_number_id, whatsapp_token_in_vault')
      .limit(1)
      .single();

    if (!settings) {
      throw new Error('Nina settings not found');
    }

    let accessToken = settings.whatsapp_access_token;
    const phoneNumberId = settings.whatsapp_phone_number_id;

    if (!phoneNumberId) {
      throw new Error('WhatsApp phone_number_id not configured');
    }

    // Try Vault if token is stored there
    if (settings.whatsapp_token_in_vault) {
      const { data: vaultToken } = await supabase.rpc('get_vault_secret', {
        secret_name: 'whatsapp_access_token',
      });
      if (vaultToken) accessToken = vaultToken;
    }

    if (!accessToken) {
      throw new Error('WhatsApp access token not configured');
    }

    // Format destination number (remove + and non-digits)
    const formattedNumber = to_number.replace(/\D/g, '');

    console.log(`Initiating outbound call to ${formattedNumber} via phone_number_id ${phoneNumberId}`);

    // Call Meta Graph API to initiate the call
    const metaResponse = await fetch(
      `https://graph.facebook.com/v22.0/${phoneNumberId}/calls`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: formattedNumber,
          type: 'audio',
          action: 'connect',
          session: {
            sdp: sdp_offer,
            sdp_type: 'offer',
          },
        }),
      }
    );

    const metaBody = await metaResponse.json();
    console.log('Meta API response:', JSON.stringify(metaBody).substring(0, 500));

    if (!metaResponse.ok) {
      const errorCode = metaBody?.error?.code;
      const errorMsg = metaBody?.error?.message || 'Unknown Meta API error';
      console.error(`Meta API error ${errorCode}: ${errorMsg}`);
      return new Response(
        JSON.stringify({ error: errorMsg, error_code: errorCode, meta_error: metaBody?.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const whatsappCallId = metaBody?.calls?.[0]?.id || metaBody?.id;

    // Create call record in database
    const { data: callRecord, error: insertError } = await supabase
      .from('whatsapp_calls')
      .insert({
        whatsapp_call_id: whatsappCallId,
        contact_id: contact_id || null,
        conversation_id: conversation_id || null,
        direction: 'outbound',
        status: 'calling',
        phone_number_id: phoneNumberId,
        to_number: formattedNumber,
        sdp_offer: sdp_offer,
      })
      .select('id, whatsapp_call_id')
      .single();

    if (insertError) {
      console.error('Error inserting call record:', insertError);
      throw new Error('Failed to create call record');
    }

    console.log(`Outbound call initiated: id=${callRecord.id}, whatsapp_call_id=${whatsappCallId}`);

    return new Response(
      JSON.stringify({
        success: true,
        call_id: callRecord.id,
        whatsapp_call_id: whatsappCallId,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('whatsapp-call-initiate error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
