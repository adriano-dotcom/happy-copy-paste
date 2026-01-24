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

// Interface para status de seguro existente
interface InsuranceStatus {
  has_vehicle_insurance?: boolean;
  has_cargo_insurance?: boolean;
  satisfaction?: 'satisfied' | 'dissatisfied' | null;
  renewal_date?: string | null;
  hasSoftRejection?: boolean; // NOVO: detectado desinteresse leve
}

interface GenerateMessageRequest {
  contact_name: string;
  contact_company?: string;
  agent_name?: string;
  agent_specialty?: string;
  agent_slug?: string;
  prompt_type: 'qualification' | 'urgency' | 'budget' | 'decision' | 'soft_reengagement' | 'last_chance' | 'schedule_call' | 'schedule_call_transportador' | 'unanswered_question' | 're_qualify' | 'direct_question' | 'closing_with_option' | 'closing_with_option_insurance' | 'schedule_renewal' | 'ask_insurance_renewal' | 'prospecting_closing' | 'prospecting_no_reply' | 'health_closing' | 'health_no_reply';
  hours_waiting?: number;
  attempt_number: number;
  conversation_context?: string;
  unanswered_question?: string;
  last_message_sent?: string;
  is_qualified?: boolean;
  detected_product?: DetectedProduct;
  answered_qualifications?: AnsweredQualifications; // tópicos já respondidos
  insurance_status?: InsuranceStatus; // status de seguro existente
}

// Terms forbidden for unqualified leads (they imply a quote is ready when it's not)
const FORBIDDEN_TERMS_FOR_UNQUALIFIED = [
  'cotação', 'cotacao', 'orçamento', 'orcamento', 'proposta', 
  'valor', 'preço', 'preco', 'quase pronta', 'pronto', 'pronta',
  'confirmar dados', 'confirmar os dados', 'finalizar'
];

