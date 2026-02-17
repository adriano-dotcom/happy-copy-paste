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
  // Mon-Sat 08:00-20:00
  return day >= 1 && day <= 6 && hour >= 8 && hour < 20;
}

function getNextBusinessSlot(): Date {
  const spNow = getNowInSP();
  const result = new Date(spNow);

  // If before 8am today and it's a business day, schedule for 8am today
  if (spNow.getDay() >= 1 && spNow.getDay() <= 6 && spNow.getHours() < 8) {
    result.setHours(8, 0, 0, 0);
    return result;
  }

  // Otherwise, find next business day at 8am
  result.setDate(result.getDate() + 1);
  while (result.getDay() === 0) { // skip Sunday
    result.setDate(result.getDate() + 1);
  }
  result.setHours(8, 0, 0, 0);
  return result;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const elevenlabsApiKey = Deno.env.get('ELEVENLABS_API_KEY');
  const elevenlabsAgentId = Deno.env.get('ELEVENLABS_AGENT_ID_IRIS');
  const elevenlabsPhoneNumberId = Deno.env.get('ELEVENLABS_PHONE_NUMBER_ID');

  if (!elevenlabsApiKey || !elevenlabsAgentId || !elevenlabsPhoneNumberId) {
    console.error('[ElevenLabs Call] Missing required secrets');
    return new Response(JSON.stringify({ error: 'Missing ElevenLabs configuration' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    // Check for force mode (manual retry for specific contact)
    let body: any = {};
    try { body = await req.json(); } catch { /* empty body is fine */ }

    if (body.contact_id && body.force) {
      console.log(`[ElevenLabs Call] Force mode for contact: ${body.contact_id}`);
      // Find the latest voice qualification for this contact
      const { data: vq } = await supabase
        .from('voice_qualifications')
        .select('*, contacts(phone_number, name, call_name)')
        .eq('contact_id', body.contact_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!vq) {
        return new Response(JSON.stringify({ error: 'No voice qualification found' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Reset and process immediately
      await supabase
        .from('voice_qualifications')
        .update({ status: 'pending', scheduled_for: new Date().toISOString() })
        .eq('id', vq.id);

      const result = await processCall(supabase, { ...vq, contacts: vq.contacts }, elevenlabsApiKey, elevenlabsAgentId, elevenlabsPhoneNumberId);
      return new Response(JSON.stringify(result), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Normal batch mode: process pending qualifications
    const spNow = getNowInSP();
    if (!isBusinessHours(spNow)) {
      console.log(`[ElevenLabs Call] Outside business hours (SP: ${spNow.toLocaleString('pt-BR')}). Rescheduling pending calls.`);

      const nextSlot = getNextBusinessSlot();
      const { data: pending } = await supabase
        .from('voice_qualifications')
        .select('id')
        .eq('status', 'pending')
        .lte('scheduled_for', new Date().toISOString())
        .limit(10);

      if (pending && pending.length > 0) {
        await supabase
          .from('voice_qualifications')
          .update({ scheduled_for: nextSlot.toISOString() })
          .in('id', pending.map(p => p.id));
        console.log(`[ElevenLabs Call] Rescheduled ${pending.length} calls to ${nextSlot.toLocaleString('pt-BR')}`);
      }

      return new Response(JSON.stringify({ status: 'outside_business_hours', rescheduled: pending?.length || 0 }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch pending qualifications (max 3 per run)
    const { data: pendingCalls, error: fetchError } = await supabase
      .from('voice_qualifications')
      .select('*, contacts(phone_number, name, call_name)')
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(3);

    if (fetchError) {
      console.error('[ElevenLabs Call] Error fetching pending calls:', fetchError);
      throw fetchError;
    }

    if (!pendingCalls || pendingCalls.length === 0) {
      return new Response(JSON.stringify({ status: 'no_pending_calls' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[ElevenLabs Call] Processing ${pendingCalls.length} pending calls`);

    const results = [];
    for (const vq of pendingCalls) {
      const result = await processCall(supabase, vq, elevenlabsApiKey, elevenlabsAgentId, elevenlabsPhoneNumberId);
      results.push(result);
      // Small delay between calls
      if (pendingCalls.indexOf(vq) < pendingCalls.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    return new Response(JSON.stringify({ status: 'processed', results }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[ElevenLabs Call] Unexpected error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function processCall(
  supabase: any,
  vq: any,
  apiKey: string,
  agentId: string,
  phoneNumberId: string
) {
  const contact = vq.contacts;
  if (!contact?.phone_number) {
    console.error(`[ElevenLabs Call] No phone number for VQ ${vq.id}`);
    await supabase
      .from('voice_qualifications')
      .update({ status: 'failed', observations: 'Contato sem número de telefone' })
      .eq('id', vq.id);
    return { id: vq.id, status: 'failed', reason: 'no_phone' };
  }

  // Format phone number with +55 if needed
  let phone = contact.phone_number.replace(/\D/g, '');
  if (!phone.startsWith('55')) phone = '55' + phone;
  phone = '+' + phone;

  const leadName = contact.name || contact.call_name || 'Cliente';

  console.log(`[ElevenLabs Call] Calling ${leadName} at ${phone} (VQ: ${vq.id}, attempt: ${vq.attempt_number})`);

  // Update status to calling
  await supabase
    .from('voice_qualifications')
    .update({ status: 'calling', called_at: new Date().toISOString() })
    .eq('id', vq.id);

  try {
    const response = await fetch('https://api.us.elevenlabs.io/v1/convai/twilio/outbound-call', {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        agent_id: agentId,
        agent_phone_number_id: phoneNumberId,
        to_number: phone,
        conversation_initiation_client_data: {
          dynamic_variables: {
            lead_name: leadName,
            lead_id: vq.contact_id,
            vq_id: vq.id,
            produto_interesse: 'Seguro de Carga',
            horario: getNowInSP().toLocaleString('pt-BR'),
          }
        }
      }),
    });

    const responseText = await response.text();
    console.log(`[ElevenLabs Call] API Response (${response.status}):`, responseText);

    if (!response.ok) {
      throw new Error(`ElevenLabs API error ${response.status}: ${responseText}`);
    }

    let data;
    try { data = JSON.parse(responseText); } catch { data = {}; }

    await supabase
      .from('voice_qualifications')
      .update({
        elevenlabs_conversation_id: data.conversation_id || null,
        call_sid: data.callSid || data.call_sid || null,
        elevenlabs_agent_id: agentId,
      })
      .eq('id', vq.id);

    console.log(`[ElevenLabs Call] ✅ Call initiated for ${leadName} (conv: ${data.conversation_id})`);
    return { id: vq.id, status: 'calling', conversation_id: data.conversation_id };

  } catch (error) {
    console.error(`[ElevenLabs Call] ❌ Error calling ${leadName}:`, error.message);

    const newAttempt = vq.attempt_number + 1;
    if (newAttempt > vq.max_attempts) {
      await supabase
        .from('voice_qualifications')
        .update({
          status: 'failed',
          observations: `Falha após ${vq.max_attempts} tentativas: ${error.message}`,
        })
        .eq('id', vq.id);
      return { id: vq.id, status: 'failed', reason: 'max_attempts' };
    }

    // Retry in 2 hours
    const retryAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await supabase
      .from('voice_qualifications')
      .update({
        status: 'pending',
        attempt_number: newAttempt,
        scheduled_for: retryAt.toISOString(),
        observations: `Tentativa ${vq.attempt_number} falhou: ${error.message}`,
      })
      .eq('id', vq.id);
    return { id: vq.id, status: 'retry', next_attempt: newAttempt };
  }
}
