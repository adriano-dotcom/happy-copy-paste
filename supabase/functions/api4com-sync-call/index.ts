import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { call_log_id, api4com_call_id } = await req.json();

    if (!call_log_id && !api4com_call_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'call_log_id ou api4com_call_id é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find the call log
    let callLog: {
      id: string;
      status: string;
      api4com_call_id: string | null;
      started_at: string;
      duration_seconds: number | null;
      record_url: string | null;
      answered_at: string | null;
      ended_at: string | null;
      hangup_cause: string | null;
    } | null = null;

    if (call_log_id) {
      const { data, error } = await supabase
        .from('call_logs')
        .select('id, status, api4com_call_id, started_at, duration_seconds, record_url, answered_at, ended_at, hangup_cause')
        .eq('id', call_log_id)
        .single();
      
      if (error || !data) {
        console.error('[api4com-sync-call] Call log not found by id:', call_log_id);
        return new Response(
          JSON.stringify({ success: false, error: 'Call log não encontrado' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      callLog = data;
    } else {
      const { data, error } = await supabase
        .from('call_logs')
        .select('id, status, api4com_call_id, started_at, duration_seconds, record_url, answered_at, ended_at, hangup_cause')
        .eq('api4com_call_id', api4com_call_id)
        .order('started_at', { ascending: false })
        .limit(1)
        .single();
      
      if (error || !data) {
        console.error('[api4com-sync-call] Call log not found by api4com_call_id:', api4com_call_id);
        return new Response(
          JSON.stringify({ success: false, error: 'Call log não encontrado' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      callLog = data;
    }

    console.log('[api4com-sync-call] Found call log:', {
      id: callLog.id,
      status: callLog.status,
      api4com_call_id: callLog.api4com_call_id,
    });

    // Get API4Com token
    const { data: settings, error: settingsError } = await supabase
      .from('nina_settings')
      .select('api4com_api_token, api4com_token_in_vault')
      .limit(1)
      .single();

    if (settingsError || !settings) {
      console.error('[api4com-sync-call] Failed to get settings:', settingsError);
      return new Response(
        JSON.stringify({ success: false, error: 'Configurações não encontradas' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let apiToken = settings.api4com_api_token;
    
    if (settings.api4com_token_in_vault) {
      const { data: secrets } = await supabase.rpc('get_decrypted_secrets');
      const vaultToken = secrets?.find((s: { name: string; secret: string }) => s.name === 'api4com_api_token');
      if (vaultToken?.secret) {
        apiToken = vaultToken.secret;
      }
    }

    if (!apiToken) {
      console.error('[api4com-sync-call] No API token configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Token API4Com não configurado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const callId = callLog.api4com_call_id;
    
    if (!callId) {
      console.log('[api4com-sync-call] No api4com_call_id stored, cannot sync');
      return new Response(
        JSON.stringify({ success: false, error: 'Sem ID de chamada do provedor', synced: false }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Try multiple endpoints with different base URLs
    const baseUrls = [
      'https://api.api4com.com',
      'https://api4com.com.br',
      'https://app.api4com.com',
    ];
    
    const endpoints = [
      `/api/v1/dialer/calls/${callId}`,
      `/api/v1/calls/${callId}`,
      `/api/v1/cdr/${callId}`,
      `/api/v1/call/${callId}`,
      `/v1/calls/${callId}`,
      `/calls/${callId}`,
      `/call/${callId}`,
      `/dialer/calls/${callId}`,
    ];

    let callDetails: Record<string, unknown> | null = null;
    let usedEndpoint = '';

    for (const baseUrl of baseUrls) {
      if (callDetails) break;
      
      for (const endpoint of endpoints) {
        try {
          const fullUrl = `${baseUrl}${endpoint}`;
          console.log('[api4com-sync-call] Trying:', fullUrl);
          
          const response = await fetch(fullUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${apiToken}`,
              'X-Api-Key': apiToken,
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
          });

          console.log('[api4com-sync-call] Response:', response.status, response.statusText);

          if (response.ok) {
            const text = await response.text();
            console.log('[api4com-sync-call] ✅ Got response from:', fullUrl);
            console.log('[api4com-sync-call] Response body (first 500 chars):', text.substring(0, 500));
            
            try {
              callDetails = JSON.parse(text);
              usedEndpoint = fullUrl;
            } catch (e) {
              console.log('[api4com-sync-call] Failed to parse JSON:', e);
            }
            break;
          } else {
            const errorText = await response.text();
            console.log('[api4com-sync-call]', response.status, ':', errorText.substring(0, 300));
          }
        } catch (e) {
          console.error('[api4com-sync-call] Error fetching:', e);
        }
      }
    }

    if (!callDetails) {
      console.log('[api4com-sync-call] Could not get call details from any endpoint');
      
      // Try to fetch recordings specifically if call ended
      if (['completed', 'cancelled', 'no_answer', 'busy', 'failed'].includes(callLog.status) && !callLog.record_url) {
        console.log('[api4com-sync-call] 🎤 Attempting to fetch recordings for completed call');
        
        for (const baseUrl of baseUrls) {
          try {
            const recordingsEndpoints = [
              `/api/v1/recordings?call_id=${callId}`,
              `/api/v1/calls/${callId}/recordings`,
              `/api/v1/dialer/recordings/${callId}`,
            ];
            
            for (const endpoint of recordingsEndpoints) {
              const response = await fetch(`${baseUrl}${endpoint}`, {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${apiToken}`,
                  'X-Api-Key': apiToken,
                  'Accept': 'application/json',
                },
              });
              
              if (response.ok) {
                const recordingsData = await response.json();
                console.log('[api4com-sync-call] 📼 Recordings response:', JSON.stringify(recordingsData).substring(0, 500));
                
                const recordingUrl = recordingsData?.data?.[0]?.url || 
                                     recordingsData?.recordings?.[0]?.url ||
                                     recordingsData?.recording_url ||
                                     recordingsData?.url;
                
                if (recordingUrl) {
                  console.log('[api4com-sync-call] ✅ Found recording URL:', recordingUrl.substring(0, 80));
                  
                  await supabase
                    .from('call_logs')
                    .update({
                      record_url: recordingUrl,
                      transcription_status: 'pending',
                    })
                    .eq('id', callLog.id);
                  
                  // Trigger transcription
                  await fetch(`${supabaseUrl}/functions/v1/transcribe-call-recording`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${supabaseKey}`,
                    },
                    body: JSON.stringify({ call_log_id: callLog.id }),
                  });
                  
                  return new Response(
                    JSON.stringify({ 
                      success: true, 
                      synced: true, 
                      message: 'Gravação recuperada',
                      updates: { record_url: recordingUrl },
                    }),
                    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                  );
                }
              }
            }
          } catch (e) {
            console.log('[api4com-sync-call] Recording fetch error:', e);
          }
        }
      }
      
      // Check elapsed time for stuck calls
      const startTime = new Date(callLog.started_at).getTime();
      const elapsed = Date.now() - startTime;
      const elapsedMinutes = elapsed / 60000;
      
      if (['dialing', 'ringing'].includes(callLog.status) && elapsedMinutes > 5) {
        console.log('[api4com-sync-call] Call stuck in', callLog.status, 'for', elapsedMinutes.toFixed(1), 'min');
        
        const { error: updateError } = await supabase
          .from('call_logs')
          .update({
            status: 'no_answer',
            ended_at: new Date().toISOString(),
            hangup_cause: 'sync_timeout',
          })
          .eq('id', callLog.id);

        if (updateError) {
          console.error('[api4com-sync-call] Failed to update:', updateError);
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            synced: true, 
            message: 'Marcado como não atendida (timeout)',
            newStatus: 'no_answer',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, synced: false, message: 'Não foi possível obter detalhes do provedor' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse call details
    const details = (callDetails as { data?: Record<string, unknown>; call?: Record<string, unknown> }).data || 
                    (callDetails as { call?: Record<string, unknown> }).call || 
                    callDetails;
    
    const providerStatus = String(details.status || details.state || details.disposition || details.callStatus || '');
    const duration = Number(details.duration || details.billsec || details.talk_time || details.talkTime || 
                     details.billable_duration || details.duration_seconds || 0);
    const recordUrl = String(details.recordUrl || details.recording_url || details.recordingUrl || 
                      details.recording || details.record_url || details.media_url || '') || null;
    const answeredAt = details.answered_at || details.answeredAt || details.answer_time || 
                       details.connect_time || null;
    const endedAt = details.ended_at || details.endedAt || details.end_time || 
                    details.hangup_time || details.disconnect_time || null;
    const hangupCause = String(details.hangup_cause || details.hangupCause || details.disconnect_reason ||
                        details.reason || '') || null;

    console.log('[api4com-sync-call] Parsed:', {
      providerStatus,
      duration,
      recordUrl: recordUrl ? 'present' : 'null',
      answeredAt,
      usedEndpoint,
    });

    // Map status
    let newStatus = callLog.status;
    const statusLower = providerStatus.toLowerCase();
    
    if (['answered', 'connected', 'in-progress', 'talking'].includes(statusLower)) {
      newStatus = 'answered';
    } else if (['completed', 'ended', 'hangup', 'terminated', 'finished'].includes(statusLower)) {
      newStatus = duration > 0 || answeredAt ? 'completed' : 'no_answer';
    } else if (['no-answer', 'no_answer', 'noanswer', 'timeout', 'unanswered'].includes(statusLower)) {
      newStatus = 'no_answer';
    } else if (['busy', 'rejected', 'declined'].includes(statusLower)) {
      newStatus = 'busy';
    } else if (['failed', 'error', 'invalid'].includes(statusLower)) {
      newStatus = 'failed';
    } else if (['cancelled', 'canceled', 'aborted'].includes(statusLower)) {
      newStatus = 'cancelled';
    }

    // Build update
    const updateData: Record<string, unknown> = {};
    
    if (newStatus !== callLog.status) {
      updateData.status = newStatus;
    }
    
    if (duration > 0 && !callLog.duration_seconds) {
      updateData.duration_seconds = duration;
    }
    
    if (recordUrl && !callLog.record_url) {
      updateData.record_url = recordUrl;
      updateData.transcription_status = 'pending';
    }
    
    if (answeredAt && !callLog.answered_at) {
      updateData.answered_at = new Date(String(answeredAt)).toISOString();
    }
    
    if (endedAt && !callLog.ended_at) {
      updateData.ended_at = new Date(String(endedAt)).toISOString();
    }
    
    if (hangupCause && !callLog.hangup_cause) {
      updateData.hangup_cause = hangupCause;
    }

    if (Object.keys(updateData).length === 0) {
      console.log('[api4com-sync-call] No updates needed');
      return new Response(
        JSON.stringify({ success: true, synced: true, message: 'Nenhuma atualização necessária' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[api4com-sync-call] Updating with:', updateData);

    const { error: updateError } = await supabase
      .from('call_logs')
      .update(updateData)
      .eq('id', callLog.id);

    if (updateError) {
      console.error('[api4com-sync-call] Failed to update:', updateError);
      return new Response(
        JSON.stringify({ success: false, error: 'Falha ao atualizar' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Trigger transcription if needed
    if (updateData.record_url) {
      console.log('[api4com-sync-call] Triggering transcription');
      
      try {
        await fetch(`${supabaseUrl}/functions/v1/transcribe-call-recording`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ call_log_id: callLog.id }),
        });
      } catch (e) {
        console.error('[api4com-sync-call] Failed to trigger transcription:', e);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        synced: true, 
        updates: updateData,
        message: 'Chamada sincronizada',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[api4com-sync-call] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