// Sanitize message for unqualified leads - prevent forbidden terms
// NOTA: Prompts de prospecção (prospecting_closing, prospecting_no_reply) NÃO devem ser sanitizados
function sanitizeMessageForUnqualifiedLead(
  message: string, 
  isQualified: boolean,
  contactName: string,
  lastMessage?: string,
  detectedProduct?: DetectedProduct,
  answeredQualifications?: AnsweredQualifications,
  promptType?: string // NOVO: tipo de prompt para bypass
): string {
  if (isQualified) return message;
  
  // Prompts de prospecção e saúde são encerramentos profissionais - não devem cair em fallback
  if (promptType === 'prospecting_closing' || promptType === 'prospecting_no_reply' || 
      promptType === 'health_closing' || promptType === 'health_no_reply') {
    console.log(`[generate-followup-message] Skipping sanitization for closing prompt: ${promptType}`);
    return message;
  }
  
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

  // NOVO: Encerramento elegante específico para leads com seguro existente
  closing_with_option_insurance: `O cliente JÁ TEM SEGURO mas parou de responder suas perguntas sobre renovação.
Esta é uma mensagem de ENCERRAMENTO ELEGANTE e RESPEITOSO:

VOCÊ DEVE:
- Agradecer o contato de forma BREVE (1 frase)
- Mencionar que fica à disposição para quando precisar RENOVAR ou COMPARAR valores
- NUNCA perguntar "o que você precisa?" - ELE JÁ TEM SEGURO!
- Máximo 2 frases
- Tom profissional, amigável e respeitoso

Exemplos:
"{nome}, agradeço o contato! Quando precisar cotar a renovação, é só me chamar aqui. Abraço! 🤝"
"{nome}, fico à disposição pra quando quiser comparar valores na renovação. Bom trabalho! 👍"
"{nome}, caso queira uma cotação comparativa no futuro, é só me chamar. Abraço!"

NUNCA use:
- "O que você precisa?"
- "Qual tipo de seguro?"
- "Posso te ajudar com algo?"
- Perguntas genéricas de qualificação`,

  schedule_renewal: `O cliente JÁ TEM SEGURO e informou isso anteriormente.
NUNCA pergunte "o que você precisa?" ou "qual seguro?" - ELE JÁ TEM!

Sua missão é AVANÇAR para a renovação:
1. Se NÃO perguntou vencimento: "Quando vence a apólice atual?"
2. Se já tem vencimento: "Posso preparar uma cotação comparativa pra vocês avaliarem na renovação?"
3. CROSS-SELL: Se só falou de veículo, pergunte sobre CARGA. Se só falou de carga, pergunte sobre VEÍCULO.

Seja CONSULTIVO e ofereça VALOR:
- Cotação comparativa sem compromisso
- Análise das coberturas atuais
- Condições especiais para renovação

Exemplos:
- "{nome}, quando vence o seguro atual? Posso preparar uma cotação comparativa!"
- "{nome}, e sobre o seguro de carga, vocês têm RCTR-C?"
- "Posso preparar uma proposta pra vocês compararem na renovação, sem compromisso!"`,

  // NOVO: Pergunta sobre seguro para leads que fizeram soft rejection
  ask_insurance_renewal: `O cliente disse que NÃO TEM INTERESSE ou NÃO PRECISA AGORA.
Esta é a ÚLTIMA E ÚNICA tentativa de contato. Seja BREVE e RESPEITOSO:

VOCÊ DEVE:
1. Perguntar SE o cliente tem seguro atualmente (de carga ou veículo)
2. Se sim, perguntar quando vence para oferecer cotação comparativa
3. Deixar a porta aberta para contato futuro
4. Máximo 2 frases
5. Tom amigável, SEM PRESSÃO

NUNCA:
- Insistir ou parecer desesperado
- Fazer múltiplas perguntas
- Usar frases genéricas como "posso te ajudar?"
- Repetir a mesma abordagem de antes

Exemplos:
- "{nome}, entendo! Só uma curiosidade: vocês já têm seguro de carga ou veículo hoje? Se tiver, quando vence? Fico à disposição pra comparar valores 😉"
- "{nome}, tranquilo! Pergunta rápida: vocês têm seguro na frota hoje? Quando vence? Me chama aqui quando quiser cotar!"
- "{nome}, sem problemas! Vocês já estão segurados? Se sim, posso fazer uma cotação comparativa pra renovação, sem compromisso!"`,

  // NOVO: Encerramento profissional para prospecção (Atlas) - Lead respondeu mas parou
  prospecting_closing: `O lead de PROSPECÇÃO respondeu inicialmente mas parou de interagir.
Esta é a ÚLTIMA mensagem - faça um encerramento PROFISSIONAL e ELEGANTE:

ESTRUTURA OBRIGATÓRIA:
1. Reconheça que o lead pode estar ocupado (1 frase curta)
2. Ofereça disponibilidade para cotar seguro de CARGA e FROTA
3. SEMPRE termine com: "Confira nossos serviços em jacometoseguros.com.br"

REGRAS:
- Máximo 3 frases
- NÃO insista ou seja repetitivo
- NÃO faça perguntas
- Tom amigável e profissional
- Agradeça pelo tempo
- Use o primeiro nome do cliente de forma natural

EXEMPLOS APROVADOS:
- "Entendo que você pode estar ocupado no momento. Fico à disposição sempre que precisar cotar seguro de carga ou frota. Confira nossos serviços em jacometoseguros.com.br. Obrigado pelo seu tempo!"
- "Obrigado por receber minha mensagem! Quando precisar de cotação para seguro de transporte de carga ou frota, estou à disposição. Visite jacometoseguros.com.br para saber mais sobre nossos serviços."
- "Agradeço sua atenção! Caso precise proteger suas cargas ou frota no futuro, estaremos prontos para ajudar. Acesse jacometoseguros.com.br e conheça nossas soluções."
- "Fico à disposição para quando precisar de seguro para sua operação. Você pode conhecer mais sobre a Jacometo Seguros em jacometoseguros.com.br. Tenha um ótimo dia!"

NUNCA USE:
- Perguntas ("Você precisa de algo?")
- Nome em MAIÚSCULAS
- Insistência ("Me responde?", "Está aí?")
- Promessas de cotação não solicitadas`,

  // NOVO: Encerramento para prospecção quando lead NUNCA respondeu ao template
  prospecting_no_reply: `O lead de prospecção NÃO RESPONDEU ao template inicial.
Envie UMA mensagem de encerramento educada:

ESTRUTURA:
1. Agradeça por receber a mensagem
2. Ofereça disponibilidade para seguro de carga ou frota
3. SEMPRE termine com: "Visite jacometoseguros.com.br para saber mais."

EXEMPLOS:
- "Obrigado por receber minha mensagem! Quando precisar de cotação para seguro de transporte de carga ou frota, estou à disposição. Visite jacometoseguros.com.br para saber mais sobre nossos serviços."
- "Fico à disposição caso precise de proteção para sua operação no futuro. Conheça a Jacometo Seguros em jacometoseguros.com.br. Até mais!"
- "Agradeço sua atenção! Se precisar de seguro para carga ou frota, é só me chamar. Acesse jacometoseguros.com.br e conheça nossas soluções."

REGRAS:
- Máximo 2 frases + site
- NÃO faça perguntas
- NÃO insista
- Use o primeiro nome do cliente de forma natural`,

  // NOVO: Encerramento profissional para SAÚDE (Clara) - Lead respondeu mas parou
  health_closing: `O lead de PLANOS DE SAÚDE respondeu inicialmente mas parou de interagir.
Esta é a ÚLTIMA mensagem - faça um encerramento PROFISSIONAL e ELEGANTE:

ESTRUTURA OBRIGATÓRIA:
1. Reconheça que o lead pode estar ocupado (1 frase curta)
2. Ofereça disponibilidade para cotar planos de saúde empresarial, individual ou odontológico
3. SEMPRE termine com: "Confira nossos serviços em jacometoseguros.com.br"

REGRAS:
- Máximo 3 frases
- NÃO insista ou seja repetitivo
- NÃO faça perguntas
- Tom amigável, acolhedor e profissional
- Agradeça pelo tempo
- Use o primeiro nome do cliente de forma natural

EXEMPLOS APROVADOS:
- "Entendo que você pode estar ocupado no momento. Fico à disposição sempre que precisar cotar plano de saúde empresarial, familiar ou odontológico. Confira nossos serviços em jacometoseguros.com.br. Obrigada pelo seu tempo!"
- "Agradeço sua atenção! Quando precisar de cotação de plano de saúde, estou à disposição. Acesse jacometoseguros.com.br e conheça nossas soluções."
- "Fico à disposição para quando precisar cuidar da saúde da sua equipe ou família. Conheça mais em jacometoseguros.com.br. Tenha um ótimo dia!"

NUNCA USE:
- Perguntas ("Você precisa de algo?")
- Nome em MAIÚSCULAS
- Insistência ("Me responde?", "Está aí?")`,

  // NOVO: Encerramento para SAÚDE quando lead NUNCA respondeu
  health_no_reply: `O lead de planos de saúde NÃO RESPONDEU ao contato inicial.
Envie UMA mensagem de encerramento educada:

ESTRUTURA:
1. Agradeça por receber a mensagem
2. Ofereça disponibilidade para planos de saúde empresarial, individual ou odontológico
3. SEMPRE termine com: "Visite jacometoseguros.com.br para saber mais."

EXEMPLOS:
- "Obrigada por receber minha mensagem! Quando precisar de cotação para plano de saúde, estou à disposição. Visite jacometoseguros.com.br para conhecer nossas soluções."
- "Fico à disposição caso precise de um plano de saúde para sua empresa ou família. Conheça a Jacometo Seguros em jacometoseguros.com.br. Até mais!"
- "Agradeço sua atenção! Se precisar de plano de saúde ou odontológico, é só me chamar. Acesse jacometoseguros.com.br e conheça nossos serviços."

REGRAS:
- Máximo 2 frases + site
- NÃO faça perguntas
- NÃO insista
- Use o primeiro nome do cliente de forma natural
- Tom acolhedor e empático (especialista em saúde)`
};

