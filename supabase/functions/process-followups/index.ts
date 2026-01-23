import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MessageSequenceItem {
  attempt: number;
  type: 'manual' | 'ai_generated';
  content?: string;
  ai_prompt_type?: 'qualification' | 'urgency' | 'budget' | 'decision' | 'soft_reengagement' | 'last_chance' | 'schedule_call' | 'schedule_call_transportador' | 'direct_question' | 'closing_with_option' | 'schedule_renewal' | 'prospecting_closing' | 'prospecting_no_reply';
  delay_hours?: number;
}

// Interface para status de seguro existente (detectado no nina_context)
interface InsuranceStatus {
  has_vehicle_insurance?: boolean;
  has_cargo_insurance?: boolean;
  satisfaction?: 'satisfied' | 'dissatisfied' | null;
  renewal_date?: string | null;
  hasSoftRejection?: boolean; // NOVO: detectado desinteresse leve
}

interface Automation {
  id: string;
  name: string;
  hours_without_response: number;
  time_unit: 'hours' | 'minutes';
  automation_type: 'template' | 'free_text' | 'window_expiring';
  template_id: string | null;
  template_variables: Record<string, string>;
  free_text_message: string | null;
  agent_messages: Record<string, string> | null;
  within_window_only: boolean;
  conversation_statuses: string[];
  pipeline_ids: string[] | null;
  tags: string[] | null;
  max_attempts: number;
  cooldown_hours: number;
  active_hours_start: string;
  active_hours_end: string;
  active_days: number[];
  is_active: boolean;
  minutes_before_expiry: number;
  only_if_no_client_response: boolean;
  messages_sequence: MessageSequenceItem[] | null;
}

interface EligibleConversation {
  id: string;
  contact_id: string;
  last_message_at: string;
  status: string;
  whatsapp_window_start: string | null;
  contact_name: string | null;
  contact_call_name: string | null;
  contact_company: string | null;
  contact_phone: string;
  current_agent_id: string | null;
  pipeline_id: string | null;
  client_memory?: {
    lead_profile?: {
      qualification_score?: number;
      lead_stage?: string;
      products_discussed?: string[];
      interests?: string[];
    };
  };
  nina_context?: {
    insurance_status?: InsuranceStatus;
    questions_asked?: Record<string, string>;
    metadata?: {
      origin?: string;
    };
  };
}

// Check if WhatsApp 24h window is still open
function isWindowOpen(windowStart: string | null): boolean {
  if (!windowStart) return false;
  const start = new Date(windowStart);
  const now = new Date();
  const hoursSinceStart = (now.getTime() - start.getTime()) / (1000 * 60 * 60);
  return hoursSinceStart < 24;
}

