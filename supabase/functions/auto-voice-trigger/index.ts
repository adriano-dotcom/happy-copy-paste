import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function getNowInSP(): Date {
  const now = new Date();
  const spString = now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
  return new Date(spString);
}

function isBusinessHours(spNow: Date): boolean {
  const hour = spNow.getHours();
  const day = spNow.getDay(); // 0=Sun, 6=Sat
  // Mon-Sat 07:00-20:00
  return day >= 1 && day <= 6 && hour >= 7 && hour < 20;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // ===== PHASE 0: Cleanup stuck VQs =====
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: stuckVqs } = await supabase
      .from('voice_qualifications')
      .select('id, attempt_number, max_attempts, called_at')
      .eq('status', 'calling')
      .lt('called_at', thirtyMinAgo);

    for (const stuck of stuckVqs || []) {
      const newAttempt = (stuck.attempt_number || 1) + 1;
      if (newAttempt > (stuck.max_attempts || 3)) {
        await supabase.from('voice_qualifications').update({
          status: 'not_contacted',
          completed_at: new Date().toISOString(),
          observations: 'Ligacao travada - sem resposta do ElevenLabs apos 30min'
        }).eq('id', stuck.id);
      } else {
        const retryAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
        await supabase.from('voice_qualifications').update({
          status: 'pending',
          attempt_number: newAttempt,
          scheduled_for: retryAt.toISOString(),
          observations: `Tentativa ${stuck.attempt_number}: travada, reagendada`
        }).eq('id', stuck.id);
      }
      console.log(`[Auto Voice] Cleaned up stuck VQ ${stuck.id}`);
    }

    // Also clean up VQs stuck in 'ended' without completed_at
    const { data: endedStuck } = await supabase
      .from('voice_qualifications')
      .select('id')
      .eq('status', 'ended')
      .is('completed_at', null);

    for (const e of endedStuck || []) {
      await supabase.from('voice_qualifications').update({
        status: 'cancelled',
        completed_at: new Date().toISOString(),
        observations: 'Encerrada automaticamente - status ended sem finalizacao'
      }).eq('id', e.id);
      console.log(`[Auto Voice] Cleaned up ended VQ ${e.id}`);
    }

    // ===== PHASE 1: Process scheduled auto-window VQs =====
    // These are VQs created by nina-orchestrator with a delay (scheduled_for in the future)
    const { data: scheduledVqs, error: schedError } = await supabase
      .from('voice_qualifications')
      .select('id, contact_id')
      .eq('status', 'scheduled')
      .eq('trigger_source', 'auto_window')
      .lte('scheduled_for', new Date().toISOString())
      .limit(10);

    if (schedError) {
      console.error('[Auto Voice] Error fetching scheduled VQs:', schedError);
    }

    const scheduledResults = [];
    if (scheduledVqs && scheduledVqs.length > 0) {
      console.log(`[Auto Voice] Found ${scheduledVqs.length} scheduled auto-window VQs ready to trigger`);

      for (const vq of scheduledVqs) {
        try {
          // Mark as pending to avoid re-processing
          await supabase
            .from('voice_qualifications')
            .update({ status: 'pending' })
            .eq('id', vq.id);

          // Trigger the call
          const { error: invokeError } = await supabase.functions.invoke('trigger-elevenlabs-call', {
            body: { contact_id: vq.contact_id, force: true, trigger_source: 'auto_window' },
          });

          if (invokeError) {
            console.error(`[Auto Voice] Error invoking trigger for scheduled VQ ${vq.id}:`, invokeError);
            scheduledResults.push({ vq_id: vq.id, contact_id: vq.contact_id, status: 'error' });
          } else {
            console.log(`[Auto Voice] Triggered scheduled VQ ${vq.id} for contact ${vq.contact_id}`);
            scheduledResults.push({ vq_id: vq.id, contact_id: vq.contact_id, status: 'triggered' });
          }
        } catch (err) {
          console.error(`[Auto Voice] Error processing scheduled VQ ${vq.id}:`, err.message);
          scheduledResults.push({ vq_id: vq.id, contact_id: vq.contact_id, status: 'error', error: err.message });
        }
      }
    }

    // ===== PHASE 2: Original flow — check business hours and find inactive leads =====
    const spNow = getNowInSP();
    if (!isBusinessHours(spNow)) {
      console.log(`[Auto Voice] Outside business hours (SP: ${spNow.toLocaleString('pt-BR')}). Skipping.`);
      return new Response(JSON.stringify({ status: 'outside_business_hours' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if automation is paused
    const { data: pauseSettings } = await supabase
      .from('nina_settings')
      .select('auto_voice_paused')
      .limit(1)
      .single();

    if (pauseSettings?.auto_voice_paused) {
      console.log('[Auto Voice] Automation is PAUSED. Skipping.');
      return new Response(JSON.stringify({ status: 'paused' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Find conversations where last message was 5-15 min ago, contact not blocked, no recent VQ
    const { data: candidates, error: queryError } = await supabase
      .rpc('auto_voice_trigger_candidates');

    // If RPC doesn't exist, use raw query approach via REST
    let conversationsToCall: any[] = [];

    if (queryError) {
      console.log('[Auto Voice] RPC not found, using direct queries');

      // Step 1: Find conversations with last_message_at between 5 and 15 min ago
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

      const { data: conversations, error: convError } = await supabase
        .from('conversations')
        .select('id, contact_id, last_message_at')
        .lt('last_message_at', fiveMinAgo)
        .gt('last_message_at', fifteenMinAgo)
        .eq('is_active', true);

      if (convError) {
        console.error('[Auto Voice] Error fetching conversations:', convError);
        throw convError;
      }

      if (!conversations || conversations.length === 0) {
        console.log('[Auto Voice] No conversations in 5-15 min window');
        return new Response(JSON.stringify({ status: 'no_candidates', checked: 0 }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      console.log(`[Auto Voice] Found ${conversations.length} conversations in window`);

      // Step 2: Filter - check each conversation
      for (const conv of conversations) {
        // Check if contact is blocked
        const { data: contact } = await supabase
          .from('contacts')
          .select('id, is_blocked, phone_number')
          .eq('id', conv.contact_id)
          .single();

        if (!contact || contact.is_blocked || !contact.phone_number) {
          continue;
        }

        // Check if there's a recent VQ (last 24h)
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: existingVq } = await supabase
          .from('voice_qualifications')
          .select('id')
          .eq('contact_id', conv.contact_id)
          .gt('created_at', twentyFourHoursAgo)
          .limit(1);

        if (existingVq && existingVq.length > 0) {
          console.log(`[Auto Voice] Skipping contact ${conv.contact_id} - VQ exists in last 24h`);
          continue;
        }

        // Check if last message in conversation is from nina (AI responded, lead didn't reply)
        const { data: lastMsg } = await supabase
          .from('messages')
          .select('from_type')
          .eq('conversation_id', conv.id)
          .order('sent_at', { ascending: false })
          .limit(1)
          .single();

        if (!lastMsg || lastMsg.from_type !== 'nina') {
          continue;
        }

        conversationsToCall.push(conv);
      }
    } else {
      conversationsToCall = candidates || [];
    }

    if (conversationsToCall.length === 0) {
      console.log('[Auto Voice] No eligible conversations found');
      return new Response(JSON.stringify({ status: 'no_eligible', checked: conversationsToCall.length }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[Auto Voice] ${conversationsToCall.length} leads eligible for auto-call`);

    const results = [];
    for (const conv of conversationsToCall) {
      try {
        // Create voice_qualification
        const { data: vq, error: vqError } = await supabase
          .from('voice_qualifications')
          .insert({
            contact_id: conv.contact_id,
            status: 'pending',
            scheduled_for: new Date().toISOString(),
            attempt_number: 1,
            max_attempts: 3,
          })
          .select('id')
          .single();

        if (vqError) {
          console.error(`[Auto Voice] Error creating VQ for ${conv.contact_id}:`, vqError);
          continue;
        }

        console.log(`[Auto Voice] Created VQ ${vq.id} for contact ${conv.contact_id}`);

        // Call trigger-elevenlabs-call with force mode
        const { error: invokeError } = await supabase.functions.invoke('trigger-elevenlabs-call', {
          body: { contact_id: conv.contact_id, force: true },
        });

        if (invokeError) {
          console.error(`[Auto Voice] Error invoking trigger for ${conv.contact_id}:`, invokeError);
        }

        results.push({ contact_id: conv.contact_id, vq_id: vq.id, status: 'triggered' });
      } catch (err) {
        console.error(`[Auto Voice] Error processing ${conv.contact_id}:`, err.message);
        results.push({ contact_id: conv.contact_id, status: 'error', error: err.message });
      }
    }

    console.log(`[Auto Voice] Processed ${results.length} auto-calls`);
    return new Response(JSON.stringify({ status: 'processed', results }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Auto Voice] Unexpected error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