// TEMAS DE FALLBACK - organizados para evitar repetição semântica
interface FallbackTheme {
  tema: string;
  mensagens: string[];
}

const FALLBACK_THEMES_BY_PRODUCT: Record<string, FallbackTheme[]> = {
  carga: [
    { tema: 'mercadoria', mensagens: [
      "Qual tipo de mercadoria você transporta?",
      "Me conta o que você transporta!"
    ]},
    { tema: 'rota', mensagens: [
      "Pra sua carga, qual a rota principal que você faz?",
      "Quais estados você atende com mais frequência?"
    ]},
    { tema: 'valor', mensagens: [
      "Qual o valor médio das cargas?",
      "Quantas viagens você faz por mês em média?"
    ]},
    { tema: 'ligacao', mensagens: [
      "Posso te ligar pra falar sobre as coberturas? 5 min!"
    ]},
  ],
  veiculo: [
    { tema: 'uso', mensagens: [
      "O veículo é pra uso profissional ou pessoal?"
    ]},
    { tema: 'modelo', mensagens: [
      "Me conta qual o modelo e ano do veículo!",
      "Qual veículo você quer segurar?"
    ]},
    { tema: 'ligacao', mensagens: [
      "Posso te ligar pra falar sobre as coberturas? 5 min!"
    ]},
  ],
  frota: [
    { tema: 'quantidade', mensagens: [
      "Quantos veículos tem na frota hoje?",
      "Me conta quantos veículos são na frota!"
    ]},
    { tema: 'tipo', mensagens: [
      "A frota é só de caminhões ou tem outros tipos?",
      "Quais tipos de veículos tem na frota?"
    ]},
    { tema: 'ligacao', mensagens: [
      "Posso te ligar pra falar sobre seguro de frota? 5 min!"
    ]},
  ],
  generico: [
    { tema: 'necessidade', mensagens: [
      "Qual tipo de seguro você está buscando?",
      "É pra proteger veículo, carga ou os dois?"
    ]},
    { tema: 'ligacao', mensagens: [
      "Posso te ligar pra entender sua necessidade? 5 min!"
    ]},
  ],
  has_insurance: [
    { tema: 'vencimento', mensagens: [
      "Quando vence a apólice atual? Posso preparar uma cotação comparativa!",
      "Sobre sua apólice atual: quando vence?"
    ]},
    { tema: 'crosssell', mensagens: [
      "Além do seguro do veículo, vocês têm RCTR-C pra proteger a carga?",
      "Você tem seguro de carga também? É diferente do seguro do veículo!"
    ]},
  ],
};

