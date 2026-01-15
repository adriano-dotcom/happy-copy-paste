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
    const { conversationId, contactId, agentSlug, qualificationData } = await req.json();

    console.log(`[HandoffSummary] Starting summary generation for conversation ${conversationId}, agent: ${agentSlug}`);

    if (!conversationId || !contactId) {
      throw new Error('Missing required parameters: conversationId and contactId');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch recent messages
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('content, from_type, sent_at, type')
      .eq('conversation_id', conversationId)
      .order('sent_at', { ascending: true })
      .limit(50);

    if (messagesError) {
      console.error('[HandoffSummary] Error fetching messages:', messagesError);
      throw messagesError;
    }

    // 2. Fetch conversation context
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('nina_context, metadata')
      .eq('id', conversationId)
      .single();

    if (convError) {
      console.error('[HandoffSummary] Error fetching conversation:', convError);
    }

    // 3. Fetch contact info
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('notes, name, company, email, phone_number, lead_source, campaign, utm_source, utm_campaign')
      .eq('id', contactId)
      .single();

    if (contactError) {
      console.error('[HandoffSummary] Error fetching contact:', contactError);
      throw contactError;
    }

    // 4. Format conversation for AI
    const conversationText = messages?.map(m => {
      const sender = m.from_type === 'user' ? 'Lead' : 'Atlas';
      const content = m.type === 'audio' ? '[Áudio transcrito]: ' + (m.content || '[não transcrito]') : m.content;
      return `${sender}: ${content}`;
    }).join('\n') || '';

    // Get qualification data from multiple sources
    const qaData = qualificationData || 
                   conversation?.nina_context?.qualification_answers || 
                   conversation?.nina_context?.vehicle_qualification_data ||
                   {};

    // 5. Build prompt based on agent
    let systemPrompt = '';
    
    if (agentSlug === 'atlas') {
      systemPrompt = `Você é um assistente que resume conversas de qualificação de leads para seguro de veículos/frota.

Analise a conversa e os dados coletados e crie um resumo CONCISO e ESTRUTURADO.

FORMATO DO RESUMO (use apenas as seções relevantes):

📊 PERFIL DO LEAD
- Interesse: [frota/veículos/carga]
- Situação atual: [já tem seguro / nunca teve / deixou de renovar]
- Seguradora atual: [se informado]
- Vencimento: [se informado]
- Satisfação: [se mencionou]

🚗 INFORMAÇÕES DA FROTA
- Quantidade: [número de veículos]
- Tipo: [caminhões/carros/motos/etc]
- Uso: [transporte/entrega/pessoal/etc]
- CRLV: [enviou/não enviou]

📋 DADOS COLETADOS
- Nome: [se informado]
- Email: [se informado]
- Empresa: [se informado]
- CNPJ: [se informado]

📍 ORIGEM
- Fonte: [template enviado / mensagem espontânea / campanha]
- Campanha: [se aplicável]

💡 OBSERVAÇÕES
- Objeções ou preocupações mencionadas
- Nível de urgência percebido
- Qualquer informação relevante

⏭️ PRÓXIMO PASSO RECOMENDADO
[Uma frase clara sobre o que o operador deve fazer primeiro]

REGRAS:
- Máximo 200 palavras
- Só incluir seções que tenham informação
- Usar linguagem direta e objetiva
- Focar no que o operador precisa saber para dar continuidade
- Se algo não foi coletado, não mencionar`;
    } else {
      // Generic prompt for other agents
      systemPrompt = `Você é um assistente que resume conversas de qualificação de leads.

Analise a conversa e crie um resumo CONCISO com:
- O que o lead está procurando
- Informações coletadas (nome, email, empresa)
- Contexto relevante
- Próximo passo recomendado

Máximo 150 palavras. Seja direto e objetivo.`;
    }

    // 6. Call AI to generate summary
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const userContent = `CONVERSA:
${conversationText}

DADOS DE QUALIFICAÇÃO COLETADOS:
${JSON.stringify(qaData, null, 2)}

INFORMAÇÕES DO CONTATO:
- Nome: ${contact?.name || 'Não informado'}
- Empresa: ${contact?.company || 'Não informado'}
- Email: ${contact?.email || 'Não informado'}
- Fonte: ${contact?.lead_source || contact?.campaign || contact?.utm_source || 'Não identificado'}
- Campanha: ${contact?.utm_campaign || 'N/A'}`;

    console.log('[HandoffSummary] Calling AI to generate summary...');

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-5-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
        max_completion_tokens: 500,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[HandoffSummary] AI API error:', errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const summary = aiData.choices?.[0]?.message?.content;

    if (!summary) {
      throw new Error('No summary generated by AI');
    }

    console.log('[HandoffSummary] Summary generated successfully');

    // 7. Append summary to contact notes
    const timestamp = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const agentName = agentSlug === 'atlas' ? 'Atlas' : agentSlug?.charAt(0).toUpperCase() + agentSlug?.slice(1) || 'IA';
    
    const newNote = `\n\n---\n📋 Resumo do ${agentName} (${timestamp})\n\n${summary}`;
    
    const existingNotes = contact?.notes || '';
    const updatedNotes = existingNotes + newNote;

    const { error: updateError } = await supabase
      .from('contacts')
      .update({ notes: updatedNotes })
      .eq('id', contactId);

    if (updateError) {
      console.error('[HandoffSummary] Error updating contact notes:', updateError);
      throw updateError;
    }

    console.log(`[HandoffSummary] ✅ Summary saved to contact ${contactId}`);

    return new Response(JSON.stringify({ 
      success: true, 
      summary,
      contactId 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[HandoffSummary] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
