import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Detected product type
type DetectedProduct = 'carga' | 'veiculo' | 'frota' | null;

// Interface para rastrear quais tópicos de qualificação já foram respondidos
interface AnsweredQualifications {
  tipo_empresa: boolean;        // pessoa jurídica / autônomo
  tipo_operacao: boolean;       // próprio / terceirizado
  perfil_transportador: boolean; // transportador / embarcador
  tipo_mercadoria: boolean;     // qual mercadoria transporta
  rota_principal: boolean;      // qual rota faz
  valor_carga: boolean;         // valor médio da carga
  qtd_viagens: boolean;         // quantas viagens por mês
  uso_veiculo: boolean;         // profissional / pessoal
  modelo_veiculo: boolean;      // modelo e ano
  qtd_frota: boolean;           // quantos veículos na frota
  tipo_frota: boolean;          // tipos de veículos
}

interface GenerateMessageRequest {
  contact_name: string;
  contact_company?: string;
  agent_name?: string;
  agent_specialty?: string;
  agent_slug?: string;
  prompt_type: 'qualification' | 'urgency' | 'budget' | 'decision' | 'soft_reengagement' | 'last_chance' | 'schedule_call' | 'schedule_call_transportador' | 'unanswered_question' | 're_qualify' | 'direct_question' | 'closing_with_option';
  hours_waiting?: number;
  attempt_number: number;
  conversation_context?: string;
  unanswered_question?: string;
  last_message_sent?: string;
  is_qualified?: boolean;
  detected_product?: DetectedProduct;
  answered_qualifications?: AnsweredQualifications; // NOVO: tópicos já respondidos
}

// Terms forbidden for unqualified leads (they imply a quote is ready when it's not)
const FORBIDDEN_TERMS_FOR_UNQUALIFIED = [
  'cotação', 'cotacao', 'orçamento', 'orcamento', 'proposta', 
  'valor', 'preço', 'preco', 'quase pronta', 'pronto', 'pronta',
  'confirmar dados', 'confirmar os dados', 'finalizar'
];

// Sanitize message for unqualified leads - prevent forbidden terms
function sanitizeMessageForUnqualifiedLead(
  message: string, 
  isQualified: boolean,
  contactName: string,
  lastMessage?: string,
  detectedProduct?: DetectedProduct,
  answeredQualifications?: AnsweredQualifications
): string {
  if (isQualified) return message;
  
  const lowerMessage = message.toLowerCase();
  const containsForbidden = FORBIDDEN_TERMS_FOR_UNQUALIFIED.some(term => lowerMessage.includes(term));
  
  if (containsForbidden) {
    console.log(`[generate-followup-message] Message contains forbidden terms for unqualified lead: "${message.substring(0, 60)}..."`);
    console.log(`[generate-followup-message] Falling back to re-qualification message`);
    return getVariedFallback(contactName, lastMessage, detectedProduct, answeredQualifications);
  }
  
  return message;
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

  unanswered_question: `O cliente NÃO respondeu sua última pergunta de qualificação.
CONTEXTO CRÍTICO: O lead pode ter vindo de um anúncio e está no início da conversa.
Você DEVE:
1. Retomar a pergunta de forma DIFERENTE e mais SIMPLES
2. Oferecer OPÇÕES prontas (ex: "É mais pra carga ou veículo?")
3. Ser BREVE e direto - 1 a 2 frases no máximo
4. NUNCA mencionar cotação ou orçamento (ainda não há!)
5. Foco em DESCOBRIR a necessidade do cliente
Exemplo: "{nome}, me ajuda aqui: é pra proteger a carga durante o transporte ou o veículo em si?"`,

  re_qualify: `O cliente mostrou interesse inicial mas não respondeu sua pergunta de qualificação.
Retome de forma mais DIRETA e oferecendo valor:
- Reforce o benefício de responder (ex: "Com isso te passo um valor na hora")
- Seja mais específico nas opções
- Ofereça fazer uma ligação rápida se necessário
- Não seja genérico - use o contexto da conversa`,

  direct_question: `O cliente respondeu inicialmente mas parou de responder.
Esta é uma tentativa CURTA e DIRETA:
- Faça UMA única pergunta objetiva de qualificação
- Máximo 1-2 frases, SEM introdução longa
- Vá direto ao ponto: "{nome}, vocês já têm seguro hoje?"
- NÃO ofereça ligação ainda, só faça a pergunta
- Tom casual mas profissional
Exemplos:
- "{nome}, vocês já trabalham com alguma seguradora?"
- "{nome}, qual tipo de seguro vocês mais precisam?"
- "{nome}, sua transportadora já tem cobertura de carga?"`,

  closing_with_option: `Esta é a ÚLTIMA tentativa de contato, faça um encerramento ELEGANTE:
- Reconheça que o cliente pode estar ocupado
- NÃO seja insistente ou repetitivo
- Deixe a porta aberta para contato futuro
- Seja BREVE e respeitoso (máximo 2-3 frases)
- SEMPRE termine com algo como "Se precisar, é só me chamar aqui!"
Exemplo:
"{nome}, caso não tenha interesse agora, sem problemas! Se precisar de seguro pra transportadora no futuro, é só me chamar aqui. Abraço! 🤝"
NÃO mencione: cotação, proposta, valores (já que não qualificou)`,
};