// Grupos de perguntas semanticamente similares
const SIMILAR_QUESTION_GROUPS = [
  ['pessoa jurídica', 'autônomo', 'transportadora', 'motorista autônomo', 'pj', 'embarcador', 'transportador'],
  ['próprio', 'terceirizado', 'agregado', 'presta serviço'],
  ['modelo', 'ano do veículo', 'qual veículo'],
  ['quantos veículos', 'quantas viagens', 'quantos caminhões'],
];

// TEMAS DE FOLLOW-UP PARA ROTAÇÃO (Íris/carga)
interface FollowupTheme {
  name: string;
  keywords: string[];
  alternatives: string[];
}

const IRIS_FOLLOWUP_THEMES: FollowupTheme[] = [
  { 
    name: 'perfil', 
    keywords: ['transportador', 'embarcador', 'pessoa jurídica', 'autônomo', 'pj'],
    alternatives: ['Qual tipo de mercadoria você transporta?', 'Quais estados você atende?']
  },
  { 
    name: 'rota', 
    keywords: ['estado', 'região', 'rota', 'atende', 'viaja'],
    alternatives: ['Quantas viagens você faz por mês?', 'Qual o valor médio das cargas?']
  },
  { 
    name: 'carga', 
    keywords: ['mercadoria', 'carga', 'transporta', 'valor', 'viagens'],
    alternatives: ['Posso te ajudar com alguma dúvida sobre o RCTR-C?', 'Qual melhor horário pra uma ligação rápida?']
  },
  { 
    name: 'duvida', 
    keywords: ['dúvida', 'duvida', 'entender', 'ajudar', 'explicar'],
    alternatives: ['Te ligo em 5 min pra resolver? Me manda um "pode ligar"!', 'Qual tipo de carga você geralmente transporta?']
  },
  { 
    name: 'ligacao', 
    keywords: ['ligar', 'ligo', 'horário', 'telefone', 'ligação'],
    alternatives: ['Quais estados você atende com mais frequência?', 'Ficou com alguma dúvida sobre as coberturas?']
  },
];

