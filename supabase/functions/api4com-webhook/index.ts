import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Health check endpoint (GET request)
  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({ 
        status: 'ok', 
        service: 'api4com-webhook',
        timestamp: new Date().toISOString() 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await req.json();
    
    console.log('[api4com-webhook] Received webhook:', JSON.stringify(body, null, 2));

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Normalize event type - API4Com may use different naming conventions
    const eventType = (body.event || body.type || body.Event || body.status || 'unknown').toLowerCase();
    
    // Extract call ID - API4Com may use different field names
    const callId = body.call_id || body.id || body.uniqueid || body.channel_id || 
                   body.CallId || body.callId || body.linkedid;
    
    // Extract additional fields
    const extension = body.extension || body.Extension || body.channel || body.caller_id_num;
    const destination = body.destination || body.phone || body.called_number || body.Destination;
    
    console.log('[api4com-webhook] Processing event:', { 
      eventType, 
      callId, 
      extension, 
      destination,
      rawBody: body 
    });

    // Map various event types to our status
    const eventMapping: Record<string, string> = {
      // Hangup events
      'channel-hangup': 'hangup',
      'hangup': 'hangup',
      'call-ended': 'hangup',
      'callended': 'hangup',
      'end': 'hangup',
      'disconnected': 'hangup',
      // Answer events
      'channel-answer': 'answered',
      'answer': 'answered',
      'answered': 'answered',
      'connected': 'answered',
      'bridge': 'answered',
      // Ringing events
      'channel-ringing': 'ringing',
      'ringing': 'ringing',
      'ring': 'ringing',
      'alerting': 'ringing',
      // Dialing events
      'dial': 'dialing',
      'dialing': 'dialing',
      'originate': 'dialing',
      'progress': 'dialing',
    };

    const normalizedEvent = eventMapping[eventType] || eventType;

    if (normalizedEvent === 'hangup') {
      // Call ended - update call log
      const duration = body.duration || body.billsec || body.call_duration || 0;
      const hangupCause = body.hangup_cause || body.cause || body.disposition || 'normal';
      const recordUrl = body.record_url || body.recording_url || body.recordingurl || null;
      const answeredAt = body.answered_at || body.answer_time || null;

      // Determine final status
      let status = 'completed';
      if (hangupCause === 'no_answer' || hangupCause === 'NO ANSWER') {
        status = 'no_answer';
      } else if (hangupCause === 'busy' || hangupCause === 'BUSY') {
        status = 'busy';
      } else if (hangupCause === 'failed' || hangupCause === 'FAILED') {
        status = 'failed';
      } else if (duration > 0) {
        status = 'completed';
      }

      // Try to find and update the call log
      if (callId) {
        const { data: existingLog, error: findError } = await supabase
          .from('call_logs')
          .select('id')
          .eq('api4com_call_id', callId)
          .maybeSingle();

        if (existingLog) {
          const { error: updateError } = await supabase
            .from('call_logs')
            .update({
              status: status,
              ended_at: new Date().toISOString(),
              answered_at: answeredAt ? new Date(answeredAt).toISOString() : null,
              duration_seconds: duration,
              hangup_cause: hangupCause,
              record_url: recordUrl,
              metadata: {
                webhook_data: body,
                updated_at: new Date().toISOString(),
              }
            })
            .eq('api4com_call_id', callId);

          if (updateError) {
            console.error('[api4com-webhook] Update error:', updateError);
          } else {
            console.log('[api4com-webhook] Call log updated:', { callId, status, duration });
          }
        } else {
          console.log('[api4com-webhook] No matching call log found for:', callId);
        }
      }
    } else if (normalizedEvent === 'answered') {
      // Call answered - update status
      if (callId) {
        const { error: updateError } = await supabase
          .from('call_logs')
          .update({
            status: 'answered',
            answered_at: new Date().toISOString(),
            metadata: {
              webhook_data: body,
              answered_at_source: new Date().toISOString(),
            }
          })
          .eq('api4com_call_id', callId);

        if (updateError) {
          console.error('[api4com-webhook] Answer update error:', updateError);
        } else {
          console.log('[api4com-webhook] Call marked as answered:', callId);
        }
      }
    } else if (normalizedEvent === 'ringing') {
      // Call ringing - update status
      if (callId) {
        const { error: updateError } = await supabase
          .from('call_logs')
          .update({ 
            status: 'ringing',
            metadata: {
              webhook_data: body,
              ringing_at: new Date().toISOString(),
            }
          })
          .eq('api4com_call_id', callId);
        
        if (updateError) {
          console.error('[api4com-webhook] Ringing update error:', updateError);
        } else {
          console.log('[api4com-webhook] Call marked as ringing:', callId);
        }
      }
    } else if (normalizedEvent === 'dialing') {
      // Dialing event - update status if exists
      if (callId) {
        const { error: updateError } = await supabase
          .from('call_logs')
          .update({ 
            status: 'dialing',
            metadata: {
              webhook_data: body,
              dialing_at: new Date().toISOString(),
            }
          })
          .eq('api4com_call_id', callId);
        
        if (!updateError) {
          console.log('[api4com-webhook] Call marked as dialing:', callId);
        }
      }
    } else {
      // Log unhandled event types for future reference
      console.log('[api4com-webhook] Unhandled event type:', { 
        eventType, 
        normalizedEvent,
        callId,
        body 
      });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Webhook processed',
        event: normalizedEvent,
        callId 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[api4com-webhook] Error:', error);
    // Return 200 to avoid webhook retries
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
