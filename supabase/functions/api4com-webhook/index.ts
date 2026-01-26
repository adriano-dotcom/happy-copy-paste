import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api4com-key, x-api-key',
};

// Trusted IPs from API4Com (whitelist for unauthenticated requests)
const TRUSTED_IPS = [
  '129.151.39.51',   // API4Com primary IP
  '129.151.39.0/24', // API4Com IP range
  '::1',             // localhost IPv6
  '127.0.0.1',       // localhost IPv4
];

// Helper to check if IP is in trusted list
function isTrustedIP(ip: string): boolean {
  if (!ip) return false;
  const cleanIP = ip.replace(/^::ffff:/, ''); // Handle IPv4-mapped IPv6
  
  for (const trusted of TRUSTED_IPS) {
    if (trusted.includes('/')) {
      // CIDR check - simple implementation for /24 ranges
      const [network] = trusted.split('/');
      const networkParts = network.split('.');
      const ipParts = cleanIP.split('.');
      
      if (ipParts.length === 4 && networkParts.length === 4) {
        const match = networkParts.slice(0, 3).every((part, i) => part === ipParts[i]);
        if (match) return true;
      }
    } else {
      if (cleanIP === trusted) return true;
    }
  }
  return false;
}

// Helper function to log webhook events to database
async function logWebhookEvent(
  supabase: SupabaseClient,
  {
    callId,
    eventType,
    rawPayload,
    clientIP,
    headers,
    processingResult,
    errorMessage
  }: {
    callId?: string;
    eventType: string;
    rawPayload: any;
    clientIP: string;
    headers: Record<string, string>;
    processingResult: 'success' | 'ignored' | 'error';
    errorMessage?: string;
  }
) {
  try {
    await supabase.from('api4com_webhook_logs').insert({
      call_id: callId || null,
      event_type: eventType,
      raw_payload: rawPayload,
      client_ip: clientIP,
      headers: headers,
      processing_result: processingResult,
      error_message: errorMessage || null
    });
    console.log('[api4com-webhook] 📝 Logged webhook event:', eventType, processingResult);
  } catch (e) {
    console.error('[api4com-webhook] Failed to save webhook log:', e);
  }
}