// Fallback messages by product - avoids redundant questions
const FALLBACK_MESSAGES_BY_PRODUCT: Record<string, string[]> = {
  carga: [
    "{nome}, sobre o seguro de carga: qual tipo de mercadoria você transporta?",
    "Oi {nome}! Sobre seu seguro de carga, você faz transporte próprio ou terceirizado?",
    "{nome}, posso te ligar pra falar sobre as coberturas de carga? 5 min!",
    "E aí {nome}! Pra gente avançar no seguro de carga, me conta a rota principal que você faz!",
    "{nome}, qual o valor médio das cargas que você transporta? Assim te passo as melhores opções!",
  ],
  veiculo: [
    "{nome}, sobre o seguro do veículo: é pra uso profissional ou pessoal?",
    "Oi {nome}! Pra te passar as opções certas, me conta qual o modelo do veículo!",
    "{nome}, posso te ligar pra falar sobre as coberturas do seu veículo? 5 min!",
    "E aí {nome}! O veículo é pra transporte de carga ou de passageiros?",
    "{nome}, o veículo é seu ou de frota? Me conta que te ajudo!",
  ],
  frota: [
    "{nome}, sobre o seguro de frota: quantos veículos você tem hoje?",
    "Oi {nome}! Sua frota é só de caminhões ou tem outros tipos de veículo?",
    "{nome}, posso te ligar pra falar sobre as opções de seguro pra frota? 5 min!",
    "E aí {nome}! Os veículos da frota fazem que tipo de transporte?",
    "{nome}, pra montar a melhor proposta, me conta quantos veículos são na frota!",
  ],
  generico: [
    "{nome}, me conta: qual tipo de seguro você está buscando? Posso te ajudar!",
    "Oi {nome}! Você precisa de seguro pra transporte, frota ou carga? Me fala que te ajudo!",
    "{nome}, posso te ligar rapidinho pra entender sua necessidade? 5 min!",
    "E aí {nome}! Ainda precisa de ajuda com seguro? Me conta o que você busca!",
    "{nome}, tô aqui pra te ajudar! É pra proteger veículo, carga ou os dois?",
    "Oi {nome}! Me conta o que você transporta que te passo as opções de seguro!",
    "{nome}, quer que eu te ligue pra explicar as coberturas disponíveis?",
    "E aí {nome}! Qual sua principal preocupação: proteger a carga ou o veículo?",
  ],
};

