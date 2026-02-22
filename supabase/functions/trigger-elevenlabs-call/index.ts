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
    // Check voice_call_channel from nina_settings
    const { data: ninaSettings } = await supabase
      .from('nina_settings')
      .select('voice_call_channel')
      .maybeSingle();
    
    const voiceChannel = ninaSettings?.voice_call_channel || 'pstn';

    // Check for force mode (manual retry for specific contact)
    let body: any = {};
    try { body = await req.json(); } catch { /* empty body is fine */ }

    if (body.contact_id && body.force) {
      console.log(`[ElevenLabs Call] Force mode for contact: ${body.contact_id}`);
      
      // Find the latest voice qualification for this contact (prefer pending/scheduled ones)
      const { data: vq } = await supabase
        .from('voice_qualifications')
        .select('*, contacts(phone_number, name, call_name)')
        .eq('contact_id', body.contact_id)
        .in('status', ['pending', 'scheduled'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let qualificationToProcess = vq;

      if (!qualificationToProcess) {
        // Try any recent VQ (including completed/failed) to avoid orphans
        const { data: anyVq } = await supabase
          .from('voice_qualifications')
          .select('*, contacts(phone_number, name, call_name)')
          .eq('contact_id', body.contact_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (anyVq && ['pending', 'scheduled'].includes(anyVq.status)) {
          qualificationToProcess = anyVq;
        } else if (!anyVq) {
          // No existing VQ at all — create one on the fly
          console.log(`[ElevenLabs Call] No existing VQ, creating new one for contact ${body.contact_id}`);
          
          const { data: contact } = await supabase
            .from('contacts')
            .select('id, phone_number, name, call_name')
            .eq('id', body.contact_id)
            .single();

          if (!contact) {
            return new Response(JSON.stringify({ error: 'Contact not found' }), {
              status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          const { data: newVq, error: insertError } = await supabase
            .from('voice_qualifications')
            .insert({
              contact_id: body.contact_id,
              status: 'pending',
              scheduled_for: new Date().toISOString(),
              attempt_number: 1,
              max_attempts: 3,
              trigger_source: body.trigger_source || 'manual',
            })
            .select('*, contacts(phone_number, name, call_name)')
            .single();

          if (insertError) {
            console.error('[ElevenLabs Call] Error creating VQ:', insertError);
            return new Response(JSON.stringify({ error: 'Failed to create voice qualification' }), {
              status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
          }

          qualificationToProcess = newVq;
        } else {
          // Reuse existing VQ (e.g. from orchestrator's scheduled insert)
          qualificationToProcess = anyVq;
          console.log(`[ElevenLabs Call] Reusing existing VQ ${anyVq.id} (status: ${anyVq.status}) for contact ${body.contact_id}`);
        }
      } else {
        console.log(`[ElevenLabs Call] Reusing pending/scheduled VQ ${vq.id} for contact ${body.contact_id}`);
      }

      // Reset and process immediately — preserve trigger_source if already set by orchestrator
      const triggerSource = qualificationToProcess.trigger_source !== 'manual' 
        ? qualificationToProcess.trigger_source 
        : (body.trigger_source || 'manual');
      await supabase
        .from('voice_qualifications')
        .update({ status: 'pending', scheduled_for: new Date().toISOString(), trigger_source: triggerSource })
        .eq('id', qualificationToProcess.id);

      if (voiceChannel === 'whatsapp') {
        const result = await processCallWhatsApp(supabase, qualificationToProcess);
        return new Response(JSON.stringify(result), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const result = await processCall(supabase, qualificationToProcess, elevenlabsApiKey, elevenlabsAgentId, elevenlabsPhoneNumberId);
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
      const result = voiceChannel === 'whatsapp'
        ? await processCallWhatsApp(supabase, vq)
        : await processCall(supabase, vq, elevenlabsApiKey, elevenlabsAgentId, elevenlabsPhoneNumberId);
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

  // Format phone number with +55 if needed, and ensure mobile 9th digit
  let phone = contact.phone_number.replace(/\D/g, '');
  if (phone.startsWith('55')) phone = phone.slice(2); // remove country code to normalize
  // Now phone should be DDD + number (10 or 11 digits)
  // If 10 digits, it's missing the mobile 9th digit — add it
  if (phone.length === 10) {
    const ddd = phone.slice(0, 2);
    const number = phone.slice(2);
    phone = ddd + '9' + number;
    console.log(`[ElevenLabs Call] Added missing 9th digit: ${ddd}9${number}`);
  }
  phone = '+55' + phone;

  // Normalize: only first name, Title Case
  const rawName = contact.name || contact.call_name || 'Cliente';
  const firstName = rawName.trim().split(/\s+/)[0] || 'Cliente';
  const leadName = firstName.length < 3 
    ? firstName 
    : firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();

  console.log(`[ElevenLabs Call] Calling ${leadName} at ${phone} (VQ: ${vq.id}, attempt: ${vq.attempt_number})`);

  // Update status to calling
  await supabase
    .from('voice_qualifications')
    .update({ status: 'calling', called_at: new Date().toISOString() })
    .eq('id', vq.id);

  try {
    // 1. Horário — extrair só HH:MM
    const spNow = getNowInSP();
    const horarioFormatado = spNow.getHours().toString().padStart(2, '0')
      + ':' + spNow.getMinutes().toString().padStart(2, '0');

    // 2. Produto — buscar do deal/pipeline do contato
    const { data: deal } = await supabase
      .from('deals')
      .select('pipeline_id, pipelines(name)')
      .eq('contact_id', vq.contact_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const pipelineName = (deal as any)?.pipelines?.name?.toLowerCase() || '';
    const produtoMap: Record<string, string> = {
      'transporte': 'Seguro de Transporte e Carga',
      'saude': 'Plano de Saúde',
      'saúde': 'Plano de Saúde',
      'auto': 'Seguro Auto',
      'empresarial': 'Seguro Empresarial',
      'vida': 'Seguro de Vida',
    };
    let produtoInteresse = 'seguros';
    for (const [key, value] of Object.entries(produtoMap)) {
      if (pipelineName.includes(key)) {
        produtoInteresse = value;
        break;
      }
    }

    console.log(`[ElevenLabs Call] Dynamic vars: horario=${horarioFormatado}, produto=${produtoInteresse}, pipeline="${pipelineName}"`);

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
            produto_interesse: produtoInteresse,
            horario: horarioFormatado,
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

/**
 * Process a voice qualification via WhatsApp bridge (Auto-Attendant).
 * Instead of calling ElevenLabs API directly, creates a whatsapp_calls record
 * with status 'pending_bridge' for the Auto-Attendant browser tab to pick up.
 */
async function processCallWhatsApp(supabase: any, vq: any) {
  const contact = vq.contacts;
  if (!contact?.phone_number) {
    console.error(`[ElevenLabs Call] No phone number for VQ ${vq.id}`);
    await supabase
      .from('voice_qualifications')
      .update({ status: 'failed', observations: 'Contato sem número de telefone' })
      .eq('id', vq.id);
    return { id: vq.id, status: 'failed', reason: 'no_phone' };
  }

  // Format phone number
  let phone = contact.phone_number.replace(/\D/g, '');
  if (phone.startsWith('55')) phone = phone.slice(2);
  if (phone.length === 10) {
    const ddd = phone.slice(0, 2);
    const number = phone.slice(2);
    phone = ddd + '9' + number;
  }
  phone = '+55' + phone;

  const rawName = contact.name || contact.call_name || 'Cliente';
  const firstName = rawName.trim().split(/\s+/)[0] || 'Cliente';
  const leadName = firstName.length < 3
    ? firstName
    : firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();

  console.log(`[ElevenLabs Call] WhatsApp bridge mode — creating pending_bridge for ${leadName} at ${phone} (VQ: ${vq.id})`);

  // Update VQ status
  await supabase
    .from('voice_qualifications')
    .update({ status: 'calling', called_at: new Date().toISOString() })
    .eq('id', vq.id);

  try {
    // Create a whatsapp_calls record for Auto-Attendant to pick up
    const { data: callRecord, error: insertError } = await supabase
      .from('whatsapp_calls')
      .insert({
        contact_id: vq.contact_id,
        direction: 'outbound',
        status: 'pending_bridge',
        to_number: phone,
        from_number: null, // Will be set by Auto-Attendant
        metadata: {
          vq_id: vq.id,
          lead_name: leadName,
          bridge_mode: true,
        },
      })
      .select('id')
      .single();

    if (insertError) throw insertError;

    console.log(`[ElevenLabs Call] ✅ WhatsApp bridge record created: ${callRecord.id} for VQ ${vq.id}`);

    // Update VQ with reference
    await supabase
      .from('voice_qualifications')
      .update({
        call_sid: callRecord.id, // Store whatsapp_calls.id as reference
        observations: `Aguardando Auto-Attendant bridge (call: ${callRecord.id})`,
      })
      .eq('id', vq.id);

    return { id: vq.id, status: 'pending_bridge', call_id: callRecord.id };

  } catch (error) {
    console.error(`[ElevenLabs Call] ❌ Error creating WhatsApp bridge:`, error.message);

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
