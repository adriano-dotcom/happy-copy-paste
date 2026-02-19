import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { call_id, sdp_answer } = await req.json();

    if (!call_id || !sdp_answer) {
      return new Response(JSON.stringify({ error: 'call_id and sdp_answer required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get call record
    const { data: call, error: callError } = await supabase
      .from('whatsapp_calls')
      .select('*')
      .eq('id', call_id)
      .single();

    if (callError || !call) {
      return new Response(JSON.stringify({ error: 'Call not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get access token from vault or settings
    let accessToken: string | null = null;
    const { data: hasVault } = await supabase.rpc('has_vault_secret', { secret_name: 'whatsapp_access_token' });
    if (hasVault) {
      const { data: vaultToken } = await supabase.rpc('get_vault_secret', { secret_name: 'whatsapp_access_token' });
      accessToken = vaultToken;
    }
    if (!accessToken) {
      const { data: settings } = await supabase
        .from('nina_settings')
        .select('whatsapp_access_token')
        .limit(1)
        .single();
      accessToken = settings?.whatsapp_access_token;
    }

    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'WhatsApp access token not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const phoneNumberId = call.phone_number_id;
    const whatsappCallId = call.whatsapp_call_id;
    const sdpOffer = call.sdp_offer;
    const metaUrl = `https://graph.facebook.com/v20.0/${phoneNumberId}/calls`;

    // Step 1: Send pre_accept WITHOUT session (signals readiness)
    console.log(`Sending pre_accept for call ${whatsappCallId}`);
    const preAcceptPayload: any = {
      messaging_product: 'whatsapp',
      call_id: whatsappCallId,
      action: 'pre_accept',
    };
    const preAcceptRes = await fetch(metaUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(preAcceptPayload),
    });

    const preAcceptBody = await preAcceptRes.text();
    console.log(`pre_accept response: ${preAcceptRes.status} ${preAcceptBody}`);

    if (!preAcceptRes.ok) {
      return new Response(JSON.stringify({ error: 'pre_accept failed', details: preAcceptBody }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 2: Send accept with SDP answer
    console.log(`Sending accept for call ${whatsappCallId}`);
    const acceptRes = await fetch(metaUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        call_id: whatsappCallId,
        action: 'accept',
        session: {
          sdp_type: 'answer',
          sdp: sdp_answer,
        },
      }),
    });

    const acceptBody = await acceptRes.text();
    console.log(`accept response: ${acceptRes.status} ${acceptBody}`);

    if (!acceptRes.ok) {
      return new Response(JSON.stringify({ error: 'Failed to accept call on Meta', details: acceptBody }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update call status to answered
    await supabase
      .from('whatsapp_calls')
      .update({
        status: 'answered',
        answered_at: new Date().toISOString(),
      })
      .eq('id', call_id);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Accept call error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