// Mapeamento de perguntas para tópicos de qualificação
const QUESTION_TOPIC_MAP: Record<string, keyof AnsweredQualifications> = {
  'pessoa jurídica ou autônomo': 'tipo_empresa',
  'jurídica ou autônomo': 'tipo_empresa',
  'pj ou autônomo': 'tipo_empresa',
  'transportadora ou motorista': 'tipo_empresa',
  'tem transportadora': 'tipo_empresa',
  'próprio ou terceirizado': 'tipo_operacao',
  'transporte próprio': 'tipo_operacao',
  'presta serviço': 'tipo_operacao',
  'carga própria': 'tipo_operacao',
  'transportador ou embarcador': 'perfil_transportador',
  'dono da carga': 'perfil_transportador',
  'qual tipo de mercadoria': 'tipo_mercadoria',
  'o que você transporta': 'tipo_mercadoria',
  'que tipo de carga': 'tipo_mercadoria',
  'rota principal': 'rota_principal',
  'qual rota': 'rota_principal',
  'pra onde você': 'rota_principal',
  'valor médio': 'valor_carga',
  'quanto vale': 'valor_carga',
  'quantas viagens': 'qtd_viagens',
  'viagens por mês': 'qtd_viagens',
  'uso profissional ou pessoal': 'uso_veiculo',
  'trabalho ou lazer': 'uso_veiculo',
  'modelo e ano': 'modelo_veiculo',
  'qual o modelo': 'modelo_veiculo',
  'ano do veículo': 'modelo_veiculo',
  'quantos veículos': 'qtd_frota',
  'tamanho da frota': 'qtd_frota',
  'tipos de veículo': 'tipo_frota',
  'só caminhões': 'tipo_frota',
};

// Filtra perguntas que já foram respondidas
function filterUnansweredQuestions(
  questions: string[],
  answeredQualifications?: AnsweredQualifications
): string[] {
  if (!answeredQualifications) return questions;
  
  return questions.filter(question => {
    const questionLower = question.toLowerCase();
    
    for (const [trigger, topic] of Object.entries(QUESTION_TOPIC_MAP)) {
      if (questionLower.includes(trigger) && answeredQualifications[topic]) {
        console.log(`[generate-followup-message] Filtering out answered question: "${question.substring(0, 40)}..." (topic: ${topic})`);
        return false;
      }
    }
    return true;
  });
}

