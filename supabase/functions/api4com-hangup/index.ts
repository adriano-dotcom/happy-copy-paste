import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { call_log_id, api4com_call_id } = await req.json();

    console.log('[api4com-hangup] === ENCERRANDO CHAMADA ===');
    console.log('[api4com-hangup] Params:', { call_log_id, api4com_call_id });

    if (!api4com_call_id) {
      throw new Error('ID da chamada API4Com não fornecido');
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get current call log status
    let currentCall: { id: string; status: string; answered_at: string | null } | null = null;
    if (call_log_id) {
      const { data: callLog } = await supabase
        .from('call_logs')
        .select('id, status, answered_at')
        .eq('id', call_log_id)
        .maybeSingle();
      
      currentCall = callLog;
      console.log('[api4com-hangup] Current call:', currentCall);
    }

    // Get API4Com settings
    const { data: settings, error: settingsError } = await supabase
      .from('nina_settings')
      .select('api4com_api_token, api4com_token_in_vault')
      .maybeSingle();

    if (settingsError || !settings) {
      throw new Error('Configurações não encontradas');
    }

    let apiToken = settings.api4com_api_token;
    
    // Check vault
    if (settings.api4com_token_in_vault) {
      const { data: secrets } = await supabase.rpc('get_decrypted_secrets');
      const vaultToken = secrets?.find((s: { name: string; secret: string }) => s.name === 'api4com_api_token');
      if (vaultToken?.secret) {
        apiToken = vaultToken.secret;
      }
    }

    if (!apiToken) {
      throw new Error('Token API4Com não configurado');
    }

    // Call API4Com Hangup endpoint
    console.log('[api4com-hangup] Chamando API4Com hangup...');
    const api4comResponse = await fetch(`https://api.api4com.com/api/v1/dialer/${api4com_call_id}/hangup`, {
      method: 'POST',
      headers: {
        'Authorization': apiToken,
        'Content-Type': 'application/json',
      },
    });

    const api4comData = await api4comResponse.json().catch(() => ({}));
    console.log('[api4com-hangup] Resposta API4Com:', { 
      status: api4comResponse.status, 
      ok: api4comResponse.ok,
      data: api4comData 
    });

    // Update call log
    if (call_log_id && currentCall) {
      const wasAnswered = currentCall.status === 'answered' || currentCall.answered_at;
      const finalStatus = wasAnswered ? 'completed_manual' : 'cancelled';
      
      const { error: updateError } = await supabase
        .from('call_logs')
        .update({
          status: finalStatus,
          ended_at: new Date().toISOString(),
          hangup_cause: wasAnswered ? 'user_hangup' : 'user_cancel',
        })
        .eq('id', call_log_id);

      if (updateError) {
        console.error('[api4com-hangup] Erro ao atualizar log:', updateError);
      } else {
        console.log('[api4com-hangup] ✅ Call ended with status:', finalStatus);
      }

      // Trigger sync in background to get final details from provider
      // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil((async () => {
          console.log('[api4com-hangup] 🔄 Starting background sync for call:', call_log_id);
          
          // Wait for provider to finalize
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          try {
            const syncResponse = await fetch(`${supabaseUrl}/functions/v1/api4com-sync-call`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`,
              },
              body: JSON.stringify({ call_log_id }),
            });
            const syncData = await syncResponse.json();
            console.log('[api4com-hangup] Background sync result:', syncData);
          } catch (e) {
            console.error('[api4com-hangup] Background sync failed:', e);
          }
        })());
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Chamada encerrada',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[api4com-hangup] === ERRO ===', errorMessage);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      { 
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