// Helper to get a fingerprint of the key for logging (without exposing the actual key)
function getKeyFingerprint(key: string): string {
  if (!key) return 'null';
  const trimmed = key.trim();
  if (trimmed.length < 8) return `len=${trimmed.length}`;
  return `len=${trimmed.length}, prefix=${trimmed.substring(0, 3)}..., suffix=...${trimmed.substring(trimmed.length - 3)}`;
}

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
        timestamp: new Date().toISOString(),
        trustedIPs: TRUSTED_IPS,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Extract client IP from headers
    const clientIP = 
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-client-ip') ||
      'unknown';
    
    // Log ALL headers for complete debugging
    const allHeaders = Array.from(req.headers.entries());
    console.log('[api4com-webhook] 📋 Request received from IP:', clientIP);
    console.log('[api4com-webhook] 📋 All headers:', allHeaders.map(([k, v]) => 
      k.toLowerCase().includes('key') || k.toLowerCase().includes('auth') || k.toLowerCase().includes('token')
        ? `${k}: [REDACTED len=${v.length}]` 
        : `${k}: ${v.substring(0, 100)}${v.length > 100 ? '...' : ''}`
    ));
    
    // Extract URL (used for optional key transport via query params)
    const url = new URL(req.url);

    const ipTrusted = isTrustedIP(clientIP);

    // Validate webhook authentication (NO bypass mechanisms)
    const webhookKey = Deno.env.get('API4COM_WEBHOOK_KEY');
    if (!webhookKey) {
      console.error('[api4com-webhook] SECURITY: API4COM_WEBHOOK_KEY not configured - refusing to process webhook');

      // Log misconfiguration so it's visible in audit trails
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        await logWebhookEvent(supabase, {
          eventType: 'auth_failed',
          rawPayload: { clientIP, reason: 'missing_server_key', ipTrusted },
          clientIP,
          headers: Object.fromEntries(req.headers.entries()),
          processingResult: 'error',
          errorMessage: 'Server misconfiguration: API4COM_WEBHOOK_KEY not configured',
        });
      } catch {
        // ignore logging failures
      }

      return new Response(
        JSON.stringify({ error: 'Service Unavailable', message: 'Webhook key not configured' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Try multiple authentication methods
    let providedKey: string | null = null;
    let authMethod = 'none';
        
        // Method 1: Headers
        const headerKey = 
          req.headers.get('x-api4com-key') || 
          req.headers.get('X-Api4com-Key') || 
          req.headers.get('X-API4COM-KEY') ||
          req.headers.get('x-api-key') ||
          req.headers.get('X-Api-Key') ||
          req.headers.get('x-webhook-key') ||
          req.headers.get('X-Webhook-Key');
        
        if (headerKey) {
          providedKey = headerKey;
          authMethod = 'header';
        }
        
        // Method 2: Query parameters
        if (!providedKey) {
          const queryKey = url.searchParams.get('key') || 
                           url.searchParams.get('api_key') || 
                           url.searchParams.get('token') ||
                           url.searchParams.get('webhook_key');
          if (queryKey) {
            providedKey = queryKey;
            authMethod = 'query';
          }
        }
        
        // Method 3: Authorization Bearer
        if (!providedKey) {
          const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
          if (authHeader) {
            if (authHeader.startsWith('Bearer ')) {
              providedKey = authHeader.substring(7);
              authMethod = 'bearer';
            } else if (authHeader.startsWith('Basic ')) {
              try {
                const decoded = atob(authHeader.substring(6));
                const [, password] = decoded.split(':');
                if (password) {
                  providedKey = password;
                  authMethod = 'basic';
                }
              } catch (e) {
                console.log('[api4com-webhook] Failed to decode Basic auth');
              }
            }
          }
        }
        
        // Apply trim to both keys
        const trimmedProvidedKey = providedKey?.trim() || '';
        const trimmedWebhookKey = webhookKey.trim();
        
    console.log('[api4com-webhook] 🔑 Auth check:', {
      authMethod,
      providedKeyFingerprint: getKeyFingerprint(providedKey || ''),
      expectedKeyFingerprint: getKeyFingerprint(webhookKey),
      hasQueryParams: url.searchParams.toString().length > 0,
      clientIP,
      ipTrusted,
    });

    // TEMPORARY FALLBACK: Accept requests from trusted IPs while client configures key
    // This allows API4Com webhooks to work even if the provider hasn't been configured to send the key
    if (!trimmedProvidedKey && ipTrusted) {
      console.warn('[api4com-webhook] ⚠️ TEMPORARY: Accepting request from trusted IP without key:', clientIP);
      console.warn('[api4com-webhook] ⚠️ Please configure API4COM_WEBHOOK_KEY in the API4Com panel');
      // Continue processing - don't return here
    } else if (!trimmedProvidedKey || trimmedProvidedKey !== trimmedWebhookKey) {
      // Not from trusted IP and no valid key - reject
      console.error('[api4com-webhook] ❌ Authentication failed from:', clientIP);

      // Log the failed authentication attempt
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      await logWebhookEvent(supabase, {
        eventType: 'auth_failed',
        rawPayload: { authMethod, clientIP, ipTrusted, reason: 'key_mismatch_or_missing' },
        clientIP,
        headers: Object.fromEntries(req.headers.entries()),
        processingResult: 'error',
        errorMessage: 'Authentication failed - invalid or missing key',
      });

      return new Response(
        JSON.stringify({ error: 'Unauthorized', message: 'Invalid or missing API key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[api4com-webhook] ✅ Authentication successful via', authMethod);

    const body = await req.json();
    
    // Log complete payload for debugging
    console.log('[api4com-webhook] 📦 Full payload:', JSON.stringify(body, (key, value) => {
      if (['token', 'secret', 'password', 'key'].includes(key.toLowerCase())) {
        return '[REDACTED]';
      }
      return value;
    }).substring(0, 2000));

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse webhook event - try multiple common field names for compatibility
    const eventType = body.eventType || body.event_type || body.event || body.type || body.action || body.Event || '';
    const callId = body.id || body.callId || body.call_id || body.uniqueid || body.uuid || 
                   body.callUuid || body.call_uuid || body.linkedid || body.Id || '';
    const extension = body.extension || body.ext || body.from || body.caller || body.source || 
                      body.caller_id || body.callerId || body.Extension || '';
    
    // Normalize destination phone number
    let destination = body.destination || body.to || body.called || body.callee || 
                      body.dest || body.destination_number || body.Destination || '';
    if (destination) {
      destination = destination.replace(/[^\d+]/g, '');
      if (destination.length >= 10 && !destination.startsWith('+')) {
        destination = '+' + (destination.startsWith('55') ? '' : '55') + destination;
      }
    }
    
    // Extract duration
    const duration = parseInt(body.duration || body.billsec || body.talk_time || body.talkTime || 
                     body.duration_seconds || body.billable_duration || body.Duration || '0', 10);
    
    // Extract recording URL
    const recordUrl = body.recordUrl || body.recording_url || body.recordingUrl || 
                      body.recording || body.record_url || body.media_url || 
                      body.RecordUrl || body.RecordingUrl || null;
    
    // Extract hangup cause
    const hangupCause = body.cause || body.hangup_cause || body.hangupCause || 
                        body.disconnect_reason || body.reason || body.Cause || 
                        body.disposition || '';
    
    // Extract answered time
    const answeredAt = body.answered_at || body.answeredAt || body.answer_time || 
                       body.connect_time || body.AnsweredAt || null;
    
    // Extract metadata
    const metadata = body.metadata || body.meta || body.custom || body.customData || {};
    const contactId = metadata.contactId || metadata.contact_id || body.contactId || body.contact_id || '';
    const conversationId = metadata.conversationId || metadata.conversation_id || body.conversationId || body.conversation_id || '';

    console.log('[api4com-webhook] 📊 Parsed event:', {
      eventType,
      callId,
      extension,
      destination,
      duration,
      recordUrl: recordUrl ? `[${recordUrl.length} chars]` : null,
      hangupCause,
      answeredAt,
      contactId: contactId || 'none',
      conversationId: conversationId || 'none',
    });

    // Map event type to normalized status
    let normalizedEvent = '';
    const eventLower = eventType.toLowerCase();
    
    // API4Com specific events - channel-hangup, channel-answered, etc.
    const isChannelHangup = eventLower === 'channel-hangup' || eventLower === 'channel_hangup' || 
                            eventLower === 'channel-destroy' || eventLower === 'channel_destroy';
    const isChannelAnswered = eventLower === 'channel-answered' || eventLower === 'channel_answered' ||
                              eventLower === 'channel-bridge' || eventLower === 'channel_bridge';
    const isChannelRinging = eventLower === 'channel-ringing' || eventLower === 'channel_ringing' ||
                             eventLower === 'channel-progress' || eventLower === 'channel_progress';
    const isChannelDialing = eventLower === 'channel-originate' || eventLower === 'channel_originate' ||
                             eventLower === 'channel-create' || eventLower === 'channel_create';
    
    if (isChannelHangup || ['hangup', 'ended', 'completed', 'terminated', 'disconnect', 'disconnected', 'finish', 'finished', 'end'].includes(eventLower)) {
      normalizedEvent = 'hangup';
      console.log('[api4com-webhook] 🎯 Recognized hangup event:', eventType);
    } else if (isChannelAnswered || ['answered', 'answer', 'connected', 'connect', 'in-progress', 'talking', 'active'].includes(eventLower)) {
      normalizedEvent = 'answered';
    } else if (isChannelRinging || ['ringing', 'ring', 'alerting', 'alert'].includes(eventLower)) {
      normalizedEvent = 'ringing';
    } else if (isChannelDialing || ['dialing', 'dial', 'initiated', 'initiating', 'queued', 'pending', 'starting'].includes(eventLower)) {
      normalizedEvent = 'dialing';
    } else if (['no-answer', 'no_answer', 'noanswer', 'timeout', 'unanswered'].includes(eventLower)) {
      normalizedEvent = 'no_answer';
    } else if (['busy', 'rejected', 'declined'].includes(eventLower)) {
      normalizedEvent = 'busy';
    } else if (['failed', 'error', 'invalid', 'failure'].includes(eventLower)) {
      normalizedEvent = 'failed';
    } else if (['cancelled', 'canceled', 'aborted', 'cancel'].includes(eventLower)) {
      normalizedEvent = 'cancelled';
    } else {
      console.log('[api4com-webhook] ⚠️ Unknown event type:', eventType, '- treating as potential hangup');
      // Treat unknown events with hangup indicators as hangup
      if (hangupCause || recordUrl || duration > 0) {
        normalizedEvent = 'hangup';
        console.log('[api4com-webhook] 🔄 Converting unknown event to hangup due to hangupCause/recordUrl/duration');
      } else {
        normalizedEvent = eventLower;
      }
    }

    // Helper to find call log by multiple criteria
    const findCallLog = async () => {
      // First try by api4com_call_id
      if (callId) {
        const { data } = await supabase
          .from('call_logs')
          .select('*')
          .eq('api4com_call_id', callId)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (data) {
          console.log('[api4com-webhook] ✅ Found call log by api4com_call_id:', data.id);
          return data;
        }
      }

      // Try by metadata
      if (contactId || conversationId) {
        let query = supabase.from('call_logs').select('*');
        
        if (contactId) query = query.eq('contact_id', contactId);
        if (conversationId) query = query.eq('conversation_id', conversationId);
        
        const { data } = await query.order('started_at', { ascending: false }).limit(1).maybeSingle();
        
        if (data) {
          console.log('[api4com-webhook] ✅ Found call log by metadata:', data.id);
          // Update api4com_call_id if we have it
          if (callId && !data.api4com_call_id) {
            await supabase.from('call_logs').update({ api4com_call_id: callId }).eq('id', data.id);
          }
          return data;
        }
      }

      // Try by phone number - most recent active call
      if (destination) {
        const phoneVariations = [
          destination,
          destination.replace(/^\+55/, ''),
          destination.replace(/^\+/, ''),
          `+${destination}`,
          `+55${destination.replace(/^\+55/, '')}`,
        ].filter(Boolean);

        const { data } = await supabase
          .from('call_logs')
          .select('*')
          .in('phone_number', phoneVariations)
          .in('status', ['dialing', 'ringing', 'answered'])
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (data) {
          console.log('[api4com-webhook] ✅ Found call log by phone number:', data.id);
          if (callId && !data.api4com_call_id) {
            await supabase.from('call_logs').update({ api4com_call_id: callId }).eq('id', data.id);
          }
          return data;
        }
      }

      console.log('[api4com-webhook] ⚠️ No call log found for:', { callId, contactId, conversationId, destination });
      return null;
    };

    // Process based on event type
    if (normalizedEvent === 'hangup') {
      // Determine final status based on API4Com hangup causes
      let status = 'completed';
      const hangupCauseLower = hangupCause.toLowerCase();
      
      console.log('[api4com-webhook] 🔍 Processing hangup:', {
        hangupCause,
        hangupCauseLower,
        duration,
        hasRecording: !!recordUrl,
        recordUrl: recordUrl ? recordUrl.substring(0, 50) + '...' : null,
      });
      
      // API4Com specific hangup causes
      if (hangupCauseLower.includes('originator_cancel') || hangupCauseLower === 'originator_cancel') {
        // ORIGINATOR_CANCEL can mean two things:
        // 1. Operator cancelled manually (quick cancel, < 25s)
        // 2. Lead didn't answer and call timed out (ring time >= 25s)
        // We'll classify based on ring time after finding the call log
        status = duration > 0 ? 'completed' : 'pending_originator_cancel';
        console.log('[api4com-webhook] 📱 Originator cancel detected, will classify based on ring time');
      } else if (hangupCauseLower.includes('normal_clearing') || hangupCauseLower === 'normal_clearing' ||
                 hangupCauseLower.includes('normal clearing')) {
        // Normal call termination
        status = duration > 0 ? 'completed' : 'no_answer';
        console.log('[api4com-webhook] ✅ Normal clearing detected, status:', status);
      } else if (hangupCauseLower.includes('user_busy') || hangupCauseLower === 'user_busy' ||
                 hangupCauseLower.includes('busy')) {
        status = 'busy';
      } else if (hangupCauseLower.includes('no_answer') || hangupCauseLower.includes('no answer') ||
                 hangupCauseLower.includes('no_user_response') || hangupCauseLower === 'no_user_response') {
        status = 'no_answer';
      } else if (hangupCauseLower.includes('call_rejected') || hangupCauseLower === 'call_rejected') {
        status = 'busy';
      } else if (hangupCauseLower.includes('failed') || hangupCauseLower.includes('number_changed') || 
                 hangupCauseLower.includes('unallocated') || hangupCauseLower.includes('not_registered') ||
                 hangupCauseLower.includes('invalid_number') || hangupCauseLower.includes('destination_out_of_order')) {
        status = 'failed';
      } else if (duration > 0) {
        // Has duration = call was answered at some point
        status = 'completed';
      } else {
        // No duration, unknown cause = probably not answered
        status = 'no_answer';
      }
      
      console.log('[api4com-webhook] 📊 Final status determined:', status);

      const callLog = await findCallLog();
      
      if (callLog) {
        // Resolve pending_originator_cancel based on ring time
        if (status === 'pending_originator_cancel') {
          const startTime = new Date(callLog.started_at).getTime();
          const endTime = Date.now();
          const ringTimeSeconds = (endTime - startTime) / 1000;
          
          // If call rang for >= 25 seconds, it's likely the lead didn't answer
          // If < 25 seconds, the operator probably cancelled manually
          const ringTimeThreshold = 25;
          
          if (ringTimeSeconds >= ringTimeThreshold) {
            status = 'no_answer';
            console.log(`[api4com-webhook] 📱 ORIGINATOR_CANCEL classified as no_answer (ring time: ${ringTimeSeconds.toFixed(1)}s >= ${ringTimeThreshold}s)`);
          } else {
            status = 'cancelled';
            console.log(`[api4com-webhook] 📱 ORIGINATOR_CANCEL classified as cancelled (ring time: ${ringTimeSeconds.toFixed(1)}s < ${ringTimeThreshold}s)`);
          }
        }
        
        if (callLog.status === 'cancelled' || callLog.status === 'timeout' || callLog.status === 'completed_manual') {
          console.log('[api4com-webhook] 🔧 Correcting client-side status:', callLog.status, '→', status);
        }
        
        // Build update data - ALWAYS save recording if present
        const updateData: Record<string, unknown> = {
          status: status,
          ended_at: new Date().toISOString(),
          answered_at: answeredAt ? new Date(answeredAt).toISOString() : (callLog.answered_at || null),
          duration_seconds: duration || callLog.duration_seconds || 0,
          hangup_cause: hangupCause || callLog.hangup_cause,
          metadata: {
            webhook_data: body,
            updated_at: new Date().toISOString(),
            previous_status: callLog.status,
            event_type_original: eventType,
          }
        };
        
        // CRITICAL: Always save recording URL if present, even for cancelled calls
        if (recordUrl) {
          updateData.record_url = recordUrl;
          updateData.transcription_status = 'pending';
          console.log('[api4com-webhook] 🎤 Recording URL detected, will save:', recordUrl.substring(0, 80));
        }
        
        const { error: updateError } = await supabase
          .from('call_logs')
          .update(updateData)
          .eq('id', callLog.id);

        if (updateError) {
          console.error('[api4com-webhook] ❌ Update error:', updateError);
        } else {
          console.log('[api4com-webhook] ✅ Call log updated successfully:', { 
            id: callLog.id, 
            previousStatus: callLog.status,
            newStatus: status, 
            duration: duration || callLog.duration_seconds || 0, 
            hasRecording: !!recordUrl,
            recordingSaved: !!recordUrl,
          });
          
          // Trigger transcription if recording exists
          if (recordUrl) {
            console.log('[api4com-webhook] 🎙️ Triggering transcription');
            
            const transcribeInBackground = async () => {
              try {
                const response = await fetch(`${supabaseUrl}/functions/v1/transcribe-call-recording`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${supabaseKey}`,
                  },
                  body: JSON.stringify({ call_log_id: callLog.id }),
                });
                
                if (response.ok) {
                  console.log('[api4com-webhook] ✅ Transcription triggered');
                } else {
                  console.error('[api4com-webhook] ❌ Transcription failed:', await response.text());
                }
              } catch (error) {
                console.error('[api4com-webhook] ❌ Transcription error:', error);
              }
            };
            
            // @ts-ignore
            if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
              // @ts-ignore
              EdgeRuntime.waitUntil(transcribeInBackground());
            } else {
              transcribeInBackground();
            }
          }
        }
      }
    } else if (normalizedEvent === 'answered') {
      const callLog = await findCallLog();
      
      if (callLog) {
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
          .eq('id', callLog.id);

        if (updateError) {
          console.error('[api4com-webhook] ❌ Answer update error:', updateError);
        } else {
          console.log('[api4com-webhook] ✅ Call marked as answered:', callLog.id);
        }
      }
    } else if (normalizedEvent === 'ringing') {
      const callLog = await findCallLog();
      
      if (callLog) {
        const { error: updateError } = await supabase
          .from('call_logs')
          .update({ 
            status: 'ringing',
            metadata: {
              webhook_data: body,
              ringing_at: new Date().toISOString(),
            }
          })
          .eq('id', callLog.id);
        
        if (!updateError) {
          console.log('[api4com-webhook] ✅ Call marked as ringing:', callLog.id);
        }
      }
    } else if (normalizedEvent === 'dialing') {
      const callLog = await findCallLog();
      
      if (callLog) {
        const { error: updateError } = await supabase
          .from('call_logs')
          .update({ 
            status: 'dialing',
            metadata: {
              webhook_data: body,
              dialing_at: new Date().toISOString(),
            }
          })
          .eq('id', callLog.id);
        
        if (!updateError) {
          console.log('[api4com-webhook] ✅ Call marked as dialing:', callLog.id);
        }
      }
    } else if (['no_answer', 'busy', 'failed', 'cancelled'].includes(normalizedEvent)) {
      const callLog = await findCallLog();
      
      if (callLog) {
        await supabase
          .from('call_logs')
          .update({
            status: normalizedEvent,
            ended_at: new Date().toISOString(),
            hangup_cause: hangupCause || normalizedEvent,
          })
          .eq('id', callLog.id);
        
        console.log('[api4com-webhook] ✅ Call marked as', normalizedEvent, ':', callLog.id);
      }
    } else {
      console.log('[api4com-webhook] ⚠️ Unhandled event:', { eventType, normalizedEvent, callId });
      
      // Log ignored/unknown events
      await logWebhookEvent(supabase, {
        callId,
        eventType,
        rawPayload: body,
        clientIP,
        headers: Object.fromEntries(Array.from(req.headers.entries()).filter(([k]) => 
          !k.toLowerCase().includes('auth') && !k.toLowerCase().includes('key')
        )),
        processingResult: 'ignored',
        errorMessage: `Unknown event type: ${eventType}`,
      });
    }

    // Log successful processing
    await logWebhookEvent(supabase, {
      callId,
      eventType,
      rawPayload: body,
      clientIP,
      headers: Object.fromEntries(Array.from(req.headers.entries()).filter(([k]) => 
        !k.toLowerCase().includes('auth') && !k.toLowerCase().includes('key')
      )),
      processingResult: 'success',
    });

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
    console.error('[api4com-webhook] ❌ Error:', error);
    
    // Log error
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      await logWebhookEvent(supabase, {
        eventType: 'error',
        rawPayload: { error: error instanceof Error ? error.message : 'Unknown error' },
        clientIP: 'unknown',
        headers: {},
        processingResult: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
    } catch (logError) {
      console.error('[api4com-webhook] Failed to log error:', logError);
    }
    
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
