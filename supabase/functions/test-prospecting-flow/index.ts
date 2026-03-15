import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Iris Qualification Test Scenarios - should NOT trigger disqualification
const IRIS_QUALIFICATION_TEST_SCENARIOS = [
  // Contratação
  {
    name: 'Subcontratado Response',
    agentQuestion: 'Você atua como contratado direto ou subcontratado?',
    userAnswer: 'Subcontratado',
    expectedCategory: 'contratacao',
    shouldNotDisqualify: true
  },
  {
    name: 'Agregado Response',
    agentQuestion: 'Você é contratado direto ou subcontratado?',
    userAnswer: 'Sou agregado',
    expectedCategory: 'contratacao',
    shouldNotDisqualify: true
  },
  // Quantidade de veículos
  {
    name: 'Numeric Vehicle Count',
    agentQuestion: 'Quantos veículos tem na sua frota?',
    userAnswer: '5',
    expectedCategory: 'qtd_veiculos',
    shouldNotDisqualify: true
  },
  {
    name: 'Text Vehicle Count',
    agentQuestion: 'Quantas carretas você tem?',
    userAnswer: 'Tenho três carretas',
    expectedCategory: 'qtd_veiculos',
    shouldNotDisqualify: true
  },
  // Tipo de frota
  {
    name: 'Own Fleet Response',
    agentQuestion: 'Sua frota é própria, agregados ou terceiros?',
    userAnswer: 'Frota própria',
    expectedCategory: 'tipo_frota',
    shouldNotDisqualify: true
  },
  // ANTT
  {
    name: 'ANTT Active',
    agentQuestion: 'Sua ANTT está ativa e regularizada?',
    userAnswer: 'Sim, está ativa',
    expectedCategory: 'antt',
    shouldNotDisqualify: true
  },
  // CT-e
  {
    name: 'CTE Emission',
    agentQuestion: 'Você emite CT-e?',
    userAnswer: 'Sim, emito',
    expectedCategory: 'cte',
    shouldNotDisqualify: true
  },
  {
    name: 'No CTE Subcontracted',
    agentQuestion: 'Emite CT-e ou é subcontratado?',
    userAnswer: 'Não emito, sou subcontratado',
    expectedCategory: 'cte',
    shouldNotDisqualify: true
  },
  // CNPJ
  {
    name: 'CNPJ Number',
    agentQuestion: 'Pode me informar o CNPJ para consulta?',
    userAnswer: '12345678000199',
    expectedCategory: 'cnpj',
    shouldNotDisqualify: true
  },
  // Tipo de carga
  {
    name: 'Cargo Type',
    agentQuestion: 'Que tipo de mercadoria você geralmente transporta?',
    userAnswer: 'Carga seca, principalmente grãos',
    expectedCategory: 'tipo_mercadoria',
    shouldNotDisqualify: true
  },
  // Estados/Regiões
  {
    name: 'Regions',
    agentQuestion: 'Quais estados ou regiões você atende?',
    userAnswer: 'Sul e Sudeste',
    expectedCategory: 'regioes_estados',
    shouldNotDisqualify: true
  },
  // Viagens por mês
  {
    name: 'Monthly Trips',
    agentQuestion: 'Quantas viagens faz por mês em média?',
    userAnswer: '20',
    expectedCategory: 'viagens_mes',
    shouldNotDisqualify: true
  },
  // Valor da carga
  {
    name: 'Cargo Value',
    agentQuestion: 'Qual o valor médio por carga?',
    userAnswer: 'Entre 100 e 200 mil',
    expectedCategory: 'valor_carga',
    shouldNotDisqualify: true
  },
  // Seguro ativo
  {
    name: 'Has Insurance',
    agentQuestion: 'Os veículos da sua frota já têm seguro?',
    userAnswer: 'Tenho, mas tá vencendo',
    expectedCategory: 'tem_seguro',
    shouldNotDisqualify: true
  },
  // Tipos de veículos
  {
    name: 'Vehicle Types',
    agentQuestion: 'Quais tipos de veículos você tem? Carretas, trucks, vans?',
    userAnswer: 'Carretas e bitrens',
    expectedCategory: 'tipos_veiculos',
    shouldNotDisqualify: true
  }
];

