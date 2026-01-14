import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateMessageRequest {
  contact_name: string;
  contact_company?: string;
  agent_name?: string;
  agent_specialty?: string;
  agent_slug?: string;
  prompt_type: 'qualification' | 'urgency' | 'budget' | 'decision' | 'soft_reengagement' | 'last_chance' | 'schedule_call' | 'schedule_call_transportador' | 'unanswered_question' | 're_qualify';
  hours_waiting?: number;
  attempt_number: number;
  conversation_context?: string;
  unanswered_question?: string; // NEW: The specific question that went unanswered
  last_message_sent?: string; // Anti-repetition
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
VARIE a abordagem: pergunte sobre dúvidas, ofereça ajuda específica, ou mencione disponibilidade.`,

  last_chance: `Esta é a ÚLTIMA tentativa de contato com o lead.
Envie uma mensagem de encerramento que:
- Mencione especificamente SEGURO DE CARGA ou o produto discutido
- Ofereça algo de VALOR (cotação sem compromisso, análise gratuita)
- Dê uma última oportunidade de ligação
- NÃO seja passivo ("fico no aguardo" - NÃO!)
- Seja DIRETO e ofereça ação concreta
- SEMPRE termine com: "Acesse nosso site: https://jacometoseguros.com.br/"
Exemplo: "{nome}, posso te enviar uma cotação sem compromisso por aqui. Ou se preferir, me manda seu horário que te ligo. Acesse nosso site: https://jacometoseguros.com.br/"`,

  schedule_call: `O cliente não respondeu à primeira mensagem.
Sua missão é perguntar qual o melhor horário para uma conversa.
Seja direto e natural, ofereça opções flexíveis:
- Pergunte se prefere manhã, tarde ou noite
- Ou deixe ele escolher o melhor momento
- Seja breve e objetivo`,

  schedule_call_transportador: `O cliente é um TRANSPORTADOR que não respondeu sua pergunta de qualificação.
Transportadores são MUITO ocupados e preferem resolver RÁPIDO por telefone.
OFEREÇA uma ligação rápida de forma PROATIVA e DIRETA:
- Mencione que é sobre o SEGURO DE CARGA/RCTR-C
- Destaque: "5 minutinhos resolvo seu seguro"
- Fale que você pode ligar AGORA ou pergunte o melhor horário
- NUNCA seja genérico - vá direto ao ponto
- Mostre que você respeita o tempo dele
- NUNCA peça e-mail (transportadores não usam)
Exemplo: "{nome}, te ligo em 5 min pra resolver seu seguro de carga? Me manda um 'pode ligar' ou me diz o horário."`,

  unanswered_question: `O cliente NÃO respondeu sua última pergunta.
VOCÊ TEM O CONTEXTO DA PERGUNTA - use isso!
Você DEVE retomar a MESMA pergunta de forma DIFERENTE:
- Reformule com outras palavras
- Seja mais direto OU mais casual (varie)
- Ofereça opções prontas se fizer sentido (ex: "É mais frota própria ou terceirizada?")
- NÃO pergunte "o que achou" ou "conseguiu pensar" - NÃO HOUVE CONVERSA!
- Foque em obter a informação que você PRECISA
- Mostre que responder é rápido e fácil`,

  re_qualify: `O cliente mostrou interesse inicial mas não respondeu sua pergunta de qualificação.
Retome de forma mais DIRETA e oferecendo valor:
- Reforce o benefício de responder (ex: "Com isso te passo um valor na hora")
- Seja mais específico nas opções
- Ofereça fazer uma ligação rápida se necessário
- Não seja genérico - use o contexto da conversa`,
};

// Varied fallback messages to never repeat the same one
const FALLBACK_MESSAGES = [
  "{nome}, posso te ligar rapidinho pra resolver sobre o seguro? 5 min e já te passo tudo!",
  "E aí {nome}! Quer que eu te ligue pra explicar melhor sobre a cobertura?",
  "{nome}, me passa o melhor horário que te ligo. Resolvo tudo em 5 minutinhos!",
  "Oi {nome}! Tô por aqui pra te ajudar com o seguro. Posso te ligar agora?",
  "{nome}, ainda precisa do seguro de carga? Me avisa que te ligo!",
  "E aí {nome}! Sua cotação tá quase pronta, só preciso confirmar uns dados. Posso ligar?",
  "{nome}, tô no aguardo. Se quiser, me manda um horário que te ligo!",
  "Oi {nome}! Que tal uma ligação rápida pra resolvermos seu seguro?",
];

// Get a fallback message that's different from the last one
function getVariedFallback(contactName: string, lastMessage?: string): string {
  const name = contactName || 'Cliente';
  let attempts = 0;
  let fallback: string;
  
  do {
    const randomIndex = Math.floor(Math.random() * FALLBACK_MESSAGES.length);
    fallback = FALLBACK_MESSAGES[randomIndex].replace('{nome}', name);
    attempts++;
  } while (lastMessage && fallback === lastMessage && attempts < 10);
  
  return fallback;
}

// Check if two messages are too similar
function messagesTooSimilar(msg1: string, msg2: string): boolean {
  if (!msg1 || !msg2) return false;
  
  const normalize = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, '').trim();
  const n1 = normalize(msg1);
  const n2 = normalize(msg2);
  
  // Exact match
  if (n1 === n2) return true;
  
  // High overlap (>80% of words match)
  const words1 = new Set(n1.split(/\s+/));
  const words2 = new Set(n2.split(/\s+/));
  const intersection = [...words1].filter(w => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;
  const similarity = intersection / union;
  
  return similarity > 0.8;
}

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
      conversation_context,
      unanswered_question,
      last_message_sent
    } = body;

    console.log(`[generate-followup-message] Generating ${prompt_type} message for ${contact_name}, attempt ${attempt_number}`);
    if (unanswered_question) {
      console.log(`[generate-followup-message] Unanswered question detected: "${unanswered_question.substring(0, 80)}..."`);
    }
    if (last_message_sent) {
      console.log(`[generate-followup-message] Last message to avoid: "${last_message_sent.substring(0, 50)}..."`);
    }

    const promptInstruction = PROMPT_TEMPLATES[prompt_type] || PROMPT_TEMPLATES.soft_reengagement;

    // Build anti-repetition instruction
    const antiRepetitionRule = last_message_sent 
      ? `\n\n⚠️ REGRA CRÍTICA ANTI-REPETIÇÃO:
Sua última mensagem foi: "${last_message_sent}"
Você DEVE criar uma mensagem COMPLETAMENTE DIFERENTE:
- Use outra estrutura de frase
- Faça outra pergunta ou ofereça algo diferente
- Mude o CTA (call to action)
- NÃO comece igual nem use as mesmas palavras-chave`
      : '';

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
10. CADA MENSAGEM DEVE SER ÚNICA - nunca repita estrutura ou conteúdo
${antiRepetitionRule}

${promptInstruction}`;

    // Build context-aware user prompt
    let contextSection = '';
    if (unanswered_question) {
      contextSection = `
🎯 CONTEXTO CRÍTICO - PERGUNTA SEM RESPOSTA:
Você fez esta pergunta e o cliente NÃO respondeu: "${unanswered_question}"
Sua missão é RETOMAR essa mesma pergunta de outra forma.
NÃO pergunte "conseguiu pensar?" ou "o que achou?" - ele não respondeu NADA!
Reformule a pergunta de forma mais direta ou ofereça opções.`;
    } else if (conversation_context) {
      contextSection = `\n- Contexto da conversa: ${conversation_context}`;
    }

    const userPrompt = `Gere uma mensagem de follow-up para:
- Nome do cliente: ${contact_name}
${contact_company ? `- Empresa: ${contact_company}` : ''}
${hours_waiting ? `- Horas sem resposta: ${Math.round(hours_waiting)}h` : ''}
- Tentativa número: ${attempt_number}
${contextSection}
${last_message_sent ? `\n❌ NÃO repita nem pareça com: "${last_message_sent}"` : ''}

Responda APENAS com a mensagem, sem explicações ou aspas.`;

    // Use higher temperature for more creativity and variation
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
        temperature: 0.95, // Higher temperature for more variation
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[generate-followup-message] AI Gateway error:', response.status, errorText);
      
      if (response.status === 429 || response.status === 402) {
        const fallbackMessage = getVariedFallback(contact_name, last_message_sent);
        return new Response(JSON.stringify({ 
          error: response.status === 429 ? 'Rate limit exceeded' : 'Créditos insuficientes',
          message: fallbackMessage,
          is_fallback: true
        }), {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    let generatedMessage = data.choices?.[0]?.message?.content?.trim();

    if (!generatedMessage) {
      throw new Error('Nenhuma mensagem gerada pela IA');
    }

    // Clean up the message (remove quotes if present)
    generatedMessage = generatedMessage.replace(/^["']|["']$/g, '').trim();

    // Check if message is too similar to last one - regenerate if needed
    if (last_message_sent && messagesTooSimilar(generatedMessage, last_message_sent)) {
      console.log('[generate-followup-message] Generated message too similar to last, using fallback');
      generatedMessage = getVariedFallback(contact_name, last_message_sent);
    }

    console.log(`[generate-followup-message] Generated: "${generatedMessage.substring(0, 50)}..."`);

    return new Response(JSON.stringify({ 
      message: generatedMessage,
      prompt_type,
      attempt_number 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[generate-followup-message] Error:', error);
    
    // Parse body again for fallback
    let contactName = 'Cliente';
    let lastMessage: string | undefined;
    try {
      const body = await req.clone().json();
      contactName = body.contact_name || 'Cliente';
      lastMessage = body.last_message_sent;
    } catch {}
    
    const fallbackMessage = getVariedFallback(contactName, lastMessage);
    
    return new Response(JSON.stringify({ 
      message: fallbackMessage,
      error: String(error),
      is_fallback: true
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