// Get minutes remaining until window expires
function getWindowMinutesRemaining(windowStart: string | null): number {
  if (!windowStart) return -1;
  const start = new Date(windowStart);
  const now = new Date();
  const expiresAt = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const minutesRemaining = (expiresAt.getTime() - now.getTime()) / (1000 * 60);
  return minutesRemaining;
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

// Replace variables in message template
function replaceVariables(message: string, conv: EligibleConversation): string {
  const name = normalizeContactName(conv.contact_name || conv.contact_call_name);
  const callName = normalizeContactName(conv.contact_call_name || conv.contact_name);
  const company = conv.contact_company || '';
  
  return message
    .replace(/{nome}/gi, name)
    .replace(/{name}/gi, name)
    .replace(/{call_name}/gi, callName)
    .replace(/{empresa}/gi, company)
    .replace(/{company}/gi, company);
}

// Detected product type from conversation
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

// Lead qualification analysis result
interface LeadQualification {
  isQualified: boolean;
  detectedProduct: DetectedProduct;
  hasExistingInsurance: boolean; // detectado no histórico de mensagens
  hasSoftRejection: boolean; // NOVO: detectado desinteresse leve ("não preciso agora", etc)
}

// Mensagens de fallback POR PRODUTO - evita perguntas redundantes
// Inclui perguntas de qualificação específicas para transportadores
const FALLBACK_MESSAGES_BY_PRODUCT: Record<string, string[]> = {
  carga: [
    // Perguntas de qualificação de perfil do transportador
    "{nome}, você é transportador de carga própria ou presta serviço pra terceiros?",
    "Oi {nome}! Você é transportador pessoa jurídica ou autônomo? Assim te passo as melhores opções!",
    "{nome}, me confirma: você tem transportadora ou é motorista autônomo?",
    "E aí {nome}! Você faz transporte próprio ou terceirizado? Me conta pra eu montar a proposta certa!",
    "{nome}, você é transportador ou embarcador da carga? Me fala que te ajudo melhor!",
    // Perguntas de aprofundamento sobre a operação
    "{nome}, sobre o seguro de carga: qual tipo de mercadoria você transporta?",
    "Oi {nome}! Pra sua carga, você precisa de cobertura pra qual rota principal?",
    "{nome}, posso te ligar pra falar sobre as coberturas de carga? 5 min!",
    "E aí {nome}! Pra gente avançar, me conta o valor médio das cargas que você transporta!",
    "{nome}, qual seu maior receio: roubo, acidente ou avaria da carga?",
    "{nome}, quantas viagens você faz por mês em média? Assim calculo a melhor cobertura!",
  ],
  veiculo: [
    // Perguntas de qualificação de perfil
    "{nome}, o veículo é seu próprio ou da empresa?",
    "Oi {nome}! Você usa o veículo pra trabalho ou uso pessoal?",
    "{nome}, é veículo próprio ou financiado? Me conta que te passo as opções certas!",
    // Perguntas de aprofundamento
    "{nome}, sobre o seguro do veículo: é pra uso profissional ou pessoal?",
    "Oi {nome}! Pra te passar as opções certas, me conta qual o modelo do veículo!",
    "{nome}, posso te ligar pra falar sobre as coberturas do seu veículo? 5 min!",
    "E aí {nome}! O veículo é pra transporte de carga ou de passageiros?",
    "{nome}, qual ano do veículo? Assim te passo valores mais precisos!",
  ],
  frota: [
    // Perguntas de qualificação de perfil
    "{nome}, a frota é própria da empresa ou terceirizada?",
    "Oi {nome}! Vocês são transportadora ou usam os veículos pra operação própria?",
    "{nome}, os motoristas são CLT ou agregados? Isso influencia na cobertura!",
    // Perguntas de aprofundamento
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
  // Mensagens específicas para leads que já têm seguro
  has_insurance: [
    "{nome}, sobre a renovação: quando vence a apólice atual? Posso preparar uma cotação comparativa!",
    "Oi {nome}! Você mencionou que já tem seguro. Está satisfeito com a seguradora atual?",
    "{nome}, além do seguro do veículo, vocês têm RCTR-C pra proteger a carga? É fundamental pro transporte!",
    "E aí {nome}! Sobre sua apólice atual: quando vence? Consigo te passar uma proposta antes da renovação!",
    "{nome}, você tem seguro de carga também? É diferente do seguro do veículo e essencial pra transportador!",
    "Oi {nome}! Pra sua renovação, me confirma: quando vence o seguro atual?",
    "{nome}, posso te ligar pra fazer uma cotação comparativa antes da renovação? 5 min!",
  ],
};

// Get a varied fallback that's different from the last message, using product-specific messages
function getVariedFallback(
  contactName: string, 
  lastMessage?: string,
  detectedProduct?: DetectedProduct,
  hasExistingInsurance: boolean = false
): string {
  const name = contactName || 'Cliente';
  
  // Se lead já tem seguro, usar mensagens específicas de renovação
  const productKey = hasExistingInsurance ? 'has_insurance' : (detectedProduct || 'generico');
  const messages = FALLBACK_MESSAGES_BY_PRODUCT[productKey] || FALLBACK_MESSAGES_BY_PRODUCT.generico;
  
  let attempts = 0;
  let fallback: string;
  
  do {
    const randomIndex = Math.floor(Math.random() * messages.length);
    fallback = messages[randomIndex].replace('{nome}', name);
    attempts++;
  } while (lastMessage && fallback === lastMessage && attempts < 10);
  
  console.log(`[process-followups] Fallback selected for product "${productKey}": "${fallback.substring(0, 50)}..."`);
  return fallback;
}

// Generate AI message using edge function
async function generateAIMessage(
  supabaseUrl: string,
  supabaseServiceKey: string,
  conv: EligibleConversation,
  promptType: string,
  attemptNumber: number,
  hoursWaiting: number,
  agentName?: string,
  agentSpecialty?: string,
  agentSlug?: string,
  lastMessageSent?: string,
  conversationContext?: string,
  unansweredQuestion?: string,
  isQualified: boolean = true,
  detectedProduct?: DetectedProduct,
  answeredQualifications?: AnsweredQualifications,
  insuranceStatus?: InsuranceStatus | null // NOVO: status de seguro existente
): Promise<string> {
  try {
    // Se o agente é Íris (transportadores) e o prompt é schedule_call, usar prompt específico
    let finalPromptType = promptType;
    if (agentSlug === 'iris' && promptType === 'schedule_call') {
      finalPromptType = 'schedule_call_transportador';
      console.log(`[process-followups] Using transportador-specific prompt for Íris`);
    }
    
    // NOVO: Se lead fez SOFT REJECTION, lógica simplificada de 1 tentativa
    const hasSoftRejection = insuranceStatus?.hasSoftRejection;
    if (hasSoftRejection) {
      // Tentativa 1 = ask_insurance_renewal (pergunta se tem seguro e vencimento)
      // Tentativa 2+ = NÃO ENVIA (retorna null para parar automação)
      if (attemptNumber >= 2) {
        console.log(`[process-followups] 🛑 Soft rejection - attempt ${attemptNumber} - STOPPING automation (no more messages)`);
        return null as unknown as string; // Signal to stop automation
      } else {
        finalPromptType = 'ask_insurance_renewal';
        console.log(`[process-followups] 🚫 Soft rejection - attempt 1 - using ask_insurance_renewal prompt`);
      }
    }
    // Se lead já tem seguro, lógica simplificada de 2 tentativas
    else {
      const hasExistingInsurance = insuranceStatus?.has_vehicle_insurance || insuranceStatus?.has_cargo_insurance;
      if (hasExistingInsurance) {
        // Tentativa 1 = schedule_renewal (perguntar vencimento/oferecer cotação comparativa)
        // Tentativa 2+ = closing_with_option (encerramento elegante)
        if (attemptNumber >= 2) {
          finalPromptType = 'closing_with_option';
          console.log(`[process-followups] 📝 Lead with insurance, attempt ${attemptNumber} - forcing closing_with_option (encerramento elegante)`);
        } else if (promptType !== 'schedule_renewal') {
          finalPromptType = 'schedule_renewal';
          console.log(`[process-followups] Lead has existing insurance - forcing schedule_renewal prompt`);
        }
      } else {
      // Lógica padrão para leads sem seguro
      // Se há pergunta sem resposta, sobrescrever o prompt type
      if (unansweredQuestion && promptType !== 'last_chance') {
        finalPromptType = 'unanswered_question';
        console.log(`[process-followups] Overriding prompt to unanswered_question due to pending question`);
      }
      
        // Se lead não qualificado, forçar re_qualify
        if (!isQualified && promptType !== 'last_chance') {
          finalPromptType = 're_qualify';
          console.log(`[process-followups] Lead NOT qualified - forcing re_qualify prompt`);
        }
      }
    }
    
    // Log answered qualifications
    if (answeredQualifications) {
      const answeredTopics = Object.entries(answeredQualifications)
        .filter(([_, v]) => v)
        .map(([k]) => k);
      console.log(`[process-followups] Already answered qualifications: ${answeredTopics.join(', ') || 'none'}`);
    }
    
    const hasInsurance = insuranceStatus?.has_vehicle_insurance || insuranceStatus?.has_cargo_insurance || false;
    console.log(`[process-followups] Generating AI message, prompt: ${finalPromptType}, context: ${conversationContext ? 'yes' : 'no'}, unanswered: ${unansweredQuestion ? 'yes' : 'no'}, qualified: ${isQualified}, product: ${detectedProduct || 'none'}, hasInsurance: ${hasInsurance}`);

    
    const response = await fetch(`${supabaseUrl}/functions/v1/generate-followup-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        contact_name: conv.contact_name || conv.contact_call_name || 'Cliente',
        contact_company: conv.contact_company,
        agent_name: agentName,
        agent_specialty: agentSpecialty,
        agent_slug: agentSlug,
        prompt_type: finalPromptType,
        hours_waiting: hoursWaiting,
        attempt_number: attemptNumber,
        last_message_sent: lastMessageSent,
        conversation_context: conversationContext,
        unanswered_question: unansweredQuestion,
        is_qualified: isQualified,
        detected_product: detectedProduct,
        answered_qualifications: answeredQualifications,
        insurance_status: insuranceStatus, // NOVO: passar status de seguro
      }),
    });

    if (!response.ok) {
      console.error('[process-followups] AI message generation failed:', response.status);
      return getVariedFallback(conv.contact_name || conv.contact_call_name || 'Cliente', lastMessageSent, detectedProduct, hasInsurance);
    }

    const data = await response.json();
    return data.message || getVariedFallback(conv.contact_name || conv.contact_call_name || 'Cliente', lastMessageSent, detectedProduct, hasInsurance);
  } catch (error) {
    console.error('[process-followups] Error generating AI message:', error);
    const hasInsuranceErr = insuranceStatus?.has_vehicle_insurance || insuranceStatus?.has_cargo_insurance || false;
    return getVariedFallback(conv.contact_name || conv.contact_call_name || 'Cliente', lastMessageSent, detectedProduct, hasInsuranceErr);
  }
}

// Analyze conversation history to detect unanswered questions
interface ConversationAnalysis {
  hasUserResponse: boolean;
  unansweredQuestion: string | null;
  conversationContext: string;
  lastNinaMessage: string | null;
  answeredQualifications: AnsweredQualifications; // NOVO: tópicos já respondidos
}

// Analisa mensagens do usuário para detectar quais tópicos de qualificação foram respondidos
function analyzeAnsweredQualifications(
  messages: Array<{ content: string | null; from_type: string }>
): AnsweredQualifications {
  const result: AnsweredQualifications = {
    tipo_empresa: false,
    tipo_operacao: false,
    perfil_transportador: false,
    tipo_mercadoria: false,
    rota_principal: false,
    valor_carga: false,
    qtd_viagens: false,
    uso_veiculo: false,
    modelo_veiculo: false,
    qtd_frota: false,
    tipo_frota: false,
  };
  
  // Detectores de resposta por tópico (regex patterns)
  const detectors: Record<keyof AnsweredQualifications, RegExp[]> = {
    tipo_empresa: [
      /autônomo|autonomo|pj|pessoa jur[íi]dica|cnpj|mei|empresa|ltda|eireli|s\.?a\.?|sociedade/i
    ],
    tipo_operacao: [
      /pr[óo]prio|terceirizado|agregado|presto servi[çc]o|presta servico|frota pr[óo]pria|carga pr[óo]pria|subcontratado/i
    ],
    perfil_transportador: [
      /transportador|embarcador|dono da carga|contratante|freteiro|caminhoneiro|motorista/i
    ],
    tipo_mercadoria: [
      /eletr[ôo]nico|gr[ãa]o|combust[íi]vel|alimento|carga seca|frigor[íi]fic|container|qu[íi]mico|perec[íi]vel|m[óo]veis|bebidas|a[çc]o|ferro|madeira|papel|tecido|roupa|cosm[ée]tico|medicamento|farm[áa]ceutico/i
    ],
    rota_principal: [
      /s[ãa]o paulo|sp|rio|rj|minas|mg|bahia|ba|nordeste|sul|sudeste|centro-oeste|norte|interior|capital|rodovia|br-\d|para[ná]|pr|santa catarina|sc|rio grande/i
    ],
    valor_carga: [
      /mil reais|milh[ãa]o|\d+ mil|\d+k|r\$ ?\d|\d+ reais|100k|200k|500k|1m|2m/i
    ],
    qtd_viagens: [
      /\d+ viagens?|\d+ por m[êe]s|\d+ por mes|semanal|mensal|di[áa]ri|\d+ vezes?/i
    ],
    uso_veiculo: [
      /pessoal|profissional|trabalho|lazer|fam[íi]lia|uso pr[óo]prio|uso di[áa]rio|particular/i
    ],
    modelo_veiculo: [
      /volvo|scania|mercedes|iveco|daf|man|volkswagen|vw|fiat|ford|hyundai|toyota|fh|vm|axor|actros|atego|stralis|daily|constellation|meteor|\d{4}|ano \d|20\d\d/i
    ],
    qtd_frota: [
      /\d+ ve[íi]culos?|\d+ caminh[õo]es?|\d+ carretas?|uma frota de|tenho \d|minha frota tem/i
    ],
    tipo_frota: [
      /s[óo] caminh[õo]es?|s[óo] carretas?|vans?|utilit[áa]rios?|leves e pesados|misturada|truck|bitruck|bi-truck|toco|3\/4/i
    ],
  };
  
  // Concatenar todo conteúdo das mensagens do usuário
  const userContent = messages
    .filter(m => m.from_type === 'user')
    .map(m => m.content || '')
    .join(' ')
    .toLowerCase();
  
  // Testar cada detector
  for (const [key, patterns] of Object.entries(detectors)) {
    const matched = patterns.some(p => p.test(userContent));
    result[key as keyof AnsweredQualifications] = matched;
    if (matched) {
      console.log(`[process-followups] Qualification topic already answered: ${key}`);
    }
  }
  
  return result;
}

// Detectar se lead tem seguro existente a partir do histórico de mensagens
function detectExistingInsuranceFromMessages(messages: Array<{ content: string | null; from_type: string }>): boolean {
  const userMessages = messages
    .filter(m => m.from_type === 'user')
    .map(m => m.content?.toLowerCase() || '')
    .join(' ');
  
  // Patterns que indicam que o lead JÁ TEM seguro
  const HAS_INSURANCE_PATTERNS = [
    /j[áa] tenho seguro/i,
    /j[áa] t[ôo] segurado/i,
    /j[áa] tem seguro/i,
    /j[áa] possuo seguro/i,
    /tudo certo no momento/i,
    /t[áa] tudo ok/i,
    /t[áa] tudo certo/i,
    /todas.*placas.*segurad/i,
    /todos.*ve[íi]culos.*segurad/i,
    /quando.*vencer/i,
    /perto de vencer/i,
    /entro em cota[çc][ãa]o/i,
    /renovar.*seguro/i,
    /renova[çc][ãa]o/i,
    /ap[óo]lice.*vence/i,
    /vencimento da ap[óo]lice/i,
    /j[áa] tenho.*cobertura/i,
    /atual.*seguradora/i,
    /minha seguradora/i,
    /depois.*renovar/i,
  ];
  
  const hasInsurance = HAS_INSURANCE_PATTERNS.some(pattern => pattern.test(userMessages));
  
  if (hasInsurance) {
    console.log(`[process-followups] 🔍 Detected existing insurance from user messages`);
  }
  
  return hasInsurance;
}

// NOVO: Detectar soft rejection (desinteresse leve) a partir do histórico de mensagens
function detectSoftRejectionFromMessages(messages: Array<{ content: string | null; from_type: string }>): boolean {
  const userMessages = messages
    .filter(m => m.from_type === 'user')
    .map(m => m.content?.toLowerCase() || '')
    .join(' ');
  
  // Patterns que indicam SOFT REJECTION - desinteresse leve mas não agressivo
  const SOFT_REJECTION_PATTERNS = [
    // Desinteresse direto
    /n[ãa]o tenho interesse/i,
    /n[ãa]o quero/i,
    /sem interesse/i,
    /n[ãa]o preciso/i,
    /n[ãa]o preciso agora/i,
    /no momento n[ãa]o/i,
    /por enquanto n[ãa]o/i,
    /agora n[ãa]o/i,
    /n[ãa]o [ée] o momento/i,
    /talvez depois/i,
    /talvez mais tarde/i,
    /outro momento/i,
    /mais pra frente/i,
    /mais para frente/i,
    /depois eu vejo/i,
    /depois a gente v[êe]/i,
    // Satisfação atual / corretor próprio
    /estou satisfeito/i,
    /t[ôo] satisfeito/i,
    /bem atendido/i,
    /bem servido/i,
    /j[áa] tenho corretor/i,
    /meu corretor/i,
    /corretor de confian[çc]a/i,
    // Renovação automática
    /renova autom[áa]tico/i,
    /renova[çc][ãa]o autom[áa]tica/i,
    /renovando autom[áa]tico/i,
    // Desnecessidade
    /n[ãa]o uso mais/i,
    /parei de/i,
    /vendi o/i,
    /n[ãa]o trabalho mais/i,
    /n[ãa]o transporto mais/i,
  ];
  
  const hasSoftRejection = SOFT_REJECTION_PATTERNS.some(pattern => pattern.test(userMessages));
  
  if (hasSoftRejection) {
    console.log(`[process-followups] 🚫 Detected SOFT REJECTION from user messages`);
  }
  
  return hasSoftRejection;
}

function analyzeConversationHistory(messages: Array<{ content: string | null; from_type: string; sent_at: string }>): ConversationAnalysis {
  const emptyQualifications: AnsweredQualifications = {
    tipo_empresa: false, tipo_operacao: false, perfil_transportador: false,
    tipo_mercadoria: false, rota_principal: false, valor_carga: false,
    qtd_viagens: false, uso_veiculo: false, modelo_veiculo: false,
    qtd_frota: false, tipo_frota: false,
  };
  
  if (!messages || messages.length === 0) {
    return { hasUserResponse: false, unansweredQuestion: null, conversationContext: '', lastNinaMessage: null, answeredQualifications: emptyQualifications };
  }
  
  // Analisar qualificações respondidas
  const answeredQualifications = analyzeAnsweredQualifications(messages);
  
  // Messages are ordered desc (most recent first)
  const hasUserResponse = messages.some(m => m.from_type === 'user');
  const lastMessage = messages[0];
  const isLastFromNina = lastMessage?.from_type !== 'user';
  
  let unansweredQuestion: string | null = null;
  let lastNinaMessage: string | null = null;
  
  // Find the last Nina message
  const ninaMessages = messages.filter(m => m.from_type !== 'user');
  if (ninaMessages.length > 0) {
    lastNinaMessage = ninaMessages[0]?.content || null;
    
    // Check if last Nina message was a question
    if (isLastFromNina && lastNinaMessage) {
      const content = lastNinaMessage.toLowerCase();
      const isQuestion = content.includes('?') || 
                        content.includes('qual') ||
                        content.includes('como') ||
                        content.includes('quando') ||
                        content.includes('quanto') ||
                        content.includes('onde') ||
                        content.includes('quem') ||
                        content.includes('precisa') ||
                        content.includes('gostaria');
      
      if (isQuestion) {
        unansweredQuestion = lastNinaMessage;
      }
    }
  }
  
  // Build context summary
  let conversationContext = '';
  if (!hasUserResponse && isLastFromNina) {
    conversationContext = `IMPORTANTE: Cliente NÃO respondeu nenhuma mensagem ainda. Última mensagem da Nina: "${lastNinaMessage?.substring(0, 100)}..."`;
  } else if (hasUserResponse) {
    const lastUserMessage = messages.find(m => m.from_type === 'user');
    if (lastUserMessage?.content) {
      conversationContext = `Última resposta do cliente: "${lastUserMessage.content.substring(0, 100)}"`;
    }
  }
  
  return { hasUserResponse, unansweredQuestion, conversationContext, lastNinaMessage, answeredQualifications };
}

// Analyze lead qualification AND detect specific product mentioned
function analyzeLeadQualification(
  clientMemory: EligibleConversation['client_memory'],
  recentMessages: Array<{ content: string | null; from_type: string }>
): LeadQualification {
  const leadProfile = clientMemory?.lead_profile;
  
  // Keywords for product detection - more specific to less specific
  const CARGA_KEYWORDS = [
    'carga', 'cargas', 'transportadora', 'transportador', 'frete', 'rctr', 
    'mercadoria', 'mercadorias', 'embarque', 'roubo de carga', 'desvio de carga'
  ];
  const VEICULO_KEYWORDS = [
    'veículo', 'veiculo', 'carro', 'moto', 'motocicleta', 'automóvel', 'automovel'
  ];
  const FROTA_KEYWORDS = [
    'frota', 'frotas', 'vários veículos', 'varios veiculos', 'veículos da empresa'
  ];
  const CAMINHAO_KEYWORDS = [
    'caminhão', 'caminhao', 'carreta', 'truck', 'bi-truck', 'bitruck', 'cavalo mecânico'
  ];
  
  // Build user content for analysis
  const userMessages = recentMessages
    .filter(m => m.from_type === 'user')
    .map(m => m.content?.toLowerCase() || '');
  const userContent = userMessages.join(' ');
  
  // Function to detect product from text
  const detectProduct = (text: string): DetectedProduct => {
    // Priority: carga > frota > veículo (carga is more specific)
    if (CARGA_KEYWORDS.some(kw => text.includes(kw))) {
      return 'carga';
    }
    if (FROTA_KEYWORDS.some(kw => text.includes(kw))) {
      return 'frota';
    }
    // Caminhão alone usually means carga (for this business)
    if (CAMINHAO_KEYWORDS.some(kw => text.includes(kw))) {
      return 'carga'; // Default caminhão to carga for transporters
    }
    if (VEICULO_KEYWORDS.some(kw => text.includes(kw))) {
      return 'veiculo';
    }
    return null;
  };
  
  // Critério 1: Score de qualificação >= 40
  if (leadProfile?.qualification_score && leadProfile.qualification_score >= 40) {
    console.log(`[process-followups] Lead qualified: score >= 40 (${leadProfile.qualification_score})`);
    const product = leadProfile?.products_discussed?.[0] as DetectedProduct || detectProduct(userContent);
    return { isQualified: true, detectedProduct: product, hasExistingInsurance: false, hasSoftRejection: false };
  }
  
  // Critério 2: Estágio 'qualified' ou 'engaged'
  if (leadProfile?.lead_stage && ['qualified', 'engaged'].includes(leadProfile.lead_stage)) {
    console.log(`[process-followups] Lead qualified: stage is ${leadProfile.lead_stage}`);
    const product = leadProfile?.products_discussed?.[0] as DetectedProduct || detectProduct(userContent);
    return { isQualified: true, detectedProduct: product, hasExistingInsurance: false, hasSoftRejection: false };
  }
  
  // Critério 3: Produtos discutidos preenchido
  if (leadProfile?.products_discussed && leadProfile.products_discussed.length > 0) {
    console.log(`[process-followups] Lead qualified: has products_discussed`);
    const product = leadProfile.products_discussed[0] as DetectedProduct;
    return { isQualified: true, detectedProduct: product, hasExistingInsurance: false, hasSoftRejection: false };
  }
  
  // Critério 4: Usuário mencionou produto nas mensagens
  const detectedProduct = detectProduct(userContent);
  if (detectedProduct) {
    console.log(`[process-followups] Lead qualified: user mentioned ${detectedProduct} keywords`);
    return { isQualified: true, detectedProduct, hasExistingInsurance: false, hasSoftRejection: false };
  }
  
  // Check for general insurance keywords that indicate some interest but no specific product
  const generalKeywords = [
    'seguro', 'cotação', 'cotacao', 'proposta', 'cobertura', 
    'apólice', 'apolice', 'sinistro', 'acidente', 'proteção', 'proteger'
  ];
  
  if (generalKeywords.some(kw => userContent.includes(kw))) {
    console.log(`[process-followups] Lead qualified with general keywords but no specific product`);
    return { isQualified: true, detectedProduct: null, hasExistingInsurance: false, hasSoftRejection: false };
  }
  
  console.log(`[process-followups] Lead NOT qualified: no criteria met`);
  return { isQualified: false, detectedProduct: null, hasExistingInsurance: false, hasSoftRejection: false };
}

// Get message for current attempt from sequence
async function getMessageForAttempt(
  automation: Automation,
  attemptNumber: number,
  conv: EligibleConversation,
  hoursWaiting: number,
  supabaseUrl: string,
  supabaseServiceKey: string,
  agentName?: string,
  agentSpecialty?: string,
  agentSlug?: string,
  lastMessageSent?: string,
  conversationContext?: string,
  unansweredQuestion?: string,
  isQualified: boolean = true,
  detectedProduct?: DetectedProduct,
  answeredQualifications?: AnsweredQualifications,
  insuranceStatus?: InsuranceStatus | null,
  forcedPromptType?: string | null // NOVO: forçar tipo de prompt (para prospecção)
): Promise<string> {
  const sequence = automation.messages_sequence;
  
  // NOVO: Se há um prompt type forçado (prospecção), usar ele diretamente
  if (forcedPromptType) {
    console.log(`[process-followups] Using FORCED prompt type: ${forcedPromptType}`);
    return await generateAIMessage(
      supabaseUrl, supabaseServiceKey, conv,
      forcedPromptType, attemptNumber, hoursWaiting,
      agentName, agentSpecialty, agentSlug, lastMessageSent,
      conversationContext, unansweredQuestion, isQualified, detectedProduct, answeredQualifications,
      insuranceStatus
    );
  }
  
  // If lead is NOT qualified, force re_qualify prompt
  if (!isQualified) {
    console.log(`[process-followups] Lead NOT qualified - forcing re_qualify prompt`);
    return await generateAIMessage(
      supabaseUrl, supabaseServiceKey, conv,
      're_qualify', attemptNumber, hoursWaiting,
      agentName, agentSpecialty, agentSlug, lastMessageSent,
      conversationContext, unansweredQuestion, isQualified, detectedProduct, answeredQualifications,
      insuranceStatus
    );
  }
  
  // If no sequence configured, use the legacy free_text_message
  if (!sequence || sequence.length === 0) {
    return replaceVariables(automation.free_text_message || 'Oi {nome}, ainda consegue continuar?', conv);
  }

  // Find the message for this attempt using array index (attempt 1 = index 0, attempt 2 = index 1, etc.)
  // Also try to find by attempt field if present
  let sequenceItem = sequence[attemptNumber - 1];
  
  // Fallback: try to find by attempt field if index doesn't have the right attempt
  if (!sequenceItem || (sequenceItem.attempt && sequenceItem.attempt !== attemptNumber)) {
    sequenceItem = sequence.find(s => s.attempt === attemptNumber) || sequenceItem;
  }
  
  if (!sequenceItem) {
    // Fallback to the last message in sequence or free_text_message
    const lastItem = sequence[sequence.length - 1];
    if (lastItem) {
      if (lastItem.type === 'ai_generated' && lastItem.ai_prompt_type) {
        return await generateAIMessage(
          supabaseUrl, supabaseServiceKey, conv,
          lastItem.ai_prompt_type, attemptNumber, hoursWaiting,
          agentName, agentSpecialty, agentSlug, lastMessageSent,
          conversationContext, unansweredQuestion, isQualified, detectedProduct, answeredQualifications,
          insuranceStatus
        );
      }
      return replaceVariables(lastItem.content || automation.free_text_message || 'Oi {nome}!', conv);
    }
    return replaceVariables(automation.free_text_message || 'Oi {nome}, ainda consegue continuar?', conv);
  }
  
  console.log(`[process-followups] Using sequence item for attempt ${attemptNumber}:`, JSON.stringify(sequenceItem));

  // Generate AI message or use manual content
  if (sequenceItem.type === 'ai_generated' && sequenceItem.ai_prompt_type) {
    console.log(`[process-followups] Generating AI message for attempt ${attemptNumber}, type: ${sequenceItem.ai_prompt_type}, has context: ${!!conversationContext}, has unanswered: ${!!unansweredQuestion}, qualified: ${isQualified}, product: ${detectedProduct || 'none'}, hasInsurance: ${!!(insuranceStatus?.has_vehicle_insurance || insuranceStatus?.has_cargo_insurance)}`);
    return await generateAIMessage(
      supabaseUrl, supabaseServiceKey, conv,
      sequenceItem.ai_prompt_type, attemptNumber, hoursWaiting,
      agentName, agentSpecialty, agentSlug, lastMessageSent,
      conversationContext, unansweredQuestion, isQualified, detectedProduct, answeredQualifications,
      insuranceStatus
    );
  }

  return replaceVariables(sequenceItem.content || automation.free_text_message || 'Oi {nome}!', conv);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[process-followups] Starting follow-up processing...');

    // Get current time in Brazil timezone
    const now = new Date();
    const brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const currentHour = brazilTime.getHours();
    const currentMinute = brazilTime.getMinutes();
    const currentTimeStr = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
    const currentDay = brazilTime.getDay(); // 0 = Sunday, 1 = Monday, etc.

    console.log(`[process-followups] Current time in Brazil: ${currentTimeStr}, day: ${currentDay}`);

    // Fetch active automations
    const { data: automations, error: automationsError } = await supabase
      .from('followup_automations')
      .select('*')
      .eq('is_active', true);

    if (automationsError) {
      console.error('[process-followups] Error fetching automations:', automationsError);
      throw automationsError;
    }

    if (!automations || automations.length === 0) {
      console.log('[process-followups] No active automations found');
      return new Response(JSON.stringify({ processed: 0, message: 'No active automations' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[process-followups] Found ${automations.length} active automations`);

    let totalProcessed = 0;
    const results: { automation: string; sent: number; skipped: number; failed: number }[] = [];

    for (const automation of automations as Automation[]) {
      console.log(`[process-followups] Processing automation: ${automation.name} (type: ${automation.automation_type})`);

      // Check if current time is within active hours
      const startTime = automation.active_hours_start;
      const endTime = automation.active_hours_end;
      
      if (currentTimeStr < startTime || currentTimeStr > endTime) {
        console.log(`[process-followups] Outside active hours (${startTime}-${endTime}), skipping`);
        results.push({ automation: automation.name, sent: 0, skipped: 0, failed: 0 });
        continue;
      }

      // Check if current day is active
      if (!automation.active_days.includes(currentDay)) {
        console.log(`[process-followups] Day ${currentDay} not in active days, skipping`);
        results.push({ automation: automation.name, sent: 0, skipped: 0, failed: 0 });
        continue;
      }

      // Handle window_expiring automation type
      if (automation.automation_type === 'window_expiring') {
        const windowExpiryResult = await processWindowExpiringAutomation(supabase, supabaseUrl, supabaseServiceKey, automation, now);
        results.push(windowExpiryResult);
        totalProcessed += windowExpiryResult.sent;
        continue;
      }

      // For template automations, verify template exists
      let template = null;
      if (automation.automation_type === 'template') {
        if (!automation.template_id) {
          console.log(`[process-followups] No template configured for template automation, skipping`);
          results.push({ automation: automation.name, sent: 0, skipped: 0, failed: 0 });
          continue;
        }

        const { data: templateData, error: templateError } = await supabase
          .from('whatsapp_templates')
          .select('*')
          .eq('id', automation.template_id)
          .eq('status', 'APPROVED')
          .maybeSingle();

        if (templateError || !templateData) {
          console.log(`[process-followups] Template not found or not approved, skipping`);
          results.push({ automation: automation.name, sent: 0, skipped: 0, failed: 0 });
          continue;
        }
        template = templateData;
      }

      // For free_text automations, verify message exists (or has sequence)
      if (automation.automation_type === 'free_text') {
        const hasSequence = automation.messages_sequence && automation.messages_sequence.length > 0;
        if (!hasSequence && !automation.free_text_message?.trim()) {
          console.log(`[process-followups] No free text message or sequence configured, skipping`);
          results.push({ automation: automation.name, sent: 0, skipped: 0, failed: 0 });
          continue;
        }
      }

      // Calculate the cutoff time based on time_unit
      const timeMultiplier = automation.time_unit === 'minutes' ? 60 * 1000 : 60 * 60 * 1000;
      const cutoffTime = new Date(now.getTime() - automation.hours_without_response * timeMultiplier);
      const cooldownTime = new Date(now.getTime() - automation.cooldown_hours * 60 * 60 * 1000);

      // Find eligible conversations
      let query = supabase
        .from('conversations')
        .select(`
          id,
          contact_id,
          last_message_at,
          status,
          whatsapp_window_start,
          current_agent_id,
          nina_context,
          contacts!inner (
            name,
            call_name,
            company,
            phone_number,
            client_memory
          )
        `)
        .eq('is_active', true)
        .in('status', automation.conversation_statuses)
        .lt('last_message_at', cutoffTime.toISOString());

      const { data: conversationsRaw, error: convError } = await query;

      if (convError) {
        console.error(`[process-followups] Error fetching conversations:`, convError);
        results.push({ automation: automation.name, sent: 0, skipped: 0, failed: 0 });
        continue;
      }

      if (!conversationsRaw || conversationsRaw.length === 0) {
        console.log(`[process-followups] No eligible conversations found`);
        results.push({ automation: automation.name, sent: 0, skipped: 0, failed: 0 });
        continue;
      }

      console.log(`[process-followups] Found ${conversationsRaw.length} potential conversations`);

      // Fetch agent info for AI message generation
      const { data: agentsData } = await supabase
        .from('agents')
        .select('id, name, specialty, slug')
        .eq('is_active', true);
      
      const agentsMap: Record<string, { name: string; specialty: string | null; slug: string }> = {};
      if (agentsData) {
        for (const agent of agentsData) {
          agentsMap[agent.id] = { name: agent.name, specialty: agent.specialty, slug: agent.slug };
        }
      }

      let sent = 0;
      let skipped = 0;
      let failed = 0;

      for (const convRaw of conversationsRaw) {
        const conv: EligibleConversation = {
          id: convRaw.id,
          contact_id: convRaw.contact_id,
          last_message_at: convRaw.last_message_at,
          status: convRaw.status,
          whatsapp_window_start: convRaw.whatsapp_window_start,
          contact_name: (convRaw.contacts as any)?.name,
          contact_call_name: (convRaw.contacts as any)?.call_name,
          contact_company: (convRaw.contacts as any)?.company,
          contact_phone: (convRaw.contacts as any)?.phone_number,
          current_agent_id: convRaw.current_agent_id,
          pipeline_id: null,
          client_memory: (convRaw.contacts as any)?.client_memory,
          nina_context: (convRaw as any).nina_context,
        };

        // Check if deal is lost (skip if lost_at is set or in "Perdido" stage)
        const { data: deal } = await supabase
          .from('deals')
          .select(`
            id,
            lost_at,
            stage_id,
            pipeline_stages!inner(title)
          `)
          .eq('contact_id', conv.contact_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (deal?.lost_at || (deal?.pipeline_stages as any)?.title === 'Perdido') {
          console.log(`[process-followups] Deal is lost for conversation ${conv.id}, skipping`);
          skipped++;
          continue;
        }
        
        // Check if conversation has identity mismatch or followup stopped flags
        const ninaContext = (conv.nina_context || {}) as Record<string, any>;
        if (ninaContext.identity_mismatch || ninaContext.wrong_contact_detected_at) {
          console.log(`[process-followups] Identity mismatch detected for ${conv.id}, skipping (wrong contact)`);
          skipped++;
          continue;
        }
        
        if (ninaContext.followup_stopped) {
          console.log(`[process-followups] Followup stopped flag set for ${conv.id}, skipping`);
          skipped++;
          continue;
        }

        // Check if deal has pending callback (scheduled call) - SKIP if callback is scheduled
        if (deal?.id) {
          const { data: pendingCallback } = await supabase
            .from('deal_activities')
            .select('id, scheduled_at, type, title')
            .eq('deal_id', deal.id)
            .eq('is_completed', false)
            .in('type', ['call', 'callback'])
            .gt('scheduled_at', now.toISOString())
            .order('scheduled_at', { ascending: true })
            .limit(1)
            .maybeSingle();

          if (pendingCallback) {
            console.log(`[process-followups] Deal has pending callback "${pendingCallback.title}" scheduled for ${pendingCallback.scheduled_at}, skipping followup for conversation ${conv.id}`);
            skipped++;
            continue;
          }
        }

        // Check within_window_only constraint
        if (automation.within_window_only) {
          if (!isWindowOpen(conv.whatsapp_window_start)) {
            console.log(`[process-followups] 24h window closed for conversation ${conv.id}, skipping (within_window_only=true)`);
            skipped++;
            continue;
          }
        }

        // For free_text automations, window MUST be open (WhatsApp requirement)
        if (automation.automation_type === 'free_text') {
          if (!isWindowOpen(conv.whatsapp_window_start)) {
            console.log(`[process-followups] 24h window closed for conversation ${conv.id}, cannot send free text message`);
            skipped++;
            continue;
          }
        }

        // Fetch recent messages for context analysis (up to 8 messages)
        const { data: recentMessages } = await supabase
          .from('messages')
          .select('content, from_type, sent_at')
          .eq('conversation_id', conv.id)
          .order('sent_at', { ascending: false })
          .limit(8);
        
        // Check if last message was from user (skip if user sent last message)
        const lastMessageFromType = recentMessages?.[0]?.from_type;
        if (lastMessageFromType === 'user') {
          console.log(`[process-followups] Last message from user, skipping conversation ${conv.id}`);
          skipped++;
          continue;
        }
        
        // Check for recent messages to prevent duplicates (race condition) - skip if message sent in last 5 minutes
        const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
        const recentAgentMessage = recentMessages?.find(m => 
          m.from_type !== 'user' && new Date(m.sent_at) > fiveMinutesAgo
        );
        if (recentAgentMessage) {
          const secondsAgo = Math.floor((now.getTime() - new Date(recentAgentMessage.sent_at).getTime()) / 1000);
          console.log(`[process-followups] Agent message sent ${secondsAgo}s ago, skipping to prevent duplicate for ${conv.id}`);
          skipped++;
          continue;
        }
        
        // Check if last agent message indicates scheduled callback (patterns that show callback was confirmed)
        const lastAgentMessage = recentMessages?.find(m => m.from_type !== 'user')?.content?.toLowerCase() || '';
        const CALLBACK_CONFIRMATION_PATTERNS = [
          'vamos entrar em contato',
          'entraremos em contato',
          'ligaremos',
          'retornaremos',
          'ligar para você',
          'retornar sua ligação',
          'agendado para',
          'agendei para',
          'marcado para',
          'te ligo',
          'ligamos',
          'retorno',
          'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira',
          'segunda feira', 'terça feira', 'quarta feira', 'quinta feira', 'sexta feira',
          'pela manhã', 'pela tarde', 'de manhã', 'à tarde', 'as 9', 'às 9', 'as 10', 'às 10',
          'as 11', 'às 11', 'as 14', 'às 14', 'as 15', 'às 15', 'as 16', 'às 16',
        ];
        
        const hasCallbackConfirmation = CALLBACK_CONFIRMATION_PATTERNS.some(p => lastAgentMessage.includes(p));
        if (hasCallbackConfirmation) {
          console.log(`[process-followups] Last agent message indicates callback confirmation, skipping followup for ${conv.id}`);
          skipped++;
          continue;
        }
        
        // Analyze conversation to detect unanswered questions
        const conversationAnalysis = analyzeConversationHistory(recentMessages || []);
        if (conversationAnalysis.unansweredQuestion) {
          console.log(`[process-followups] Detected unanswered question in ${conv.id}: "${conversationAnalysis.unansweredQuestion.substring(0, 60)}..."`);
        }
        
            // Analyze lead qualification and detect product
            const leadQualification = analyzeLeadQualification(conv.client_memory, recentMessages || []);
            const leadIsQualified = leadQualification.isQualified;
            const detectedProduct = leadQualification.detectedProduct;
            
            // NOVO: Detectar seguro existente também pelo histórico de mensagens
            const hasInsuranceFromMessages = detectExistingInsuranceFromMessages(recentMessages || []);
            const hasExistingInsuranceDetected = hasInsuranceFromMessages || leadQualification.hasExistingInsurance;
            
            console.log(`[process-followups] Lead qualification for ${conv.id}: qualified=${leadIsQualified}, product=${detectedProduct || 'none'}, hasInsuranceFromMessages=${hasInsuranceFromMessages}`);

        // Check previous follow-ups from this automation (now including message_content for anti-repetition)
        const { data: previousLogs, error: logsError } = await supabase
          .from('followup_logs')
          .select('id, created_at, message_content')
          .eq('automation_id', automation.id)
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false });

        if (logsError) {
          console.error(`[process-followups] Error checking logs:`, logsError);
          failed++;
          continue;
        }

        // Determine current attempt number
        const attemptNumber = (previousLogs?.length || 0) + 1;

        // Check max attempts
        if (attemptNumber > automation.max_attempts) {
          console.log(`[process-followups] Max attempts reached for conversation ${conv.id}`);
          skipped++;
          continue;
        }

        // Check cooldown
        if (previousLogs && previousLogs.length > 0) {
          const lastLog = previousLogs[0];
          if (new Date(lastLog.created_at) > cooldownTime) {
            console.log(`[process-followups] Within cooldown period for conversation ${conv.id}`);
            skipped++;
            continue;
          }
        }

        // Calculate hours waited
        const msWaited = now.getTime() - new Date(conv.last_message_at).getTime();
        const hoursWaited = msWaited / (1000 * 60 * 60);

        // Get agent info for AI generation
        const agentInfo = conv.current_agent_id ? agentsMap[conv.current_agent_id] : null;

        try {
          if (automation.automation_type === 'free_text') {
            // Get last message sent for anti-repetition
            const lastMessageSent = previousLogs?.[0]?.message_content || undefined;
            if (lastMessageSent) {
              console.log(`[process-followups] Last message for anti-repetition: "${lastMessageSent.substring(0, 40)}..."`);
            }
            
            // Extract insurance status from nina_context OU detecção via mensagens
            let insuranceStatus: InsuranceStatus | null = conv.nina_context?.insurance_status || null;
            
            // NOVO: Detectar soft rejection (desinteresse leve)
            const hasSoftRejectionDetected = detectSoftRejectionFromMessages(recentMessages || []);
            
            // NOVO: Se detectamos via mensagens mas não está no nina_context, criar o status
            if (hasExistingInsuranceDetected && !insuranceStatus) {
              insuranceStatus = { has_vehicle_insurance: true };
              console.log(`[process-followups] 🔍 Insurance detected from messages - creating status`);
            }
            
            // NOVO: Adicionar soft rejection ao status
            if (hasSoftRejectionDetected) {
              insuranceStatus = { ...insuranceStatus, hasSoftRejection: true };
              console.log(`[process-followups] 🚫 Soft rejection detected from messages - adding to status`);
            }
            
            const hasExistingInsurance = insuranceStatus?.has_vehicle_insurance || insuranceStatus?.has_cargo_insurance || false;
            
            // NOVO: Detectar se é conversa de PROSPECÇÃO (Atlas)
            const isProspectingConversation = agentInfo?.slug === 'atlas' || 
              (conv.nina_context?.metadata?.origin === 'prospeccao');
            
            // NOVO: Fluxo SIMPLIFICADO para prospecção - apenas 2 tentativas
            if (isProspectingConversation) {
              console.log(`[process-followups] 🎯 PROSPECTING conversation detected (${agentInfo?.slug || 'unknown'}) - using simplified 2-step flow`);
              
              // Verificar se lead respondeu pelo menos uma vez
              const hasUserResponse = conversationAnalysis.hasUserResponse;
              
              if (!hasUserResponse) {
                // Lead NUNCA respondeu ao template inicial
                // Tentativa 1 = prospecting_no_reply (encerramento sem resposta)
                // Tentativa 2+ = NÃO ENVIA
                if (attemptNumber >= 2) {
                  console.log(`[process-followups] 🛑 Prospecting no reply - attempt ${attemptNumber} - STOPPING (max 1 attempt for no-reply)`);
                  
                  // Marcar conversa como encerrada
                  await supabase.from('conversations').update({
                    nina_context: {
                      ...conv.nina_context,
                      followup_stopped: true,
                      followup_stopped_reason: 'prospecting_no_reply',
                      closed_at: new Date().toISOString()
                    }
                  }).eq('id', conv.id);
                  
                  skipped++;
                  continue;
                }
              } else {
                // Lead respondeu mas parou
                // Tentativa 1 = direct_question (pergunta curta)
                // Tentativa 2 = prospecting_closing (encerramento profissional)
                // Tentativa 3+ = NÃO ENVIA
                if (attemptNumber >= 3) {
                  console.log(`[process-followups] 🛑 Prospecting partial response - attempt ${attemptNumber} - STOPPING (max 2 attempts for partial response)`);
                  
                  // Marcar conversa como encerrada
                  await supabase.from('conversations').update({
                    nina_context: {
                      ...conv.nina_context,
                      followup_stopped: true,
                      followup_stopped_reason: 'prospecting_closed',
                      closed_at: new Date().toISOString()
                    }
                  }).eq('id', conv.id);
                  
                  skipped++;
                  continue;
                }
              }
            }
            // NOVO: Para leads com SOFT REJECTION, LIMITAR a 1 tentativa
            // 1ª = ask_insurance_renewal (pergunta se tem seguro e vencimento)
            // 2ª+ = NÃO ENVIA (encerra automação)
            else if (hasSoftRejectionDetected) {
              console.log(`[process-followups] Lead has soft rejection - using simplified 1-step flow`);
              
              if (attemptNumber >= 2) {
                console.log(`[process-followups] 🛑 Attempt ${attemptNumber} for lead with soft rejection - STOPPING (no more messages)`);
                skipped++;
                continue;
              }
            }
            // Para leads com seguro existente (sem soft rejection), LIMITAR a 2 tentativas máximo
            else if (hasExistingInsurance) {
              console.log(`[process-followups] Lead has existing insurance - using simplified 2-step flow`);
              
              // Se já é a 2ª tentativa ou mais, forçar encerramento elegante
              if (attemptNumber >= 2) {
                console.log(`[process-followups] 📝 Attempt ${attemptNumber} for lead with insurance - forcing closing_with_option (encerramento elegante)`);
              }
            }
            
            // NOVO: Para prospecção, forçar prompts específicos
            let prospectingPromptType: string | null = null;
            if (isProspectingConversation) {
              const hasUserResponse = conversationAnalysis.hasUserResponse;
              
              if (!hasUserResponse) {
                // Sem resposta → encerramento direto com site
                prospectingPromptType = 'prospecting_no_reply';
                console.log(`[process-followups] 📩 Prospecting: no user response - using prospecting_no_reply`);
              } else {
                // Respondeu mas parou
                if (attemptNumber === 1) {
                  prospectingPromptType = 'direct_question';
                  console.log(`[process-followups] 📩 Prospecting: attempt 1 - using direct_question`);
                } else {
                  // Tentativa 2 = encerramento profissional com site
                  prospectingPromptType = 'prospecting_closing';
                  console.log(`[process-followups] 📩 Prospecting: attempt 2 - using prospecting_closing (professional closing)`);
                }
              }
            }
            
            // Get message content based on attempt number, sequence, and conversation context
            const messageContent = await getMessageForAttempt(
              automation,
              attemptNumber,
              conv,
              hoursWaited,
              supabaseUrl,
              supabaseServiceKey,
              agentInfo?.name,
              agentInfo?.specialty || undefined,
              agentInfo?.slug,
              lastMessageSent,
              conversationAnalysis.conversationContext,
              conversationAnalysis.unansweredQuestion || undefined,
              leadIsQualified,
              detectedProduct,
              conversationAnalysis.answeredQualifications,
              insuranceStatus, // status de seguro existente
              prospectingPromptType // NOVO: forçar prompt de prospecção
            );
            
            // NOVO: Se messageContent é null (soft rejection após 1ª tentativa), parar automação
            if (!messageContent || messageContent === 'null') {
              console.log(`[process-followups] ⏹️ No message to send (soft rejection limit reached) - marking and skipping`);
              
              // Atualizar nina_context para indicar que automação foi encerrada
              await supabase.from('conversations').update({
                nina_context: {
                  ...conv.nina_context,
                  followup_stopped: true,
                  followup_stopped_reason: 'soft_rejection_limit'
                }
              }).eq('id', conv.id);
              
              skipped++;
              continue;
            }
            
            console.log(`[process-followups] Sending message (attempt ${attemptNumber}) to ${conv.id}: "${messageContent.substring(0, 50)}..."`);

            // Insert into send_queue
            const { data: queueItem, error: queueError } = await supabase
              .from('send_queue')
              .insert({
                contact_id: conv.contact_id,
                conversation_id: conv.id,
                message_type: 'text',
                from_type: 'nina',
                content: messageContent,
                status: 'pending',
                priority: 2,
              })
              .select('id')
              .single();

            if (queueError) {
              console.error(`[process-followups] Failed to queue free text message:`, queueError);
              
              await supabase.from('followup_logs').insert({
                automation_id: automation.id,
                conversation_id: conv.id,
                contact_id: conv.contact_id,
                template_name: `[Tentativa ${attemptNumber}] ${automation.name}`,
                status: 'failed',
                error_message: queueError.message,
                hours_waited: hoursWaited,
                message_content: messageContent, // Save for anti-repetition
              });
              
              failed++;
              continue;
            }

            // Log success with message_content for future anti-repetition
            await supabase.from('followup_logs').insert({
              automation_id: automation.id,
              conversation_id: conv.id,
              contact_id: conv.contact_id,
              template_name: `[Tentativa ${attemptNumber}] ${automation.name}`,
              status: 'sent',
              hours_waited: hoursWaited,
              message_content: messageContent, // Save for anti-repetition
            });

            console.log(`[process-followups] Queued follow-up (attempt ${attemptNumber}) for conversation ${conv.id}`);
            
            // Trigger whatsapp-sender to process the queue immediately
            try {
              const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
              fetch(senderUrl, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${supabaseServiceKey}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ triggered_by: 'process-followups' })
              }).catch(err => console.error('[process-followups] Error triggering whatsapp-sender:', err));
              console.log(`[process-followups] Triggered whatsapp-sender for queued message`);
            } catch (e) {
              console.error('[process-followups] Failed to trigger whatsapp-sender:', e);
            }
            
            sent++;
            totalProcessed++;

          } else {
            // Send template via send-whatsapp-template function
            const variables: string[] = [];
            const varConfig = automation.template_variables || {};
            
            for (let i = 1; i <= 10; i++) {
              const key = i.toString();
              if (varConfig[key]) {
                let value = '';
                switch (varConfig[key]) {
                  case 'contact.name':
                    value = conv.contact_name || conv.contact_call_name || 'Cliente';
                    break;
                  case 'contact.call_name':
                    value = conv.contact_call_name || conv.contact_name || 'Cliente';
                    break;
                  case 'contact.company':
                    value = conv.contact_company || '';
                    break;
                  case 'hours_waiting':
                    value = Math.round(hoursWaited).toString();
                    break;
                  default:
                    value = varConfig[key];
                }
                variables.push(value);
              }
            }

            const sendResponse = await fetch(`${supabaseUrl}/functions/v1/send-whatsapp-template`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                contact_id: conv.contact_id,
                conversation_id: conv.id,
                template_name: template!.name,
                language: template!.language || 'pt_BR',
                variables: variables.length > 0 ? variables : undefined,
              }),
            });

            const sendResult = await sendResponse.json();

            if (!sendResponse.ok) {
              console.error(`[process-followups] Failed to send template:`, sendResult);
              
              await supabase.from('followup_logs').insert({
                automation_id: automation.id,
                conversation_id: conv.id,
                contact_id: conv.contact_id,
                template_name: template!.name,
                status: 'failed',
                error_message: sendResult.error || 'Unknown error',
                hours_waited: hoursWaited,
              });
              
              failed++;
              continue;
            }

            // Log success
            await supabase.from('followup_logs').insert({
              automation_id: automation.id,
              conversation_id: conv.id,
              contact_id: conv.contact_id,
              message_id: sendResult.message_id,
              template_name: template!.name,
              status: 'sent',
              hours_waited: hoursWaited,
            });

            console.log(`[process-followups] Sent template follow-up to conversation ${conv.id}`);
            sent++;
            totalProcessed++;
          }

        } catch (sendError) {
          console.error(`[process-followups] Error sending follow-up:`, sendError);
          
          await supabase.from('followup_logs').insert({
            automation_id: automation.id,
            conversation_id: conv.id,
            contact_id: conv.contact_id,
            template_name: automation.automation_type === 'template' ? template?.name : `[Texto Livre] ${automation.name}`,
            status: 'failed',
            error_message: String(sendError),
            hours_waited: hoursWaited,
          });
          
          failed++;
        }
      }

      results.push({ automation: automation.name, sent, skipped, failed });
      console.log(`[process-followups] Automation ${automation.name}: sent=${sent}, skipped=${skipped}, failed=${failed}`);
    }

    console.log(`[process-followups] Total processed: ${totalProcessed}`);

    return new Response(JSON.stringify({ 
      processed: totalProcessed, 
      results,
      timestamp: now.toISOString(),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[process-followups] Error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Process window expiring automations
async function processWindowExpiringAutomation(
  supabase: any,
  supabaseUrl: string,
  supabaseServiceKey: string,
  automation: Automation,
  now: Date
): Promise<{ automation: string; sent: number; skipped: number; failed: number }> {
  console.log(`[process-followups] Processing window_expiring automation: ${automation.name}`);
  
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  
  const minutesBeforeExpiry = automation.minutes_before_expiry || 10;
  
  // Find conversations with windows expiring within the configured margin
  const { data: conversationsRaw, error: convError } = await supabase
    .from('conversations')
    .select(`
      id,
      contact_id,
      last_message_at,
      status,
      whatsapp_window_start,
      current_agent_id,
      contacts!inner (
        name,
        call_name,
        company,
        phone_number
      )
    `)
    .eq('is_active', true)
    .in('status', automation.conversation_statuses)
    .not('whatsapp_window_start', 'is', null);

  if (convError) {
    console.error(`[process-followups] Error fetching conversations:`, convError);
    return { automation: automation.name, sent: 0, skipped: 0, failed: 0 };
  }

  if (!conversationsRaw || conversationsRaw.length === 0) {
    console.log(`[process-followups] No conversations with active windows found`);
    return { automation: automation.name, sent: 0, skipped: 0, failed: 0 };
  }

  console.log(`[process-followups] Found ${conversationsRaw.length} conversations with active windows`);

  // Get agent-to-pipeline mapping for fallback
  const { data: pipelines } = await supabase
    .from('pipelines')
    .select('id, agent_id')
    .not('agent_id', 'is', null);
  
  const pipelineAgentMap: Record<string, string> = {};
  if (pipelines) {
    for (const p of pipelines) {
      if (p.agent_id) pipelineAgentMap[p.id] = p.agent_id;
    }
  }

  for (const convRaw of conversationsRaw) {
    // Try to get agent from conversation or via pipeline through deal
    let agentId = convRaw.current_agent_id;
    let pipelineIdFromDeal: string | null = null;
    let isDealLost = false;
    
    // Check deal status and get agent via pipeline if needed
    const { data: deal } = await supabase
      .from('deals')
      .select(`
        pipeline_id,
        lost_at,
        pipeline_stages!inner(title)
      `)
      .eq('contact_id', convRaw.contact_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    // Skip if deal is lost
    if (deal?.lost_at || (deal?.pipeline_stages as any)?.title === 'Perdido') {
      console.log(`[process-followups] Deal is lost for conversation ${convRaw.id}, skipping window expiry`);
      skipped++;
      continue;
    }
    
    // If no agent on conversation, try to find via deal -> pipeline -> agent
    if (!agentId && deal?.pipeline_id) {
      pipelineIdFromDeal = deal.pipeline_id;
      if (pipelineAgentMap[deal.pipeline_id]) {
        agentId = pipelineAgentMap[deal.pipeline_id];
      }
    }

    const conv: EligibleConversation = {
      id: convRaw.id,
      contact_id: convRaw.contact_id,
      last_message_at: convRaw.last_message_at,
      status: convRaw.status,
      whatsapp_window_start: convRaw.whatsapp_window_start,
      contact_name: (convRaw.contacts as any)?.name,
      contact_call_name: (convRaw.contacts as any)?.call_name,
      contact_company: (convRaw.contacts as any)?.company,
      contact_phone: (convRaw.contacts as any)?.phone_number,
      current_agent_id: agentId,
      pipeline_id: pipelineIdFromDeal,
    };

    // Check if window is expiring within the configured margin
    const minutesRemaining = getWindowMinutesRemaining(conv.whatsapp_window_start);
    
    // Window must be expiring soon (within margin) but not already expired
    if (minutesRemaining < 0 || minutesRemaining > minutesBeforeExpiry) {
      console.log(`[process-followups] Window for ${conv.id} has ${minutesRemaining.toFixed(1)} min remaining, not within ${minutesBeforeExpiry} min margin, skipping`);
      skipped++;
      continue;
    }

    console.log(`[process-followups] Window for ${conv.id} expires in ${minutesRemaining.toFixed(1)} min - within margin!`);

    // Check if client responded during this window period
    if (automation.only_if_no_client_response) {
      const { data: clientMessages, error: msgError } = await supabase
        .from('messages')
        .select('id')
        .eq('conversation_id', conv.id)
        .eq('from_type', 'user')
        .gte('sent_at', conv.whatsapp_window_start)
        .limit(2); // Just need to know if there's more than the initial message

      if (msgError) {
        console.error(`[process-followups] Error checking client messages:`, msgError);
        failed++;
        continue;
      }

      // If client sent messages after the window started (beyond the initial message that opened the window)
      // We check for > 1 because the first message is what opened the window
      const hasClientResponse = clientMessages && clientMessages.length > 1;
      
      if (hasClientResponse) {
        console.log(`[process-followups] Client responded during window for ${conv.id}, skipping (only_if_no_client_response=true)`);
        skipped++;
        continue;
      }
    }

    // Check previous follow-ups from this automation (max attempts)
    const { data: previousLogs, error: logsError } = await supabase
      .from('followup_logs')
      .select('id, created_at')
      .eq('automation_id', automation.id)
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: false });

    if (logsError) {
      console.error(`[process-followups] Error checking logs:`, logsError);
      failed++;
      continue;
    }

    if (previousLogs && previousLogs.length >= automation.max_attempts) {
      console.log(`[process-followups] Max attempts reached for conversation ${conv.id}`);
      skipped++;
      continue;
    }

    // Check cooldown
    const cooldownTime = new Date(now.getTime() - automation.cooldown_hours * 60 * 60 * 1000);
    if (previousLogs && previousLogs.length > 0) {
      const lastLog = previousLogs[0];
      if (new Date(lastLog.created_at) > cooldownTime) {
        console.log(`[process-followups] Within cooldown period for conversation ${conv.id}`);
        skipped++;
        continue;
      }
    }

    // Calculate hours waited
    const msWaited = now.getTime() - new Date(conv.last_message_at).getTime();
    const hoursWaited = msWaited / (1000 * 60 * 60);

    try {
      // Select message based on agent
      let rawMessage = automation.free_text_message || 'Olá {nome}! Caso precise de ajuda, estou aqui. Me responde qualquer coisa pra gente continuar a conversa!';
      
      // Check if there's an agent-specific message
      if (conv.current_agent_id && automation.agent_messages && automation.agent_messages[conv.current_agent_id]) {
        rawMessage = automation.agent_messages[conv.current_agent_id];
        console.log(`[process-followups] Using agent-specific message for agent ${conv.current_agent_id}`);
      } else if (conv.current_agent_id) {
        console.log(`[process-followups] No agent-specific message for agent ${conv.current_agent_id}, using fallback`);
      }
      
      let messageContent = replaceVariables(rawMessage, conv);
      
      // Adicionar link do site no final da mensagem (consistência com last_chance)
      const siteLink = 'Acesse nosso site: https://jacometoseguros.com.br/';
      if (!messageContent.includes('jacometoseguros.com.br')) {
        messageContent = `${messageContent}\n\n${siteLink}`;
      }
      
      console.log(`[process-followups] Sending window expiring message to ${conv.id}: "${messageContent.substring(0, 50)}..."`);

      // Insert into send_queue
      const { error: queueError } = await supabase
        .from('send_queue')
        .insert({
          contact_id: conv.contact_id,
          conversation_id: conv.id,
          message_type: 'text',
          from_type: 'nina',
          content: messageContent,
          status: 'pending',
          priority: 3, // Higher priority for time-sensitive messages
        });

      if (queueError) {
        console.error(`[process-followups] Failed to queue window expiring message:`, queueError);
        
        await supabase.from('followup_logs').insert({
          automation_id: automation.id,
          conversation_id: conv.id,
          contact_id: conv.contact_id,
          template_name: `[Última Chance] ${automation.name}`,
          status: 'failed',
          error_message: queueError.message,
          hours_waited: hoursWaited,
        });
        
        failed++;
        continue;
      }

      // Log success
      await supabase.from('followup_logs').insert({
        automation_id: automation.id,
        conversation_id: conv.id,
        contact_id: conv.contact_id,
        template_name: `[Última Chance] ${automation.name}`,
        status: 'sent',
        hours_waited: hoursWaited,
      });

      console.log(`[process-followups] Queued window expiring message for conversation ${conv.id} (${minutesRemaining.toFixed(1)} min before expiry)`);
      sent++;

    } catch (sendError) {
      console.error(`[process-followups] Error sending window expiring message:`, sendError);
      
      await supabase.from('followup_logs').insert({
        automation_id: automation.id,
        conversation_id: conv.id,
        contact_id: conv.contact_id,
        template_name: `[Última Chance] ${automation.name}`,
        status: 'failed',
        error_message: String(sendError),
        hours_waited: hoursWaited,
      });
      
      failed++;
    }
  }

  console.log(`[process-followups] Window expiring automation ${automation.name}: sent=${sent}, skipped=${skipped}, failed=${failed}`);
  return { automation: automation.name, sent, skipped, failed };
}