async function cleanupTestConversation(supabase: any, phone: string) {
  const { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('phone_number', phone)
    .single();

  if (contact) {
    // Reset deals associated with test contact
    const { data: deals } = await supabase
      .from('deals')
      .select('id')
      .eq('contact_id', contact.id);

    if (deals && deals.length > 0) {
      await supabase
        .from('deals')
        .update({
          lost_reason: null,
          lost_at: null,
          won_at: null,
          notes: null
        })
        .eq('contact_id', contact.id);
      console.log(`🧹 Reset ${deals.length} deals for test contact`);
    }

    const { data: conv } = await supabase
      .from('conversations')
      .select('id')
      .eq('contact_id', contact.id)
      .single();

    if (conv) {
      await supabase.from('messages').delete().eq('conversation_id', conv.id);
      await supabase.from('send_queue').delete().eq('conversation_id', conv.id);
      await supabase.from('nina_processing_queue').delete().eq('conversation_id', conv.id);
      await supabase.from('conversations').update({
        nina_context: null,
        status: 'nina'
      }).eq('id', conv.id);
    }

    await supabase.from('contacts').update({
      client_memory: null,
      tags: []
    }).eq('id', contact.id);
  }
}

async function setupTestConversation(
  supabase: any,
  phone: string,
  agentId: string,
  testName: string
): Promise<{ conversationId: string; contactId: string }> {
  // Get or create contact
  let { data: contact } = await supabase
    .from('contacts')
    .select('id')
    .eq('phone_number', phone)
    .single();

  if (!contact) {
    const { data: newContact } = await supabase
      .from('contacts')
      .insert({
        phone_number: phone,
        name: testName,
        lead_source: 'test'
      })
      .select('id')
      .single();
    contact = newContact;
  }

  // Get or create conversation
  let { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('contact_id', contact.id)
    .single();

  if (!conv) {
    const { data: newConv } = await supabase
      .from('conversations')
      .insert({
        contact_id: contact.id,
        current_agent_id: agentId,
        status: 'nina',
        whatsapp_window_start: new Date().toISOString(),
        metadata: { origin: 'test_qualification' }
      })
      .select('id')
      .single();
    conv = newConv;
  } else {
    await supabase
      .from('conversations')
      .update({
        current_agent_id: agentId,
        status: 'nina',
        whatsapp_window_start: new Date().toISOString()
      })
      .eq('id', conv.id);
  }

  return { conversationId: conv.id, contactId: contact.id };
}

async function runQualificationProtectionTests(
  supabase: any,
  supabaseUrl: string,
  supabaseKey: string
): Promise<Response> {
  console.log('🧪 Running Iris Qualification Protection Tests...\n');

  const results: Array<{
    scenario: string;
    passed: boolean;
    category: string;
    details: string;
  }> = [];

  // Get Iris agent
  const { data: irisAgent } = await supabase
    .from('agents')
    .select('id, slug, name')
    .eq('slug', 'iris')
    .single();

  if (!irisAgent) {
    return new Response(JSON.stringify({
      error: 'Iris agent not found'
    }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const testPhone = '+5500000000002'; // Different phone for qualification tests

  for (const scenario of IRIS_QUALIFICATION_TEST_SCENARIOS) {
    console.log(`\n📋 Testing: ${scenario.name}`);
    console.log(`   Agent Q: "${scenario.agentQuestion}"`);
    console.log(`   User A: "${scenario.userAnswer}"`);

    try {
      // 1. Setup: Create/reset test conversation
      await cleanupTestConversation(supabase, testPhone);

      const { conversationId, contactId } = await setupTestConversation(
        supabase,
        testPhone,
        irisAgent.id,
        'Teste Qualificação Íris'
      );

      // 2. Insert agent question as previous message
      await supabase.from('messages').insert({
        conversation_id: conversationId,
        content: scenario.agentQuestion,
        from_type: 'nina',
        type: 'text',
        status: 'sent'
      });

      // Small delay to ensure message order
      await new Promise(r => setTimeout(r, 100));

      // 3. Insert user answer
      const { data: userMsg } = await supabase.from('messages').insert({
        conversation_id: conversationId,
        content: scenario.userAnswer,
        from_type: 'user',
        type: 'text',
        status: 'delivered'
      }).select('id').single();

      // 4. Queue for nina processing
      await supabase.from('nina_processing_queue').insert({
        message_id: userMsg.id,
        conversation_id: conversationId,
        contact_id: contactId,
        status: 'pending',
        priority: 10
      });

      // 5. Trigger nina-orchestrator
      const orchestratorResponse = await fetch(`${supabaseUrl}/functions/v1/nina-orchestrator`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      if (!orchestratorResponse.ok) {
        const errorText = await orchestratorResponse.text();
        console.error('❌ Orchestrator error:', errorText);
      }

      // 6. Wait for processing
      await new Promise(r => setTimeout(r, 4000));

      // 7. Check results - conversation should NOT be paused
      const { data: conv } = await supabase
        .from('conversations')
        .select('status, nina_context')
        .eq('id', conversationId)
        .single();

      // 8. Check if contact was tagged with disqualification tag
      const { data: contact } = await supabase
        .from('contacts')
        .select('tags')
        .eq('id', contactId)
        .single();

      const disqualificationTags = ['emprego', 'frete', 'identidade_invalida', 'numero_errado'];
      const hasDisqualificationTag = contact?.tags?.some((tag: string) =>
        disqualificationTags.includes(tag)
      );

      const wasDisqualified =
        conv?.status === 'paused' ||
        hasDisqualificationTag;

      const passed = scenario.shouldNotDisqualify && !wasDisqualified;

      results.push({
        scenario: scenario.name,
        passed,
        category: scenario.expectedCategory,
        details: passed
          ? '✅ Correctly allowed qualification flow'
          : `❌ Incorrectly disqualified - Status: ${conv?.status}, Tags: ${contact?.tags?.join(', ') || 'none'}`
      });

      console.log(passed ? '   ✅ PASSED' : '   ❌ FAILED');

    } catch (error: any) {
      results.push({
        scenario: scenario.name,
        passed: false,
        category: scenario.expectedCategory,
        details: `❌ Error: ${error.message}`
      });
      console.log(`   ❌ ERROR: ${error.message}`);
    }
  }

  // Final cleanup
  await cleanupTestConversation(supabase, testPhone);

  // Summary
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`\n${'='.repeat(50)}`);
  console.log(`📊 RESULTS: ${passed}/${results.length} passed`);
  console.log(`${'='.repeat(50)}\n`);

  return new Response(JSON.stringify({
    success: failed === 0,
    summary: {
      total: results.length,
      passed,
      failed
    },
    results
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { agent_slug, messages, cleanup_only, test_type } = await req.json();

    // New mode: qualification protection tests
    if (test_type === 'qualification_protection') {
      return await runQualificationProtectionTests(supabase, supabaseUrl, supabaseKey);
    }

    const testPhone = '+5500000000001';
    const testName = 'Teste Prospecção';

    // Cleanup protocol — reuse robust cleanup function
    console.log('🧹 Running cleanup protocol...');
    await cleanupTestConversation(supabase, testPhone);
    console.log('✅ Cleanup completed');

    // Re-fetch contact after cleanup
    const { data: existingContact } = await supabase
      .from('contacts')
      .select('id')
      .eq('phone_number', testPhone)
      .single();

    if (cleanup_only) {
      return new Response(JSON.stringify({ success: true, message: 'Cleanup completed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!agent_slug || !messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'agent_slug and messages array required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get agent
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('*')
      .eq('slug', agent_slug)
      .single();

    if (agentError || !agent) {
      return new Response(JSON.stringify({ error: `Agent ${agent_slug} not found` }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`🤖 Testing agent: ${agent.name}`);

    // Create or get test contact
    let contactId: string;
    if (existingContact) {
      contactId = existingContact.id;
    } else {
      const { data: newContact, error: contactError } = await supabase
        .from('contacts')
        .insert({
          phone_number: testPhone,
          name: testName,
          lead_source: 'test'
        })
        .select('id')
        .single();

      if (contactError) throw contactError;
      contactId = newContact.id;
    }

    // Get or create conversation with agent
    let conversationId: string;
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('contact_id', contactId)
      .single();

    if (existingConv) {
      conversationId = existingConv.id;
      // Update to use this agent with prospecting origin
      await supabase
        .from('conversations')
        .update({
          current_agent_id: agent.id,
          status: 'nina',
          whatsapp_window_start: new Date().toISOString(),
          metadata: { origin: 'prospeccao' }
        })
        .eq('id', conversationId);
    } else {
      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert({
          contact_id: contactId,
          current_agent_id: agent.id,
          status: 'nina',
          whatsapp_window_start: new Date().toISOString(),
          metadata: { origin: 'prospeccao' }
        })
        .select('id')
        .single();

      if (convError) throw convError;
      conversationId = newConv.id;
    }

    console.log(`💬 Conversation ID: ${conversationId}`);

    // Move deal to Prospecção pipeline for proper soft rejection handling
    const { data: prospectPipeline } = await supabase
      .from('pipelines')
      .select('id')
      .eq('slug', 'prospeccao')
      .maybeSingle();

    if (prospectPipeline) {
      const { data: firstStage } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('pipeline_id', prospectPipeline.id)
        .order('position', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (firstStage) {
        const { error: dealUpdateError } = await supabase
          .from('deals')
          .update({
            pipeline_id: prospectPipeline.id,
            stage_id: firstStage.id,
            lost_reason: null,
            lost_at: null
          })
          .eq('contact_id', contactId);

        if (dealUpdateError) {
          console.log('⚠️ Could not move deal to Prospecção:', dealUpdateError.message);
        } else {
          console.log('✅ Deal moved to Prospecção pipeline');
        }
      }
    }

    const conversationLog: Array<{ role: string; content: string; timestamp: string }> = [];

    // Process each message sequentially
    for (let i = 0; i < messages.length; i++) {
      const userMessage = messages[i];
      console.log(`\n📨 [${i + 1}/${messages.length}] User: "${userMessage}"`);

      // Insert user message
      const { data: insertedMsg, error: msgError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          content: userMessage,
          from_type: 'user',
          type: 'text',
          status: 'delivered'
        })
        .select('id')
        .single();

      if (msgError) throw msgError;

      conversationLog.push({
        role: 'user',
        content: userMessage,
        timestamp: new Date().toISOString()
      });

      // Add to nina processing queue
      await supabase
        .from('nina_processing_queue')
        .insert({
          message_id: insertedMsg.id,
          conversation_id: conversationId,
          contact_id: contactId,
          status: 'pending',
          priority: 10
        });

      // Trigger nina-orchestrator
      const orchestratorUrl = `${supabaseUrl}/functions/v1/nina-orchestrator`;
      console.log('🚀 Triggering nina-orchestrator...');

      const orchestratorResponse = await fetch(orchestratorUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });

      if (!orchestratorResponse.ok) {
        const errorText = await orchestratorResponse.text();
        console.error('❌ Orchestrator error:', errorText);
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Get agent response
      const { data: agentMessages } = await supabase
        .from('messages')
        .select('content, from_type, sent_at')
        .eq('conversation_id', conversationId)
        .eq('from_type', 'nina')
        .order('sent_at', { ascending: false })
        .limit(1);

      if (agentMessages && agentMessages.length > 0) {
        const agentResponse = agentMessages[0].content;
        console.log(`🤖 Agent: "${agentResponse}"`);

        conversationLog.push({
          role: 'agent',
          content: agentResponse || '',
          timestamp: agentMessages[0].sent_at
        });
      } else {
        console.log('⚠️ No agent response found');
        conversationLog.push({
          role: 'agent',
          content: '[NO RESPONSE]',
          timestamp: new Date().toISOString()
        });
      }
    }

    // Get final conversation state
    const { data: finalConv } = await supabase
      .from('conversations')
      .select('nina_context')
      .eq('id', conversationId)
      .single();

    // Get all messages
    const { data: allMessages } = await supabase
      .from('messages')
      .select('content, from_type, sent_at')
      .eq('conversation_id', conversationId)
      .order('sent_at', { ascending: true });

    console.log('\n✅ Test completed');

    return new Response(JSON.stringify({
      success: true,
      agent: agent.name,
      conversation_id: conversationId,
      conversation_log: conversationLog,
      all_messages: allMessages,
      nina_context: finalConv?.nina_context,
      qualification_answers: finalConv?.nina_context?.qualification_answers || {}
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('❌ Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
