import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, contactName, agentName } = await req.json();

    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No messages provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    // Format messages for context
    const conversationText = messages.map((m: any) => {
      const sender = m.from_type === 'user' ? contactName : (m.from_type === 'nina' ? agentName : 'Operador');
      return `${sender}: ${m.content || '[mídia]'}`;
    }).join('\n');

    const systemPrompt = `Você é um especialista em análise de conversas de vendas B2B. Analise a conversa e gere um resumo conciso e estruturado.

Formato do resumo (use exatamente estes cabeçalhos):

📌 SITUAÇÃO
[Contexto geral: quem é o lead, como chegou, qual interesse inicial]

🎯 NECESSIDADES
[O que o cliente busca/precisa, problemas que quer resolver]

📋 DADOS COLETADOS
[Informações obtidas: CNPJ, tipo de carga, estados, valores, ANTT, CT-e, etc.]

⏭️ PRÓXIMOS PASSOS
[O que precisa ser feito: cotação, documentos, contato, etc.]

💡 OBSERVAÇÕES
[Detalhes relevantes, objeções, pontos de atenção]

Regras:
- Seja conciso, máximo 150 palavras total
- Use bullet points quando apropriado
- Foque em informações acionáveis
- Omita seções sem informação relevante
- Mantenha tom profissional`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Analise esta conversa e gere o resumo:\n\n${conversationText}` }
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content?.trim();

    if (!summary) {
      throw new Error('No summary generated');
    }

    console.log('Summary generated successfully for contact:', contactName);

    return new Response(
      JSON.stringify({ summary }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-summary:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate summary';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
