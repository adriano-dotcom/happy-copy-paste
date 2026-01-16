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

    // First, get current call log status to determine correct final status
    let currentStatus = 'dialing';
    if (call_log_id) {
      const { data: callLog } = await supabase
        .from('call_logs')
        .select('status, answered_at')
        .eq('id', call_log_id)
        .maybeSingle();
      
      if (callLog) {
        currentStatus = callLog.status;
        console.log('[api4com-hangup] Current call status:', currentStatus, '| answered_at:', callLog.answered_at);
      }
    }

    // Get API4Com settings
    console.log('[api4com-hangup] Buscando configurações...');
    const { data: settings, error: settingsError } = await supabase
      .from('nina_settings')
      .select('api4com_api_token')
      .maybeSingle();

    if (settingsError || !settings?.api4com_api_token) {
      console.error('[api4com-hangup] Erro ao buscar configurações:', settingsError);
      throw new Error('Token API4Com não configurado');
    }

    // Call API4Com Hangup endpoint
    console.log('[api4com-hangup] Chamando API4Com hangup...');
    const api4comResponse = await fetch(`https://api.api4com.com/api/v1/dialer/${api4com_call_id}/hangup`, {
      method: 'POST',
      headers: {
        'Authorization': settings.api4com_api_token,
        'Content-Type': 'application/json',
      },
    });

    const api4comData = await api4comResponse.json().catch(() => ({}));
    
    console.log('[api4com-hangup] Resposta API4Com:', { 
      status: api4comResponse.status, 
      ok: api4comResponse.ok,
      data: api4comData 
    });

    // Update call log with correct status based on whether the call was answered
    if (call_log_id) {
      // Determine the correct status:
      // - If call was answered, mark as "completed_manual" (user manually hung up after talking)
      // - If call was still dialing/ringing, mark as "cancelled" (call never connected)
      let finalStatus = 'cancelled';
      let hangupCause = 'user_hangup';
      
      if (currentStatus === 'answered') {
        finalStatus = 'completed_manual';
        hangupCause = 'user_hangup_after_answer';
        console.log('[api4com-hangup] 📞 Call was answered - marking as completed_manual');
      } else {
        console.log('[api4com-hangup] ❌ Call was not answered (status:', currentStatus, ') - marking as cancelled');
      }

      const { error: updateError } = await supabase
        .from('call_logs')
        .update({ 
          status: finalStatus,
          ended_at: new Date().toISOString(),
          hangup_cause: hangupCause
        })
        .eq('id', call_log_id);

      if (updateError) {
        console.error('[api4com-hangup] Erro ao atualizar log:', updateError);
      } else {
        console.log('[api4com-hangup] ✅ Call log updated to:', finalStatus);
      }
    }

    if (!api4comResponse.ok) {
      // Log the error but don't fail - we still want to update our local state
      console.warn('[api4com-hangup] API4Com retornou erro, mas atualizamos status local:', api4comResponse.status);
    }

    console.log('[api4com-hangup] === CHAMADA ENCERRADA ===');

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