// Identificar tema de uma mensagem
function identifyMessageTheme(message: string): string | null {
  const lowerMsg = message.toLowerCase();
  for (const theme of IRIS_FOLLOWUP_THEMES) {
    if (theme.keywords.some(kw => lowerMsg.includes(kw))) {
      return theme.name;
    }
  }
  return null;
}

// Obter alternativas baseado no tema da última mensagem
function getThemeAlternatives(lastMessage: string): string[] {
  const theme = identifyMessageTheme(lastMessage);
  if (!theme) return [];
  
  const themeConfig = IRIS_FOLLOWUP_THEMES.find(t => t.name === theme);
  return themeConfig?.alternatives || [];
}

// Verificar se duas mensagens são semanticamente similares
function isSimilarToLastMessage(newMessage: string, lastMessage?: string): boolean {
  if (!lastMessage) return false;
  
  const newLower = newMessage.toLowerCase();
  const lastLower = lastMessage.toLowerCase();
  
  for (const group of SIMILAR_QUESTION_GROUPS) {
    const newHasGroup = group.some(kw => newLower.includes(kw));
    const lastHasGroup = group.some(kw => lastLower.includes(kw));
    if (newHasGroup && lastHasGroup) {
      console.log(`[generate-followup-message] 🔄 Detected similar question pattern`);
      return true;
    }
  }
  
  return false;
}

// Verificar similaridade de palavras (mais rigoroso)
function calculateWordSimilarity(msg1: string, msg2: string): number {
  const normalize = (s: string) => s.toLowerCase()
    .replace(/[^a-záàâãéèêíïóôõöúç0-9 ]/gi, '')
    .split(' ')
    .filter(w => w.length > 3);
  
  const words1 = new Set(normalize(msg1));
  const words2 = new Set(normalize(msg2));
  
  if (words1.size === 0 || words2.size === 0) return 0;
  
  const intersection = [...words1].filter(w => words2.has(w));
  const similarity = intersection.length / Math.max(words1.size, words2.size);
  
  return similarity;
}

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

// Normalizar nome para evitar MAIÚSCULAS (ex: "REINALDO" -> "Reinaldo")
function normalizeContactName(name: string | null): string {
  if (!name) return 'Cliente';
  
  // Se está todo em maiúsculas, converter para Title Case
  if (name === name.toUpperCase() && name.length > 2) {
    return name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }
  return name;
}

