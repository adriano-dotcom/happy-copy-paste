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
    const { call_id } = await req.json();

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

    // Get access token
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

    if (accessToken && call.phone_number_id && call.whatsapp_call_id) {
      const metaUrl = `https://graph.facebook.com/v20.0/${call.phone_number_id}/calls`;
      const res = await fetch(metaUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          call_id: call.whatsapp_call_id,
          action: 'terminate',
        }),
      });
      const resBody = await res.text();
      console.log(`Terminate response: ${res.status} ${resBody}`);
    }

    const endedAt = new Date().toISOString();
    let durationSeconds: number | null = null;
    if (call.answered_at) {
      durationSeconds = Math.round(
        (new Date(endedAt).getTime() - new Date(call.answered_at).getTime()) / 1000
      );
    }

    await supabase
      .from('whatsapp_calls')
      .update({
        status: 'ended',
        ended_at: endedAt,
        duration_seconds: durationSeconds,
        hangup_cause: 'local_hangup',
      })
      .eq('id', call_id);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Terminate call error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
