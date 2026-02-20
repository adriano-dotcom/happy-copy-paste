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
    // GET: Webhook verification from Meta
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const mode = url.searchParams.get('hub.mode');
      const token = url.searchParams.get('hub.verify_token');
      const challenge = url.searchParams.get('hub.challenge');

      // Get verify token from settings
      const { data: settings } = await supabase
        .from('nina_settings')
        .select('whatsapp_verify_token')
        .limit(1)
        .single();

      const verifyToken = settings?.whatsapp_verify_token || 'viver-de-ia-nina-webhook';

      if (mode === 'subscribe' && token === verifyToken) {
        console.log('Webhook verified for calls');
        return new Response(challenge, { status: 200, headers: corsHeaders });
      }

      return new Response('Forbidden', { status: 403, headers: corsHeaders });
    }

    // POST: Process call events from Meta
    if (req.method === 'POST') {
      const body = await req.json();
      console.log('Call webhook received:', JSON.stringify(body).substring(0, 500));

      const entries = body?.entry || [];
      for (const entry of entries) {
        const changes = entry?.changes || [];
        for (const change of changes) {
          const calls = change?.value?.calls || [];
          const phoneNumberId = change?.value?.metadata?.phone_number_id;

          for (const call of calls) {
            const callId = call.id;
            const fromNumber = call.from;
            const callType = call.type; // "connect" or "terminate"
            const sdp = call.session?.sdp;
            const sdpType = call.session?.sdp_type;
            const callDirection = call.direction; // "BUSINESS_INITIATED" for outbound

            console.log(`Call event: type=${callType}, id=${callId}, from=${fromNumber}, direction=${callDirection}`);

            if (callType === 'connect') {
              // Check if this is a business-initiated (outbound) call response
              if (callDirection === 'BUSINESS_INITIATED') {
                // Outbound call: Meta is sending back the SDP answer from the lead
                console.log(`Outbound call response: id=${callId}, updating with SDP answer`);

                const { data: existingCall } = await supabase
                  .from('whatsapp_calls')
                  .select('id, status')
                  .eq('whatsapp_call_id', callId)
                  .limit(1)
                  .maybeSingle();

                if (existingCall) {
                  await supabase
                    .from('whatsapp_calls')
                    .update({
                      status: 'ringing',
                      sdp_answer: sdp,
                      metadata: { sdp_type: sdpType, direction: callDirection },
                    })
                    .eq('id', existingCall.id);

                  console.log(`Outbound call ${callId} updated with SDP answer, status=ringing`);
                } else {
                  console.warn(`Outbound call ${callId} not found in DB for connect event`);
                }
              } else {
                // Inbound call: create new record (existing behavior)
                const normalizedPhone = fromNumber?.replace(/\D/g, '');
                let contactId: string | null = null;
                let conversationId: string | null = null;

                if (normalizedPhone) {
                  const { data: contact } = await supabase
                    .from('contacts')
                    .select('id')
                    .or(`phone_number.eq.${normalizedPhone},phone_number.eq.+${normalizedPhone}`)
                    .limit(1)
                    .maybeSingle();

                  if (contact) {
                    contactId = contact.id;
                    const { data: conv } = await supabase
                      .from('conversations')
                      .select('id')
                      .eq('contact_id', contact.id)
                      .eq('is_active', true)
                      .order('last_message_at', { ascending: false })
                      .limit(1)
                      .maybeSingle();

                    if (conv) conversationId = conv.id;
                  }
                }

                const { error: insertError } = await supabase
                  .from('whatsapp_calls')
                  .insert({
                    whatsapp_call_id: callId,
                    contact_id: contactId,
                    conversation_id: conversationId,
                    direction: 'inbound',
                    status: 'ringing',
                    phone_number_id: phoneNumberId,
                    from_number: fromNumber,
                    sdp_offer: sdp,
                    metadata: { sdp_type: sdpType },
                  });

                if (insertError) {
                  console.error('Error inserting call:', insertError);
                } else {
                  console.log(`Call ${callId} created with status=ringing`);
                }
              }
            } else if (callType === 'terminate') {
              // Update call status
              const { data: existingCall } = await supabase
                .from('whatsapp_calls')
                .select('id, status, started_at, answered_at')
                .eq('whatsapp_call_id', callId)
                .limit(1)
                .maybeSingle();

              if (existingCall) {
                const newStatus = existingCall.status === 'answered' ? 'ended' : 'missed';
                const endedAt = new Date().toISOString();
                let durationSeconds: number | null = null;

                if (existingCall.answered_at) {
                  durationSeconds = Math.round(
                    (new Date(endedAt).getTime() - new Date(existingCall.answered_at).getTime()) / 1000
                  );
                }

                await supabase
                  .from('whatsapp_calls')
                  .update({
                    status: newStatus,
                    ended_at: endedAt,
                    duration_seconds: durationSeconds,
                    hangup_cause: call.reason || 'caller_hangup',
                  })
                  .eq('id', existingCall.id);

                console.log(`Call ${callId} updated to status=${newStatus}`);
              } else {
                console.log(`Call ${callId} not found for terminate event`);
              }
            }
          }
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  } catch (error) {
    console.error('Call webhook error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 200, // Always return 200 to Meta to prevent retries
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