// Get a fallback message that's different from the last one, using product-specific messages
function getVariedFallback(
  contactName: string, 
  lastMessage?: string,
  detectedProduct?: DetectedProduct,
  answeredQualifications?: AnsweredQualifications,
  attemptNumber: number = 1
): string {
  const name = normalizeContactName(contactName);
  const productKey = detectedProduct || 'generico';
  const themes = FALLBACK_THEMES_BY_PRODUCT[productKey] || FALLBACK_THEMES_BY_PRODUCT.generico;
  
  // Encontrar primeiro tema que não foi perguntado (baseado em tópicos respondidos)
  let selectedTheme: FallbackTheme | null = null;
  
  for (const theme of themes) {
    // Verificar se mensagens deste tema ainda não foram respondidas
    const themeMessages = theme.mensagens;
    const unansweredMessages = filterUnansweredQuestions(themeMessages, answeredQualifications);
    
    if (unansweredMessages.length > 0) {
      selectedTheme = { ...theme, mensagens: unansweredMessages };
      break;
    }
  }
  
  // Se todos os temas já foram respondidos, usar mensagens de avanço
  if (!selectedTheme) {
    console.log(`[generate-followup-message] All themes exhausted - using advancement messages`);
    const advancementMessages = [
      `Já tenho tudo que preciso! Posso te ligar em 5 min pra fechar?`,
      `Com essas informações, consigo te passar as melhores opções. Me manda um horário que te ligo!`,
      `Perfeito! Que tal uma ligação rápida pra eu te apresentar a proposta?`,
    ];
    const randomIndex = Math.floor(Math.random() * advancementMessages.length);
    let msg = advancementMessages[randomIndex];
    // Adicionar nome apenas na 1ª tentativa
    if (attemptNumber <= 1) {
      msg = `${name}, ${msg.charAt(0).toLowerCase()}${msg.slice(1)}`;
    }
    return msg;
  }
  
  let attempts = 0;
  let fallback: string = '';
  
  do {
    const randomIndex = Math.floor(Math.random() * selectedTheme.mensagens.length);
    fallback = selectedTheme.mensagens[randomIndex];
    attempts++;
  } while (isSimilarToLastMessage(fallback, lastMessage) && attempts < 5);
  
  // Adicionar nome apenas na 1ª tentativa
  if (attemptNumber <= 1) {
    fallback = `${name}, ${fallback.charAt(0).toLowerCase()}${fallback.slice(1)}`;
  }
  
  console.log(`[generate-followup-message] Fallback for product "${productKey}", tema "${selectedTheme.tema}": "${fallback.substring(0, 50)}..."`);
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
      answered_qualifications = null,
      insurance_status = null // NOVO: status de seguro existente
    } = body;
    
    // NORMALIZAR nome para evitar MAIÚSCULAS
    const normalizedContactName = normalizeContactName(contact_name);
    
    // NOVO: Detectar se lead tem seguro existente
    const hasExistingInsurance = insurance_status?.has_vehicle_insurance || insurance_status?.has_cargo_insurance || false;
    
    // NOVO: Se prompt é closing_with_option e lead tem seguro, usar prompt específico
    let effectivePromptType = prompt_type;
    if (prompt_type === 'closing_with_option' && hasExistingInsurance) {
      effectivePromptType = 'closing_with_option_insurance';
      console.log(`[generate-followup-message] Lead has insurance - using closing_with_option_insurance prompt`);
    }
    
    // Log answered qualifications
    if (answered_qualifications) {
      const answeredTopics = Object.entries(answered_qualifications)
        .filter(([_, v]) => v)
        .map(([k]) => k);
      console.log(`[generate-followup-message] Already answered topics: ${answeredTopics.join(', ') || 'none'}`);
    }
    
    console.log(`[generate-followup-message] Lead: qualified=${is_qualified ? 'YES' : 'NO'}, product=${detected_product || 'none'}, hasInsurance=${hasExistingInsurance}`);
    console.log(`[generate-followup-message] Contact name normalized: "${contact_name}" -> "${normalizedContactName}"`);

    console.log(`[generate-followup-message] Generating ${effectivePromptType} message for ${normalizedContactName}, attempt ${attempt_number}`);
    if (unanswered_question) {
      console.log(`[generate-followup-message] Unanswered question detected: "${unanswered_question.substring(0, 80)}..."`);
    }
    if (last_message_sent) {
      console.log(`[generate-followup-message] Last message to avoid: "${last_message_sent.substring(0, 50)}..."`);
    }

    const promptInstruction = PROMPT_TEMPLATES[effectivePromptType] || PROMPT_TEMPLATES.soft_reengagement;

    // Build anti-repetition instruction - FORTALECER A REGRA
    const lastTheme = last_message_sent ? identifyMessageTheme(last_message_sent) : null;
    const themeAlternatives = last_message_sent ? getThemeAlternatives(last_message_sent) : [];
    
    const antiRepetitionRule = last_message_sent 
      ? `\n\n🚫 REGRA CRÍTICA ANTI-REPETIÇÃO - VIOLAÇÃO = FALHA TOTAL:
Sua ÚLTIMA mensagem foi EXATAMENTE: "${last_message_sent}"

VOCÊ ESTÁ TERMINANTEMENTE PROIBIDO DE:
❌ Repetir a mesma estrutura de frase
❌ Usar as mesmas palavras-chave principais ("transportador", "embarcador" se já usou)
❌ Fazer a mesma pergunta reformulada (ex: "é transportador ou embarcador?" → "você transporta ou é dono da carga?" = MESMO TEMA = PROIBIDO)
❌ Começar a mensagem da mesma forma
❌ Usar o mesmo tema de pergunta

${lastTheme ? `📋 TEMA DA ÚLTIMA MENSAGEM: "${lastTheme}" - VOCÊ DEVE USAR UM TEMA DIFERENTE!` : ''}
${themeAlternatives.length > 0 ? `\n✅ ALTERNATIVAS OBRIGATÓRIAS (escolha UMA):\n${themeAlternatives.map(a => `• "${a}"`).join('\n')}` : ''}

ESTRATÉGIA DE VARIAÇÃO OBRIGATÓRIA:
- Se última foi PERGUNTA DE PERFIL → Agora pergunte sobre TIPO DE CARGA ou REGIÃO
- Se última perguntou sobre CARGA → Agora pergunte sobre DÚVIDAS ou ofereça LIGAÇÃO
- Se última ofereceu LIGAÇÃO → Agora faça pergunta sobre a OPERAÇÃO

⚠️ ANTES DE RESPONDER: Compare sua resposta com a última mensagem. Se o TEMA for similar, MUDE COMPLETAMENTE.`
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
- Nome do cliente: ${normalizedContactName}
${contact_company ? `- Empresa: ${contact_company}` : ''}
${hours_waiting ? `- Horas sem resposta: ${Math.round(hours_waiting)}h` : ''}
- Tentativa número: ${attempt_number}
${contextSection}
${productContext}
${last_message_sent ? `\n❌ NÃO repita nem pareça com: "${last_message_sent}"` : ''}