// Get a fallback message that's different from the last one, using product-specific messages
function getVariedFallback(
  contactName: string, 
  lastMessage?: string,
  detectedProduct?: DetectedProduct,
  answeredQualifications?: AnsweredQualifications
): string {
  const name = contactName || 'Cliente';
  const productKey = detectedProduct || 'generico';
  let messages = FALLBACK_MESSAGES_BY_PRODUCT[productKey] || FALLBACK_MESSAGES_BY_PRODUCT.generico;
  
  // Filtrar mensagens de perguntas já respondidas
  messages = filterUnansweredQuestions(messages, answeredQualifications);
  
  // Se todas as perguntas foram respondidas, usar mensagens de avanço
  if (messages.length === 0) {
    console.log(`[generate-followup-message] All qualification questions answered - using advancement messages`);
    messages = [
      `${name}, já tenho tudo que preciso! Posso te ligar em 5 min pra fechar?`,
      `Oi ${name}! Com essas informações, consigo te passar as melhores opções. Me manda um horário que te ligo!`,
      `${name}, perfeito! Que tal uma ligação rápida pra eu te apresentar a proposta?`,
    ];
    // Retornar diretamente sem substituição (já tem o nome)
    const randomIndex = Math.floor(Math.random() * messages.length);
    return messages[randomIndex];
  }
  
  let attempts = 0;
  let fallback: string;
  
  do {
    const randomIndex = Math.floor(Math.random() * messages.length);
    fallback = messages[randomIndex].replace('{nome}', name);
    attempts++;
  } while (lastMessage && fallback === lastMessage && attempts < 10);
  
  console.log(`[generate-followup-message] Fallback for product "${productKey}": "${fallback.substring(0, 50)}..."`);
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
      last_message_sent,
      is_qualified = true,
      detected_product = null,
      answered_qualifications = null // NOVO: tópicos já respondidos
    } = body;
    
    // Log answered qualifications
    if (answered_qualifications) {
      const answeredTopics = Object.entries(answered_qualifications)
        .filter(([_, v]) => v)
        .map(([k]) => k);
      console.log(`[generate-followup-message] Already answered topics: ${answeredTopics.join(', ') || 'none'}`);
    }
    
    console.log(`[generate-followup-message] Lead: qualified=${is_qualified ? 'YES' : 'NO'}, product=${detected_product || 'none'}`);

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
    
    // Add product context if detected - CRITICAL to avoid redundant questions
    // Perguntas de qualificação específicas por produto
    const qualificationQuestions: Record<string, string[]> = {
      carga: [
        'Você é transportador pessoa jurídica ou autônomo?',
        'Faz transporte próprio ou terceirizado (presta serviço)?',
        'Você é transportador ou embarcador da carga?',
        'Qual tipo de mercadoria você transporta?',
        'Qual a rota principal que você faz?',
        'Qual o valor médio das cargas transportadas?',
        'Quantas viagens você faz por mês?',
      ],
      veiculo: [
        'O veículo é próprio ou financiado?',
        'É pra uso profissional ou pessoal?',
        'Qual o modelo e ano do veículo?',
        'Você usa pra transporte de carga ou passageiros?',
      ],
      frota: [
        'A frota é própria ou terceirizada?',
        'Quantos veículos tem na frota?',
        'Os motoristas são CLT ou agregados?',
        'Quais tipos de veículos (caminhões, vans, etc)?',
        'Que tipo de transporte a frota faz?',
      ],
    };

    let productContext = '';
    if (detected_product) {
      const productLabels: Record<string, string> = {
        carga: 'SEGURO DE CARGA / TRANSPORTADOR',
        veiculo: 'SEGURO DE VEÍCULO',
        frota: 'SEGURO DE FROTA'
      };
      const allQuestions = qualificationQuestions[detected_product] || [];
      
      // Filtrar perguntas já respondidas
      const availableQuestions = filterUnansweredQuestions(allQuestions, answered_qualifications || undefined);
      
      console.log(`[generate-followup-message] Available questions: ${availableQuestions.length}/${allQuestions.length}`);
      
      if (availableQuestions.length === 0) {
        productContext = `
⚠️ QUALIFICAÇÃO COMPLETA: O cliente já respondeu TODAS as perguntas de qualificação para ${productLabels[detected_product]}!
- NÃO faça mais perguntas sobre perfil, tipo de empresa, mercadoria, etc.
- Agora você deve AVANÇAR: sugira agendar uma LIGAÇÃO ou enviar uma PROPOSTA
- Seja direto: "Posso te ligar em 5 min?" ou "Qual o melhor horário pra eu te ligar?"`;
      } else {
        productContext = `
⚠️ PRODUTO JÁ IDENTIFICADO: O cliente demonstrou interesse em ${productLabels[detected_product] || detected_product.toUpperCase()}.
- NUNCA pergunte "carga ou veículo?" - ele já disse o que quer!
- Escolha UMA destas perguntas (as outras JÁ FORAM RESPONDIDAS):
  ${availableQuestions.map(q => `• ${q}`).join('\n  ')}
- Seja ESPECÍFICO e NATURAL sobre ${detected_product}
- NUNCA repita perguntas que ele já respondeu!`;
      }
    }

    const userPrompt = `Gere uma mensagem de follow-up para:
- Nome do cliente: ${contact_name}
${contact_company ? `- Empresa: ${contact_company}` : ''}
${hours_waiting ? `- Horas sem resposta: ${Math.round(hours_waiting)}h` : ''}
- Tentativa número: ${attempt_number}
${contextSection}
${productContext}
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
        const fallbackMessage = getVariedFallback(contact_name, last_message_sent, detected_product, answered_qualifications || undefined);
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
      generatedMessage = getVariedFallback(contact_name, last_message_sent, detected_product, answered_qualifications || undefined);
    }
    
    // Sanitize message for unqualified leads - prevent forbidden terms
    generatedMessage = sanitizeMessageForUnqualifiedLead(generatedMessage, is_qualified, contact_name, last_message_sent, detected_product, answered_qualifications || undefined);

    console.log(`[generate-followup-message] Generated: "${generatedMessage.substring(0, 50)}..."`);

    return new Response(JSON.stringify({ 
      message: generatedMessage,
      prompt_type,
      attempt_number,
      is_qualified
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[generate-followup-message] Error:', error);
    
    // Parse body again for fallback
    let contactName = 'Cliente';
    let lastMessage: string | undefined;
    let product: DetectedProduct = null;
    try {
      const body = await req.clone().json();
      contactName = body.contact_name || 'Cliente';
      lastMessage = body.last_message_sent;
      product = body.detected_product || null;
    } catch {}
    
    const fallbackMessage = getVariedFallback(contactName, lastMessage, product);
    
    return new Response(JSON.stringify({ 
      message: fallbackMessage,
      error: String(error),
      is_fallback: true
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
