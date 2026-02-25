import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function getAccessToken(supabase: any): Promise<string | null> {
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
  return accessToken;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { call_id, sdp_answer, action } = await req.json();

    if (!call_id) {
      return new Response(JSON.stringify({ error: 'call_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    const accessToken = await getAccessToken(supabase);
    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'WhatsApp access token not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const phoneNumberId = call.phone_number_id;
    const whatsappCallId = call.whatsapp_call_id;
    const metaUrl = `https://graph.facebook.com/v20.0/${phoneNumberId}/calls`;

    const requestedAction = action || 'pre_accept';

    // ═══════════════════════════════════════════
    //  PRE_ACCEPT — CAS: ringing -> pre_accepting
    // ═══════════════════════════════════════════
    if (requestedAction === 'pre_accept') {
      if (!sdp_answer) {
        return new Response(JSON.stringify({ error: 'sdp_answer required for pre_accept' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (call.status !== 'ringing') {
        console.log(`[pre_accept] Call ${call_id} already ${call.status}, skipping`);
        return new Response(JSON.stringify({ success: true, step: 'pre_accept', skipped: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Atomically claim: ringing -> pre_accepting
      const { data: claimed } = await supabase
        .from('whatsapp_calls')
        .update({ status: 'pre_accepting' })
        .eq('id', call_id)
        .eq('status', 'ringing')
        .select('id')
        .maybeSingle();

      if (!claimed) {
        console.log(`[pre_accept] Call ${call_id} (wa:${whatsappCallId}) — CAS lost, another instance won`);
        return new Response(JSON.stringify({ success: true, step: 'pre_accept', skipped: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`[pre_accept] Call ${call_id} (wa:${whatsappCallId}) — CAS claimed, sending to Meta`);
      const preAcceptRes = await fetch(metaUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          call_id: whatsappCallId,
          action: 'pre_accept',
          session: { sdp_type: 'answer', sdp: sdp_answer },
        }),
      });

      const preAcceptBody = await preAcceptRes.text();
      console.log(`[pre_accept] Meta response: ${preAcceptRes.status} ${preAcceptBody}`);

      if (!preAcceptRes.ok) {
        // Revert status on failure
        await supabase
          .from('whatsapp_calls')
          .update({ status: 'ringing' })
          .eq('id', call_id);

        return new Response(JSON.stringify({ error: 'pre_accept failed', details: preAcceptBody }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true, step: 'pre_accept', skipped: false }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ═══════════════════════════════════════════
    //  ACCEPT — CAS: pre_accepting -> accepting
    // ═══════════════════════════════════════════
    if (requestedAction === 'accept') {
      // CAS: only proceed if status is pre_accepting
      const { data: claimed } = await supabase
        .from('whatsapp_calls')
        .update({ status: 'accepting' })
        .eq('id', call_id)
        .eq('status', 'pre_accepting')
        .select('id')
        .maybeSingle();

      if (!claimed) {
        console.log(`[accept] Call ${call_id} (wa:${whatsappCallId}) — CAS lost (status: ${call.status}), skipping`);
        return new Response(JSON.stringify({ success: true, step: 'accept', skipped: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const acceptSdp = sdp_answer || 'v=0\r\no=- 0 0 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\n';
      console.log(`[accept] Call ${call_id} (wa:${whatsappCallId}) — CAS claimed, sending to Meta (SDP len: ${acceptSdp.length}, has media: ${acceptSdp.includes('m=audio')})`);

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
          session: { sdp_type: 'answer', sdp: acceptSdp },
        }),
      });

      const acceptBody = await acceptRes.text();
      console.log(`[accept] Meta response: ${acceptRes.status} ${acceptBody}`);

      if (!acceptRes.ok) {
        console.warn(`[accept] Meta returned ${acceptRes.status}: ${acceptBody} — non-fatal, updating DB anyway`);
      }

      // Update to answered
      await supabase
        .from('whatsapp_calls')
        .update({
          status: 'answered',
          answered_at: new Date().toISOString(),
        })
        .eq('id', call_id);

      return new Response(JSON.stringify({ success: true, step: 'accept', skipped: false }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action. Use pre_accept or accept.' }), {
      status: 400,
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
