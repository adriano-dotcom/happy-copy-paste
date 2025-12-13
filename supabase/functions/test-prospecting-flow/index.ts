import "https://deno.land/x/xhr@0.1.0/mod.ts";
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { agent_slug, messages, cleanup_only } = await req.json();

    const testPhone = '+5500000000001';
    const testName = 'Teste Prospecção';

    // Cleanup protocol
    console.log('🧹 Running cleanup protocol...');
    
    // Find test contact
    const { data: existingContact } = await supabase
      .from('contacts')
      .select('id')
      .eq('phone_number', testPhone)
      .single();

    if (existingContact) {
      // Find conversation
      const { data: conversation } = await supabase
        .from('conversations')
        .select('id')
        .eq('contact_id', existingContact.id)
        .single();

      if (conversation) {
        // Delete messages
        await supabase
          .from('messages')
          .delete()
          .eq('conversation_id', conversation.id);

        // Clear queues
        await supabase
          .from('send_queue')
          .delete()
          .eq('conversation_id', conversation.id);

        await supabase
          .from('nina_processing_queue')
          .delete()
          .eq('conversation_id', conversation.id);

        // Reset conversation
        await supabase
          .from('conversations')
          .update({
            nina_context: null,
            status: 'nina',
            current_agent_id: null,
            whatsapp_window_start: new Date().toISOString()
          })
          .eq('id', conversation.id);

        // Reset contact memory
        await supabase
          .from('contacts')
          .update({ client_memory: null })
          .eq('id', existingContact.id);

        console.log('✅ Cleanup completed');
      }
    }

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
