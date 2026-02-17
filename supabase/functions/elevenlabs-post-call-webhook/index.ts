import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const payload = await req.json();
    console.log('[ElevenLabs Webhook] Received payload:', JSON.stringify(payload).substring(0, 500));

    // Extract data from ElevenLabs post-call webhook
    const conversationId = payload.conversation_id;
    const transcript = payload.transcript || payload.full_transcript || '';
    const analysis = payload.analysis || payload.data_collection_results || {};
    const dynamicVars = payload.conversation_initiation_client_data?.dynamic_variables || payload.dynamic_variables || {};
    const callStatus = payload.call_status || payload.status || 'completed';

    const vqId = dynamicVars.vq_id;
    const leadId = dynamicVars.lead_id;

    if (!vqId && !conversationId) {
      console.error('[ElevenLabs Webhook] No vq_id or conversation_id in payload');
      return new Response(JSON.stringify({ error: 'Missing identification' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Find the voice qualification record
    let vq;
    if (vqId) {
      const { data } = await supabase
        .from('voice_qualifications')
        .select('*')
        .eq('id', vqId)
        .single();
      vq = data;
    }
    if (!vq && conversationId) {
      const { data } = await supabase
        .from('voice_qualifications')
        .select('*')
        .eq('elevenlabs_conversation_id', conversationId)
        .single();
      vq = data;
    }

    if (!vq) {
      console.error('[ElevenLabs Webhook] Voice qualification not found');
      return new Response(JSON.stringify({ error: 'VQ not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Handle no-answer / busy
    if (['no-answer', 'no_answer', 'busy', 'canceled', 'failed'].includes(callStatus)) {
      console.log(`[ElevenLabs Webhook] Call status: ${callStatus} for VQ ${vq.id}`);

      const newAttempt = vq.attempt_number + 1;
      if (newAttempt > vq.max_attempts) {
        await supabase
          .from('voice_qualifications')
          .update({
            status: 'not_contacted',
            completed_at: new Date().toISOString(),
            observations: `Não atendeu após ${vq.max_attempts} tentativas`,
          })
          .eq('id', vq.id);
      } else {
        // Retry in 2 hours
        const retryAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
        await supabase
          .from('voice_qualifications')
          .update({
            status: 'pending',
            attempt_number: newAttempt,
            scheduled_for: retryAt.toISOString(),
            observations: `Tentativa ${vq.attempt_number}: ${callStatus}`,
          })
          .eq('id', vq.id);
        console.log(`[ElevenLabs Webhook] Scheduled retry ${newAttempt} for VQ ${vq.id}`);
      }

      return new Response(JSON.stringify({ status: 'retry_scheduled' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Parse analysis results
    const qualificationResult = analysis.qualification_result || analysis.qualificado || null;
    const interestLevel = analysis.interest_level || analysis.nivel_interesse || null;
    const callSummary = analysis.summary || analysis.resumo || null;
    const nextStep = analysis.next_step || analysis.proximo_passo || null;
    const bestContactTime = analysis.best_contact_time || analysis.melhor_horario || null;
    const observations = analysis.observations || analysis.observacoes || null;

    // Format transcript
    let fullTranscript = '';
    if (typeof transcript === 'string') {
      fullTranscript = transcript;
    } else if (Array.isArray(transcript)) {
      fullTranscript = transcript.map((t: any) => 
        `${t.role === 'agent' ? 'Iris' : 'Lead'}: ${t.message || t.text || t.content || ''}`
      ).join('\n');
    }

    // Update voice qualification
    await supabase
      .from('voice_qualifications')
      .update({
        status: 'completed',
        qualification_result: qualificationResult,
        interest_level: interestLevel,
        call_summary: callSummary,
        full_transcript: fullTranscript || null,
        next_step: nextStep,
        best_contact_time: bestContactTime,
        observations: observations,
        completed_at: new Date().toISOString(),
      })
      .eq('id', vq.id);

    console.log(`[ElevenLabs Webhook] ✅ VQ ${vq.id} updated: result=${qualificationResult}, interest=${interestLevel}`);

    // If qualified, try to update deal stage
    if (qualificationResult === 'qualificado' && vq.deal_id) {
      // Find the "Qualificado pela IA" stage
      const { data: stages } = await supabase
        .from('pipeline_stages')
        .select('id, title, pipeline_id')
        .eq('is_active', true)
        .ilike('title', '%qualificad%')
        .limit(1);

      if (stages && stages.length > 0) {
        await supabase
          .from('deals')
          .update({
            stage_id: stages[0].id,
            stage: 'qualified',
            notes: `Qualificado por ligação da Iris (${new Date().toLocaleDateString('pt-BR')}): ${callSummary || 'Sem resumo'}`,
          })
          .eq('id', vq.deal_id);
        console.log(`[ElevenLabs Webhook] Deal ${vq.deal_id} moved to qualified stage`);
      }
    }

    return new Response(JSON.stringify({ status: 'ok', vq_id: vq.id }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[ElevenLabs Webhook] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