IMPORTANTE: Use o nome "${normalizedContactName}" (primeira letra maiúscula, resto minúsculo).

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
        const fallbackMessage = getVariedFallback(normalizedContactName, last_message_sent, detected_product, answered_qualifications || undefined);
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

    // Check if message is too similar to last one - regenerate with stronger instruction
    if (last_message_sent) {
      const similarity = calculateWordSimilarity(generatedMessage, last_message_sent);
      console.log(`[generate-followup-message] Similarity score: ${(similarity * 100).toFixed(1)}%`);
      
      if (similarity > 0.5 || messagesTooSimilar(generatedMessage, last_message_sent)) {
        console.log('[generate-followup-message] ⚠️ Generated message too similar - forcing retry with different theme');
        
        // Tentar regenerar com instrução mais forte
        try {
          const retryAlternatives = getThemeAlternatives(last_message_sent);
          const retryResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'google/gemini-2.5-flash',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
                { role: 'assistant', content: generatedMessage },
                { role: 'user', content: `⛔ ESSA MENSAGEM É MUITO PARECIDA COM A ANTERIOR! 
A última foi: "${last_message_sent}"
A sua foi: "${generatedMessage}"
Elas têm ${(similarity * 100).toFixed(0)}% de similaridade - INACEITÁVEL!

GERE UMA MENSAGEM SOBRE UM TEMA COMPLETAMENTE DIFERENTE.
${retryAlternatives.length > 0 ? `Use uma dessas alternativas: ${retryAlternatives.join(' OU ')}` : 'Mude o assunto para tipo de carga, região atendida, dúvidas, ou ofereça ligação.'}`
                }
              ],
              max_tokens: 200,
              temperature: 0.98, // Temperatura ainda mais alta para forçar variação
            }),
          });
          
          if (retryResponse.ok) {
            const retryData = await retryResponse.json();
            const retryMessage = retryData.choices?.[0]?.message?.content?.trim();
            if (retryMessage) {
              generatedMessage = retryMessage.replace(/^["']|["']$/g, '').trim();
              console.log(`[generate-followup-message] Retry successful: "${generatedMessage.substring(0, 50)}..."`);
            }
          }
        } catch (retryError) {
          console.error('[generate-followup-message] Retry failed, using fallback:', retryError);
          generatedMessage = getVariedFallback(normalizedContactName, last_message_sent, detected_product, answered_qualifications || undefined);
        }
        
        // Verificar novamente - se ainda similar, usar fallback
        const newSimilarity = calculateWordSimilarity(generatedMessage, last_message_sent);
        if (newSimilarity > 0.5) {
          console.log(`[generate-followup-message] Retry still too similar (${(newSimilarity * 100).toFixed(0)}%) - using fallback`);
          generatedMessage = getVariedFallback(normalizedContactName, last_message_sent, detected_product, answered_qualifications || undefined);
        }
      }
    }
    
    // Sanitize message for unqualified leads - prevent forbidden terms
    generatedMessage = sanitizeMessageForUnqualifiedLead(generatedMessage, is_qualified, normalizedContactName, last_message_sent, detected_product, answered_qualifications || undefined, effectivePromptType);

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
