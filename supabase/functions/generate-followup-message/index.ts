import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateMessageRequest {
  contact_name: string;
  contact_company?: string;
  agent_name?: string;
  agent_specialty?: string;
  prompt_type: 'qualification' | 'urgency' | 'budget' | 'decision' | 'soft_reengagement' | 'last_chance' | 'schedule_call';
  hours_waiting?: number;
  attempt_number: number;
  conversation_context?: string;
}

const PROMPT_TEMPLATES: Record<string, string> = {
  qualification: `Você precisa descobrir mais sobre as necessidades do cliente. 
Faça UMA pergunta aberta e natural para entender melhor:
- Qual problema/dor ele está tentando resolver
- O que motivou ele a procurar sua solução
Exemplo de estrutura: "Entendi! E me conta, [pergunta sobre necessidade específica]?"`,

  urgency: `Você precisa entender a urgência do cliente.
Faça UMA pergunta natural para descobrir:
- Quando ele precisa resolver isso
- Se há algum prazo ou evento que exige pressa
Exemplo de estrutura: "E pra quando você precisaria resolver isso?"`,

  budget: `Você precisa entender a disponibilidade de investimento.
Faça UMA pergunta indireta e natural sobre orçamento:
- Sem parecer invasivo ou comercial demais
- Focando no valor/investimento esperado
Exemplo de estrutura: "Você já tem uma ideia de quanto pretende investir nisso?"`,

  decision: `Você precisa entender o processo de decisão.
Faça UMA pergunta natural para descobrir:
- Quem mais participa da decisão
- Se ele é o decisor final
Exemplo de estrutura: "Além de você, mais alguém vai participar dessa decisão?"`,

  soft_reengagement: `O cliente não respondeu há algum tempo.
Envie uma mensagem leve e amigável para retomar:
- Sem ser insistente
- Oferecendo ajuda genuína
- Deixando a porta aberta
Exemplo de estrutura: "Oi [nome]! Só passando pra ver se posso ajudar com mais alguma informação..."`,

  last_chance: `Esta é provavelmente a última tentativa de contato.
Envie uma mensagem de encerramento amigável que:
- Não seja agressiva ou culpabilizadora
- Deixe claro que você está disponível
- Ofereça uma alternativa (ligação, outro momento)
- SEMPRE termine a mensagem com: "Acesse nosso site: https://jacometoseguros.com.br/"
Exemplo de estrutura: "Oi [nome], vou encerrar nosso atendimento por aqui, mas fico à disposição caso precise... Acesse nosso site: https://jacometoseguros.com.br/"`,

  schedule_call: `O cliente não respondeu à primeira mensagem.
Sua missão é perguntar qual o melhor horário para uma conversa.
Seja direto e natural, ofereça opções flexíveis:
- Pergunte se prefere manhã, tarde ou noite
- Ou deixe ele escolher o melhor momento
- Seja breve e objetivo
Exemplo de estrutura: "Oi [nome]! Qual seria o melhor horário pra gente conversar? Posso te ligar de manhã ou prefere à tarde?"`,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY não configurada');
    }

    const body: GenerateMessageRequest = await req.json();
    const { 
      contact_name, 
      contact_company, 
      agent_name, 
      agent_specialty,
      prompt_type, 
      hours_waiting,
      attempt_number,
      conversation_context 
    } = body;

    console.log(`[generate-followup-message] Generating ${prompt_type} message for ${contact_name}, attempt ${attempt_number}`);

    const promptInstruction = PROMPT_TEMPLATES[prompt_type] || PROMPT_TEMPLATES.soft_reengagement;

    const systemPrompt = `Você é ${agent_name || 'um assistente de vendas'} ${agent_specialty ? `especializado em ${agent_specialty}` : ''}.
Sua missão é gerar UMA mensagem de follow-up curta e natural para WhatsApp.

REGRAS OBRIGATÓRIAS:
1. Máximo 2-3 frases curtas
2. Tom amigável e consultivo, NUNCA robótico
3. Use linguagem informal brasileira (oi, tudo bem, etc)
4. NUNCA use palavras como "automático", "sistema", "mensagem automática"
5. NUNCA comece com "Olá!" - prefira "Oi" ou "E aí"
6. Use o nome do cliente de forma natural
7. A mensagem deve parecer escrita por um humano
8. NÃO use emojis em excesso (máximo 1)
9. Faça apenas UMA pergunta ou solicitação

${promptInstruction}`;

    const userPrompt = `Gere uma mensagem de follow-up para:
- Nome do cliente: ${contact_name}
${contact_company ? `- Empresa: ${contact_company}` : ''}
${hours_waiting ? `- Horas sem resposta: ${Math.round(hours_waiting)}h` : ''}
- Tentativa número: ${attempt_number}
${conversation_context ? `- Contexto da conversa: ${conversation_context}` : ''}

Responda APENAS com a mensagem, sem explicações ou aspas.`;

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
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 200,
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[generate-followup-message] AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ 
          error: 'Rate limit exceeded. Tente novamente em alguns segundos.',
          fallback_message: `Oi ${contact_name}! Tudo bem? Ainda estou por aqui caso precise de ajuda.`
        }), {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      if (response.status === 402) {
        return new Response(JSON.stringify({ 
          error: 'Créditos insuficientes na Lovable AI.',
          fallback_message: `Oi ${contact_name}! Tudo bem? Ainda estou por aqui caso precise de ajuda.`
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const generatedMessage = data.choices?.[0]?.message?.content?.trim();

    if (!generatedMessage) {
      throw new Error('Nenhuma mensagem gerada pela IA');
    }

    // Clean up the message (remove quotes if present)
    const cleanMessage = generatedMessage.replace(/^["']|["']$/g, '').trim();

    console.log(`[generate-followup-message] Generated: "${cleanMessage.substring(0, 50)}..."`);

    return new Response(JSON.stringify({ 
      message: cleanMessage,
      prompt_type,
      attempt_number 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[generate-followup-message] Error:', error);
    
    // Return a fallback message instead of failing
    const body = await req.json().catch(() => ({}));
    const fallbackMessage = `Oi ${body.contact_name || 'Cliente'}! Tudo bem? Ainda estou por aqui caso precise de ajuda.`;
    
    return new Response(JSON.stringify({ 
      message: fallbackMessage,
      error: String(error),
      is_fallback: true
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
