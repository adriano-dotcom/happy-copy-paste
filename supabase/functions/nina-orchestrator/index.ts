import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech";

interface Agent {
  id: string;
  name: string;
  slug: string;
  specialty: string | null;
  system_prompt: string;
  is_default: boolean;
  is_active: boolean;
  detection_keywords: string[];
  greeting_message: string | null;
  handoff_message: string | null;
  rejection_message: string | null;
  cargo_focused_greeting: string | null;
  qualification_questions: Array<{ order: number; question: string }>;
  audio_response_enabled?: boolean;
  elevenlabs_voice_id?: string | null;
  elevenlabs_model?: string | null;
  elevenlabs_stability?: number | null;
  elevenlabs_similarity_boost?: number | null;
  elevenlabs_style?: number | null;
  elevenlabs_speed?: number | null;
  elevenlabs_speaker_boost?: boolean | null;
}

// Keywords que indicam interesse explícito em seguro de cargas (para campanhas)
const CARGO_INSURANCE_KEYWORDS = [
  'seguro de carga', 'seguro de cargas', 'seguro da carga', 'seguro cargas',
  'rctr', 'rctr-c', 'rc-dc', 'roubo de carga', 'roubo carga',
  'seguro pra transportadora', 'seguro para transportadora',
  'seguro transporte', 'seguro de frete', 'seguro frete',
  'seguro para caminhão', 'seguro caminhoneiro', 'seguro caminhão',
  'transporte de carga', 'transporto carga', 'minha transportadora',
  'seguro pra frota', 'seguro para frota', 'seguro da frota'
];

function hasExplicitCargoInterest(messageContent: string): boolean {
  const lowerContent = messageContent.toLowerCase();
  return CARGO_INSURANCE_KEYWORDS.some(keyword => lowerContent.includes(keyword));
}

// ===== OUT OF SCOPE INSURANCE DETECTION (for Sofia agent) =====
// Insurance types that are NOT handled by transport specialists (Adri, Clara, Leo)
// These will be handled by Sofia (generic insurance agent)
const OUT_OF_SCOPE_INSURANCE_KEYWORDS: Record<string, string[]> = {
  // Tipos existentes
  'auto': ['seguro auto', 'seguro carro', 'seguro do carro', 'seguro do meu carro', 'seguro veículo particular', 'seguro veiculo particular', 'seguro meu veículo', 'seguro meu veiculo'],
  'residencial': ['seguro residencial', 'seguro residencia', 'seguro da casa', 'seguro casa', 'seguro do apartamento', 'seguro apartamento', 'seguro apto', 'seguro imóvel', 'seguro imovel'],
  'vida': ['seguro de vida', 'seguro vida', 'seguro morte', 'seguro pessoal'],
  'viagem': ['seguro viagem', 'seguro de viagem', 'assistência viagem', 'assistencia viagem'],
  'pet': ['seguro pet', 'seguro do cachorro', 'seguro do gato', 'seguro animal'],
  'celular': ['seguro celular', 'seguro do celular', 'seguro smartphone', 'seguro do iphone', 'seguro do telefone'],
  'bike': ['seguro bike', 'seguro bicicleta', 'seguro da bike'],
  'fianca': ['seguro fiança', 'seguro fianca', 'seguro aluguel', 'seguro locatício', 'seguro locaticio'],
  'empresarial': ['seguro empresa', 'seguro empresarial', 'seguro comercial', 'seguro patrimônio', 'seguro patrimonio', 'seguro do negócio', 'seguro do negocio'],
  'frota_geral': ['seguro frota', 'frota de veículos', 'frota de veiculos', 'vários veículos', 'varios veiculos', 'seguro moto', 'seguro motocicleta'],
  
  // Novos tipos adicionados
  'garantia': ['seguro garantia', 'garantia contratual', 'garantia de obra', 'seguro performance', 'garantia licitação', 'garantia licitacao', 'garantia judicial', 'seguro garantia contratual'],
  'rc': ['responsabilidade civil', 'seguro rc', 'rc profissional', 'rc geral', 'danos a terceiros', 'seguro responsabilidade', 'rc médica', 'rc medica', 'rc advogado', 'rc engenheiro'],
  'deo': ['seguro d&o', 'd&o', 'directors and officers', 'seguro diretores', 'seguro executivos', 'responsabilidade de gestores', 'd and o'],
  'equipamentos': ['seguro equipamentos', 'seguro máquinas', 'seguro maquinas', 'seguro eletrônicos', 'seguro eletronicos', 'seguro notebook', 'seguro computador', 'seguro maquinário', 'seguro maquinario'],
  'condominio': ['seguro condomínio', 'seguro condominio', 'seguro prédio', 'seguro predio', 'seguro do condomínio', 'seguro do condominio', 'seguro predial'],
  'rural': ['seguro rural', 'seguro agrícola', 'seguro agricola', 'seguro safra', 'seguro fazenda', 'seguro gado', 'seguro pecuário', 'seguro pecuario', 'seguro plantação', 'seguro plantacao', 'seguro colheita'],
  'nautico': ['seguro barco', 'seguro lancha', 'seguro jet ski', 'seguro jetski', 'seguro embarcação', 'seguro embarcacao', 'seguro iate', 'seguro marítimo', 'seguro maritimo', 'seguro náutico', 'seguro nautico'],
  'aeronautico': ['seguro avião', 'seguro aviao', 'seguro helicóptero', 'seguro helicoptero', 'seguro aeronave', 'seguro drone', 'seguro aeronáutico', 'seguro aeronautico', 'seguro asa delta', 'seguro parapente'],
  // 'saude' e 'odonto' REMOVIDOS - Clara (agente especialista) atende esses tipos
  // 'saude': [...] - Atendido por Clara
  // 'odonto': [...] - Atendido por Clara
  'previdencia': ['previdência privada', 'previdencia privada', 'pgbl', 'vgbl', 'aposentadoria privada', 'plano de aposentadoria', 'fundo de previdência', 'fundo de previdencia', 'plano previdenciário', 'plano previdenciario'],
  'consorcio': ['consórcio', 'consorcio', 'consórcio imóvel', 'consorcio imovel', 'consórcio carro', 'consorcio carro', 'consórcio auto', 'consorcio auto', 'carta de crédito', 'carta de credito'],
  'cyber': ['seguro cyber', 'seguro digital', 'proteção de dados', 'protecao de dados', 'seguro vazamento', 'seguro cibernético', 'seguro cibernetico', 'seguro ataque hacker', 'seguro ransomware', 'lgpd'],
};

// Map type to friendly name in Portuguese
const INSURANCE_TYPE_NAMES: Record<string, string> = {
  // Tipos existentes
  'auto': 'Seguro Auto',
  'residencial': 'Seguro Residencial',
  'vida': 'Seguro de Vida',
  'viagem': 'Seguro Viagem',
  'pet': 'Seguro Pet',
  'celular': 'Seguro Celular',
  'bike': 'Seguro Bike',
  'fianca': 'Seguro Fiança',
  'empresarial': 'Seguro Empresarial',
  'frota_geral': 'Seguro de Frota',
  
  // Novos tipos adicionados
  'garantia': 'Seguro Garantia',
  'rc': 'Responsabilidade Civil',
  'deo': 'Seguro D&O',
  'equipamentos': 'Seguro de Equipamentos',
  'condominio': 'Seguro Condomínio',
  'rural': 'Seguro Rural/Agrícola',
  'nautico': 'Seguro Náutico',
  'aeronautico': 'Seguro Aeronáutico',
  // 'saude' e 'odonto' removidos - Clara atende esses tipos
  'previdencia': 'Previdência Privada',
  'consorcio': 'Consórcio',
  'cyber': 'Seguro Cyber',
};

interface OutOfScopeResult {
  isOutOfScope: boolean;
  insuranceType: string | null;
  friendlyName: string | null;
  detectedKeyword: string | null;
}

// ===== FALLBACK MESSAGE DETECTION =====
// Used to prevent sending fallback/error messages as audio
const FALLBACK_PATTERNS = [
  'desculpe, não consegui processar',
  'pode repetir de outra forma',
  'não entendi sua mensagem',
  'houve um erro ao processar',
  'desculpe, houve um problema',
  'tente novamente'
];

function isFallbackMessage(content: string): boolean {
  if (!content) return false;
  const lowerContent = content.toLowerCase();
  return FALLBACK_PATTERNS.some(pattern => lowerContent.includes(pattern));
}
// ===== END FALLBACK MESSAGE DETECTION =====

// ===== CLT EMPLOYEE DETECTION (job clarification needed) =====
// When someone says they are a "CLT employee" / "professional driver" / etc.
// they might be looking for a job, not insurance. Ask clarifying question.
interface CltEmployeePattern {
  needsClarification: boolean;
  matchedTerms: string[];
}

const CLT_EMPLOYEE_INDICATORS = [
  'clt', 'carteira assinada', 'registro em carteira',
  'motorista profissional', 'sou motorista', 'trabalho como motorista',
  'motorista de empresa', 'empregado', 'funcionário', 'funcionario',
  'trabalho numa empresa', 'trabalho em uma empresa'
];

const CLT_EXCLUSION_TERMS = [
  // Termos que indicam que é dono/gestor (não funcionário)
  'minha frota', 'meus caminhões', 'meus caminhaos', 'minha transportadora',
  'minha empresa', 'sou dono', 'sou proprietário', 'sou proprietario',
  'emito ct-e', 'cnpj', 'antt', 'rntrc', 'minha carreta', 'meu caminhão'
];

function detectCltEmployeePattern(messageContent: string, allUserMessages: string[]): CltEmployeePattern {
  const content = messageContent.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const allContent = allUserMessages.join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // Check exclusions first - if they mention ownership terms, not an employee
  const hasExclusion = CLT_EXCLUSION_TERMS.some(term => 
    allContent.includes(term.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
  );
  
  if (hasExclusion) {
    return { needsClarification: false, matchedTerms: [] };
  }
  
  // Check for CLT indicators
  const matchedTerms: string[] = [];
  for (const indicator of CLT_EMPLOYEE_INDICATORS) {
    const normalizedIndicator = indicator.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (content.includes(normalizedIndicator)) {
      matchedTerms.push(indicator);
    }
  }
  
  // Need clarification if found CLT indicators without ownership context
  return {
    needsClarification: matchedTerms.length > 0,
    matchedTerms
  };
}
// ===== END CLT EMPLOYEE DETECTION =====

// ===== NAME EXTRACTION UTILITY =====
function extractNameFromMessage(content: string): string | null {
  if (!content) return null;
  
  // Padrões comuns de resposta com nome
  const patterns = [
    /(?:meu nome [eé]|me chamo|sou o?a?\s*)\s*([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)?)/i,
    /(?:pode me chamar de|[eé]\s*o?a?\s*)\s*([A-Za-zÀ-ÿ]+)/i,
    /(?:aqui [eé]\s*o?a?\s*)\s*([A-Za-zÀ-ÿ]+)/i
  ];
  
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match && match[1] && match[1].length >= 2 && match[1].length <= 30) {
      // Capitalizar primeira letra de cada palavra
      return match[1].split(' ').map(w => 
        w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
      ).join(' ');
    }
  }
  
  // Se for uma resposta curta (1-3 palavras), pode ser só o nome
  const words = content.trim().split(/\s+/);
  if (words.length <= 3 && words.length >= 1) {
    const firstWord = words[0];
    // Verificar se parece um nome (começa com letra, tamanho razoável)
    if (firstWord.length >= 2 && firstWord.length <= 20 && /^[A-Za-zÀ-ÿ]+$/.test(firstWord)) {
      // Verificar se NÃO é uma palavra comum
      const commonWords = ['sim', 'nao', 'não', 'ok', 'oi', 'ola', 'olá', 'bom', 'boa', 'dia', 'tarde', 'noite', 
        'obrigado', 'obrigada', 'tchau', 'blz', 'beleza', 'certo', 'entendi', 'legal', 'tudo', 'bem', 'de'];
      if (!commonWords.includes(firstWord.toLowerCase())) {
        // Pegar até 2 palavras como nome
        const nameParts = words.slice(0, 2).filter(w => /^[A-Za-zÀ-ÿ]+$/.test(w) && w.length >= 2);
        if (nameParts.length > 0) {
          return nameParts.map(w => 
            w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
          ).join(' ');
        }
      }
    }
  }
  
  return null;
}
// ===== END NAME EXTRACTION UTILITY =====

// ===== CONTACT NAME NORMALIZATION (Title Case + First Name Only) =====
function normalizeContactName(name: string | null): string {
  if (!name || !name.trim()) return 'Cliente';
  
  // Pegar apenas o primeiro nome
  const firstName = name.trim().split(/\s+/)[0];
  
  // Se está todo em maiúsculas, converter para Title Case
  if (firstName === firstName.toUpperCase() && firstName.length > 2) {
    return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
  }
  
  // Garantir primeira letra maiúscula
  return firstName.charAt(0).toUpperCase() + firstName.slice(1);
}
// ===== END CONTACT NAME NORMALIZATION =====

// ===== SANITIZE NAME IN CONVERSATION HISTORY =====
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizeNameInHistory(content: string, contact: any): string {
  if (!content || !contact?.name) return content;
  const fullName = (contact.call_name || contact.name || '').trim();
  const originalName = (contact.name || '').trim();
  const normalized = normalizeContactName(contact.call_name || contact.name);
  
  let sanitized = content;
  
  // Replace full original name (case-insensitive) — e.g. "LEONARDO FELIPE RIBEIRO SANCHES" → "Leonardo"
  if (originalName && originalName !== normalized) {
    sanitized = sanitized.replace(new RegExp(escapeRegex(originalName), 'gi'), normalized);
  }
  
  // Replace call_name full if different
  if (fullName && fullName !== originalName && fullName !== normalized) {
    sanitized = sanitized.replace(new RegExp(escapeRegex(fullName), 'gi'), normalized);
  }
  
  // Replace CAPS first name (e.g. "LEONARDO" → "Leonardo")
  const firstName = originalName.split(/\s+/)[0];
  if (firstName && firstName === firstName.toUpperCase() && firstName.length > 2) {
    sanitized = sanitized.replace(new RegExp(`\\b${escapeRegex(firstName)}\\b`, 'g'), normalized);
  }
  
  return sanitized;
}
// ===== END SANITIZE NAME IN CONVERSATION HISTORY =====

// ===== TIMEZONE UTILITY =====
const BRAZIL_TIMEZONE = 'America/Sao_Paulo';
function toBRT(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString('pt-BR', { timeZone: BRAZIL_TIMEZONE });
}
// ===== END TIMEZONE UTILITY =====

// ===== AUTOMATIC DISQUALIFICATION SYSTEM =====
interface DisqualificationCategory {
  key: string;
  tag: string;
  keywords: string[];
  response: string | null;
  pauseConversation: boolean;
  markAsLost?: boolean; // Flag para marcar deal como perdido
  setIdentityMismatch?: boolean; // Flag para prevenir follow-ups
  resetContactData?: boolean; // Flag para resetar dados do contato (mudança de dono)
  reason: string;
  emoji: string;
}

// ===== IRIS QUALIFICATION CONTEXT PATTERNS =====
// When the last agent message matches these patterns, user responses
// are QUALIFICATION ANSWERS, NOT job-seeking/disqualification triggers

interface QualificationPattern {
  agentPatterns: RegExp[];
  validAnswers: string[];
}

const IRIS_QUALIFICATION_PATTERNS: Record<string, QualificationPattern> = {
  // Tipo de contratação (já existente e expandido)
  contratacao: {
    agentPatterns: [
      /contratado direto.*subcontratado/i,
      /subcontratado.*contratado direto/i,
      /tipo de contrata[çc][aã]o/i,
      /emitindo ct-?e.*ou.*subcontratado/i,
      /atua como.*direto.*ou.*subcontratado/i,
      /trabalha como.*direto.*subcontratado/i,
      /direto ou subcontratado/i,
      /voc[êe] [eé] contratado/i,
      /contratado ou subcontratado/i,
      /você atua como contratado/i,
      /voce atua como contratado/i,
      /contratado.*emitindo.*ct-?e/i
    ],
    validAnswers: [
      'subcontratado', 'sub-contratado', 'sub contratado',
      'contratado direto', 'direto', 'contratado',
      'sou subcontratado', 'trabalho subcontratado',
      'faço frete subcontratado', 'faco frete subcontratado',
      'agregado', 'terceirizado', 'autonomo', 'autônomo',
      'pj', 'pessoa juridica', 'pessoa jurídica', 'cnpj',
      'emito cte', 'emito ct-e', 'nao emito', 'não emito',
      'ambos', 'os dois', 'depende', 'os 2'
    ]
  },

  // Intenção de continuar subcontratado ou virar direto
  intencao_sub: {
    agentPatterns: [
      /pretende continuar.*subcontratado/i,
      /virar contratado direto/i,
      /continuar como subcontratado/i,
      /plano.*virar direto/i,
      /pretende virar direto/i,
      /quer virar direto/i
    ],
    validAnswers: [
      'continuar', 'virar direto', 'quero continuar', 'quero virar',
      'pretendo continuar', 'pretendo virar', 'vou continuar', 'vou virar',
      'sim', 'nao', 'não', 'ainda nao sei', 'ainda não sei', 'depende',
      'vou permanecer', 'por enquanto sim', 'por enquanto nao', 'por enquanto não'
    ]
  },

  // Tipo de frota
  tipo_frota: {
    agentPatterns: [
      /frota.*pr[óo]pria.*agregados.*terceiros/i,
      /pr[óo]pria.*agregados.*terceiros/i,
      /trabalha com frota/i,
      /tipo de frota/i,
      /frota [eé]/i,
      /sua frota [eé]/i,
      /frota [eé] propria/i,
      /frota.*ou.*agregados/i
    ],
    validAnswers: [
      'propria', 'própria', 'agregados', 'terceiros', 'mista',
      'frota propria', 'frota própria', 'so agregados', 'só agregados',
      'so terceiros', 'só terceiros', 'tudo proprio', 'tudo próprio',
      'propria e agregados', 'própria e agregados', 'so minha', 'só minha'
    ]
  },

  // Tem seguro ativo
  tem_seguro: {
    agentPatterns: [
      /j[áa] tem seguro/i,
      /seguro.*ativo/i,
      /ve[íi]culos.*j[áa] t[êe]m seguro/i,
      /tem seguro de carga/i,
      /seguro atualmente/i,
      /tem algum seguro/i,
      /possui seguro/i
    ],
    validAnswers: [
      'sim', 'nao', 'não', 'tenho', 'nao tenho', 'não tenho',
      'ativo', 'vencido', 'ja tenho', 'já tenho', 'ainda nao', 'ainda não',
      'vencendo', 'pra vencer', 'para vencer', 'ta vencendo', 'tá vencendo'
    ]
  },

  // Vencimento de apólice
  vencimento: {
    agentPatterns: [
      /quando vence/i,
      /vence a ap[óo]lice/i,
      /vencimento.*seguro/i,
      /data.*vencimento/i,
      /vence o seguro/i,
      /quando.*ap[óo]lice.*vence/i
    ],
    validAnswers: [
      'mes que vem', 'mês que vem', 'proximo mes', 'próximo mês',
      'janeiro', 'fevereiro', 'marco', 'março', 'abril', 'maio',
      'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
      'esse mes', 'esse mês', 'semana que vem', 'daqui', 'dias', 'meses',
      'nao sei', 'não sei', 'vou verificar', 'vou ver'
    ]
  },

  // Tipo de mercadoria/carga
  tipo_mercadoria: {
    agentPatterns: [
      /tipo de mercadoria/i,
      /que.*transporta/i,
      /tipo de carga/i,
      /quais.*cargas/i,
      /o que voc[êe] transporta/i,
      /mercadoria.*transporta/i,
      /carga.*transporta/i
    ],
    validAnswers: [
      'geral', 'carga geral', 'seca', 'carga seca', 'frigorificada',
      'refrigerada', 'graos', 'grãos', 'soja', 'milho', 'alimentos',
      'bebidas', 'eletronicos', 'eletrônicos', 'maquinas', 'máquinas',
      'madeira', 'ferro', 'aco', 'aço', 'cimento', 'quimicos', 'químicos',
      'perigosa', 'de tudo', 'varia', 'depende', 'diversa', 'container',
      'congelados', 'frios', 'medicamentos', 'combustivel', 'combustível'
    ]
  },

  // Regiões/Estados
  regioes_estados: {
    agentPatterns: [
      /quais regi[õo]es/i,
      /quais estados/i,
      /onde.*atende/i,
      /regi[õo]es.*atende/i,
      /estados.*atende/i,
      /onde.*roda/i,
      /rota principal/i
    ],
    validAnswers: [
      'sp', 'rj', 'mg', 'pr', 'sc', 'rs', 'ba', 'go', 'mt', 'ms', 'df',
      'sao paulo', 'são paulo', 'rio', 'minas', 'parana', 'paraná',
      'sul', 'sudeste', 'nordeste', 'centro-oeste', 'norte',
      'todo brasil', 'brasil todo', 'nacional', 'interestadual', 'regional',
      'sul e sudeste', 'norte e nordeste', 'interior', 'capital'
    ]
  },

  // Quantidade de veículos
  qtd_veiculos: {
    agentPatterns: [
      /quantos ve[íi]culos/i,
      /quantas carretas/i,
      /quantos caminh[õo]es/i,
      /tamanho da frota/i,
      /ve[íi]culos.*tem na frota/i,
      /quantas unidades/i,
      /quantos.*na frota/i
    ],
    validAnswers: [
      '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '15', '20', '30', '50', '100',
      'um', 'uma', 'dois', 'duas', 'tres', 'três', 'quatro', 'cinco',
      'dez', 'vinte', 'trinta', 'poucos', 'varios', 'vários', 'muitos',
      'so um', 'só um', 'so uma', 'só uma', 'mais de', 'menos de', 'aproximadamente'
    ]
  },

  // Tipos de veículos
  tipos_veiculos: {
    agentPatterns: [
      /quais tipos de ve[íi]culos/i,
      /carretas.*trucks.*vans/i,
      /tipo de ve[íi]culo/i,
      /que ve[íi]culos.*tem/i,
      /quais ve[íi]culos/i
    ],
    validAnswers: [
      'carreta', 'carretas', 'truck', 'trucks', 'bitrem', 'rodotrem',
      'van', 'vans', 'furgao', 'furgão', 'cavalo', 'toco', 'bi-truck',
      'caminhao', 'caminhão', 'caminhoes', 'caminhões', 'utilitario', 'utilitário',
      '3/4', 'tres quartos', 'três quartos', 'semi reboque', 'bau', 'baú'
    ]
  },

  // Viagens por mês
  viagens_mes: {
    agentPatterns: [
      /quantas viagens/i,
      /viagens.*m[êe]s/i,
      /fretes.*m[êe]s/i,
      /media.*viagens/i,
      /média.*viagens/i,
      /frequencia.*viagens/i,
      /frequência.*viagens/i
    ],
    validAnswers: [
      '1', '2', '3', '5', '10', '15', '20', '30', '50', '100',
      'uma', 'duas', 'poucas', 'muitas', 'varia', 'depende',
      'diario', 'diário', 'semanal', 'mensal', 'quinzenal',
      'toda semana', 'todo dia', 'varias por semana', 'várias por semana'
    ]
  },

  // Valor médio/máximo
  valor_carga: {
    agentPatterns: [
      /valor m[ée]dio/i,
      /maior valor/i,
      /valor.*carga/i,
      /quanto vale/i,
      /valor aproximado/i,
      /faixa de valor/i
    ],
    validAnswers: [
      'mil', 'mil reais', '50 mil', '100 mil', '200 mil', '500 mil',
      'milhao', 'milhão', 'depende', 'varia', 'nao sei', 'não sei',
      'entre', 'mais ou menos', 'aproximadamente', 'r$', 'reais',
      'baixo valor', 'alto valor', 'medio', 'médio'
    ]
  },

  // ANTT
  antt: {
    agentPatterns: [
      /antt.*ativa/i,
      /antt.*regularizada/i,
      /tem antt/i,
      /sua antt/i,
      /rntrc.*ativo/i,
      /possui antt/i
    ],
    validAnswers: [
      'sim', 'nao', 'não', 'ativa', 'regularizada', 'tenho',
      'em dia', 'vencida', 'vencendo', 'renovando', 'preciso renovar',
      'ta ativa', 'tá ativa', 'ta regular', 'tá regular'
    ]
  },

  // CT-e
  cte: {
    agentPatterns: [
      /emite ct-?e/i,
      /voc[êe].*ct-?e/i,
      /emiss[ãa]o de ct-?e/i,
      /pretende emitir/i,
      /emite conhecimento/i
    ],
    validAnswers: [
      'sim', 'nao', 'não', 'emito', 'nao emito', 'não emito',
      'ainda nao', 'ainda não', 'pretendo', 'vou emitir', 'ja emito', 'já emito',
      'tenho', 'nao tenho', 'não tenho'
    ]
  },

  // CNPJ
  cnpj: {
    agentPatterns: [
      /qual.*cnpj/i,
      /cnpj da.*empresa/i,
      /n[úu]mero do cnpj/i,
      /me passa.*cnpj/i,
      /pode informar.*cnpj/i,
      /cnpj.*consulta/i
    ],
    validAnswers: [
      'tenho', 'vou mandar', 'mando', 'ja mando', 'já mando', 'segue',
      'sim', 'vou passar', 'anota ai', 'anota aí'
    ]
  }
};

/**
 * Check if user response is answering ANY Iris qualification question
 * Returns true if disqualification check should be skipped
 */
function isIrisQualificationAnswer(
  userMessage: string, 
  lastAgentMessage: string | null,
  agentSlug: string | null
): { isQualification: boolean; category: string | null } {
  // Only apply for Iris agent
  if (agentSlug !== 'iris') {
    return { isQualification: false, category: null };
  }
  
  if (!lastAgentMessage) {
    return { isQualification: false, category: null };
  }
  
  const normalizeText = (text: string) => 
    text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  const lowerAgentMsg = normalizeText(lastAgentMessage);
  const lowerUserMsg = normalizeText(userMessage);
  
  // Check each qualification category
  for (const [category, config] of Object.entries(IRIS_QUALIFICATION_PATTERNS)) {
    // Check if agent asked this type of question
    const isQuestionMatch = config.agentPatterns.some(pattern => 
      pattern.test(lowerAgentMsg)
    );
    
    if (!isQuestionMatch) continue;
    
    // Check if user response is a valid answer
    const isValidAnswer = config.validAnswers.some(answer => 
      lowerUserMsg.includes(normalizeText(answer))
    );
    
    if (isValidAnswer) {
      console.log(`[Nina][Iris] ✅ Qualification answer - Category: ${category}`);
      console.log(`[Nina][Iris] Question: "${lastAgentMessage.substring(0, 60)}..."`);
      console.log(`[Nina][Iris] Answer: "${userMessage}"`);
      return { isQualification: true, category };
    }
  }
  
  // Extra check: short numeric answers for "quantos" questions
  if (/^\d{1,4}$/.test(userMessage.trim())) {
    if (/quant[oa]s?/i.test(lowerAgentMsg) || /n[úu]mero/i.test(lowerAgentMsg)) {
      console.log('[Nina][Iris] ✅ Numeric answer to quantity question');
      return { isQualification: true, category: 'numeric_quantity' };
    }
  }
  
  // Extra check: CNPJ format (14 digits)
  const cnpjDigits = userMessage.replace(/\D/g, '');
  if (cnpjDigits.length === 14) {
    if (/cnpj/i.test(lowerAgentMsg)) {
      console.log('[Nina][Iris] ✅ CNPJ number detected');
      return { isQualification: true, category: 'cnpj' };
    }
  }
  
  return { isQualification: false, category: null };
}
// ===== END IRIS QUALIFICATION CONTEXT PATTERNS =====

const DISQUALIFICATION_CATEGORIES: DisqualificationCategory[] = [
  {
    key: 'job_seeker',
    tag: 'emprego',
    keywords: [
      // More specific job-seeking phrases to avoid false positives
      'vaga de emprego', 'vagas de emprego', 'vaga de trabalho', 'vagas de trabalho',
      'procuro emprego', 'preciso de emprego', 'procurando emprego',
      'procuro trabalho', 'preciso de trabalho', 'procurando trabalho',
      'estou desempregado', 'estou procurando emprego', 'estou sem emprego',
      'vocês estão contratando', 'voces estao contratando', 'estão contratando', 'estao contratando',
      'tem vaga aí', 'tem vaga ai', 'tem vagas aí', 'tem vagas ai',
      'há vaga disponível', 'ha vaga disponivel', 'há vagas disponíveis',
      'posso mandar meu currículo', 'posso enviar meu currículo',
      'manda o currículo', 'enviar currículo', 'deixar currículo',
      'curriculo', 'currículo', 'meu cv',
      'oportunidade de emprego', 'oportunidades de emprego',
      'quero trabalhar aí', 'quero trabalhar ai', 'quero trabalhar com vocês', 'quero trabalhar com voces',
      'vocês precisam de', 'voces precisam de', 'precisam de motorista', 'precisam de ajudante',
      // ===== INFORMAL JOB-SEEKING PHRASES (added 2026-01-23) =====
      'procura pessoal pra trabalhar', 'procura pessoal para trabalhar',
      'procuram pessoal pra trabalhar', 'procuram pessoal para trabalhar',
      'precisa de pessoal pra trabalhar', 'precisa de pessoal para trabalhar',
      'precisa de gente pra trabalhar', 'precisa de gente para trabalhar',
      'precisa de funcionario', 'precisa de funcionários', 'precisa de funcionarios',
      'ta precisando de gente', 'tá precisando de gente', 'está precisando de gente',
      'voces contratam', 'vocês contratam', 'cês contratam',
      'to procurando trampo', 'tô procurando trampo', 'procuro trampo', 'preciso de trampo',
      'alguma vaga disponivel', 'alguma vaga disponível', 'tem alguma vaga',
      'procura gente pra trabalhar', 'procura gente para trabalhar',
      'ta contratando', 'tá contratando', 'tao contratando', 'tão contratando',
      // ===== EXPANDED INFORMAL PHRASES (added 2026-01-23) =====
      // Variações "tem como trabalhar"
      'tem como trabalhar aí', 'tem como trabalhar ai', 'tem como trabalhar aí com vocês',
      'tem como eu trabalhar', 'como faz pra trabalhar aí', 'como faço pra trabalhar ai',
      'como faz pra trabalhar ai', 'como faço pra trabalhar aí',
      // Variações "preciso de renda/dinheiro"
      'preciso de renda', 'preciso de uma renda', 'preciso fazer uma grana',
      'preciso ganhar dinheiro', 'preciso de um trampo', 'precisando de renda',
      'precisando de grana', 'preciso de um bico',
      // Variações "arrumar trabalho/emprego"
      'quero arrumar emprego', 'quero arrumar um emprego', 'quero arrumar trabalho',
      'quero arrumar um trabalho', 'to querendo arrumar trampo', 'tô querendo arrumar trampo',
      'conseguir um emprego', 'conseguir emprego',
      // Variações informais genéricas
      'vocês tão pegando gente', 'voces tao pegando gente', 'cês tão pegando', 'ces tao pegando',
      'tem serviço aí', 'tem serviço ai', 'tem trampo aí', 'tem trampo ai',
      'tem trabalho aí', 'tem trabalho ai', 'dá pra trampar aí', 'da pra trampar ai',
      'posso trampar aí', 'posso trampar ai', 'to sem trampo', 'tô sem trampo', 'estou sem trampo',
      'to desempregado', 'tô desempregado',
      // Variações "procurando alguma coisa"
      'to procurando alguma coisa', 'tô procurando alguma coisa', 'procurando qualquer coisa',
      'preciso de qualquer coisa', 'aceito qualquer trabalho', 'aceito qualquer trampo',
      'to precisando de qualquer coisa', 'tô precisando de qualquer coisa',
      // Variações "vaga de motorista/ajudante"
      'vaga de motorista', 'vaga pra motorista', 'vaga para motorista',
      'vaga de ajudante', 'vaga pra ajudante', 'vaga para ajudante',
      'procuro vaga de motorista', 'procuro vaga de ajudante',
      'sou motorista e procuro', 'sou ajudante e procuro',
      // Gírias e expressões regionais
      'cola aí pra trampar', 'manda um salve sobre vaga', 'rola vaga aí', 'rola trabalho ai',
      'tem como colar aí', 'tem vaguinha aí', 'tem vaguinha ai',
      // ===== TYPOS E ERROS DE TRANSCRIÇÃO DE ÁUDIO (added 2026-01-23) =====
      // Erros em "trabalho/trabalhar"
      'trabaiho', 'trabayo', 'trabalo', 'trabalio', 'trabaio',
      'trabaihar', 'trabayar', 'trabalar', 'trabaliar', 'trabaiar',
      'procuro trabaiho', 'preciso de trabaiho', 'quero trabaihar',
      'to procurando trabaiho', 'tô procurando trabaiho', 'procurando trabaiho',
      // Erros em "emprego"
      'empregu', 'impregu', 'imprego', 'empregadu', 'impregado',
      'desempregadu', 'dezempregado', 'dezempregadu',
      'procuro empregu', 'preciso de empregu', 'to desempregadu', 'tô desempregadu',
      'to sem empregu', 'tô sem empregu', 'procurando empregu',
      // Erros em "trampo" (gíria)
      'trampu', 'trampi', 'trampô', 'trampa', 'trampá',
      'procuro trampu', 'preciso de trampu', 'to sem trampu', 'tô sem trampu',
      'to procurando trampu', 'tô procurando trampu', 'tem trampu ai', 'tem trampu aí',
      // Erros em "currículo"
      'curriculu', 'curiculo', 'curículo', 'curriculo',
      'manda o curriculu', 'enviar curriculu', 'mandar curriculu',
      'posso mandar meu curriculu', 'posso enviar meu curriculu',
      // Erros em "contratando/contratar"
      'contratanu', 'contratatando', 'contratá', 'contratanu pessoal',
      'tao contratanu', 'estao contratanu', 'ta contratanu', 'tá contratanu',
      'voces tao contratanu', 'vocês tão contratanu',
      // Erros em "precisando/preciso"
      'precisanu', 'presisando', 'presiso', 'presisu', 'precissu',
      'to presisando', 'tô presisando', 'ta presisando', 'tá presisando',
      'presiso de trabalho', 'presiso de emprego', 'presisando de trampo',
      // Erros em "vaga"
      'vagá', 'vaguinha ai', 'vagaai', 'tem vagá', 'alguma vagá',
      // Erros gerais de fala rápida/informal
      'vcs tao pegando', 'vcs contratam', 'vc contrata', 'vcs precisam',
      'tem trabio ai', 'tem trabaio ai', 'tem trabayo ai',
      'to sem trabio', 'to sem trabaio', 'tô sem trabaio',
      // ===== CONFIRMAÇÕES EXPLÍCITAS DE BUSCA DE EMPREGO (added 2026-01-27) =====
      // Confirmações de emprego em respostas de clarificação
      'oportunidade de trabalho', 'oportunidades de trabalho',
      'oportunidade de emprego', 'oportunidades de emprego', 
      'busco trabalho', 'busco emprego', 'busco oportunidade',
      'trabalho de motorista', 'quero trabalhar como motorista', 'quero ser contratado',
      'sou motorista e busco', 'sou motorista procurando',
      'preciso de trabalho como motorista', 'preciso trabalhar como motorista'
    ],
    response: 'Agradecemos seu contato. Somos uma corretora especializada em seguros de transporte e carga. No momento, nao temos vagas em aberto. Desejamos sucesso na sua busca!',
    pauseConversation: true,
    reason: 'Procura de emprego - não é lead de seguro'
  },
  {
    key: 'vendor',
    tag: 'fornecedor',
    keywords: [
      'gostaria de oferecer', 'tenho um produto', 'representante comercial',
      'parceiro comercial', 'distribuidor', 'revenda', 'atacado',
      'cotação de serviço', 'oferecer serviços', 'prestar serviço',
      'somos empresa de', 'minha empresa oferece', 'nossa empresa oferece',
      'vendemos', 'comercializamos', 'fornecemos', 'sou vendedor',
      'sou representante', 'vendo sistema', 'vendo software',
      'ofereço meus serviços', 'prestação de serviço'
    ],
    response: 'Agradecemos seu contato. No momento, nao estamos buscando novos fornecedores ou prestadores de servico. Caso isso mude, entraremos em contato. Obrigado!',
    pauseConversation: true,
    reason: 'Fornecedor/prestador de serviço - não é lead de seguro'
  },
  {
    key: 'partnership',
    tag: 'parceria',
    keywords: [
      'parceria', 'parceiro', 'associação', 'convênio', 'colaboração',
      'representar vocês', 'representação', 'comissão por indicação',
      'indicação de clientes', 'troca de indicação', 'network',
      'joint venture', 'co-branding', 'acordo comercial'
    ],
    response: 'Agradecemos o interesse em parceria. No momento, nao estamos avaliando novas parcerias comerciais. Desejamos sucesso!',
    pauseConversation: true,
    reason: 'Busca parceria - não é lead de seguro'
  },
  {
    key: 'number_owner_changed',
    tag: 'mudou_dono',
    keywords: [
      // Mudança de proprietário do número
      'esse número agora é meu', 'esse numero agora e meu',
      'agora esse número é meu', 'agora esse numero e meu',
      'comprei esse número', 'comprei esse numero',
      'esse chip agora é meu', 'esse chip agora e meu',
      'o antigo dono', 'antigo proprietário', 'antigo proprietario',
      'dono anterior', 'proprietário anterior', 'proprietario anterior',
      'quem tinha esse número', 'quem tinha esse numero',
      'não é mais dele', 'nao e mais dele',
      'não é mais dela', 'nao e mais dela',
      'saiu da empresa', 'não trabalha mais aqui', 'nao trabalha mais aqui',
      'foi demitido', 'foi mandado embora',
      'vendeu a empresa', 'fechou a empresa',
      'troquei de chip', 'peguei esse número', 'peguei esse numero',
      'herdei esse número', 'herdei esse numero',
      'esse número era de', 'esse numero era de',
      'era do meu', 'era da minha',
      'agora sou eu', 'agora é meu', 'agora e meu',
      'novo dono', 'nova dona', 'o dono saiu', 'a dona saiu',
      'agora é outra pessoa', 'agora e outra pessoa',
      'não existe mais essa pessoa', 'nao existe mais essa pessoa',
      'ele vendeu', 'ela vendeu', 'vendeu o negócio', 'vendeu o negocio',
      'aposentou', 'faleceu', 'mudou de cidade',
      'não mora mais aqui', 'nao mora mais aqui',
      'não trabalha mais', 'nao trabalha mais',
      'esse número era', 'esse numero era'
    ],
    response: 'Entendi! Obrigado por avisar. Vou atualizar nosso cadastro.\n\nPosso saber seu nome para registrar corretamente?',
    pauseConversation: false, // NÃO pausa - queremos continuar qualificando
    markAsLost: false, // NÃO marca como perdido - é um novo lead potencial
    setIdentityMismatch: false,
    resetContactData: true, // NOVA FLAG - reseta dados do contato
    reason: 'Número mudou de dono - novo lead'
  },
  {
    key: 'wrong_number',
    tag: 'engano',
    keywords: [
      // Erros de discagem / envio
      'número errado', 'numero errado', 'errei o número', 'errei o numero',
      'desculpa, engano', 'foi engano', 'liguei errado', 'mandei errado',
      'quem é você', 'quem e voce', 'não conheço', 'nao conheco',
      'quem está falando', 'quem esta falando', 'não te conheço',
      'nao te conheco', 'errado o contato', 'contato errado',
      // Identidade errada / não é a pessoa certa
      'não é este contato', 'nao e este contato',
      'não sou este contato', 'nao sou este contato',
      'não sou essa pessoa', 'nao sou essa pessoa',
      'não é comigo', 'nao e comigo',
      'você ligou para pessoa errada', 'voce ligou para pessoa errada',
      'você mandou para pessoa errada', 'voce mandou para pessoa errada',
      'pessoa errada', 'errou de pessoa',
      // Não é o responsável / não é da empresa
      'não sou o dono', 'nao sou o dono',
      'não sou da empresa', 'nao sou da empresa',
      'não trabalho nessa empresa', 'nao trabalho nessa empresa',
      'não é aqui', 'nao e aqui',
      'aqui não é', 'aqui nao e',
      // Número pessoal / particular
      'esse número é pessoal', 'esse numero e pessoal',
      'esse é meu pessoal', 'esse e meu pessoal',
      'número pessoal', 'numero pessoal',
      'número particular', 'numero particular',
      'celular pessoal', 'meu pessoal',
      // Erros de número
      'acho que você errou', 'acho que voce errou',
      'errou de número', 'errou de numero',
      'mandou errado', 'trocou de número', 'trocou de numero',
      // Padrões de rejeição de identidade
      'não sou eu', 'nao sou eu', 'não é meu', 'nao e meu',
      'sou outra pessoa', 'número antigo', 'numero antigo',
      'esse whatsapp não é', 'esse whatsapp nao e',
      'esse zap não é', 'esse zap nao e',
      'nao pertence', 'não pertence',
      'esse numero nao pertence', 'esse número não pertence'
    ],
    response: 'Entendo, peco desculpas pelo engano. Obrigado por avisar!',
    pauseConversation: true,
    markAsLost: true,
    setIdentityMismatch: true,
    reason: 'Contato errado / pessoa errada'
  },
  {
    key: 'spam',
    tag: 'spam',
    keywords: [
      'ganhe dinheiro', 'renda extra fácil', 'trabalhe de casa ganhando',
      'investimento garantido', 'forex', 'criptomoeda fácil',
      'clique no link e ganhe', 'promoção especial exclusiva',
      'você foi selecionado', 'prêmio em dinheiro', 'casino',
      'apostas online', 'ganhos garantidos', 'duplique seu dinheiro',
      'bitcoin grátis', 'pix de graça', 'empréstimo aprovado'
    ],
    response: null, // Não responde spam
    pauseConversation: true,
    reason: 'Spam/golpe detectado'
  },
  {
    key: 'freight_seeker',
    tag: 'frete',
    keywords: [
      // Busca direta de frete
      'preciso fazer um frete', 'preciso de um frete', 'quero fazer um frete',
      'preciso fazer frete', 'quero contratar frete', 'contratar um frete',
      'onde posso contratar frete', 'onde contrato frete', 'como contratar frete',
      'quanto custa um frete', 'quanto custa o frete', 'quanto custa pra fazer frete',
      'quanto custa fazer um frete', 'valor do frete', 'preço do frete', 'preco do frete',
      'orcamento de frete', 'orçamento de frete', 'cotacao de frete', 'cotação de frete',
      // Busca de transportadora
      'vocês fazem transporte', 'voces fazem transporte', 'fazem transporte',
      'vocês transportam', 'voces transportam', 'vocês entregam', 'voces entregam',
      'preciso de uma transportadora', 'preciso de transportadora',
      'indicam transportadora', 'indicação de transportadora', 'indicacao de transportadora',
      'conhecem transportadora', 'conhecem alguma transportadora',
      // Variações informais
      'tem frete aí', 'tem frete ai', 'faz frete', 'fazem frete',
      'vocês são transportadora', 'voces sao transportadora',
      'é transportadora', 'e transportadora', 'são transportadora', 'sao transportadora',
      'preciso transportar', 'quero transportar', 'preciso enviar', 'quero enviar',
      'preciso mandar', 'quero mandar', 'preciso despachar', 'quero despachar',
      // Especificando carga/mercadoria para transporte
      'preciso levar uma carga', 'preciso levar carga', 'preciso enviar carga',
      'preciso mandar uma carga', 'transportar mercadoria', 'enviar mercadoria',
      'mandar mercadoria', 'despachar mercadoria', 'entregar mercadoria',
      // Perguntando sobre caminhão/veículo
      'tem caminhão disponível', 'tem caminhao disponivel', 'tem carreta disponível',
      'preciso de caminhão', 'preciso de caminhao', 'preciso de carreta',
      'aluguel de caminhão', 'aluguel de caminhao', 'alugar caminhão', 'alugar caminhao',
      // Rotas/destinos
      'frete pra', 'frete para', 'entrega pra', 'entrega para',
      'transportam pra', 'transportam para', 'levam pra', 'levam para',
      // ===== TYPOS E ERROS DE TRANSCRIÇÃO DE ÁUDIO (added 2026-01-23) =====
      // Erros em "frete"
      'freti', 'frête', 'fretê', 'frète', 'fretí',
      'preciso de um freti', 'fazer um freti', 'quanto custa o freti',
      'contratar freti', 'tem freti ai', 'tem freti aí', 'faz freti',
      'preciso fazer freti', 'quero fazer freti', 'quero um freti',
      // Erros em "transporte/transportadora"
      'transpote', 'trasporte', 'transporti', 'transpoti', 'transporti',
      'transportadra', 'trasportadora', 'transportadóra', 'trasportadóra',
      'preciso de trasporte', 'fazem transpote', 'fazem trasporte',
      'preciso de transportadra', 'preciso de trasportadora',
      'voces fazem transpote', 'vocês fazem transpote', 'voces fazem trasporte',
      // Erros em "transportar"
      'trasportar', 'transpota', 'trasporta', 'transpotar', 'traspotar',
      'preciso trasportar', 'quero trasportar', 'preciso transpota',
      // Erros em "caminhão/carreta"
      'caminhâo', 'caminhãu', 'caminhaum', 'caminham', 'caminhon',
      'carréta', 'carêta', 'careta', 'carrêta', 'caretá',
      'preciso de caminhâo', 'tem caminhaum', 'preciso de careta',
      'tem caminhâo disponivel', 'tem caminhaum disponivel',
      // Erros em "enviar/entregar"
      'invia', 'enviá', 'inviar', 'envía',
      'intrega', 'entregá', 'intregar', 'intregá',
      'preciso invia', 'preciso intrega', 'quero invia', 'quero intrega',
      // Erros em "carga/mercadoria"
      'cárga', 'cargu', 'cargá', 'cargâ',
      'mercadória', 'mercadóriu', 'mercadoría', 'mercadóri',
      'enviar cargu', 'transportar cargu', 'levar mercadória',
      'preciso enviar cargu', 'preciso levar mercadória'
    ],
    response: 'Ola! Entendo que voce esta buscando servicos de frete ou transporte. Nos nao realizamos transporte de cargas - somos uma corretora de seguros especializada em proteger mercadorias durante o transporte. Se voce ja tem o frete contratado e quer garantir a seguranca da sua carga, podemos ajudar! Voce ja tem uma transportadora?',
    pauseConversation: false, // NÃO pausar - tentar converter em lead de seguro
    reason: 'Busca de frete - esclarecer que somos corretora de seguros'
  }
];

function detectDisqualificationCategory(messageContent: string): DisqualificationCategory | null {
  const content = messageContent.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // ===== TRANSPORT INDUSTRY CONTEXT PROTECTION =====
  // If message contains transport-specific terms, it's likely a qualification context
  // and should NOT be flagged as job_seeker
  const transportContextTerms = [
    'subcontratado', 'contratado direto', 'ct-e', 'cte', 'antt', 'rntrc',
    'carreta', 'truck', 'bitrem', 'rodotrem', 'cavalo', 'frota', 'agregado',
    'rctr', 'rc-v', 'carga seca', 'frigorificado', 'granel', 'averbacao',
    'averbação', 'mercadoria', 'frete proprio', 'frete próprio'
  ];

  const hasTransportContext = transportContextTerms.some(term =>
    content.includes(term.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
  );

  if (hasTransportContext) {
    console.log('[Nina][Disqualification] 🚛 Transport context detected - NOT flagging as job_seeker');
    return null;
  }
  // ===== END TRANSPORT INDUSTRY CONTEXT PROTECTION =====
  
  // ===== EXPLICIT JOB SEEKER CHECK - MUST COME FIRST =====
  // These phrases are UNAMBIGUOUS job seeking - disqualify even if there was prior insurance interest
  // This handles cases where lead asks about insurance first, then asks for a job
  const explicitJobSeekerPhrases = [
    'procura pessoal pra trabalhar', 'procura pessoal para trabalhar',
    'procuram pessoal pra trabalhar', 'procuram pessoal para trabalhar',
    'precisa de pessoal pra trabalhar', 'precisa de gente pra trabalhar',
    'ta precisando de gente', 'tá precisando de gente', 'está precisando de gente',
    'voces contratam', 'vocês contratam', 'cês contratam',
    'ta contratando', 'tá contratando', 'tao contratando', 'tão contratando',
    'procura gente pra trabalhar', 'procura gente para trabalhar'
  ];
  
  const isExplicitJobSeeker = explicitJobSeekerPhrases.some(phrase => 
    content.includes(phrase.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
  );
  
  if (isExplicitJobSeeker) {
    console.log(`[Nina][Disqualification] 💼 EXPLICIT job seeker detected - overriding any insurance interest`);
    return DISQUALIFICATION_CATEGORIES.find(c => c.key === 'job_seeker')!;
  }
  // ===== END EXPLICIT JOB SEEKER CHECK =====
  
  // ===== EXPLICIT FREIGHT SEEKER CHECK =====
  // These phrases indicate someone looking for freight/transport services, not insurance
  // Must come BEFORE insurance check since some terms overlap (carga, transporte)
  const explicitFreightSeekerPhrases = [
    'preciso fazer um frete', 'preciso de um frete', 'quero fazer um frete',
    'quanto custa um frete', 'quanto custa o frete', 'quanto custa pra fazer frete',
    'vocês fazem transporte', 'voces fazem transporte', 'fazem transporte',
    'vocês são transportadora', 'voces sao transportadora', 'é transportadora',
    'preciso de uma transportadora', 'preciso de transportadora',
    'onde posso contratar frete', 'como contratar frete',
    'tem frete aí', 'tem frete ai', 'faz frete', 'fazem frete',
    'vocês transportam', 'voces transportam', 'vocês entregam', 'voces entregam',
    // ===== VARIAÇÕES COM ERROS DE TRANSCRIÇÃO (added 2026-01-23) =====
    'preciso fazer um freti', 'preciso de um freti', 'quero fazer um freti',
    'quanto custa um freti', 'quanto custa o freti', 'quanto custa pra fazer freti',
    'fazem transpote', 'fazem trasporte', 'fazem transporti',
    'preciso de transportadra', 'preciso de trasportadora', 'preciso de uma trasportadora',
    'tem freti ai', 'tem freti aí', 'faz freti', 'fazem freti',
    'voces fazem transpote', 'vocês fazem transpote', 'voces fazem trasporte',
    'voces trasportam', 'vocês trasportam', 'voces intregam', 'vocês intregam'
  ];
  
  const isExplicitFreightSeeker = explicitFreightSeekerPhrases.some(phrase => 
    content.includes(phrase.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
  );
  
  if (isExplicitFreightSeeker) {
    console.log(`[Nina][Disqualification] 🚛 EXPLICIT freight seeker detected - clarifying we are insurance brokers`);
    return DISQUALIFICATION_CATEGORIES.find(c => c.key === 'freight_seeker')!;
  }
  // ===== END EXPLICIT FREIGHT SEEKER CHECK =====
  
  // ===== INSURANCE INTEREST CHECK =====
  // If the message mentions insurance-related terms, do NOT disqualify
  // This prevents false positives when leads say "onde eu trabalho, a gente tá sem seguro"
  const insuranceTerms = [
    'seguro', 'seguros', 'cotar', 'cotacao', 'cotação', 
    'rctr', 'carga', 'cargas', 'transporte', 'apolice', 'apólice',
    'cobertura', 'sinistro', 'indenizacao', 'indenização',
    'proteger', 'proteção', 'protecao', 'assegurar',
    'sem seguro', 'fazer seguro', 'preciso de seguro', 'quero seguro',
    'nao tem seguro', 'não tem seguro', 'ta sem seguro', 'tá sem seguro',
    'esta sem seguro', 'está sem seguro', 'renovar seguro', 'renovacao',
    'ct-e', 'cte', 'antt', 'rntrc', 'caminhao', 'caminhão', 'frota'
  ];
  
  const hasInsuranceInterest = insuranceTerms.some(term => 
    content.includes(term.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
  );
  
  if (hasInsuranceInterest) {
    console.log(`[Nina][Disqualification] 🛡️ Insurance interest detected in message - NOT disqualifying`);
    return null;
  }
  // ===== END INSURANCE INTEREST CHECK =====
  
  for (const category of DISQUALIFICATION_CATEGORIES) {
    const match = category.keywords.some(keyword => 
      content.includes(keyword.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
    );
    if (match) {
      console.log(`[Nina][Disqualification] ⚠️ Detected disqualification category: ${category.key} (keyword matched)`);
      return category;
    }
  }
  return null;
}

// ===== CURRICULUM/RESUME DOCUMENT DETECTION FUNCTION =====
// Patterns that indicate a resume/CV document
const CURRICULUM_PATTERNS = [
  // Typical resume structure (Portuguese)
  'experiência profissional', 'experiencia profissional',
  'dados pessoais', 'objetivo profissional',
  'formação escolar', 'formacao escolar', 'formação acadêmica', 'formacao academica',
  'cursos extracurriculares', 'cursos extra',
  'qualificações', 'qualificacoes', 'habilidades',
  'informações pessoais', 'informacoes pessoais',
  // Common CV terms
  'curriculum vitae', 'currículo vitae', 'curriculo vitae',
  'experiências', 'experiencias',
  // Typical fields
  'estado civil', 'data de nascimento', 'nacionalidade brasileira',
  'cargo:', 'empresa:', 'período:', 'periodo:',
  'ensino médio', 'ensino medio', 'ensino fundamental',
  'superior completo', 'superior incompleto',
  'técnico em', 'tecnico em',
  // Availability/salary terms
  'disponibilidade imediata', 'disponível para',
  'pretensão salarial', 'pretensao salarial',
  // Experience structure (common for transport CVs)
  'auxiliar de', 'ajudante de', 'operador de',
  'motorista -', 'entregador -',
  // Driver's license (common in transport CVs)
  'cnh categoria', 'cnh:', 'habilitação:',
  // Skills section
  'conhecimentos em', 'domínio de', 'dominio de',
  'referências', 'referencias',
  // Education section markers
  'grau de escolaridade', 'escolaridade:',
  'cursos complementares', 'certificações', 'certificacoes'
];

function detectCurriculumInExtractedText(content: string): boolean {
  if (!content) return false;
  
  // Only check text extracted from documents/images
  const isExtractedText = content.includes('[Texto extraído') || 
                          content.includes('[Texto extraido') ||
                          content.includes('[Texto da imagem') ||
                          content.includes('[Conteúdo do documento') ||
                          content.includes('[Conteudo do documento');
  
  if (!isExtractedText) return false;
  
  const lowerContent = content.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // Count how many curriculum patterns were found
  let matchCount = 0;
  const matchedPatterns: string[] = [];
  
  for (const pattern of CURRICULUM_PATTERNS) {
    const normalizedPattern = pattern.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (lowerContent.includes(normalizedPattern)) {
      matchCount++;
      matchedPatterns.push(pattern);
    }
  }
  
  // If found 3+ typical resume patterns, it's very likely a CV
  const isCurriculum = matchCount >= 3;
  
  if (isCurriculum) {
    console.log(`[Nina][CV Detection] 📄 Detected ${matchCount} CV patterns: ${matchedPatterns.slice(0, 5).join(', ')}${matchedPatterns.length > 5 ? '...' : ''}`);
  }
  
  return isCurriculum;
}
// ===== END CURRICULUM/RESUME DOCUMENT DETECTION FUNCTION =====

// ===== END AUTOMATIC DISQUALIFICATION SYSTEM =====

function detectOutOfScopeInsurance(messageContent: string, currentAgentSlug: string | null): OutOfScopeResult {
  console.log('[Nina][OutOfScope] ========== VERIFICANDO OUT OF SCOPE ==========');
  console.log('[Nina][OutOfScope] Mensagem:', messageContent.substring(0, 80) + (messageContent.length > 80 ? '...' : ''));
  console.log('[Nina][OutOfScope] Agente atual slug:', currentAgentSlug || 'nenhum');
  
  // Only detect out of scope if NOT already using Sofia or if using transport-specific agents
  if (currentAgentSlug === 'sofia') {
    console.log('[Nina][OutOfScope] ⏭️ Já está com Sofia - pulando verificação');
    return { isOutOfScope: false, insuranceType: null, friendlyName: null, detectedKeyword: null };
  }
  
  const content = messageContent.toLowerCase().trim();
  
  // First check if it's explicitly about transport/cargo insurance - those are IN scope
  if (hasExplicitCargoInterest(content)) {
    console.log('[Nina][OutOfScope] ✅ Interesse explícito em CARGA - NÃO é out of scope');
    return { isOutOfScope: false, insuranceType: null, friendlyName: null, detectedKeyword: null };
  }
  
  console.log('[Nina][OutOfScope] Verificando', Object.keys(OUT_OF_SCOPE_INSURANCE_KEYWORDS).length, 'tipos de seguro...');
  
  for (const [type, keywords] of Object.entries(OUT_OF_SCOPE_INSURANCE_KEYWORDS)) {
    for (const keyword of keywords) {
      if (content.includes(keyword)) {
        console.log('[Nina][OutOfScope] ⚠️ OUT OF SCOPE DETECTADO!');
        console.log('[Nina][OutOfScope] Tipo:', type);
        console.log('[Nina][OutOfScope] Keyword encontrada:', `"${keyword}"`);
        console.log('[Nina][OutOfScope] Nome amigável:', INSURANCE_TYPE_NAMES[type] || type);
        console.log('[Nina][OutOfScope] ========== FIM OUT OF SCOPE ==========');
        return { 
          isOutOfScope: true, 
          insuranceType: type, 
          friendlyName: INSURANCE_TYPE_NAMES[type] || type,
          detectedKeyword: keyword 
        };
      }
    }
  }
  
  console.log('[Nina][OutOfScope] ✅ Mensagem está IN SCOPE (não é seguro fora do escopo)');
  console.log('[Nina][OutOfScope] ========== FIM OUT OF SCOPE ==========');
  return { isOutOfScope: false, insuranceType: null, friendlyName: null, detectedKeyword: null };
}

// ===== REFERRAL CONTACT DETECTION (Atlas prospecting only) =====
interface ReferralContactResult {
  hasReferralContact: boolean;
  phoneNumber: string | null;
  referralName: string | null;
  matchedKeyword: string | null;
}

function detectReferralContact(messageContent: string): ReferralContactResult {
  const content = messageContent.toLowerCase();
  const originalContent = messageContent; // Keep original for name extraction
  
  // Padrões de número de telefone brasileiro
  const phonePatterns = [
    /(\d{2}[\s.-]?\d{4,5}[\s.-]?\d{4})/,      // 28 99983 4654, 28-99983-4654
    /(\d{10,11})/,                              // 28999834654
    /(\(\d{2}\)[\s]?\d{4,5}[\s.-]?\d{4})/,     // (28) 99983-4654
  ];
  
  // Keywords que indicam referência a outra pessoa responsável/decisor
  const referralKeywords = [
    'responsável', 'responsavel', 'dono', 'proprietário', 'proprietario',
    'gerente', 'gestor', 'diretor', 'sócio', 'socio', 'patrão', 'patrao',
    'fala com', 'liga pra', 'liga pro', 'liga para', 'falar com',
    'o número é', 'o numero é', 'o número do', 'o numero do',
    'whatsapp do', 'zap do', 'whats do', 'número dele', 'numero dele',
    'quem cuida', 'quem decide', 'quem resolve', 'quem manda',
    'decisor', 'dono da empresa', 'chefe', 'responsável pelo',
    'passa o contato', 'anota aí', 'anota ai', 'anota o número',
    'chama', 'procura o', 'procura a', 'contato do', 'contato da',
    'o cara que', 'a pessoa que', 'quem responde', 'quem atende',
    'falar direto com', 'fala direto com', 'conversa com'
  ];
  
  // Verificar se tem número de telefone
  let phoneMatch: string | null = null;
  for (const pattern of phonePatterns) {
    const match = content.match(pattern);
    if (match) {
      // Limpar e validar - precisa ter pelo menos 10 dígitos
      const cleanNumber = match[1].replace(/\D/g, '');
      if (cleanNumber.length >= 10) {
        phoneMatch = match[1];
        break;
      }
    }
  }
  
  // Verificar se tem keyword de referência
  let matchedKeyword: string | null = null;
  for (const keyword of referralKeywords) {
    if (content.includes(keyword)) {
      matchedKeyword = keyword;
      break;
    }
  }
  
  // Só retorna positivo se tiver AMBOS: número e keyword de referência
  if (phoneMatch && matchedKeyword) {
    // Tentar extrair nome do responsável
    const namePatterns = [
      /(?:fala com|liga pra|liga para|procura|chama)\s+(?:o\s+|a\s+)?([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)?)/i,
      /(?:responsável|dono|gestor|gerente|diretor|sócio|patrão)\s+(?:é\s+)?(?:o\s+|a\s+)?([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)?)/i,
      /(?:contato do|contato da|número do|numero do|zap do|whats do)\s+([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+)?)/i,
    ];
    
    let referralName: string | null = null;
    for (const pattern of namePatterns) {
      const nameMatch = originalContent.match(pattern);
      if (nameMatch && nameMatch[1] && nameMatch[1].length >= 2 && nameMatch[1].length <= 30) {
        // Capitalizar primeira letra
        referralName = nameMatch[1].split(' ').map((w: string) => 
          w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
        ).join(' ');
        break;
      }
    }
    
    console.log(`[Nina][ReferralDetection] ✅ Referral contact detected!`);
    console.log(`[Nina][ReferralDetection]   Phone: ${phoneMatch}`);
    console.log(`[Nina][ReferralDetection]   Keyword: "${matchedKeyword}"`);
    console.log(`[Nina][ReferralDetection]   Referral Name: ${referralName || 'not extracted'}`);
    
    return {
      hasReferralContact: true,
      phoneNumber: phoneMatch,
      referralName,
      matchedKeyword
    };
  }
  
  return { hasReferralContact: false, phoneNumber: null, referralName: null, matchedKeyword: null };
}
// ===== END REFERRAL CONTACT DETECTION =====

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[Nina] Starting orchestration...');

    // Claim batch of messages to process
    const { data: queueItems, error: claimError } = await supabase
      .rpc('claim_nina_processing_batch', { p_limit: 10 });

    if (claimError) {
      console.error('[Nina] Error claiming batch:', claimError);
      throw claimError;
    }

    if (!queueItems || queueItems.length === 0) {
      console.log('[Nina] No messages to process');
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[Nina] Processing ${queueItems.length} messages`);

    // Get Nina settings with retry logic for transient failures
    let settings = null;
    let settingsRetry = 0;
    const MAX_SETTINGS_RETRIES = 3;

    while (!settings && settingsRetry < MAX_SETTINGS_RETRIES) {
      const { data, error: settingsError } = await supabase
        .from('nina_settings')
        .select('*')
        .maybeSingle();
      
      if (data) {
        settings = data;
        break;
      }
      
      settingsRetry++;
      if (settingsRetry < MAX_SETTINGS_RETRIES) {
        console.log(`[Nina] ⚠️ Settings não encontrado, tentativa ${settingsRetry}/${MAX_SETTINGS_RETRIES}, aguardando...`);
        if (settingsError) {
          console.error(`[Nina] Settings error:`, settingsError);
        }
        await new Promise(r => setTimeout(r, 1000 * settingsRetry)); // 1s, 2s backoff
      }
    }

    if (!settings) {
      console.error('[Nina] Sistema não configurado após múltiplas tentativas');
      
      // Implementar reagendamento automático para falhas transitórias
      for (const item of queueItems) {
        const newRetryCount = ((item as any).retry_count || 0) + 1;
        
        if (newRetryCount < 3) {
          // Reagendar para 5 minutos no futuro
          console.log(`[Nina] Reagendando item ${item.id} (tentativa ${newRetryCount}/3)`);
          await supabase
            .from('nina_processing_queue')
            .update({ 
              status: 'pending',
              retry_count: newRetryCount,
              scheduled_for: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
              error_message: `Falha transitória de settings - reagendado (tentativa ${newRetryCount})`
            })
            .eq('id', item.id);
        } else {
          // Após 3 tentativas, marcar como failed definitivo
          console.error(`[Nina] Item ${item.id} falhou após ${newRetryCount} tentativas`);
          await supabase
            .from('nina_processing_queue')
            .update({ 
              status: 'failed', 
              processed_at: new Date().toISOString(),
              error_message: 'Sistema não configurado após 3 tentativas - acesse /settings para configurar'
            })
            .eq('id', item.id);
        }
      }
      
      return new Response(JSON.stringify({ 
        processed: 0, 
        reason: 'system_not_configured',
        message: 'Acesse /settings para configurar o sistema',
        rescheduled: queueItems.filter((item: any) => ((item as any).retry_count || 0) + 1 < 3).length
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Check if Nina is active
    if (!settings.is_active) {
      console.log('[Nina] Nina is disabled, skipping all messages');
      for (const item of queueItems) {
        await supabase
          .from('nina_processing_queue')
          .update({ 
            status: 'completed', 
            processed_at: new Date().toISOString(),
            error_message: 'Nina disabled - message not processed'
          })
          .eq('id', item.id);
      }
      return new Response(JSON.stringify({ processed: 0, reason: 'nina_disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Load all active agents
    const { data: agents } = await supabase
      .from('agents')
      .select('*')
      .eq('is_active', true);

    const activeAgents = (agents || []) as Agent[];
    const defaultAgent = activeAgents.find(a => a.is_default);
    
    console.log(`[Nina] Loaded ${activeAgents.length} active agents`);

    let processed = 0;

    for (const item of queueItems) {
      try {
        // 🔒 RACE CONDITION FIX: Verificar se item ainda está pendente de processamento
        // (pode ter sido agregado por outro item na mesma iteração)
        const { data: currentItem } = await supabase
          .from('nina_processing_queue')
          .select('status, error_message')
          .eq('id', item.id)
          .single();
        
        // Se já foi agregado ou processado, pular
        if (currentItem?.status === 'completed' || 
            currentItem?.error_message === 'Aggregated with other messages') {
          console.log(`[Nina] ⏭️ Item ${item.id} já foi agregado, pulando...`);
          continue;
        }
        
        await processQueueItem(supabase, lovableApiKey, item, settings, activeAgents, defaultAgent);
        
        // Mark as completed
        await supabase
          .from('nina_processing_queue')
          .update({ 
            status: 'completed', 
            processed_at: new Date().toISOString() 
          })
          .eq('id', item.id);
        
        processed++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Nina] Error processing item ${item.id}:`, error);
        
        // Mark as failed with retry
        const newRetryCount = (item.retry_count || 0) + 1;
        const shouldRetry = newRetryCount < 3;
        
        await supabase
          .from('nina_processing_queue')
          .update({ 
            status: shouldRetry ? 'pending' : 'failed',
            retry_count: newRetryCount,
            error_message: errorMessage,
            scheduled_for: shouldRetry 
              ? new Date(Date.now() + newRetryCount * 30000).toISOString() 
              : null
          })
          .eq('id', item.id);
      }
    }

    console.log(`[Nina] Processed ${processed}/${queueItems.length} messages`);

    return new Response(JSON.stringify({ processed, total: queueItems.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Nina] Orchestrator error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Determine which agent should handle the conversation
function detectAgent(
  messageContent: string, 
  conversation: any, 
  agents: Agent[], 
  defaultAgent: Agent | undefined
): { agent: Agent | null; isHandoff: boolean } {
  const content = messageContent.toLowerCase();
  
  console.log('[Nina][Routing] ========== INÍCIO ROTEAMENTO DE AGENTE ==========');
  console.log('[Nina][Routing] Mensagem analisada:', content.substring(0, 100) + (content.length > 100 ? '...' : ''));
  console.log('[Nina][Routing] Conversation ID:', conversation.id);
  console.log('[Nina][Routing] Agente atual ID:', conversation.current_agent_id || 'nenhum');
  console.log('[Nina][Routing] Total de agentes ativos:', agents.length);
  console.log('[Nina][Routing] Agentes disponíveis:', agents.map(a => `${a.name} (${a.slug})`).join(', '));
  
  // PRIORIDADE 1: Se conversa é de prospecção ativa, usar Atlas
  const conversationMetadata = conversation.metadata || {};
  console.log('[Nina][Routing] Metadata da conversa:', JSON.stringify(conversationMetadata));
  
  if (conversationMetadata.origin === 'prospeccao') {
    console.log('[Nina][Routing] 🎯 Conversa de PROSPECÇÃO detectada!');
    const atlasAgent = agents.find(a => a.slug === 'atlas');
    if (atlasAgent) {
      console.log('[Nina][Routing] → Roteando para Atlas (agente de prospecção)');
      console.log('[Nina][Routing] ========== FIM ROTEAMENTO ==========');
      return { agent: atlasAgent, isHandoff: false };
    } else {
      console.log('[Nina][Routing] ⚠️ Atlas não encontrado, continuando verificação...');
    }
  }
  
  // PRIORIDADE 2: Verificar keywords para permitir handoffs pós-triagem
  console.log('[Nina][Routing] --- Checando keywords dos agentes especializados ---');
  
  for (const agent of agents) {
    if (agent.is_default) {
      console.log(`[Nina][Routing] ⏭️ Pulando agente default: ${agent.name}`);
      continue;
    }
    
    const agentKeywords = agent.detection_keywords || [];
    console.log(`[Nina][Routing] Testando agente: ${agent.name} (${agent.slug})`);
    console.log(`[Nina][Routing] Keywords configuradas (${agentKeywords.length} total): [${agentKeywords.slice(0, 5).join(', ')}${agentKeywords.length > 5 ? '...' : ''}]`);
    
    const matchedKeyword = agentKeywords.find(keyword => 
      content.includes(keyword.toLowerCase())
    );
    
    if (matchedKeyword) {
      console.log(`[Nina][Routing] ✅ MATCH! Keyword encontrada: "${matchedKeyword}"`);
      console.log(`[Nina][Routing] Agente selecionado: ${agent.name} (${agent.slug})`);
      const isNewHandoff = conversation.current_agent_id !== agent.id;
      console.log(`[Nina][Routing] É handoff novo?: ${isNewHandoff}`);
      console.log('[Nina][Routing] ========== FIM ROTEAMENTO ==========');
      return { agent, isHandoff: isNewHandoff };
    } else {
      console.log(`[Nina][Routing] ❌ Nenhuma keyword de ${agent.name} encontrada`);
    }
  }
  
  console.log('[Nina][Routing] --- Nenhum match de keyword encontrado ---');
  
  // Se não houver match de keyword, continuar com agente atual
  if (conversation.current_agent_id) {
    const currentAgent = agents.find(a => a.id === conversation.current_agent_id);
    if (currentAgent) {
      console.log(`[Nina][Routing] 🔄 Continuando com agente já atribuído: ${currentAgent.name} (${currentAgent.slug})`);
      console.log('[Nina][Routing] ========== FIM ROTEAMENTO ==========');
      return { agent: currentAgent, isHandoff: false };
    } else {
      console.log(`[Nina][Routing] ⚠️ Agente atual ${conversation.current_agent_id} não encontrado na lista ativa`);
    }
  }
  
  // Return default agent
  console.log(`[Nina][Routing] 📌 Usando agente DEFAULT: ${defaultAgent?.name || 'NENHUM'} (${defaultAgent?.slug || 'n/a'})`);
  console.log('[Nina][Routing] ========== FIM ROTEAMENTO ==========');
  return { agent: defaultAgent || null, isHandoff: false };
}

// ===== NOT RESPONSIBLE DETECTION =====
// Detects when the agent asked if the contact is the responsible person and they said "no"
function detectNotResponsible(lastAgentMessage: string | null, leadMessage: string): boolean {
  if (!lastAgentMessage || !leadMessage) return false;
  
  const normalizedAgent = lastAgentMessage.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const normalizedLead = leadMessage.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  
  // Check if agent asked about being the responsible person
  const agentAskedAboutResponsible = /responsavel|responsável/i.test(lastAgentMessage) ||
    /confirmar se/i.test(lastAgentMessage) ||
    /seria o responsavel|seria o responsável/i.test(lastAgentMessage) ||
    /voce.*responsavel|você.*responsável/i.test(lastAgentMessage) ||
    /e o responsavel|é o responsável/i.test(lastAgentMessage);
  
  if (!agentAskedAboutResponsible) return false;
  
  // Check if lead response is negative
  const negativePatterns = [
    /^n[aã]o\.?$/i,                          // just "nao" or "não"
    /^n[aã]o\s*,?\s*n[aã]o/i,               // "nao nao" or "não, não"
    /^n[aã]o\s+(sou|e|é)\b/i,               // "nao sou", "nao e"
    /^n[aã]o\s*,?\s*(sou|e|é)\b/i,          // "nao, sou", "nao, e"
    /n[aã]o\s+(sou|é|e)\s*(o\s+)?respons/i, // "nao sou o responsavel"
    /n[aã]o\s+e\s+comigo/i,                  // "nao e comigo"
    /n[aã]o\s+tenho\s+nada\s+a\s+ver/i,     // "nao tenho nada a ver"
    /^nn$/i,                                  // "nn" (shorthand)
    /^nop$/i,                                 // "nop"
  ];
  
  return negativePatterns.some(pattern => pattern.test(normalizedLead));
}

// Check if message is a prospecting rejection (hard rejection - wrong number, no interest, etc.)
function isProspectingRejection(messageContent: string): boolean {
  const content = messageContent.toLowerCase().trim();
  
  // First check if it's a soft rejection - those should be handled differently
  if (isSoftRejection(content)) {
    return false;
  }
  
  const rejectionPhrases = [
    'não sou da empresa', 'nao sou da empresa',
    'não trabalho', 'nao trabalho',
    'número errado', 'numero errado',
    'não é comigo', 'nao e comigo',
    'não tenho interesse', 'nao tenho interesse',
    'não quero', 'nao quero',
    'sem interesse',
    'errou o número', 'errou o numero',
    'ligou errado',
    'não conheço', 'nao conheco',
    'empresa errada',
    'pare de', 'para de',
    'não me ligue', 'nao me ligue',
    'não mande', 'nao mande',
    'remove', 'remova',
    // Novas frases de rejeição
    'esse número não é', 'esse numero nao e',
    'não é da empresa', 'nao e da empresa',
    'esse telefone não é', 'esse telefone nao e',
    'engano',
    'número particular', 'numero particular',
    'celular pessoal', 'meu pessoal',
    'não é comercial', 'nao e comercial',
    'pessoal esse número', 'pessoal esse numero',
    // Recusas agressivas
    'sai fora', 'me deixa', 'para com isso',
    'perturbando', 'encher o saco', 'chato',
    // Contexto transportadora
    'não sou transportadora', 'nao sou transportadora',
    'não tenho caminhão', 'nao tenho caminhao',
    'não faço transporte', 'nao faco transporte',
    'vendi a empresa', 'fechou a empresa', 'empresa fechada',
    // Pedidos para parar
    'não me mande mais', 'nao me mande mais',
    'não envie mais', 'nao envie mais',
    'bloquear', 'denunciar', 'spam',
    // Número/contato incorreto
    'não é aqui', 'nao e aqui',
    'mandou errado', 'trocou de número', 'trocou de numero',
    'esse whatsapp não é', 'esse whatsapp nao e',
    'esse zap não é', 'esse zap nao e',
    'não sou eu', 'nao sou eu',
    'sou outra pessoa', 'não é meu', 'nao e meu',
    'número antigo', 'numero antigo', 'mudou de dono',
    // *** NOVAS: Identidade errada / não é este contato ***
    'não é este contato', 'nao e este contato',
    'não sou este contato', 'nao sou este contato',
    'não sou essa pessoa', 'nao sou essa pessoa',
    'pessoa errada', 'contato errado',
    'você ligou para pessoa errada', 'voce ligou para pessoa errada',
    'você mandou para pessoa errada', 'voce mandou para pessoa errada',
    // Padrão "já disse que não sou"
    'já disse que não sou', 'ja disse que nao sou',
    'já comuniquei que não sou', 'ja comuniquei que nao sou',
    'já falei que não sou', 'ja falei que nao sou',
    'já te disse que não', 'ja te disse que nao',
    'está insistindo', 'esta insistindo',
    'insistindo em falar', 'insistindo em ligar'
  ];
  
  // Detectar padrão "não sou [nome]" via regex
  const notMePatterns = [
    /n[aã]o\s+sou\s+(?:o\s+|a\s+)?[a-záéíóúâêîôûãõç]+/i,  // "não sou Leonardo", "não sou o João"
    /j[aá]\s+(?:lhe\s+)?(?:disse|falei|comuniquei)\s+que\s+n[aã]o\s+sou/i,  // "já disse que não sou"
    /n[aã]o\s+[eé]\s+(?:esse?|esta?)\s+(?:contato|pessoa|n[uú]mero)/i,  // "não é este contato"
    /(?:esse?|esta?)\s+(?:n[uú]mero|whatsapp|zap)\s+n[aã]o\s+[eé]/i,  // "esse número não é"
  ];
  
  if (notMePatterns.some(pattern => pattern.test(content))) {
    return true;
  }
  
  return rejectionPhrases.some(phrase => content.includes(phrase));
}

// Check if message is a soft rejection (has broker, satisfied, not now - can nurture later)
function isSoftRejection(messageContent: string): boolean {
  const content = typeof messageContent === 'string' ? messageContent.toLowerCase().trim() : '';
  const softRejectionPhrases = [
    'já tenho corretor', 'ja tenho corretor',
    'tenho meu corretor', 'tenho corretor',
    'meu corretor', 'corretor de confiança', 'corretor de confianca',
    'já tenho seguro', 'ja tenho seguro',
    'estou satisfeito', 'satisfeito com',
    'não preciso agora', 'nao preciso agora',
    'no momento não', 'no momento nao',
    'por enquanto não', 'por enquanto nao',
    'já tenho', 'ja tenho',
    'estou bem servido', 'bem atendido',
    'renova automático', 'renova automatico',
    'renovação automática', 'renovacao automatica',
    'não é o momento', 'nao e o momento',
    'talvez depois', 'talvez mais tarde',
    'agora não dá', 'agora nao da',
    'outro momento', 'mais pra frente'
  ];
  
  return softRejectionPhrases.some(phrase => content.includes(phrase));
}

// Patterns that indicate the AGENT closed the conversation (farewell messages)
const AGENT_CLOSURE_PATTERNS = [
  /tenha.*(um|ótimo|bom).*(dia|tarde|noite)/i,
  /qualquer.*(dúvida|pergunta|coisa).*(procure|contate|fale|estamos|aqui)/i,
  /se.*(precisar|quiser).*(voltar|retornar|falar)/i,
  /obrigad.*pelo.*(contato|interesse|retorno)/i,
  /boa.*sorte/i,
  /desculpe.*contato/i,
  /agradeço.*atenção/i,
  /fico.*à.*disposição/i,
  /estamos.*à.*disposição/i,
  /conte.*conosco/i,
  /até.*próxima/i,
  // Handoff patterns - quando transfere para equipe humana
  /vou\s*(passar|encaminhar).*dados.*equipe/i,
  /breve.*entrar.*(em)?\s*contato/i,
  /encaminh.*(para|pra).*(corretor|equipe|especialista)/i,
  /passando.*informações.*para/i,
  /nosso.*especialista.*entrar.*contato/i,
  /equipe.*comercial.*entrar.*contato/i,
  /aguarde.*retorno/i,
];

// Patterns for minimalist client responses confirming closure
const CLIENT_CLOSURE_PATTERNS = [
  /^(ok|ok\.|okay|certo|blz|vlw|valeu|obrigad)\.?$/i,
  /^(entendi|beleza|tá\s*bom|ta\s*bom|combinado)\.?$/i,
  /^(pode\s*ser|tranquilo|de\s*boa|suave)\.?$/i,
  /^(brigad|obg|grato|grata)\.?$/i,
  /^👍$/,
  // Variações de agradecimento abreviado
  /^(obgda|obgd|obgg|obgdo|obga)\.?$/i,
  /^(entendido|anotado|perfeito|show)\.?$/i,
  // Reações do WhatsApp são confirmações implícitas
  /^\[reaction\].*$/i,
  /^👌|👍|✅|🙏|💪$/,
];

// Detect if conversation should be closed based on agent's last message and client's response
function detectConversationClosure(
  agentLastMessage: string | null, 
  clientMessage: string
): { isClosed: boolean; reason: string } {
  if (!agentLastMessage || !clientMessage) {
    return { isClosed: false, reason: '' };
  }
  
  // Check if agent sent a closure message
  const agentClosed = AGENT_CLOSURE_PATTERNS.some(p => p.test(agentLastMessage));
  
  // Check if client confirmed with a short acknowledgment
  const clientConfirmed = CLIENT_CLOSURE_PATTERNS.some(p => p.test(clientMessage.trim()));
  
  if (agentClosed && clientConfirmed) {
    return { isClosed: true, reason: 'Lead desqualificado/encerrado pelo agente' };
  }
  
  return { isClosed: false, reason: '' };
}

// ===== CALLBACK DETECTION PATTERNS =====
interface CallbackIntent {
  hasIntent: boolean;
  suggestedDate?: Date;
  suggestedTime?: string;
  rawText?: string;
}

function detectCallbackIntent(messageContent: string): CallbackIntent {
  const content = messageContent.toLowerCase().trim();
  
  console.log(`[Callback Detection] 🔍 Analisando mensagem: "${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"`);
  
  // Patterns that indicate the lead wants to be called back later
  const callbackPhrases = [
    // Time-based
    'falar depois', 'fala depois', 'ligar depois', 'liga depois',
    'retornar depois', 'retorna depois', 'me liga mais tarde',
    'outra hora', 'outro horário', 'outro horario', 'outro momento',
    // Day-based
    'segunda', 'terça', 'terca', 'quarta', 'quinta', 'sexta', 'sábado', 'sabado', 'domingo',
    'amanhã', 'amanha', 'depois de amanhã', 'depois de amanha',
    'semana que vem', 'próxima semana', 'proxima semana',
    // Busy signals
    'agora não posso', 'agora nao posso', 'agora não dá', 'agora nao da',
    'ocupado', 'ocupada', 'em reunião', 'em reuniao', 'dirigindo',
    'trabalhando', 'no trabalho', 'no serviço', 'no servico',
    'estou na rua', 'estou no carro', 'estou no caminhão', 'estou no caminhao',
    'estou viajando', 'to na estrada', 'na estrada',
    // Commercial hours
    'horário comercial', 'horario comercial', 'no comercial',
    'das 8', 'das 9', 'das 10', 'depois das', 'antes das',
    'após o almoço', 'apos o almoco', 'depois do almoço', 'depois do almoco',
    // Explicit requests
    'pode me ligar', 'podem me ligar', 'liga pra mim',
    'me retorna', 'me retorne', 'retorne minha ligação', 'retorne minha ligacao',
    'vamos conversar', 'podemos conversar', 'quer conversar'
  ];
  
  const hasIntent = callbackPhrases.some(phrase => content.includes(phrase));
  
  if (!hasIntent) {
    console.log(`[Callback Detection] ❌ Nenhum intent de callback detectado`);
    return { hasIntent: false };
  }
  
  console.log(`[Callback Detection] ✅ Intent de callback detectado!`);
  
  let suggestedDate: Date | undefined;
  let suggestedTime: string | undefined;
  
  // Try to extract specific time
  const timeMatch = content.match(/(\d{1,2})[:\s]?(?:h(?:oras?)?|:(\d{2}))/i);
  if (timeMatch) {
    const hour = parseInt(timeMatch[1]);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
    if (hour >= 7 && hour <= 19) {
      suggestedTime = `${hour.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }
  }
  
  // Try to extract specific day - use Brazil timezone (UTC-3)
  const now = getNowInBrazil();
  const daysOfWeek: Record<string, number> = {
    'domingo': 0, 'segunda': 1, 'terça': 2, 'terca': 2, 
    'quarta': 3, 'quinta': 4, 'sexta': 5, 'sábado': 6, 'sabado': 6
  };
  
  for (const [day, num] of Object.entries(daysOfWeek)) {
    if (content.includes(day)) {
      const date = new Date(now);
      const currentDay = date.getDay();
      let daysToAdd = num - currentDay;
      if (daysToAdd <= 0) daysToAdd += 7; // Next week
      date.setDate(date.getDate() + daysToAdd);
      suggestedDate = date;
      break;
    }
  }
  
  // Tomorrow
  if (content.includes('amanhã') || content.includes('amanha')) {
    suggestedDate = new Date(now);
    suggestedDate.setDate(suggestedDate.getDate() + 1);
    console.log(`[Callback Detection] 📅 Detectado "amanhã":`);
    console.log(`[Callback Detection]   - Hoje (Brasília): ${now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })} ${now.toLocaleTimeString('pt-BR')}`);
    console.log(`[Callback Detection]   - Amanhã calculado: ${suggestedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}`);
  }
  
  // Next week
  if (content.includes('semana que vem') || content.includes('próxima semana') || content.includes('proxima semana')) {
    suggestedDate = new Date(now);
    suggestedDate.setDate(suggestedDate.getDate() + 7);
  }
  
  console.log(`[Callback Detection] 📋 Resultado final:`);
  console.log(`[Callback Detection]   - hasIntent: ${true}`);
  console.log(`[Callback Detection]   - suggestedDate: ${suggestedDate?.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }) || 'não especificado'}`);
  console.log(`[Callback Detection]   - suggestedTime: ${suggestedTime || 'não especificado'}`);
  
  return {
    hasIntent: true,
    suggestedDate,
    suggestedTime,
    rawText: content
  };
}

// Get current time in Brazil timezone (UTC-3)
function getNowInBrazil(): Date {
  const utcNow = new Date();
  // Convert to Brazil time string and parse back to get correct local values
  const brazilTime = utcNow.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
  const brazilDate = new Date(brazilTime);
  
  console.log(`[Timezone Debug] 🌍 UTC: ${utcNow.toISOString()} | Brasília: ${brazilDate.toLocaleString('pt-BR')} (dia: ${brazilDate.toLocaleDateString('pt-BR', { weekday: 'long' })})`);
  
  return brazilDate;
}

// Calculate next business hour for callback scheduling
function calculateNextBusinessHour(suggestedDate?: Date, suggestedTime?: string): Date {
  console.log(`[Business Hour Calc] ⏰ Calculando próximo horário comercial...`);
  
  const now = getNowInBrazil();
  let targetDate = suggestedDate ? new Date(suggestedDate) : new Date(now);
  
  console.log(`[Business Hour Calc]   - Now (Brasília): ${now.toLocaleString('pt-BR')} (${now.toLocaleDateString('pt-BR', { weekday: 'long' })})`);
  console.log(`[Business Hour Calc]   - Suggested date input: ${suggestedDate?.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }) || 'não especificado'}`);
  console.log(`[Business Hour Calc]   - Suggested time input: ${suggestedTime || 'não especificado'}`);
  
  // Set the time
  if (suggestedTime) {
    const [hours, minutes] = suggestedTime.split(':').map(Number);
    targetDate.setHours(hours, minutes, 0, 0);
  } else {
    // Default to next available business hour
    const currentHour = now.getHours();
    
    if (targetDate.toDateString() === now.toDateString()) {
      // Same day - find next available hour
      if (currentHour < 9) {
        targetDate.setHours(9, 0, 0, 0);
      } else if (currentHour < 14) {
        targetDate.setHours(14, 0, 0, 0); // After lunch
      } else if (currentHour < 17) {
        targetDate.setHours(currentHour + 1, 0, 0, 0);
      } else {
        // Next business day
        targetDate.setDate(targetDate.getDate() + 1);
        targetDate.setHours(9, 0, 0, 0);
      }
    } else {
      targetDate.setHours(9, 0, 0, 0); // 9 AM on suggested day
    }
  }
  
  // Skip weekends
  const originalDay = targetDate.getDay();
  while (targetDate.getDay() === 0 || targetDate.getDay() === 6) {
    const skippedDay = targetDate.toLocaleDateString('pt-BR', { weekday: 'long' });
    targetDate.setDate(targetDate.getDate() + 1);
    targetDate.setHours(9, 0, 0, 0);
    console.log(`[Business Hour Calc]   - ⏭️ Pulando fim de semana: ${skippedDay} → próximo dia`);
  }
  
  // Ensure it's in the future
  if (targetDate <= now) {
    console.log(`[Business Hour Calc]   - ⚠️ Data no passado, ajustando para +30min`);
    targetDate = new Date(now);
    targetDate.setMinutes(targetDate.getMinutes() + 30);
  }
  
  console.log(`[Business Hour Calc] ✅ Resultado final: ${targetDate.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })} às ${targetDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
  console.log(`[Business Hour Calc]   - ISO (para DB): ${targetDate.toISOString()}`);
  
  return targetDate;
}

// Get next assignee using weighted round-robin
async function getNextAssignee(
  supabase: any, 
  pipelineId: string
): Promise<{ id: string; name: string; email: string } | null> {
  try {
    // 1. Find team for this pipeline
    const { data: team } = await supabase
      .from('teams')
      .select('id')
      .eq('pipeline_id', pipelineId)
      .eq('is_active', true)
      .maybeSingle();
    
    if (!team) {
      console.log('[Callback] No team found for pipeline, will not assign');
      return null;
    }
    
    // 2. Get active team members with weight
    const { data: members } = await supabase
      .from('team_members')
      .select('id, name, email, weight')
      .eq('team_id', team.id)
      .eq('status', 'active')
      .order('weight', { ascending: false });
    
    if (!members || members.length === 0) {
      console.log('[Callback] No active team members found');
      return null;
    }
    
    // 3. Get last assignment for this pipeline
    const { data: lastAssignment } = await supabase
      .from('callback_assignments')
      .select('last_assigned_member_id, assignment_count')
      .eq('pipeline_id', pipelineId)
      .maybeSingle();
    
    // 4. Round-robin: find next member
    let nextMember: typeof members[0];
    
    if (!lastAssignment?.last_assigned_member_id) {
      // First assignment - pick first (highest weight)
      nextMember = members[0];
    } else {
      // Find current member's index and go to next
      const lastIndex = members.findIndex((m: any) => m.id === lastAssignment.last_assigned_member_id);
      const nextIndex = (lastIndex + 1) % members.length;
      nextMember = members[nextIndex];
    }
    
    // 5. Update assignment tracking
    await supabase
      .from('callback_assignments')
      .upsert({
        pipeline_id: pipelineId,
        team_id: team.id,
        last_assigned_member_id: nextMember.id,
        assignment_count: (lastAssignment?.assignment_count || 0) + 1,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'team_id,pipeline_id'
      });
    
    console.log(`[Callback] 🔄 Assigned to: ${nextMember.name} (round-robin)`);
    
    return {
      id: nextMember.id,
      name: nextMember.name,
      email: nextMember.email
    };
  } catch (error) {
    console.error('[Callback] Error getting next assignee:', error);
    return null;
  }
}

// Create callback activity in deal
async function createCallbackActivity(
  supabase: any,
  contactId: string,
  pipelineId: string,
  scheduledAt: Date,
  messageContent: string,
  assignee: { id: string; name: string } | null
): Promise<boolean> {
  try {
    // Get deal for this contact
    const { data: deal } = await supabase
      .from('deals')
      .select('id, title, pipeline_id')
      .eq('contact_id', contactId)
      .eq('pipeline_id', pipelineId)
      .maybeSingle();
    
    if (!deal) {
      // Try any deal for this contact
      const { data: anyDeal } = await supabase
        .from('deals')
        .select('id, title, pipeline_id')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (!anyDeal) {
        console.log('[Callback] No deal found for contact');
        return false;
      }
    }
    
    const targetDeal = deal || null;
    if (!targetDeal) return false;
    
    // Create the callback activity
    const { error } = await supabase
      .from('deal_activities')
      .insert({
        deal_id: targetDeal.id,
        type: 'call',
        title: 'Retornar ligação (solicitado pelo lead)',
        description: `Lead pediu para retornar.\nMensagem: "${messageContent}"\nAgendado para: ${scheduledAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
        scheduled_at: scheduledAt.toISOString(),
        created_by: assignee?.id || null,
        is_completed: false
      });
    
    if (error) {
      console.error('[Callback] Error creating activity:', error);
      return false;
    }
    
    // Update deal owner if we have an assignee
    if (assignee) {
      await supabase
        .from('deals')
        .update({ owner_id: assignee.id })
        .eq('id', targetDeal.id);
    }
    
    console.log(`[Callback] ✅ Callback activity created for ${scheduledAt.toISOString()}`);
    return true;
  } catch (error) {
    console.error('[Callback] Error creating callback activity:', error);
    return false;
  }
}

// Parse renewal date from user message (e.g., "março", "15/03", "daqui 3 meses")
function parseRenewalDate(text: string): string | null {
  const content = text.toLowerCase().trim();
  
  // Month names in Portuguese
  const months: Record<string, number> = {
    'janeiro': 1, 'fevereiro': 2, 'março': 3, 'marco': 3,
    'abril': 4, 'maio': 5, 'junho': 6, 'julho': 7,
    'agosto': 8, 'setembro': 9, 'outubro': 10,
    'novembro': 11, 'dezembro': 12
  };
  
  // Try to match month name: "março", "em maio", "mês de junho"
  for (const [month, num] of Object.entries(months)) {
    if (content.includes(month)) {
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      // If month is in the past this year, assume next year
      const year = num >= currentMonth ? now.getFullYear() : now.getFullYear() + 1;
      return `${year}-${String(num).padStart(2, '0')}-15`;
    }
  }
  
  // Try to match date format: "15/03", "15/03/25", "15-03-2025"
  const dateRegex = /(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/;
  const match = content.match(dateRegex);
  if (match) {
    const [, day, month, year] = match;
    const now = new Date();
    let fullYear: string;
    if (year) {
      fullYear = year.length === 2 ? `20${year}` : year;
    } else {
      // No year specified - assume current year, or next year if date is in the past
      const monthNum = parseInt(month);
      const currentMonth = now.getMonth() + 1;
      fullYear = String(monthNum >= currentMonth ? now.getFullYear() : now.getFullYear() + 1);
    }
    return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  // Try to match relative: "daqui 3 meses", "em 2 meses", "próximo mês"
  const relativeRegex = /(\d+)\s*m[eê]s/;
  const relMatch = content.match(relativeRegex);
  if (relMatch) {
    const monthsAhead = parseInt(relMatch[1]);
    const date = new Date();
    date.setMonth(date.getMonth() + monthsAhead);
    return date.toISOString().split('T')[0];
  }
  
  // "próximo mês" / "mês que vem"
  if (content.includes('próximo mês') || content.includes('proximo mes') || content.includes('mês que vem') || content.includes('mes que vem')) {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    return date.toISOString().split('T')[0];
  }
  
  // "fim do ano" / "final do ano"
  if (content.includes('fim do ano') || content.includes('final do ano')) {
    const year = new Date().getFullYear();
    return `${year}-12-31`;
  }
  
  // "início do ano" / "começo do ano" (next year)
  if (content.includes('início do ano') || content.includes('inicio do ano') || content.includes('começo do ano') || content.includes('comeco do ano')) {
    const year = new Date().getFullYear() + 1;
    return `${year}-01-15`;
  }
  
  return null;
}

// Generate personalized renewal email using AI
async function generateRenewalEmail(
  lovableApiKey: string,
  contact: any,
  renewalDate: string
): Promise<{ subject: string; body_html: string } | null> {
  try {
    const contactName = normalizeContactName(contact?.call_name || contact?.name);
    const companyName = contact?.company || 'sua empresa';
    const formattedDate = new Date(renewalDate).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });

    const prompt = `Gere um email profissional de follow-up de renovação de seguro de cargas.

Dados do lead:
- Nome: ${contactName}
- Empresa: ${companyName}
- Data de renovação: ${formattedDate}

Contexto: O lead disse que já tem corretor, mas informou quando vence o seguro atual. Queremos oferecer uma cotação competitiva para renovação.

Tom: Profissional mas cordial, sem ser invasivo. Mencionar que é sem compromisso.

IMPORTANTE: 
- Não use markdown, apenas HTML simples
- Seja breve (máximo 3 parágrafos)
- Inclua CTA claro (responder email ou WhatsApp)

Responda APENAS no formato JSON (sem markdown code blocks):
{"subject": "assunto do email", "body_html": "<div>HTML do corpo do email</div>"}`;

    const response = await fetch(LOVABLE_AI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      console.error('[Nina] AI error generating email:', response.status);
      return getDefaultRenewalEmail(contactName, companyName, formattedDate);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error('[Nina] Empty AI response for email');
      return getDefaultRenewalEmail(contactName, companyName, formattedDate);
    }

    // Parse JSON response (handle markdown code blocks if present)
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    }

    const parsed = JSON.parse(jsonContent);
    console.log('[Nina] 📧 AI generated email content');

    return {
      subject: parsed.subject || `Renovação do seu seguro de cargas - ${formattedDate}`,
      body_html: parsed.body_html || parsed.body || getDefaultRenewalEmail(contactName, companyName, formattedDate).body_html
    };

  } catch (error) {
    console.error('[Nina] Error generating renewal email:', error);
    const contactName = contact?.name || 'Cliente';
    const companyName = contact?.company || 'sua empresa';
    const formattedDate = new Date(renewalDate).toLocaleDateString('pt-BR');
    return getDefaultRenewalEmail(contactName, companyName, formattedDate);
  }
}

// Default email template if AI fails
function getDefaultRenewalEmail(
  contactName: string,
  companyName: string,
  formattedDate: string
): { subject: string; body_html: string } {
  return {
    subject: `Renovação do seu seguro de cargas - ${formattedDate}`,
    body_html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">Olá ${contactName}!</h2>
        <p>Espero que esteja tudo bem com você e com a ${companyName}.</p>
        <p>Estamos entrando em contato porque você mencionou que seu seguro de cargas vence em <strong>${formattedDate}</strong>.</p>
        <p>Gostaríamos de apresentar uma cotação competitiva para a renovação. Trabalhamos com as melhores seguradoras do mercado e podemos oferecer condições diferenciadas.</p>
        <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0;"><strong>📞 WhatsApp:</strong> (43) 9143-4002</p>
          <p style="margin: 10px 0 0;"><strong>🌐 Site:</strong> jacometoseguros.com.br</p>
        </div>
        <p>Responda este email ou envie uma mensagem no WhatsApp - fazemos uma proposta sem compromisso!</p>
        <p style="margin-top: 30px;">Atenciosamente,<br><strong>Equipe Jacometo Seguros</strong></p>
      </div>
    `
  };
}

// Note: WhatsApp only supports audio/ogg; codecs=opus, audio/mpeg, audio/amr, audio/mp4, audio/aac
// WAV is NOT supported. We use MP3 directly from ElevenLabs.

// Helper function to get secret from Vault or fallback to table
async function getSecret(supabase: any, vaultName: string, tableValue: string | null): Promise<string | null> {
  // Try Vault first
  try {
    const { data: vaultSecret } = await supabase.rpc('get_vault_secret', { secret_name: vaultName });
    if (vaultSecret) {
      console.log(`[Nina] Using secret from Vault: ${vaultName}`);
      return vaultSecret;
    }
  } catch (e) {
    console.log(`[Nina] Vault lookup failed for ${vaultName}, using table fallback`);
  }
  
  // Fallback to table value
  return tableValue;
}

// Generate audio using ElevenLabs (outputs MP3 for WhatsApp compatibility)
async function generateAudioElevenLabs(supabase: any, settings: any, text: string, agent?: Agent | null): Promise<{ buffer: ArrayBuffer; format: 'mp3' } | null> {
  // Get API key from Vault or fallback to table
  const apiKey = await getSecret(supabase, 'vault_elevenlabs_key', settings.elevenlabs_api_key);
  
  if (!apiKey) {
    console.log('[Nina] ElevenLabs API key not configured');
    return null;
  }

  try {
    // Priority: agent config > global config > fallback defaults
    const voiceId = agent?.elevenlabs_voice_id || settings.elevenlabs_voice_id || '9BWtsMINqrJLrRacOk9x';
    const model = agent?.elevenlabs_model || settings.elevenlabs_model || 'eleven_turbo_v2_5';
    const stability = agent?.elevenlabs_stability ?? settings.elevenlabs_stability ?? 0.75;
    const similarityBoost = agent?.elevenlabs_similarity_boost ?? settings.elevenlabs_similarity_boost ?? 0.80;
    const style = agent?.elevenlabs_style ?? settings.elevenlabs_style ?? 0.30;
    const speed = agent?.elevenlabs_speed ?? settings.elevenlabs_speed ?? 1.0;
    const speakerBoost = agent?.elevenlabs_speaker_boost ?? settings.elevenlabs_speaker_boost ?? true;

    console.log(`[Nina] Generating audio (MP3) - voice: ${voiceId}, model: ${model}, agent: ${agent?.name || 'global'}`);

    // Request MP3 format (WhatsApp supports audio/mpeg)
    const response = await fetch(`${ELEVENLABS_API_URL}/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text,
        model_id: model,
        output_format: 'mp3_44100_128', // MP3 44.1kHz 128kbps
        voice_settings: {
          stability: stability,
          similarity_boost: similarityBoost,
          style: style,
          speed: speed,
          use_speaker_boost: speakerBoost
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Nina] ElevenLabs error:', response.status, errorText);
      return null;
    }

    const mp3Buffer = await response.arrayBuffer();
    console.log(`[Nina] 🎤 Received MP3 audio: ${mp3Buffer.byteLength} bytes`);
    
    return { buffer: mp3Buffer, format: 'mp3' };
  } catch (error) {
    console.error('[Nina] Error generating audio:', error);
    return null;
  }
}

// ===== QUALIFICATION COMPLETION CHECK FUNCTION =====
// Check if all essential qualification fields are collected
function isQualificationComplete(contact: any, qualificationAnswers: { [key: string]: string }): boolean {
  // Essential fields for Seguro de Cargas qualification
  const hasCnpj = !!contact?.cnpj;
  const hasTipoCarga = !!qualificationAnswers?.tipo_carga;
  const hasEstados = !!qualificationAnswers?.estados;
  const hasVolume = !!(qualificationAnswers?.viagens_mes || qualificationAnswers?.valor_medio);
  const hasTipoFrota = !!qualificationAnswers?.tipo_frota;
  
  const isComplete = hasCnpj && hasTipoCarga && hasEstados && hasVolume && hasTipoFrota;
  
  if (isComplete) {
    console.log(`[Nina] 📊 Qualification check: CNPJ=${hasCnpj}, TipoCarga=${hasTipoCarga}, Estados=${hasEstados}, Volume=${hasVolume}, TipoFrota=${hasTipoFrota} -> COMPLETE`);
  }
  
  return isComplete;
}

// ===== ATLAS VEHICLE QUALIFICATION HANDOFF CHECK =====
// Check if Atlas vehicle lead is ready for handoff (quantidade + tipo de veículo)
// UPDATED: Removida exigência de email - telefone já está garantido pelo WhatsApp
interface AtlasHandoffResult {
  readyForHandoff: boolean;
  missingField: string | null;
  qualificationData: { [key: string]: string };
  isSubcontratado?: boolean;
}

function detectAtlasVehicleHandoff(
  agent: Agent | null,
  contact: any,
  ninaContext: any
): AtlasHandoffResult {
  // Only applies to Atlas agent
  if (!agent || agent.slug !== 'atlas') {
    return { readyForHandoff: false, missingField: null, qualificationData: {} };
  }
  
  const qa = ninaContext?.qualification_answers || {};
  
  // ===== DETECT SUBCONTRATADO =====
  const isSubcontratado = 
    qa?.contratacao?.toLowerCase()?.includes('subcontratado') ||
    qa?.contratacao?.toLowerCase()?.includes('sub-contratado') ||
    qa?.contratacao?.toLowerCase()?.includes('agregado') ||
    qa?.contratacao?.toLowerCase()?.includes('terceirizado') ||
    qa?.cte?.toLowerCase()?.includes('não') ||
    qa?.cte?.toLowerCase()?.includes('nao');
  
  // Para SUBCONTRATADOS: NÃO oferece carga, apenas veículo
  if (isSubcontratado) {
    console.log('[Nina][Atlas] 🚛 SUBCONTRATADO DETECTADO - verificando requisitos de veículo');
    
    // Requisitos OBRIGATÓRIOS para subcontratado fazer handoff:
    // 1. Quantidade de veículos
    const hasQuantidade = !!(qa?.quantidade_veiculos || qa?.qtd_veiculos);
    // 2. Tipo de veículo
    const hasTipo = !!(qa?.tipo_veiculo || qa?.tipos_veiculos || qa?.modelo_veiculo);
    
    console.log(`[Nina][Atlas] Subcontratado - Quantidade: ${hasQuantidade ? '✓' : '✗'}, Tipo: ${hasTipo ? '✓' : '✗'}`);
    console.log(`[Nina][Atlas] QA data: quantidade=${qa?.quantidade_veiculos || qa?.qtd_veiculos || 'N/A'}, tipo=${qa?.tipo_veiculo || qa?.tipos_veiculos || 'N/A'}`);
    
    if (!hasQuantidade) {
      console.log('[Nina][Atlas] ⚠️ Subcontratado SEM quantidade de veículos - NÃO fazer handoff');
      return { 
        readyForHandoff: false, 
        missingField: 'quantidade_veiculos', 
        qualificationData: qa,
        isSubcontratado: true
      };
    }
    
    if (!hasTipo) {
      console.log('[Nina][Atlas] ⚠️ Subcontratado SEM tipo de veículo - NÃO fazer handoff');
      return { 
        readyForHandoff: false, 
        missingField: 'tipo_veiculo', 
        qualificationData: qa,
        isSubcontratado: true
      };
    }
    
    console.log('[Nina][Atlas] ✅ Subcontratado com quantidade + tipo de veículo - pronto para handoff!');
    return { readyForHandoff: true, missingField: null, qualificationData: qa, isSubcontratado: true };
  }
  
  // ===== LEAD NORMAL (não subcontratado) =====
  // Check if this is a vehicle lead (based on context/keywords)
  const isVehicleLead = 
    qa?.tipo_veiculo ||
    qa?.quantidade_veiculos ||
    qa?.modelo_veiculo ||
    ninaContext?.detected_vehicle_interest === true ||
    ninaContext?.vehicle_qualification_started === true;
  
  if (!isVehicleLead) {
    console.log('[Nina][Atlas] Not a vehicle lead, skipping handoff check');
    return { readyForHandoff: false, missingField: null, qualificationData: qa };
  }
  
  console.log('[Nina][Atlas] 🚗 Checking vehicle lead handoff requirements...');
  
  // Para leads de veículo, exigir apenas: quantidade + tipo
  const hasQuantidade = !!(qa?.quantidade_veiculos || qa?.qtd_veiculos);
  const hasTipo = !!(qa?.tipo_veiculo || qa?.tipos_veiculos || qa?.modelo_veiculo);
  
  console.log(`[Nina][Atlas] Vehicle Lead - Quantidade: ${hasQuantidade ? '✓' : '✗'}, Tipo: ${hasTipo ? '✓' : '✗'}`);
  console.log(`[Nina][Atlas] QA data: quantidade=${qa?.quantidade_veiculos || qa?.qtd_veiculos || 'N/A'}, tipo=${qa?.tipo_veiculo || qa?.tipos_veiculos || 'N/A'}`);
  
  if (!hasQuantidade) return { readyForHandoff: false, missingField: 'quantidade_veiculos', qualificationData: qa };
  if (!hasTipo) return { readyForHandoff: false, missingField: 'tipo_veiculo', qualificationData: qa };
  
  console.log('[Nina][Atlas] ✅ Vehicle lead com quantidade + tipo - pronto para handoff!');
  return { readyForHandoff: true, missingField: null, qualificationData: qa };
}

// ===== REAL-TIME QUALIFICATION EXTRACTION FUNCTION =====
// Extract qualification answers from user messages for immediate saving
// ENHANCED: Now includes contextual extraction based on agent questions
function extractQualificationFromMessages(
  userMessages: string[], 
  agentMessages?: string[]
): { [key: string]: string | null } {
  const extracted: { [key: string]: string | null } = {};
  const allText = userMessages.join(' ').toLowerCase();
  
  // Patterns for cargo qualification fields - ENHANCED with more variations
  const patterns: { [key: string]: RegExp } = {
    contratacao: /\b(direto|subcontratado|ambos|contratado direto|subcontrata|sub-contratado)\b/i,
    tipo_carga: /\b(alumínio|aluminio|ferro|grão|grãos|graos|grao|alimento|alimentos|químico|quimicos|químicos|madeira|cimento|frigorific|refrigerad|seca|geral|carga geral|paletizada|granel|container|containers|bebidas?|perecíveis|pereciveis|eletrônicos|eletronicos|máquinas|maquinas|equipamentos?|peças|pecas|peca|peça|autopeças|autopecas|pecas? automotivas?|componentes?|industriais?|combustível|combustivel|carne|carnes|leite|laticínios|laticinios|ração|racao|agrícola|agricola|soja|milho|trigo|fertilizante|defensivos?|insumos?|petróleo|petroleo|gás|gas|óleo|oleo|diesel|produto químico|produto quimico|material de construção|material de construcao|aço|aco|materia prima|matéria prima|bobinas?|chapas?|tubos?|perfis?|vergalhão|vergalhao|areia|brita|pedra|cascalho|terra|entulho|lixo|reciclável|reciclavel|sucata|embalagens?|papelão|papelao|plástico|plastico|têxtil|textil|tecido|roupa|vestuário|vestuario|móveis|moveis|eletrodomésticos|eletrodomesticos|medicamentos?|farmacêutico|farmaceutico|cosmético|cosmetico|calçado|calcado|sapato|couro)\b/i,
    tipo_frota: /\b(própria|propria|próprio|proprio|agregado|agregados|terceiro|terceiros|frota própria|frota propria|mista)\b/i,
    antt: /\b(regularizada|pessoa física|pessoa fisica|ativa|não tenho antt|nao tenho antt|em processo|sim tenho|tenho sim|antt ok|antt ativa|regular|em dia)\b/i,
    cte: /\b(sim|não|nao|emito|emite|vou começar|vou comecar|já emito|ja emito|emitimos|não emito|nao emito|emissão|emissao|em meu nome|no meu nome|cte proprio|cte próprio)\b/i,
  };
  
  // Patterns for vehicle/fleet qualification fields (Atlas agent)
  // UPDATED: Removed "empresa" from uso_veiculo - too generic and causes false positives
  const vehiclePatterns: { [key: string]: RegExp } = {
    tipo_veiculo: /\b(carro|carros|moto|motos|caminhão|caminhao|caminhões|caminhoes|van|vans|utilitário|utilitario|pickup|picape|sedan|suv|hatch|veículo|veiculo|veículos|veiculos|automóvel|automovel|automóveis|automoveis|carreta|carretas|truck|trucks|bitruck|cavalo mecânico|cavalo mecanico)\b/i,
    quantidade_veiculos: /\b(\d+)\s*(veículo|veiculo|carro|moto|caminhão|caminhao|caminhões|caminhoes|carreta|carretas|truck|unidade|automóvel|automovel)s?\b/i,
    uso_veiculo: /\b(particular|comercial|trabalho|táxi|taxi|uber|app|aplicativo|entrega|delivery|frota comercial|uso pessoal|passeio|lazer|frete|transporte)\b/i,
    ano_veiculo: /\b(20[0-2][0-9]|19[89][0-9])\b/,
    modelo_veiculo: /(civic|corolla|onix|hb20|gol|uno|argo|polo|creta|kicks|compass|renegade|hilux|s10|ranger|toro|strada|saveiro|fiat|volkswagen|chevrolet|ford|toyota|honda|hyundai|jeep|renault|nissan|mitsubishi|peugeot|citroen|scania|volvo|mercedes|man|iveco|daf)/i,
    cobertura_desejada: /\b(completo|completa|básico|basico|terceiros?|roubo|furto|colisão|colisao|incêndio|incendio|perda total|franquia|casco)\b/i,
  };
  
  // Apply vehicle patterns
  for (const [key, regex] of Object.entries(vehiclePatterns)) {
    const match = allText.match(regex);
    if (match) {
      extracted[key] = match[0];
    }
  }
  
  // Extract estados (can be multiple)
  const estadosRegex = /(SP|PR|MG|MT|MS|GO|RS|SC|RJ|BA|ES|DF|TO|PA|AM|CE|PE|MA|PI|RN|PB|AL|SE|RO|RR|AP|AC|São Paulo|Paraná|Minas|Mato Grosso|Goiás|Rio Grande|Santa Catarina|Rio de Janeiro|Bahia|Ceará|Pernambuco)/gi;
  const estadosMatches = allText.match(estadosRegex);
  if (estadosMatches && estadosMatches.length > 0) {
    extracted.estados = [...new Set(estadosMatches.map(s => s.toUpperCase()))].join(', ');
  }
  
  // Extract other fields
  for (const [field, regex] of Object.entries(patterns)) {
    const match = allText.match(regex);
    if (match) {
      extracted[field] = match[0];
    }
  }
  
  // Extract viagens/mes (numeric pattern) - ENHANCED
  const viagensPatterns = [
    /(\d+)\s*(?:viagens?|vezes?|por mês|ao mês|por mes|mensal|mensais)/i,
    /(?:faço|faco|realizo|faziamos|fazemos)\s*(?:em média|em media)?\s*(\d+)/i,
    /(?:média|media|em torno de)\s*(\d+)\s*(?:viagens?|vezes?)?/i
  ];
  
  for (const viagensRegex of viagensPatterns) {
    const viagensMatch = allText.match(viagensRegex);
    if (viagensMatch) {
      const num = viagensMatch[1] || viagensMatch[2];
      if (num) {
        extracted.viagens_mes = num;
        break;
      }
    }
  }
  
  // ===== ENHANCED VALUE EXTRACTION =====
  let valorMedio: string | null = null;
  let maiorValor: string | null = null;
  
  // ===== CONTEXTUAL EXTRACTION: Correlate questions with answers =====
  if (agentMessages && agentMessages.length > 0 && userMessages.length > 0) {
    // Build a timeline of alternating agent questions and user answers
    // Look for question-answer pairs more intelligently
    
    for (let i = 0; i < agentMessages.length; i++) {
      const question = (agentMessages[i] || '').toLowerCase();
      
      // Find user responses that came AFTER this question
      // In a typical conversation flow, user message i responds to agent message i
      const possibleAnswers = [
        userMessages[i]?.toLowerCase() || '',
        userMessages[i + 1]?.toLowerCase() || '' // Also check next message in case of split
      ].filter(Boolean);
      
      for (const answer of possibleAnswers) {
        // Check if agent asked about valor medio/average value
        const isValorMedioQuestion = /valor médio|valor medio|média por carga|media por carga|quanto vale|valor da carga|valor por viagem|média de valor|media de valor|valor em média|valor em media/i.test(question);
        if (isValorMedioQuestion && !valorMedio) {
          // Try to extract number from answer
          const numMatch = answer.match(/(\d+(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*(mil|reais)?/);
          if (numMatch) {
            valorMedio = numMatch[0].trim();
          } else {
            // Handle just numbers like "140"
            const simpleNum = answer.match(/^(\d{2,4})\s*$/);
            if (simpleNum) {
              // Check if answer says "mil" somewhere
              if (answer.includes('mil') || possibleAnswers.some(a => a.includes('mil'))) {
                valorMedio = `${simpleNum[1]} mil`;
              } else {
                valorMedio = `R$ ${simpleNum[1]}.000`; // Assume thousands
              }
            }
          }
        }
        
        // Check if agent asked about maior valor/highest value
        const isMaiorValorQuestion = /maior valor|maior carga|mais caro|mais alto|carga mais valiosa|maior operação|maior operacao|valor mais alto|carga de maior valor/i.test(question);
        if (isMaiorValorQuestion && !maiorValor) {
          const numMatch = answer.match(/(\d+(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*(mil|milhão|milhao|reais)?/);
          if (numMatch) {
            maiorValor = numMatch[0].trim();
          } else {
            const simpleNum = answer.match(/^(\d{2,4})\s*$/);
            if (simpleNum) {
              if (answer.includes('mil') || possibleAnswers.some(a => a.includes('mil'))) {
                maiorValor = `${simpleNum[1]} mil`;
              } else if (answer.includes('milh') || possibleAnswers.some(a => a.includes('milh'))) {
                maiorValor = `${simpleNum[1]} milhão`;
              } else {
                maiorValor = `R$ ${simpleNum[1]}.000`;
              }
            }
          }
        }
        
        // Check if agent asked about tipo de carga
        const isTipoCargaQuestion = /tipo de carga|que tipo|qual carga|transporta o que|transporta o quê|que produto|que mercadoria|o que você transporta|o que voce transporta/i.test(question);
        if (isTipoCargaQuestion && !extracted.tipo_carga) {
          const tipoCargaAnswer = answer.trim();
          if (tipoCargaAnswer.length > 2 && tipoCargaAnswer.length < 50) {
            // Extended list of cargo types
            const productWords = tipoCargaAnswer.match(/\b(peças?|pecas?|autopecas?|autopeças?|alumínio|aluminio|ferro|aço|aco|grão|grãos?|alimentos?|químicos?|quimicos?|madeira|cimento|bebidas?|eletrônicos?|eletronicos?|máquinas?|maquinas?|componentes?|industrial|industriais|carnes?|laticínios?|laticinios?|ração|racao|soja|milho|trigo|fertilizante|defensivo|insumo|petróleo|petroleo|gás|gas|óleo|oleo|diesel|produto|material|bobina|chapa|tubo|perfil|vergalhão|vergalhao|areia|brita|pedra|terra|embalagem|papelão|papelao|plástico|plastico|têxtil|textil|tecido|roupa|móveis|moveis|eletrodoméstico|medicamento|farmacêutico|cosmético|calçado|sapato|couro)\b/i);
            if (productWords) {
              extracted.tipo_carga = productWords[0];
            } else if (!/pergunt|respond|sim|não|nao|ok|entendi|certo|blz|beleza/.test(tipoCargaAnswer)) {
              // Use the answer if it doesn't look like a filler word
              extracted.tipo_carga = tipoCargaAnswer.split(/[.,!?]/)[0].trim();
            }
          }
        }
        
        // Check if agent asked about viagens/mes
        const isViagensMesQuestion = /quantas viagens|viagens por mês|viagens por mes|viagens ao mês|viagens ao mes|média de viagens|media de viagens|quantas vezes|frequência|frequencia/i.test(question);
        if (isViagensMesQuestion && !extracted.viagens_mes) {
          const numMatch = answer.match(/(\d+)\s*(viagens?|vezes?)?/);
          if (numMatch) {
            extracted.viagens_mes = numMatch[1];
          }
        }
      }
    }
  }
  
  // ===== HANDLE FRAGMENTED RESPONSES: "140" + "mil" in consecutive messages =====
  for (let i = 0; i < userMessages.length - 1; i++) {
    const current = (userMessages[i] || '').trim();
    const next = (userMessages[i + 1] || '').trim().toLowerCase();
    
    // Detect pattern: number + unit in next message
    const numMatch = current.match(/^(\d{2,4})$/);
    if (numMatch && next) {
      if (next === 'mil' || next.startsWith('mil ') || next.includes('mil reais')) {
        const value = `${numMatch[1]} mil`;
        // Assign to valor_medio or maior_valor based on which is missing
        if (!valorMedio) {
          valorMedio = value;
          console.log(`[Extraction] Detected fragmented valor: "${current}" + "${next}" = "${value}"`);
        } else if (!maiorValor) {
          maiorValor = value;
        }
      }
      if (next.includes('milh') || next === 'milhão' || next === 'milhao') {
        const value = `${numMatch[1]} milhão`;
        if (!maiorValor) {
          maiorValor = value;
        }
      }
    }
  }
  
  // Fallback: Try to extract values from all text if contextual failed
  if (!valorMedio) {
    const valorMatch = allText.match(/(?:R\$|reais)\s*(\d+(?:\.\d{3})*(?:,\d{2})?)|(\d+(?:\.\d{3})*(?:,\d{2})?)\s*(?:mil|reais)/gi);
    if (valorMatch && valorMatch.length > 0) {
      valorMedio = valorMatch[0];
    }
  }
  
  if (valorMedio) extracted.valor_medio = valorMedio;
  if (maiorValor) extracted.maior_valor = maiorValor;
  
  return extracted;
}

// ===== QUESTION TRACKING: Detect which questions the agent has already asked =====
function detectQuestionsAskedByAgent(agentMessages: string[]): Record<string, string> {
  const questionsAsked: Record<string, string> = {};
  
  const questionPatterns: Array<{ field: string; patterns: RegExp[] }> = [
    { 
      field: 'tipo_carga', 
      patterns: [
        /tipo de carga/i, /que transporta/i, /qual carga/i, /o que você transporta/i, 
        /o que voce transporta/i, /que produto/i, /que mercadoria/i, /tipo de produto/i
      ] 
    },
    { 
      field: 'valor_medio', 
      patterns: [
        /valor médio/i, /valor medio/i, /média por carga/i, /media por carga/i, 
        /quanto vale/i, /valor da carga/i, /valor por viagem/i, /valor em média/i
      ] 
    },
    { 
      field: 'maior_valor', 
      patterns: [
        /maior valor/i, /mais caro/i, /maior carga/i, /carga mais valiosa/i,
        /maior operação/i, /maior operacao/i, /valor mais alto/i
      ] 
    },
    { 
      field: 'viagens_mes', 
      patterns: [
        /viagens.*mês/i, /viagens.*mes/i, /quantas viagens/i, /média de viagens/i, 
        /media de viagens/i, /quantas vezes/i, /frequência/i
      ] 
    },
    { 
      field: 'estados', 
      patterns: [
        /quais estados/i, /que estados/i, /atende onde/i, /que regiões/i,
        /que regioes/i, /onde atua/i, /rotas/i
      ] 
    },
    { 
      field: 'cnpj', 
      patterns: [
        /qual.*cnpj/i, /seu cnpj/i, /me passa.*cnpj/i, /número do cnpj/i,
        /numero do cnpj/i, /cnpj da empresa/i
      ] 
    },
    { 
      field: 'tipo_frota', 
      patterns: [
        /frota própria/i, /frota propria/i, /agregados?.*terceiros?/i, 
        /terceirizada/i, /veículos próprios/i, /veiculos proprios/i
      ] 
    },
    { 
      field: 'antt', 
      patterns: [
        /antt.*regularizada/i, /rntrc/i, /antt em dia/i, /situação.*antt/i,
        /situacao.*antt/i, /antt.*ativa/i
      ] 
    },
    { 
      field: 'cte', 
      patterns: [
        /emite ct-e/i, /emite cte/i, /conhecimento de transporte/i, 
        /ct-e.*nome/i, /cte.*nome/i, /emissão de ct/i, /emissao de ct/i
      ] 
    },
    { 
      field: 'contratacao', 
      patterns: [
        /contratado direto/i, /subcontratado/i, /trabalha como/i,
        /tipo de contratação/i, /tipo de contratacao/i, /direto ou subcontratado/i
      ] 
    },
    {
      field: 'email',
      patterns: [
        /qual.*email/i, /seu email/i, /melhor email/i, /email para/i,
        /e-mail/i, /endereco de email/i, /endereço de email/i
      ]
    },
    // ===== NEW: Tracking questions about existing insurance =====
    {
      field: 'vencimento_seguro',
      patterns: [
        /quando vence/i, /data de vencimento/i, /vence quando/i,
        /apolice.*venc/i, /renovacao/i, /proximo vencimento/i,
        /vencimento do seguro/i, /data.*renovar/i, /quando renova/i
      ]
    },
    {
      field: 'satisfacao_seguradora',
      patterns: [
        /satisfeit/i, /atendimento/i, /gosta da seguradora/i,
        /esta content/i, /quer trocar/i, /satisfacao/i,
        /como é o atendimento/i, /como e o atendimento/i
      ]
    },
    {
      field: 'tem_seguro_veiculo',
      patterns: [
        /tem seguro.*veicul/i, /seguro.*frota.*hoje/i, /veiculos.*segurados/i,
        /ja tem seguro/i, /seguro dos veiculos/i, /tem seguro.*carro/i,
        /frota.*segurad/i, /veiculos.*cobert/i
      ]
    },
    {
      field: 'tem_seguro_carga',
      patterns: [
        /seguro de carga/i, /rctr-?c/i, /carga.*segurad/i,
        /quanto a carga/i, /seguro.*mercadoria/i, /tem seguro.*carga/i
      ]
    }
  ];
  
  for (const msg of agentMessages) {
    const lowerMsg = msg.toLowerCase();
    for (const q of questionPatterns) {
      if (!questionsAsked[q.field] && q.patterns.some(p => p.test(lowerMsg))) {
        questionsAsked[q.field] = new Date().toISOString();
      }
    }
  }
  
  return questionsAsked;
}

// ===== DETECT "ALREADY HAS INSURANCE" STATUS =====
interface InsuranceStatus {
  has_vehicle_insurance: boolean;
  has_cargo_insurance: boolean;
  is_satisfied: boolean | null;
  is_dissatisfied: boolean | null;
  renewal_date: string | null;
}

function detectExistingInsurance(userMessages: string[], agentMessages: string[]): InsuranceStatus {
  const allUserText = userMessages.join(' ').toLowerCase();
  
  const status: InsuranceStatus = {
    has_vehicle_insurance: false,
    has_cargo_insurance: false,
    is_satisfied: null,
    is_dissatisfied: null,
    renewal_date: null
  };
  
  // Patterns for "has vehicle insurance"
  const hasVehicleInsurancePatterns = [
    /ja temos?.*seguro/i, /tenho sim.*seguro/i, /temos sim.*seguro/i,
    /todos segurados/i, /todas as placas/i, /todos os veiculos/i,
    /frota segurada/i, /ja temos.*cobert/i, /tenho seguro/i,
    /temos seguro/i, /sim.*ja temos/i, /sim.*temos seguro/i,
    /sim.*ja tenho/i, /ja tenho.*seguro/i, /temos.*apolice/i
  ];
  
  // Patterns for "has cargo insurance"
  const hasCargoInsurancePatterns = [
    /rctr-?c.*sim/i, /sim.*rctr/i, /seguro de carga.*sim/i,
    /sim.*seguro de carga/i, /carga segurada/i, /ja temos.*carga/i,
    /temos seguro de carga/i, /temos rctr/i, /temos.*cobertura.*carga/i
  ];
  
  // Patterns for satisfaction/dissatisfaction
  const satisfiedPatterns = [
    /satisfeit/i, /content[ea]/i, /bem atendid/i, /gosto/i,
    /nao reclamo/i, /tranquilo/i, /ok com/i, /feliz com/i,
    /bom atendimento/i, /sem problemas/i, /tudo certo/i
  ];
  
  const dissatisfiedPatterns = [
    /insatisfeit/i, /caro demais/i, /ruim/i, /pessimo/i,
    /atendimento ruim/i, /demora/i, /nao gostei/i, /quero trocar/i,
    /nao ta bom/i, /nao está bom/i, /problema/i, /complicado/i,
    /dificil/i, /precario/i, /fraco/i, /deixa a desejar/i
  ];
  
  // Check patterns
  if (hasVehicleInsurancePatterns.some(p => p.test(allUserText))) {
    status.has_vehicle_insurance = true;
  }
  
  if (hasCargoInsurancePatterns.some(p => p.test(allUserText))) {
    status.has_cargo_insurance = true;
  }
  
  if (satisfiedPatterns.some(p => p.test(allUserText))) {
    status.is_satisfied = true;
  }
  
  if (dissatisfiedPatterns.some(p => p.test(allUserText))) {
    status.is_dissatisfied = true;
  }
  
  // Extract renewal date
  const vencimentoPatterns = [
    /vence.*(?:em|no|dia)?\s*(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)/i,
    /vencimento.*(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)/i,
    /renova.*(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)/i,
  ];
  
  for (const pattern of vencimentoPatterns) {
    const match = allUserText.match(pattern);
    if (match && match[1]) {
      status.renewal_date = match[1];
      break;
    }
  }
  
  // Also check for month names
  const monthPatterns = /(janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/i;
  const monthMatch = allUserText.match(monthPatterns);
  if (monthMatch && !status.renewal_date) {
    // Check for context like "vence em janeiro"
    const contextMatch = allUserText.match(new RegExp(`vence.*${monthMatch[1]}|${monthMatch[1]}.*vence|renova.*${monthMatch[1]}`, 'i'));
    if (contextMatch) {
      status.renewal_date = monthMatch[1];
    }
  }
  
  // Check for relative dates
  const relativeDatePatterns = [
    { pattern: /proximo mes|mes que vem/i, value: 'próximo mês' },
    { pattern: /daqui (\d+) meses?/i, value: 'em alguns meses' },
    { pattern: /fim do ano/i, value: 'fim do ano' },
    { pattern: /inicio do ano/i, value: 'início do ano' },
    { pattern: /final do ano/i, value: 'final do ano' },
    { pattern: /começo do ano/i, value: 'começo do ano' },
  ];
  
  for (const { pattern, value } of relativeDatePatterns) {
    if (pattern.test(allUserText) && !status.renewal_date) {
      status.renewal_date = value;
      break;
    }
  }
  
  return status;
}

// ===== AUTO-TAG FOR HEALTH PIPELINE =====
async function addHealthPlanTagIfClara(
  supabase: any,
  contactId: string,
  agentSlug: string | null,
  currentTags: string[] | null
): Promise<void> {
  // Only add tag for Clara agent (health insurance specialist)
  if (agentSlug !== 'clara') return;
  
  const healthTag = 'plano_de_saude';
  const tags = currentTags || [];
  
  // Skip if already has tag
  if (tags.includes(healthTag)) {
    console.log(`[Nina] 🏥 Contact already has ${healthTag} tag`);
    return;
  }
  
  // Add tag
  await supabase
    .from('contacts')
    .update({ tags: [...tags, healthTag] })
    .eq('id', contactId);
  
  console.log(`[Nina] 🏥 Added ${healthTag} tag for Clara/Health pipeline contact`);
}
// ===== END AUTO-TAG FOR HEALTH PIPELINE =====

// Sanitize text for TTS - simplify URLs for natural speech
function sanitizeTextForAudio(text: string): string {
  let sanitized = text;
  
  // Remove protocol (https://, http://)
  sanitized = sanitized.replace(/https?:\/\//g, '');
  
  // Simplify jacometoseguros.com.br paths to just the domain
  sanitized = sanitized.replace(/jacometoseguros\.com\.br\/[\w-]+/g, 'jacometoseguros.com.br');
  
  return sanitized;
}

// Upload audio to Supabase Storage (MP3 format for WhatsApp compatibility)
async function uploadAudioToStorage(
  supabase: any, 
  audioBuffer: ArrayBuffer, 
  conversationId: string,
  format: 'mp3' = 'mp3'
): Promise<string | null> {
  try {
    const fileName = `${conversationId}/${Date.now()}.mp3`;
    const contentType = 'audio/mpeg';
    
    const { data, error } = await supabase.storage
      .from('nina-audio')
      .upload(fileName, audioBuffer, {
        contentType: contentType,
        cacheControl: '3600'
      });

    if (error) {
      console.error('[Nina] Error uploading audio:', error);
      return null;
    }

    // Use public URL (bucket is public)
    const { data: publicUrlData } = supabase.storage
      .from('nina-audio')
      .getPublicUrl(fileName);

    if (!publicUrlData?.publicUrl) {
      console.error('[Nina] Error getting public URL');
      return null;
    }

    console.log(`[Nina] Audio uploaded (${format}):`, publicUrlData.publicUrl);
    return publicUrlData.publicUrl;
  } catch (error) {
    console.error('[Nina] Error uploading audio to storage:', error);
    return null;
  }
}

// ===== LOOK-AHEAD DEBOUNCE: Wait for pending messages arriving soon =====
// Before processing, check if there are more messages scheduled to arrive in the next 10 seconds
async function waitForPendingMessages(
  supabase: any,
  conversationId: string,
  maxWaitMs: number = 10000
): Promise<void> {
  const checkInterval = 2000; // Check every 2 seconds
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    // Check for pending messages with scheduled_for in the near future (next 10 seconds)
    const now = new Date();
    const futureLimit = new Date(Date.now() + 10000);
    
    const { data: upcomingItems } = await supabase
      .from('nina_processing_queue')
      .select('id, scheduled_for')
      .eq('conversation_id', conversationId)
      .eq('status', 'pending')
      .gt('scheduled_for', now.toISOString())
      .lte('scheduled_for', futureLimit.toISOString());
    
    if (!upcomingItems || upcomingItems.length === 0) {
      // No more messages arriving soon, safe to process
      console.log(`[Nina] ✅ No pending messages arriving soon, proceeding with processing`);
      return;
    }
    
    console.log(`[Nina] ⏳ Waiting for ${upcomingItems.length} pending messages in same conversation (arriving within 10s)...`);
    
    // Wait and check again
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }
  
  console.log(`[Nina] ⚠️ Max wait time reached, proceeding with available messages`);
}

// Aggregate pending messages from the same conversation for debouncing
async function aggregatePendingMessages(
  supabase: any,
  conversationId: string,
  currentItemId: string
): Promise<{ aggregatedContent: string; messageIds: string[]; primaryMessageId: string; queueItemIds: string[] } | null> {
  // Get all pending messages for this conversation that are ready to process
  const { data: pendingItems, error } = await supabase
    .from('nina_processing_queue')
    .select('id, message_id')
    .eq('conversation_id', conversationId)
    .eq('status', 'processing')
    .order('created_at', { ascending: true });

  if (error || !pendingItems || pendingItems.length === 0) {
    return null;
  }

  // Fetch all messages
  const messageIds = pendingItems.map((p: any) => p.message_id);
  const queueItemIds = pendingItems.map((p: any) => p.id);
  
  const { data: messages, error: msgError } = await supabase
    .from('messages')
    .select('id, content, type, sent_at')
    .in('id', messageIds)
    .eq('from_type', 'user')
    .order('sent_at', { ascending: true });

  if (msgError || !messages || messages.length === 0) {
    return null;
  }

  // If only one message, no aggregation needed
  if (messages.length === 1) {
    return null;
  }

  // Aggregate content from multiple messages
  const contents = messages
    .filter((m: any) => m.content && m.content.trim())
    .map((m: any) => m.content.trim());

  if (contents.length === 0) {
    return null;
  }

  // 🔒 DEDUPLICATION: Remove conteúdo idêntico (cliente enviou mesma mensagem múltiplas vezes)
  const uniqueContents = [...new Set(contents)];
  const aggregatedContent = uniqueContents.join('\n');
  
  if (uniqueContents.length < contents.length) {
    console.log(`[Nina] 🔄 Deduplicados ${contents.length - uniqueContents.length} mensagens idênticas`);
  }
  const primaryMessageId = messages[messages.length - 1].id; // Use latest message as primary

  console.log(`[Nina] 📦 Aggregated ${messages.length} messages into one: "${aggregatedContent.substring(0, 100)}..."`);

  return {
    aggregatedContent,
    messageIds: messages.map((m: any) => m.id),
    primaryMessageId,
    queueItemIds
  };
}

// Helper to mark all aggregated messages as processed
async function markMessagesAsProcessed(
  supabase: any,
  primaryMessageId: string,
  aggregatedMessageIds: string[],
  responseTime: number
) {
  // Mark primary message
  await supabase
    .from('messages')
    .update({ 
      processed_by_nina: true,
      nina_response_time: responseTime
    })
    .eq('id', primaryMessageId);

  // Mark additional aggregated messages (if any)
  if (aggregatedMessageIds.length > 1) {
    const otherMessageIds = aggregatedMessageIds.filter(id => id !== primaryMessageId);
    if (otherMessageIds.length > 0) {
      await supabase
        .from('messages')
        .update({ processed_by_nina: true })
        .in('id', otherMessageIds);
    }
  }
}

// Helper to mark all aggregated queue items as completed
async function markAggregatedQueueItemsCompleted(
  supabase: any,
  currentItemId: string,
  aggregatedQueueItemIds: string[]
) {
  // Mark all aggregated queue items as completed (except the current one, which is handled by the main loop)
  const otherQueueIds = aggregatedQueueItemIds.filter(id => id !== currentItemId);
  if (otherQueueIds.length > 0) {
    console.log(`[Nina] Marking ${otherQueueIds.length} additional queue items as completed (aggregated)`);
    await supabase
      .from('nina_processing_queue')
      .update({ 
        status: 'completed', 
        processed_at: new Date().toISOString(),
        error_message: 'Aggregated with other messages'
      })
      .in('id', otherQueueIds);
  }
}

// ===== CONVERSATION LOCK: Prevent parallel processing of same conversation =====
async function waitForConversationLock(
  supabase: any,
  conversationId: string,
  currentItemId: string,
  currentCreatedAt: string,
  maxWaitMs: number = 30000
): Promise<boolean> {
  const checkInterval = 1000;
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    // Check for OTHER items with status='processing' in the same conversation
    const { data: processingItems } = await supabase
      .from('nina_processing_queue')
      .select('id, created_at')
      .eq('conversation_id', conversationId)
      .eq('status', 'processing')
      .neq('id', currentItemId);
    
    if (!processingItems || processingItems.length === 0) {
      // No other items processing - we can proceed
      console.log(`[Nina] 🔓 Conversa ${conversationId} livre para processamento`);
      return true;
    }
    
    // Check if any processing items are OLDER than us (started before us)
    const olderItems = processingItems.filter((p: any) => p.created_at < currentCreatedAt);
    
    if (olderItems.length > 0) {
      console.log(`[Nina] 🔒 Conversa ${conversationId} em processamento por outro orchestrator (${olderItems.length} item(s) mais antigo(s)), aguardando...`);
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    } else {
      // We're the oldest - proceed
      console.log(`[Nina] 🔓 Somos o item mais antigo, prosseguindo`);
      return true;
    }
  }
  
  console.log(`[Nina] ⚠️ Timeout aguardando lock da conversa ${conversationId}, continuando mesmo assim`);
  return false;
}

async function processQueueItem(
  supabase: any,
  lovableApiKey: string,
  item: any,
  settings: any,
  agents: Agent[],
  defaultAgent: Agent | undefined
) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  console.log(`[Nina] Processing queue item: ${item.id}`);

  // 🆕 CONVERSATION LOCK: Wait if another orchestrator is processing this conversation
  // This ensures only one orchestrator processes messages at a time, enabling proper aggregation
  await waitForConversationLock(supabase, item.conversation_id, item.id, item.created_at);

  // 🆕 LOOK-AHEAD: Wait briefly if there are more messages arriving soon from the same conversation
  // This prevents processing the first message before subsequent messages are ready for aggregation
  await waitForPendingMessages(supabase, item.conversation_id);

  // Check for message aggregation (debouncing)
  const aggregated = await aggregatePendingMessages(supabase, item.conversation_id, item.id);
  
  let message: any;
  let aggregatedMessageIds: string[] = [];
  let aggregatedQueueItemIds: string[] = [];
  
  if (aggregated) {
    // Use aggregated content but get the primary message for metadata
    const { data: primaryMessage } = await supabase
      .from('messages')
      .select('*')
      .eq('id', aggregated.primaryMessageId)
      .maybeSingle();

    if (!primaryMessage) {
      throw new Error('Primary message not found');
    }

    // Override content with aggregated content
    message = { ...primaryMessage, content: aggregated.aggregatedContent };
    aggregatedMessageIds = aggregated.messageIds;
    aggregatedQueueItemIds = aggregated.queueItemIds;
    
    console.log(`[Nina] Using aggregated content from ${aggregated.messageIds.length} messages`);
    
    // Mark other queue items as completed immediately
    await markAggregatedQueueItemsCompleted(supabase, item.id, aggregatedQueueItemIds);
  } else {
    // Normal single message processing
    const { data: singleMessage } = await supabase
      .from('messages')
      .select('*')
      .eq('id', item.message_id)
      .maybeSingle();

    if (!singleMessage) {
      throw new Error('Message not found');
    }
    
    message = singleMessage;
    aggregatedMessageIds = [singleMessage.id];
  }

  // Get conversation with contact info
  const { data: conversation } = await supabase
    .from('conversations')
    .select('*, contact:contacts(*), whatsapp_window_start')
    .eq('id', item.conversation_id)
    .maybeSingle();

  if (!conversation) {
    throw new Error('Conversation not found');
  }

  // Check if conversation is still in Nina mode
  if (conversation.status !== 'nina') {
    console.log('[Nina] Conversation no longer in Nina mode, skipping');
    return;
  }

  // Check WhatsApp 24h window
  const windowStart = conversation.whatsapp_window_start ? new Date(conversation.whatsapp_window_start) : null;
  const now = new Date();
  const windowEndTime = windowStart ? new Date(windowStart.getTime() + 24 * 60 * 60 * 1000) : null;
  const isWindowOpen = windowStart !== null && windowEndTime !== null && now < windowEndTime;

  if (!isWindowOpen) {
    console.log('[Nina] WhatsApp 24h window is closed, skipping AI response');
    await supabase
      .from('messages')
      .update({ processed_by_nina: true })
      .eq('id', message.id);
    return;
  }

  // ===== AUTO-VOICE ON WINDOW OPEN =====
  // If enabled, trigger Iris call when a lead opens a new conversation window
  if (settings?.auto_voice_on_window && settings?.auto_attendant_active) {
    const windowJustOpened = windowStart && 
      (now.getTime() - windowStart.getTime()) < 30000; // 30s threshold
    
    if (windowJustOpened) {
      // Check for recent VQ in last 24h to avoid spam
      const { data: recentVq } = await supabase
        .from('voice_qualifications')
        .select('id')
        .eq('contact_id', conversation.contact_id)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(1)
        .maybeSingle();
      
      if (!recentVq) {
        const delaySeconds = settings?.auto_voice_delay_seconds || 0;
        const scheduledFor = new Date(Date.now() + delaySeconds * 1000).toISOString();

        const { error: insertErr } = await supabase
          .from('voice_qualifications')
          .insert({
            contact_id: conversation.contact_id,
            status: 'scheduled',
            scheduled_for: scheduledFor,
            attempt_number: 1,
            max_attempts: 3,
            trigger_source: 'auto_window',
          });

        if (insertErr) {
          console.error('[Nina] Auto-voice: failed to schedule VQ:', insertErr);
        } else {
          console.log(`[Nina] Auto-voice: scheduled VQ for contact ${conversation.contact_id} at ${scheduledFor} (delay: ${delaySeconds}s)`);
        }
      } else {
        console.log(`[Nina] Auto-voice: skipped, VQ exists for contact ${conversation.contact_id}`);
      }
    }
  }
  // ===== END AUTO-VOICE ON WINDOW OPEN =====

  // Check if auto-response is enabled
  if (!settings?.auto_response_enabled) {
    console.log('[Nina] Auto-response disabled, marking as processed without responding');
    await supabase
      .from('messages')
      .update({ processed_by_nina: true })
      .eq('id', message.id);
    return;
  }

  // ===== SKIP WHATSAPP REACTIONS =====
  // Reactions like [reaction] or emoji reactions should not trigger AI responses
  const messageContent = message.content?.trim() || '';
  const isReactionMessage = 
    messageContent === '[reaction]' || 
    messageContent.startsWith('[reaction') ||
    /^\[reaction.*\]$/i.test(messageContent);
    
  if (isReactionMessage) {
    console.log('[Nina] ⏭️ WhatsApp reaction detected, skipping AI response');
    await supabase
      .from('messages')
      .update({ processed_by_nina: true })
      .eq('id', message.id);
    return;
  }
  // ===== END SKIP WHATSAPP REACTIONS =====

  // ===== ANTI-DUPLICATION: Check if response already exists =====
  // Prevent duplicate responses when the same message is processed twice
  const { data: existingResponse } = await supabase
    .from('messages')
    .select('id, content, sent_at')
    .eq('conversation_id', conversation.id)
    .in('from_type', ['nina', 'human'])
    .gt('sent_at', message.sent_at)
    .order('sent_at', { ascending: true })
    .limit(1);

  if (existingResponse && existingResponse.length > 0) {
    const timeDiff = new Date(existingResponse[0].sent_at).getTime() - new Date(message.sent_at).getTime();
    // If response exists within 2 minutes, skip processing
    if (timeDiff < 120000) {
      console.log(`[Nina] ⏭️ Já existe resposta para esta mensagem (${Math.round(timeDiff/1000)}s depois), pulando processamento duplicado`);
      await supabase
        .from('messages')
        .update({ processed_by_nina: true })
        .eq('id', message.id);
      return;
    }
  }
  // ===== END ANTI-DUPLICATION =====

  // Detect which agent should handle this conversation
  const { agent, isHandoff } = detectAgent(
    message.content || '', 
    conversation, 
    agents, 
    defaultAgent
  );

  if (!agent) {
    console.log('[Nina] No agent available, using default system prompt');
  } else {
    console.log(`[Nina] Using agent: ${agent.name} (handoff: ${isHandoff})`);
  }

  // ===== AUTOMATIC CONVERSATION CLOSURE DETECTION =====
  // Check if agent sent a farewell message and client confirmed
  const conversationMetadata = conversation.metadata || {};

  // Fetch last agent message (used by closure detection AND not-responsible detection)
  let lastAgentMessage: string | null = null;
  if (message.content) {
    const { data: lastAgentMessages } = await supabase
      .from('messages')
      .select('content')
      .eq('conversation_id', conversation.id)
      .in('from_type', ['nina', 'human'])
      .lt('sent_at', message.sent_at)
      .order('sent_at', { ascending: false })
      .limit(1);
    
    lastAgentMessage = lastAgentMessages?.[0]?.content || null;
  }

  if (message.content) {
    const closureDetected = detectConversationClosure(lastAgentMessage, message.content);
    
    if (closureDetected.isClosed) {
      console.log(`[Nina] 🔒 Conversation closure detected: ${closureDetected.reason}`);
      
      // Mark message as processed
      await supabase
        .from('messages')
        .update({ processed_by_nina: true })
        .eq('id', message.id);
      
      // Mark conversation as closed
      await supabase
        .from('conversations')
        .update({ 
          status: 'paused',
          is_active: false
        })
        .eq('id', conversation.id);
      
      // ===== AUTO-GENERATE SUMMARY FOR RETURNING LEAD CONTEXT =====
      try {
        const { data: allMessages } = await supabase
          .from('messages')
          .select('content, from_type, sent_at')
          .eq('conversation_id', conversation.id)
          .order('sent_at', { ascending: true });
        
        if (allMessages && allMessages.length > 3) {
          console.log('[Nina] 📝 Generating auto-summary for closed conversation...');
          
          const summaryResponse = await supabase.functions.invoke('generate-summary', {
            body: {
              messages: allMessages,
              contactName: normalizeContactName(conversation.contact?.name || conversation.contact?.call_name),
              agentName: agent?.name || 'Nina'
            }
          });
          
          if (summaryResponse.data?.summary) {
            const timestamp = new Date().toLocaleDateString('pt-BR');
            const existingNotes = conversation.contact?.notes || '';
            const newSummary = `[${timestamp}] ${summaryResponse.data.summary}`;
            const newNotes = existingNotes 
              ? `${existingNotes}\n\n---\n${newSummary}`
              : newSummary;
            
            await supabase
              .from('contacts')
              .update({ notes: newNotes })
              .eq('id', conversation.contact_id);
            
            console.log('[Nina] 📝 Auto-generated summary saved to contact.notes');
          }
        }
      } catch (summaryErr) {
        console.error('[Nina] Error generating auto-summary:', summaryErr);
      }
      // ===== END AUTO-GENERATE SUMMARY =====
      
      // Find deal and move to "Perdido" stage
      const { data: deal } = await supabase
        .from('deals')
        .select('id, pipeline_id')
        .eq('contact_id', conversation.contact_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (deal) {
        const { data: lostStage } = await supabase
          .from('pipeline_stages')
          .select('id')
          .eq('pipeline_id', deal.pipeline_id)
          .eq('title', 'Perdido')
          .maybeSingle();
        
        if (lostStage) {
          await supabase
            .from('deals')
            .update({
              stage_id: lostStage.id,
              lost_at: new Date().toISOString(),
              lost_reason: closureDetected.reason
            })
            .eq('id', deal.id);
          
          console.log(`[Nina] 📉 Deal moved to Perdido stage automatically`);
        }
      }
      
      console.log(`[Nina] ✅ Conversation auto-closed, no response needed`);
      return;
    }
  }
  // ===== END AUTOMATIC CONVERSATION CLOSURE DETECTION =====

  // ===== NOT RESPONSIBLE DETECTION (Prospecting) =====
  // When Atlas asks "Você seria o responsável?" and lead says "não"
  if (conversationMetadata.origin === 'prospeccao' && message.content) {
    // Reuse the lastAgentMessage already fetched above (line ~3318)
    const notResponsibleDetected = detectNotResponsible(lastAgentMessage, message.content);
    
    if (notResponsibleDetected) {
      console.log(`[Nina] 🚫 NOT RESPONSIBLE detected: agent asked about responsible, lead said "${message.content}"`);
      
      // Fixed message (no AI) for consistency
      const thankYouMessage = 'Entendi! Obrigado por nos avisar. Vamos atualizar o contato no nosso cadastro. Desculpe o incomodo e tenha um otimo dia!';
      
      // Calculate delay
      const delayMin = settings?.response_delay_min || 1000;
      const delayMax = settings?.response_delay_max || 3000;
      const delay = Math.random() * (delayMax - delayMin) + delayMin;
      const aiSettings = getModelSettings(settings, [], message, conversation.contact, {});
      
      // Queue the thank you response
      await queueTextResponse(supabase, conversation, message, thankYouMessage, settings, aiSettings, delay, agent);
      
      // Mark message as processed
      const responseTime = Date.now() - new Date(message.sent_at).getTime();
      await supabase
        .from('messages')
        .update({ 
          processed_by_nina: true,
          nina_response_time: responseTime
        })
        .eq('id', message.id);
      
      // Apply tag "Prospecção numero errado"
      const tagId = '40043cab-449d-42d9-9654-08439fc16589';
      const existingTags = conversation.contact?.tags || [];
      if (!existingTags.includes(tagId)) {
        await supabase
          .from('contacts')
          .update({ tags: [...existingTags, tagId] })
          .eq('id', conversation.contact_id);
        console.log('[Nina] 🏷️ Tag "Prospecção numero errado" applied');
      }
      
      // Move deal to "Perdido" stage
      const { data: prospectingPipeline } = await supabase
        .from('pipelines')
        .select('id')
        .eq('slug', 'prospeccao')
        .single();
      
      if (prospectingPipeline) {
        const { data: lostStage } = await supabase
          .from('pipeline_stages')
          .select('id')
          .eq('pipeline_id', prospectingPipeline.id)
          .eq('title', 'Perdido')
          .single();
        
        if (lostStage) {
          await supabase
            .from('deals')
            .update({ 
              stage_id: lostStage.id,
              lost_at: new Date().toISOString(),
              lost_reason: 'Não é o responsável'
            })
            .eq('contact_id', conversation.contact_id);
          console.log('[Nina] 📉 Deal moved to Perdido (Não é o responsável)');
        }
      }
      
      // Pause conversation with followup_stopped
      await supabase
        .from('conversations')
        .update({ 
          status: 'paused',
          nina_context: {
            ...(conversation.nina_context || {}),
            followup_stopped: true,
            followup_stopped_reason: 'not_responsible',
            paused_reason: 'not_responsible',
            paused_at: new Date().toISOString()
          }
        })
        .eq('id', conversation.id);
      
      // Trigger whatsapp-sender
      try {
        const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
        fetch(senderUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({ triggered_by: 'nina-orchestrator-not-responsible' })
        }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
      } catch (e) {
        console.error('[Nina] Failed to trigger whatsapp-sender:', e);
      }
      
      console.log('[Nina] ✅ Not responsible handled: message sent, tag applied, deal lost, conversation paused');
      return;
    }
  }
  // ===== END NOT RESPONSIBLE DETECTION =====

  // ===== PROSPECTING REJECTION DETECTION =====
  // Check if this is a prospecting conversation and message is a rejection
  if (conversationMetadata.origin === 'prospeccao' && message.content && isProspectingRejection(message.content)) {
    console.log(`[Nina] 🚫 Prospecting rejection detected: "${message.content}"`);
    
    // Use agent's rejection_message for graceful closure (NOT handoff_message which is for qualified leads)
    const rejectionResponse = agent?.rejection_message 
      || 'Sem problemas! Agradeço pelo seu tempo. Qualquer dúvida sobre seguros, estamos à disposição. Tenha um ótimo dia!';
    
    // Calculate delay
    const delayMin = settings?.response_delay_min || 1000;
    const delayMax = settings?.response_delay_max || 3000;
    const delay = Math.random() * (delayMax - delayMin) + delayMin;
    
    // Get AI settings for metadata
    const aiSettings = getModelSettings(settings, [], message, conversation.contact, {});
    
    // Queue the rejection response
    await queueTextResponse(supabase, conversation, message, rejectionResponse, settings, aiSettings, delay, agent);
    
    // Mark message as processed
    const responseTime = Date.now() - new Date(message.sent_at).getTime();
    await supabase
      .from('messages')
      .update({ 
        processed_by_nina: true,
        nina_response_time: responseTime
      })
      .eq('id', message.id);
    
    // Move deal to "Perdido" stage
    const { data: prospectingPipeline } = await supabase
      .from('pipelines')
      .select('id')
      .eq('slug', 'prospeccao')
      .single();
    
    if (prospectingPipeline) {
      const { data: lostStage } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('pipeline_id', prospectingPipeline.id)
        .eq('title', 'Perdido')
        .single();
      
      if (lostStage) {
        await supabase
          .from('deals')
          .update({ 
            stage_id: lostStage.id,
            lost_at: new Date().toISOString(),
            lost_reason: 'Lead rejeitou prospecção'
          })
          .eq('contact_id', conversation.contact_id);
        
        console.log(`[Nina] 📉 Deal moved to Perdido stage`);
      }
    }
    
    // Pause conversation (end prospecting)
    await supabase
      .from('conversations')
      .update({ status: 'paused' })
      .eq('id', conversation.id);
    
    // Trigger whatsapp-sender
    try {
      const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
      fetch(senderUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ triggered_by: 'nina-orchestrator-prospecting-rejection' })
      }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
    } catch (e) {
      console.error('[Nina] Failed to trigger whatsapp-sender:', e);
    }
    
    console.log(`[Nina] ✅ Prospecting rejection handled, conversation paused`);
    return;
  }
  // ===== END PROSPECTING REJECTION DETECTION =====

  // ===== SOFT REJECTION STEP 3: CAPTURE EMAIL AND FINALIZE =====
  // Check if we're awaiting email after getting renewal date
  const ninaContext = conversation.nina_context || {};
  if (conversationMetadata.origin === 'prospeccao' && 
      (ninaContext.awaiting_email === true || ninaContext.awaiting_email_confirmation === true) && 
      message.content) {
    console.log(`[Nina] 📧 Awaiting email, received: "${message.content}"`);
    
    // Calculate delay
    const delayMin = settings?.response_delay_min || 1000;
    const delayMax = settings?.response_delay_max || 3000;
    const delay = Math.random() * (delayMax - delayMin) + delayMin;
    
    // Get AI settings for metadata
    const aiSettings = getModelSettings(settings, [], message, conversation.contact, {});
    
    // Try to extract email from message
    const emailMatch = message.content.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
    const isConfirmation = /sim|pode|isso|tá certo|correto|esse mesmo|esse aí|esse ai|pode ser|ok|blz|beleza/i.test(message.content);
    
    let finalEmail: string | null = null;
    
    if (emailMatch) {
      finalEmail = emailMatch[0].toLowerCase();
      // Save new email to contact
      await supabase
        .from('contacts')
        .update({ email: finalEmail })
        .eq('id', conversation.contact_id);
      console.log(`[Nina] 📧 New email captured and saved: ${finalEmail}`);
    } else if (isConfirmation && conversation.contact?.email) {
      finalEmail = conversation.contact.email;
      console.log(`[Nina] 📧 Email confirmed: ${finalEmail}`);
    }
    
    // Get prospecting pipeline and nurture stage
    const { data: prospectingPipeline } = await supabase
      .from('pipelines')
      .select('id')
      .eq('slug', 'prospeccao')
      .maybeSingle();
    
    const renewalDate = ninaContext.renewal_date;
    let responseText: string;
    
    if (finalEmail && renewalDate && prospectingPipeline) {
      // Generate personalized email using AI
      const emailContent = await generateRenewalEmail(
        lovableApiKey,
        conversation.contact,
        renewalDate
      );
      
      // Get deal for scheduled email
      const { data: deal } = await supabase
        .from('deals')
        .select('id, title')
        .eq('contact_id', conversation.contact_id)
        .eq('pipeline_id', prospectingPipeline.id)
        .maybeSingle();
      
      if (deal && emailContent) {
        // Calculate scheduled date (60 days before renewal)
        const renewalDateObj = new Date(renewalDate);
        const scheduledDate = new Date(renewalDateObj);
        scheduledDate.setDate(scheduledDate.getDate() - 60);
        
        // If scheduled date is in the past, schedule for 3 days from now
        const now = new Date();
        if (scheduledDate <= now) {
          scheduledDate.setTime(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        }
        
        // Insert scheduled email
        await supabase
          .from('scheduled_emails')
          .insert({
            deal_id: deal.id,
            contact_id: conversation.contact_id,
            to_email: finalEmail,
            subject: emailContent.subject,
            body_html: emailContent.body_html,
            scheduled_for: scheduledDate.toISOString().split('T')[0],
            days_before_due: 60,
            generated_by: 'ai'
          });
        
        console.log(`[Nina] 📧 Renewal email scheduled for ${scheduledDate.toISOString().split('T')[0]}`);
        
        // Create follow-up task for operator
        await supabase
          .from('deal_activities')
          .insert({
            deal_id: deal.id,
            type: 'task',
            title: 'Follow-up Renovação',
            description: `Lead rejeitou por já ter corretor.\nData de renovação: ${new Date(renewalDate).toLocaleDateString('pt-BR')}\nEmail agendado para 60 dias antes: ${finalEmail}\n\nAgendar recontato próximo da data de vencimento.`,
            scheduled_at: scheduledDate.toISOString(),
            is_completed: false
          });
        
        console.log(`[Nina] 📋 Follow-up task created for operator`);
      }
      
      responseText = 'Tudo certo! Vou enviar um lembrete próximo da renovação. Bom trabalho!';
    } else if (!finalEmail) {
      // Could not get email - graceful exit
      responseText = 'Sem problema! Quando precisar de uma cotação é só chamar. Bom trabalho!';
    } else {
      responseText = 'Perfeito! Entro em contato próximo da renovação. Bom trabalho!';
    }
    
    // Queue the response
    await queueTextResponse(supabase, conversation, message, responseText, settings, aiSettings, delay, agent);
    
    // Mark message as processed
    const responseTime = Date.now() - new Date(message.sent_at).getTime();
    await supabase
      .from('messages')
      .update({ 
        processed_by_nina: true,
        nina_response_time: responseTime
      })
      .eq('id', message.id);
    
    // Move deal to Nurture stage
    if (prospectingPipeline) {
      const { data: nurtureStage } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('pipeline_id', prospectingPipeline.id)
        .eq('title', 'Nurture')
        .maybeSingle();
      
      if (nurtureStage) {
        const { data: existingDeal } = await supabase
          .from('deals')
          .select('notes')
          .eq('contact_id', conversation.contact_id)
          .eq('pipeline_id', prospectingPipeline.id)
          .maybeSingle();
        
        const existingNotes = existingDeal?.notes || '';
        const newNote = `[${new Date().toLocaleDateString('pt-BR')}] Soft rejection - Renovação: ${renewalDate ? new Date(renewalDate).toLocaleDateString('pt-BR') : 'N/A'} - Email: ${finalEmail || 'N/A'}`;
        
        await supabase
          .from('deals')
          .update({ 
            stage_id: nurtureStage.id,
            notes: existingNotes ? `${existingNotes}\n\n${newNote}` : newNote
          })
          .eq('contact_id', conversation.contact_id)
          .eq('pipeline_id', prospectingPipeline.id);
        
        console.log(`[Nina] 🌱 Deal moved to Nurture stage`);
      }
    }
    
    // Clear awaiting flags and pause conversation
    await supabase
      .from('conversations')
      .update({ 
        status: 'paused',
        nina_context: { 
          ...ninaContext, 
          awaiting_email: false, 
          awaiting_email_confirmation: false,
          awaiting_renewal_date: false 
        }
      })
      .eq('id', conversation.id);
    
    // Trigger whatsapp-sender
    try {
      const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
      fetch(senderUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ triggered_by: 'nina-orchestrator-email-capture' })
      }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
    } catch (e) {
      console.error('[Nina] Failed to trigger whatsapp-sender:', e);
    }
    
    console.log(`[Nina] ✅ Email flow completed, deal in Nurture for follow-up`);
    return;
  }
  // ===== END SOFT REJECTION STEP 3 =====

  // ===== SOFT REJECTION STEP 2: CAPTURE RENEWAL DATE =====
  // Check if we're awaiting renewal date from a previous soft rejection
  if (conversationMetadata.origin === 'prospeccao' && ninaContext.awaiting_renewal_date === true && message.content) {
    console.log(`[Nina] 📅 Awaiting renewal date, received: "${message.content}"`);
    
    const renewalDate = parseRenewalDate(message.content);
    
    // Calculate delay
    const delayMin = settings?.response_delay_min || 1000;
    const delayMax = settings?.response_delay_max || 3000;
    const delay = Math.random() * (delayMax - delayMin) + delayMin;
    
    // Get AI settings for metadata
    const aiSettings = getModelSettings(settings, [], message, conversation.contact, {});
    
    // Get prospecting pipeline and nurture stage
    const { data: prospectingPipeline } = await supabase
      .from('pipelines')
      .select('id')
      .eq('slug', 'prospeccao')
      .maybeSingle();
    
    let responseText: string;
    
    if (renewalDate) {
      console.log(`[Nina] 📅 Parsed renewal date: ${renewalDate}`);
      
      // Save renewal date to deal.due_date
      if (prospectingPipeline) {
        await supabase
          .from('deals')
          .update({ 
            due_date: renewalDate,
            notes: `Data de renovação informada: ${new Date(renewalDate).toLocaleDateString('pt-BR')}`
          })
          .eq('contact_id', conversation.contact_id)
          .eq('pipeline_id', prospectingPipeline.id);
        
        console.log(`[Nina] 📅 Due date saved: ${renewalDate}`);
      }
      
      // Check if contact already has email
      if (conversation.contact?.email) {
        // Email exists - confirm it
        responseText = `Posso enviar informações no email ${conversation.contact.email}? Se preferir outro, me passa!`;
        await supabase
          .from('conversations')
          .update({ 
            nina_context: { 
              ...ninaContext, 
              awaiting_renewal_date: false,
              awaiting_email_confirmation: true, 
              renewal_date: renewalDate 
            }
          })
          .eq('id', conversation.id);
      } else {
        // No email - ask for it
        responseText = 'Perfeito! Pra enviar informações na época da renovação, qual seu melhor email?';
        await supabase
          .from('conversations')
          .update({ 
            nina_context: { 
              ...ninaContext, 
              awaiting_renewal_date: false,
              awaiting_email: true, 
              renewal_date: renewalDate 
            }
          })
          .eq('id', conversation.id);
      }
    } else {
      console.log(`[Nina] 📅 Could not parse date from: "${message.content}"`);
      responseText = 'Sem problema! Quando precisar de uma cotação é só chamar. Bom trabalho!';
      
      // Clear flag and move to Nurture without email
      await supabase
        .from('conversations')
        .update({ 
          status: 'paused',
          nina_context: { ...ninaContext, awaiting_renewal_date: false }
        })
        .eq('id', conversation.id);
      
      // Move deal to Nurture
      if (prospectingPipeline) {
        const { data: nurtureStage } = await supabase
          .from('pipeline_stages')
          .select('id')
          .eq('pipeline_id', prospectingPipeline.id)
          .eq('title', 'Nurture')
          .maybeSingle();
        
        if (nurtureStage) {
          await supabase
            .from('deals')
            .update({ stage_id: nurtureStage.id })
            .eq('contact_id', conversation.contact_id)
            .eq('pipeline_id', prospectingPipeline.id);
        }
      }
    }
    
    // Queue the response
    await queueTextResponse(supabase, conversation, message, responseText, settings, aiSettings, delay, agent);
    
    // Mark message as processed
    const responseTime = Date.now() - new Date(message.sent_at).getTime();
    await supabase
      .from('messages')
      .update({ 
        processed_by_nina: true,
        nina_response_time: responseTime
      })
      .eq('id', message.id);
    
    // Trigger whatsapp-sender
    try {
      const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
      fetch(senderUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ triggered_by: 'nina-orchestrator-renewal-date-capture' })
      }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
    } catch (e) {
      console.error('[Nina] Failed to trigger whatsapp-sender:', e);
    }
    
    console.log(`[Nina] ✅ Renewal date step completed`);
    return;
  }
  // ===== END SOFT REJECTION STEP 2 =====

  // ===== INTERACTIVE BUTTON REPLY HANDLING =====
  // Handle responses from interactive buttons (triaging buttons after Íris greeting)
  const isButtonReply = message.metadata?.is_button_reply === true;
  const buttonId = message.metadata?.button_id;
  
  if (isButtonReply && buttonId) {
    console.log(`[Nina] 🔘 Button reply detected: ${buttonId}`);
    
    // Handle "Foi engano" button
    if (buttonId === 'btn_engano') {
      console.log('[Nina] 🚫 User clicked "Foi engano" - pausing conversation');
      
      const enganoResponse = 'Sem problema! Se precisar de seguro de transporte no futuro, é só me chamar. 😊';
      
      const delayMin = settings?.response_delay_min || 1000;
      const delayMax = settings?.response_delay_max || 3000;
      const delay = Math.random() * (delayMax - delayMin) + delayMin;
      const aiSettings = getModelSettings(settings, [], message, conversation.contact, {});
      
      await queueTextResponse(supabase, conversation, message, enganoResponse, settings, aiSettings, delay, agent);
      
      // Pause conversation
      await supabase
        .from('conversations')
        .update({ 
          status: 'paused',
          nina_context: {
            ...ninaContext,
            triaging_result: 'engano',
            triaging_at: new Date().toISOString()
          }
        })
        .eq('id', conversation.id);
      
      // Cancel any pending/scheduled voice qualifications
      const { data: pendingVqs } = await supabase
        .from('voice_qualifications')
        .select('id')
        .eq('contact_id', conversation.contact_id)
        .in('status', ['pending', 'scheduled', 'calling']);

      if (pendingVqs && pendingVqs.length > 0) {
        await supabase
          .from('voice_qualifications')
          .update({
            status: 'cancelled',
            completed_at: new Date().toISOString(),
            observations: 'Cancelado automaticamente: lead clicou "Foi engano"',
          })
          .in('id', pendingVqs.map(v => v.id));
        console.log(`[Nina] Cancelled ${pendingVqs.length} pending voice qualifications (engano)`);
      }

      // Add tag for tracking
      const currentTags = conversation.contact?.tags || [];
      if (!currentTags.includes('engano')) {
        await supabase
          .from('contacts')
          .update({ tags: [...currentTags, 'engano'] })
          .eq('id', conversation.contact_id);
      }
      
      // Mark message as processed
      await supabase
        .from('messages')
        .update({ processed_by_nina: true })
        .eq('id', message.id);
      
      // Trigger whatsapp-sender
      try {
        const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
        fetch(senderUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({ triggered_by: 'nina-orchestrator-btn-engano' })
        }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
      } catch (e) {
        console.error('[Nina] Failed to trigger whatsapp-sender:', e);
      }
      
      console.log('[Nina] ✅ "Foi engano" handled, conversation paused');
      return;
    }
    
    // Handle "Outros seguros" button - handoff to Sofia
    if (buttonId === 'btn_outros_seguros') {
      console.log('[Nina] 🔄 User clicked "Outros seguros" - handoff to Sofia');
      
      // Find Sofia agent
      const sofiaAgent = agents.find((a: Agent) => a.slug === 'sofia');
      
      if (sofiaAgent) {
        // Update conversation to use Sofia
        const updatedContext = {
          ...ninaContext,
          handoff_from_agent: agent?.name || 'Íris',
          handoff_reason: 'user_requested_other_insurance',
          handoff_at: new Date().toISOString(),
          triaging_result: 'outros_seguros'
        };
        
        await supabase
          .from('conversations')
          .update({ 
            current_agent_id: sofiaAgent.id,
            nina_context: updatedContext
          })
          .eq('id', conversation.id);
        
        // Send Sofia's greeting
        const sofiaGreeting = `Oi! Sou a Sofia, também da Jacometo! 😊

Trabalho com vários tipos de seguro:
• 🚗 Auto (carro, moto)
• 🏠 Residencial
• 💼 Empresarial
• ✈️ Viagem
• 💚 Vida

Qual desses te interessa?`;
        
        const delayMin = settings?.response_delay_min || 1000;
        const delayMax = settings?.response_delay_max || 3000;
        const delay = Math.random() * (delayMax - delayMin) + delayMin;
        const aiSettings = getModelSettings(settings, [], message, conversation.contact, {});
        
        await queueTextResponse(supabase, conversation, message, sofiaGreeting, settings, aiSettings, delay, sofiaAgent);
        
        // Move deal to "Outros Seguros" pipeline
        const { data: currentDeal } = await supabase
          .from('deals')
          .select('id')
          .eq('contact_id', conversation.contact_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (currentDeal) {
          const { data: outrosSeguros } = await supabase
            .from('pipelines')
            .select('id')
            .eq('slug', 'outros-seguros')
            .single();
          
          if (outrosSeguros) {
            const { data: firstStage } = await supabase
              .from('pipeline_stages')
              .select('id')
              .eq('pipeline_id', outrosSeguros.id)
              .order('position', { ascending: true })
              .limit(1)
              .single();
            
            await supabase
              .from('deals')
              .update({ 
                pipeline_id: outrosSeguros.id,
                stage_id: firstStage?.id
              })
              .eq('id', currentDeal.id);
            
            console.log(`[Nina] 📦 Deal moved to "Outros Seguros" pipeline`);
          }
        }
        
        // Mark message as processed
        await supabase
          .from('messages')
          .update({ processed_by_nina: true })
          .eq('id', message.id);
        
        // Trigger whatsapp-sender
        try {
          const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
          fetch(senderUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify({ triggered_by: 'nina-orchestrator-btn-outros-seguros' })
          }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
        } catch (e) {
          console.error('[Nina] Failed to trigger whatsapp-sender:', e);
        }
        
        console.log('[Nina] ✅ Handoff to Sofia complete');
        return;
      } else {
        console.log('[Nina] ⚠️ Sofia agent not found, continuing normal flow');
      }
    }
    
    // Handle "Sou transportador" button - continue normal qualification
    if (buttonId === 'btn_transportador') {
      console.log('[Nina] ✅ User clicked "Sou transportador" - continuing qualification');
      
      // Store triaging result and continue normal flow
      await supabase
        .from('conversations')
        .update({ 
          nina_context: {
            ...ninaContext,
            triaging_result: 'transportador',
            triaging_confirmed_at: new Date().toISOString()
          }
        })
        .eq('id', conversation.id);
      
      // Don't return - let the AI continue the qualification flow
    }
  }
  // ===== END INTERACTIVE BUTTON REPLY HANDLING =====

  // ===== NEW OWNER NAME CAPTURE (after number owner change) =====
  if (ninaContext.awaiting_new_owner_name && message.content) {
    const possibleName = extractNameFromMessage(message.content);
    
    if (possibleName) {
      // Update contact with new owner name
      await supabase
        .from('contacts')
        .update({
          name: possibleName,
          call_name: possibleName.split(' ')[0]
        })
        .eq('id', conversation.contact_id);
      
      // Clear awaiting flag and continue qualification
      await supabase
        .from('conversations')
        .update({
          nina_context: {
            ...ninaContext,
            awaiting_new_owner_name: false,
            new_owner_name: possibleName,
            new_owner_captured_at: new Date().toISOString()
          }
        })
        .eq('id', conversation.id);
      
      console.log(`[Nina] ✅ New owner name captured: ${possibleName}`);
      
      // Generate welcome message for new owner
      const welcomeMessage = `Prazer, ${possibleName.split(' ')[0]}! 👋\n\nSou a Nina da Jacometo Seguros. Trabalha com transporte de cargas?`;
      
      const delayMin = settings?.response_delay_min || 1000;
      const delayMax = settings?.response_delay_max || 3000;
      const delay = Math.random() * (delayMax - delayMin) + delayMin;
      const aiSettings = getModelSettings(settings, [], message, conversation.contact, {});
      
      await queueTextResponse(supabase, conversation, message, welcomeMessage, settings, aiSettings, delay, agent);
      
      // Mark message as processed
      await supabase
        .from('messages')
        .update({ processed_by_nina: true })
        .eq('id', message.id);
      
      // Trigger whatsapp-sender
      try {
        const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
        fetch(senderUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({ triggered_by: 'nina-orchestrator-new-owner-name' })
        }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
      } catch (e) {
        console.error('[Nina] Failed to trigger whatsapp-sender:', e);
      }
      
      console.log(`[Nina] ✅ New owner qualification started for: ${possibleName}`);
      return;
    }
  }
  // ===== END NEW OWNER NAME CAPTURE =====

  // ===== SOFT REJECTION STEP 1: ASK FOR RENEWAL DATE =====
  // Check if this is a prospecting conversation and message is a soft rejection
  if (conversationMetadata.origin === 'prospeccao' && message.content && isSoftRejection(message.content)) {
    console.log(`[Nina] 💛 Soft rejection detected: "${message.content}"`);
    
    // Ask for renewal date instead of immediate closure
    const askRenewalResponse = 'Entendido! Quando vence seu seguro atual? Assim posso entrar em contato na época da renovação.';
    
    // Calculate delay
    const delayMin = settings?.response_delay_min || 1000;
    const delayMax = settings?.response_delay_max || 3000;
    const delay = Math.random() * (delayMax - delayMin) + delayMin;
    
    // Get AI settings for metadata
    const aiSettings = getModelSettings(settings, [], message, conversation.contact, {});
    
    // Queue the renewal date question
    await queueTextResponse(supabase, conversation, message, askRenewalResponse, settings, aiSettings, delay, agent);
    
    // Mark message as processed
    const responseTime = Date.now() - new Date(message.sent_at).getTime();
    await supabase
      .from('messages')
      .update({ 
        processed_by_nina: true,
        nina_response_time: responseTime
      })
      .eq('id', message.id);
    
    // Set awaiting_renewal_date flag (but don't move to Nurture yet)
    await supabase
      .from('conversations')
      .update({ 
        nina_context: { 
          ...ninaContext, 
          awaiting_renewal_date: true,
          soft_rejection_at: new Date().toISOString(),
          soft_rejection_reason: message.content
        }
      })
      .eq('id', conversation.id);
    
    // Trigger whatsapp-sender
    try {
      const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
      fetch(senderUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ triggered_by: 'nina-orchestrator-soft-rejection-ask-date' })
      }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
    } catch (e) {
      console.error('[Nina] Failed to trigger whatsapp-sender:', e);
    }
    
    console.log(`[Nina] ✅ Soft rejection detected, asking for renewal date`);
    return;
  }
// ===== END SOFT REJECTION STEP 1 =====

  // ===== CURRICULUM/RESUME DOCUMENT DETECTION =====
  // Detect job seekers who send resume/CV as document or image
  // This catches cases where OCR extracted text from a resume
  if (message.content && detectCurriculumInExtractedText(message.content)) {
    console.log('[Nina][Disqualification] 📄 Curriculum/Resume document detected via OCR');
    
    // Get or create 'emprego' tag
    const { data: empregoTag } = await supabase
      .from('tag_definitions')
      .select('id')
      .eq('name', 'emprego')
      .maybeSingle();
    
    const tagId = empregoTag?.id || 'emprego';
    const existingTags = conversation.contact?.tags || [];
    
    if (!existingTags.includes(tagId)) {
      await supabase
        .from('contacts')
        .update({ 
          tags: [...existingTags, tagId],
          client_memory: {
            ...(conversation.contact?.client_memory || {}),
            lead_profile: {
              ...(conversation.contact?.client_memory?.lead_profile || {}),
              lead_stage: 'cold',
              qualification_score: 0,
              disqualification_reason: 'Enviou currículo - busca emprego'
            }
          }
        })
        .eq('id', conversation.contact_id);
      console.log('[Nina] 🏷️ Tag "emprego" applied for curriculum sender');
    }
    
    // Send thank you message
    const thankYouMessage = 'Olá! Vi que você enviou seu currículo. Agradecemos o interesse! Somos uma corretora de seguros de transporte e não temos vagas abertas no momento. Desejamos sucesso na sua busca profissional! 🙏';
    
    const delayMin = settings?.response_delay_min || 1000;
    const delayMax = settings?.response_delay_max || 3000;
    const delay = Math.random() * (delayMax - delayMin) + delayMin;
    const aiSettings = getModelSettings(settings, [], message, conversation.contact, {});
    
    await queueTextResponse(supabase, conversation, message, thankYouMessage, settings, aiSettings, delay, agent);
    
    // Mark message as processed
    await supabase
      .from('messages')
      .update({ processed_by_nina: true })
      .eq('id', message.id);
    
    // Update nina_context with job_seeker flag and pause conversation
    await supabase
      .from('conversations')
      .update({
        status: 'paused',
        nina_context: {
          ...(conversation.nina_context || {}),
          disqualified_category: 'job_seeker_curriculum',
          followup_stopped: true,
          followup_stopped_reason: 'curriculum_sent',
          paused_reason: 'job_seeker_curriculum',
          paused_at: new Date().toISOString()
        }
      })
      .eq('id', conversation.id);
    
    // Trigger whatsapp-sender
    try {
      const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
      fetch(senderUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ triggered_by: 'nina-curriculum-detection' })
      }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
    } catch (e) {
      console.error('[Nina] Failed to trigger whatsapp-sender:', e);
    }
    
    console.log('[Nina] ✅ Curriculum sender handled: thanked, tagged "emprego", paused');
    return;
  }
  // ===== END CURRICULUM/RESUME DOCUMENT DETECTION =====

  // ===== CLT EMPLOYEE DISAMBIGUATION =====
  // Detect if user might be a CLT employee looking for job (not insurance)
  if (message.content && agent?.slug !== 'sofia') {
    // Fetch recent user messages for context
    const { data: cltUserMsgs } = await supabase
      .from('messages')
      .select('content, from_type')
      .eq('conversation_id', conversation.id)
      .eq('from_type', 'user')
      .order('sent_at', { ascending: false })
      .limit(10);
    
    const userMessages = (cltUserMsgs || []).map((m: any) => m.content || '');
    
    const cltCheck = detectCltEmployeePattern(message.content, userMessages);
    
    // Check if we're already in disambiguation flow
    const ninaContext = conversation.nina_context || {};
    const awaitingJobClarification = ninaContext.awaiting_job_clarification === true;
    
    if (awaitingJobClarification) {
      // User is responding to our clarification question
      const userResponse = message.content.toLowerCase();
      
      const isJobSeeker = /oportunidade.*trabalho|oportunidade.*emprego|busco.*trabalho|busco.*emprego|preciso.*emprego|quero.*trabalhar|de motorista|como motorista|sim.*emprego|sim.*trabalho|procuro.*vaga/i.test(userResponse);
      const isInsuranceInterest = /seguro|cotação|cotacao|cotar|proteção|protecao|carga|frota|caminhão|caminhao/i.test(userResponse);
      
      if (isJobSeeker && !isInsuranceInterest) {
        console.log('[Nina] 💼 CLT employee confirmed job seeking');
        
        // Apply job_seeker disqualification
        const jobSeekerCategory = DISQUALIFICATION_CATEGORIES.find(c => c.key === 'job_seeker')!;
        
        // Add tag
        const currentTags = conversation.contact?.tags || [];
        if (!currentTags.includes(jobSeekerCategory.tag)) {
          await supabase
            .from('contacts')
            .update({ 
              tags: [...currentTags, jobSeekerCategory.tag],
              client_memory: {
                ...(conversation.contact?.client_memory || {}),
                lead_profile: {
                  ...(conversation.contact?.client_memory?.lead_profile || {}),
                  lead_stage: 'cold',
                  qualification_score: 0,
                  disqualification_reason: 'CLT employee seeking job'
                }
              }
            })
            .eq('id', conversation.contact_id);
        }
        
        // Send response and pause
        const delayMin = settings?.response_delay_min || 1000;
        const delayMax = settings?.response_delay_max || 3000;
        const delay = Math.random() * (delayMax - delayMin) + delayMin;
        const aiSettings = getModelSettings(settings, [], message, conversation.contact, {});
        
        await queueTextResponse(supabase, conversation, message, jobSeekerCategory.response!, settings, aiSettings, delay, agent);
        
        // Mark as processed
        await supabase
          .from('messages')
          .update({ processed_by_nina: true })
          .eq('id', message.id);
        
        // Pause conversation
        await supabase
          .from('conversations')
          .update({
            status: 'paused',
            nina_context: {
              ...ninaContext,
              awaiting_job_clarification: false,
              disqualified_category: 'job_seeker_clt',
              followup_stopped: true,
              paused_reason: 'job_seeker_clt',
              paused_at: new Date().toISOString()
            }
          })
          .eq('id', conversation.id);
        
        // Trigger sender
        fetch(`${supabaseUrl}/functions/v1/whatsapp-sender`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({ triggered_by: 'nina-orchestrator-job-seeker-clt' })
        }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
        
        console.log('[Nina] ✅ CLT job seeker handled - conversation paused');
        return;
      } else {
        // Not job seeking, continue with normal flow
        console.log('[Nina] ✅ CLT employee wants insurance - continuing qualification');
        await supabase
          .from('conversations')
          .update({
            nina_context: { ...ninaContext, awaiting_job_clarification: false }
          })
          .eq('id', conversation.id);
        // Continue to normal AI processing
      }
    } else if (cltCheck.needsClarification && !ninaContext.job_clarification_asked) {
      // First time detecting CLT pattern - ask clarification question
      console.log(`[Nina] 🤔 CLT employee pattern detected: ${cltCheck.matchedTerms.join(', ')}`);
      
      const clarificationMessage = 'Só pra eu entender melhor: você está buscando oportunidade de trabalho ou precisa de seguro para sua operação de transporte?';
      
      const delayMin = settings?.response_delay_min || 1000;
      const delayMax = settings?.response_delay_max || 3000;
      const delay = Math.random() * (delayMax - delayMin) + delayMin;
      const aiSettings = getModelSettings(settings, [], message, conversation.contact, {});
      
      await queueTextResponse(supabase, conversation, message, clarificationMessage, settings, aiSettings, delay, agent);
      
      // Mark as processed
      await supabase
        .from('messages')
        .update({ processed_by_nina: true })
        .eq('id', message.id);
      
      // Set flag to await clarification
      await supabase
        .from('conversations')
        .update({
          nina_context: {
            ...ninaContext,
            awaiting_job_clarification: true,
            job_clarification_asked: true,
            clt_terms_detected: cltCheck.matchedTerms
          }
        })
        .eq('id', conversation.id);
      
      // Trigger sender
      fetch(`${supabaseUrl}/functions/v1/whatsapp-sender`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ triggered_by: 'nina-orchestrator-clt-clarification' })
      }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
      
      console.log('[Nina] ❓ CLT clarification question sent');
      return;
    }
  }
  // ===== END CLT EMPLOYEE DISAMBIGUATION =====

  // ===== AUTOMATIC DISQUALIFICATION DETECTION =====
  if (message.content) {
    // ===== CONTEXT CHECK: Avoid false positives for qualification answers =====
    // Get last agent message to check if user is answering a qualification question
    const { data: lastAgentMsgData } = await supabase
      .from('messages')
      .select('content')
      .eq('conversation_id', conversation.id)
      .in('from_type', ['nina', 'human'])
      .lt('sent_at', message.sent_at)
      .order('sent_at', { ascending: false })
      .limit(1);
    
    const lastAgentMessage = lastAgentMsgData?.[0]?.content || null;
    
    // Check if this is a qualification answer for Iris (not job-seeking)
    const qualificationCheck = isIrisQualificationAnswer(
      message.content, 
      lastAgentMessage, 
      agent?.slug || null
    );
    
    if (qualificationCheck.isQualification) {
      console.log(`[Nina] ⏭️ Skipping disqualification check - qualification answer (${qualificationCheck.category})`);
      // Continue with normal AI processing - don't disqualify
    } else {
      const disqualCategory = detectDisqualificationCategory(message.content);
    
      if (disqualCategory) {
        console.log(`[Nina] Disqualification detected: ${disqualCategory.key}`);
      
      // 1. Adicionar tag e marcar como frio
      const currentTags = conversation.contact?.tags || [];
      const clientMemory = conversation.contact?.client_memory || {};
      
      if (!currentTags.map((t: string) => t.toLowerCase()).includes(disqualCategory.tag)) {
        await supabase
          .from('contacts')
          .update({ 
            tags: [...currentTags, disqualCategory.tag],
            client_memory: {
              ...clientMemory,
              lead_profile: {
                ...(clientMemory.lead_profile || {}),
                lead_stage: 'cold',
                qualification_score: 0,
                disqualification_reason: disqualCategory.reason
              }
            }
          })
          .eq('id', conversation.contact_id);
        
        console.log(`[Nina] 🏷️ Tag "${disqualCategory.tag}" added, lead marked as cold`);
      }
      
      // 2. Enviar resposta (se configurada)
      if (disqualCategory.response) {
        const delayMin = settings?.response_delay_min || 1000;
        const delayMax = settings?.response_delay_max || 3000;
        const delay = Math.random() * (delayMax - delayMin) + delayMin;
        const aiSettings = getModelSettings(settings, [], message, conversation.contact, {});
        
        await queueTextResponse(supabase, conversation, message, disqualCategory.response, settings, aiSettings, delay, agent);
      }
      
      // 3. Marcar mensagem como processada
      await supabase
        .from('messages')
        .update({ processed_by_nina: true })
        .eq('id', message.id);
      
      // 4. Pausar conversa (se configurado) e marcar nina_context
      if (disqualCategory.pauseConversation) {
        const contextUpdate: any = {
          paused_reason: disqualCategory.key,
          paused_at: new Date().toISOString(),
          followup_stopped: true // Sempre parar follow-ups quando desqualificado
        };
        
        // Se é identidade errada, marcar para prevenir follow-ups futuros
        if (disqualCategory.setIdentityMismatch) {
          contextUpdate.identity_mismatch = true;
          contextUpdate.wrong_contact_detected_at = new Date().toISOString();
        }
        
        await supabase
          .from('conversations')
          .update({ 
            status: 'paused',
            nina_context: {
              ...(conversation.nina_context || {}),
              ...contextUpdate
            },
            metadata: {
              ...(conversation.metadata || {}),
              paused_reason: disqualCategory.key,
              paused_at: new Date().toISOString()
            }
          })
          .eq('id', conversation.id);
      }
      
      // 4.5 Marcar deal como perdido (se configurado)
      if (disqualCategory.markAsLost) {
        // Get prospecting pipeline's "Perdido" stage
        const { data: prospectingPipeline } = await supabase
          .from('pipelines')
          .select('id')
          .eq('slug', 'prospeccao')
          .maybeSingle();
        
        if (prospectingPipeline) {
          const { data: lostStage } = await supabase
            .from('pipeline_stages')
            .select('id')
            .eq('pipeline_id', prospectingPipeline.id)
            .eq('title', 'Perdido')
            .maybeSingle();
          
          if (lostStage) {
            await supabase
              .from('deals')
              .update({
                stage_id: lostStage.id,
                lost_at: new Date().toISOString(),
                lost_reason: disqualCategory.reason
              })
              .eq('contact_id', conversation.contact_id);
            
            console.log(`[Nina] 📉 Deal marked as lost: ${disqualCategory.reason}`);
          }
        }
      }
      
      // 4.6 Reset contact data (se configurado - mudança de dono do número)
      if (disqualCategory.resetContactData) {
        const contactData = conversation.contact || {};
        const previousContactData = {
          name: contactData.name,
          company: contactData.company,
          cnpj: contactData.cnpj,
          email: contactData.email,
          vertical: contactData.vertical,
          lead_status: contactData.lead_status,
          fleet_size: contactData.fleet_size
        };
        
        // Reset contact to "blank" state
        await supabase
          .from('contacts')
          .update({
            name: null,
            call_name: null,
            company: null,
            cnpj: null,
            email: null,
            vertical: null,
            fleet_size: null,
            lead_status: 'new',
            lead_source: 'reused_number',
            client_memory: {
              last_updated: new Date().toISOString(),
              lead_profile: {
                interests: [],
                lead_stage: 'new',
                objections: [],
                products_discussed: [],
                communication_style: 'unknown',
                qualification_score: 0
              },
              sales_intelligence: {
                pain_points: [],
                next_best_action: 'qualify',
                budget_indication: 'unknown',
                decision_timeline: 'unknown'
              },
              interaction_summary: {
                response_pattern: 'unknown',
                last_contact_reason: '',
                total_conversations: 0,
                preferred_contact_time: 'unknown'
              },
              conversation_history: [],
              previous_owner_data: previousContactData,
              number_owner_changed_at: new Date().toISOString()
            }
          })
          .eq('id', conversation.contact_id);
        
        console.log(`[Nina] 🔄 Contact data reset - number changed owner`);
        console.log(`[Nina] 📦 Previous owner data archived:`, JSON.stringify(previousContactData));
        
        // Update conversation context for new owner name capture
        await supabase
          .from('conversations')
          .update({
            status: 'nina',
            nina_context: {
              number_owner_changed: true,
              previous_owner_archived: true,
              awaiting_new_owner_name: true,
              reset_at: new Date().toISOString()
            }
          })
          .eq('id', conversation.id);
      }

      // 5. Disparar envio da mensagem (se houver resposta)
      if (disqualCategory.response) {
        try {
          const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
          fetch(senderUrl, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json', 
              'Authorization': `Bearer ${supabaseServiceKey}` 
            },
            body: JSON.stringify({ triggered_by: `nina-orchestrator-${disqualCategory.key}` })
          }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
        } catch (e) {
          console.error('[Nina] Failed to trigger whatsapp-sender:', e);
        }
      }
      
      console.log(`[Nina] ✅ ${disqualCategory.key} handled - conversation ${disqualCategory.pauseConversation ? 'paused' : 'active'}`);
      return;
      }
    } // End of else block for disqualification check
  }
  // ===== END AUTOMATIC DISQUALIFICATION DETECTION =====

  // ===== OUT OF SCOPE INSURANCE DETECTION - HANDOFF TO SOFIA =====
  // Detect when lead asks for insurance types outside transport scope
  if (message.content && agent) {
    const outOfScopeCheck = detectOutOfScopeInsurance(message.content, agent.slug);
    
    if (outOfScopeCheck.isOutOfScope) {
      console.log(`[Nina] 🔄 Out of scope insurance detected: ${outOfScopeCheck.insuranceType} - "${outOfScopeCheck.detectedKeyword}"`);
      
      // Find Sofia agent
      const sofiaAgent = agents.find((a: Agent) => a.slug === 'sofia');
      
      if (sofiaAgent) {
        console.log(`[Nina] 🤖 Handoff to Sofia for ${outOfScopeCheck.friendlyName}`);
        
        // Update conversation to use Sofia agent and store detected insurance type
        const updatedContext = {
          ...ninaContext,
          out_of_scope_insurance: outOfScopeCheck.insuranceType,
          out_of_scope_friendly_name: outOfScopeCheck.friendlyName,
          out_of_scope_detected_at: new Date().toISOString(),
          handoff_from_agent: agent.name
        };
        
        await supabase
          .from('conversations')
          .update({ 
            current_agent_id: sofiaAgent.id,
            nina_context: updatedContext
          })
          .eq('id', conversation.id);
        
        // Generate Sofia's greeting based on insurance type
        let sofiaGreeting = `Olá! Sou a Sofia, especialista em ${outOfScopeCheck.friendlyName} da Jacometo. `;
        
        // Add first qualification question based on type
        switch (outOfScopeCheck.insuranceType) {
          case 'auto':
            sofiaGreeting += 'Qual veículo você quer segurar? (marca/modelo/ano)';
            break;
          case 'residencial':
            sofiaGreeting += 'É casa ou apartamento?';
            break;
          case 'vida':
            sofiaGreeting += 'O seguro seria individual ou para um grupo?';
            break;
          case 'viagem':
            sofiaGreeting += 'Para qual destino você vai viajar e por quantos dias?';
            break;
          case 'empresarial':
            sofiaGreeting += 'Qual tipo de negócio você tem?';
            break;
          case 'frota_geral':
            sofiaGreeting += 'Quantos veículos tem na frota?';
            break;
          default:
            sofiaGreeting += 'Me conta mais sobre o que você precisa proteger?';
        }
        
        // Calculate delay
        const delayMin = settings?.response_delay_min || 1000;
        const delayMax = settings?.response_delay_max || 3000;
        const delay = Math.random() * (delayMax - delayMin) + delayMin;
        
        // Get AI settings for metadata
        const aiSettings = getModelSettings(settings, [], message, conversation.contact, {});
        
        // Queue Sofia's greeting
        await queueTextResponse(supabase, conversation, message, sofiaGreeting, settings, aiSettings, delay, sofiaAgent);
        
        // Mark message as processed
        const responseTime = Date.now() - new Date(message.sent_at).getTime();
        await supabase
          .from('messages')
          .update({ 
            processed_by_nina: true,
            nina_response_time: responseTime
          })
          .eq('id', message.id);
        
        // Update deal - move to "Outros Seguros" pipeline
        const { data: currentDeal } = await supabase
          .from('deals')
          .select('id, notes')
          .eq('contact_id', conversation.contact_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (currentDeal) {
          // Buscar pipeline "Outros Seguros"
          const { data: outrosSeguros } = await supabase
            .from('pipelines')
            .select('id')
            .eq('slug', 'outros-seguros')
            .single();
          
          let updateData: Record<string, unknown> = {};
          const existingNotes = currentDeal.notes || '';
          const newNote = `[${new Date().toLocaleDateString('pt-BR')}] Lead solicitou ${outOfScopeCheck.friendlyName} - transferido para Sofia`;
          updateData.notes = existingNotes ? `${existingNotes}\n\n${newNote}` : newNote;
          
          if (outrosSeguros) {
            // Buscar primeiro estágio do pipeline "Outros Seguros"
            const { data: firstStage } = await supabase
              .from('pipeline_stages')
              .select('id')
              .eq('pipeline_id', outrosSeguros.id)
              .order('position', { ascending: true })
              .limit(1)
              .single();
            
            updateData.pipeline_id = outrosSeguros.id;
            if (firstStage) {
              updateData.stage_id = firstStage.id;
            }
            console.log(`[Nina] 📦 Moving deal to "Outros Seguros" pipeline`);
          }
          
          await supabase
            .from('deals')
            .update(updateData)
            .eq('id', currentDeal.id);
        }
        
        // Trigger whatsapp-sender
        try {
          const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
          fetch(senderUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify({ triggered_by: 'nina-orchestrator-sofia-handoff' })
          }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
        } catch (e) {
          console.error('[Nina] Failed to trigger whatsapp-sender:', e);
        }
        
        console.log(`[Nina] ✅ Out of scope insurance handled, handed off to Sofia`);
        return;
      } else {
        // Sofia not found - fallback to human
        console.log(`[Nina] ⚠️ Sofia agent not found, transferring to human`);
        
        const fallbackMessage = `Obrigada pelo contato! Para ${outOfScopeCheck.friendlyName}, vou encaminhar para um de nossos corretores especializados que vai te ajudar.`;
        
        const delayMin = settings?.response_delay_min || 1000;
        const delayMax = settings?.response_delay_max || 3000;
        const delay = Math.random() * (delayMax - delayMin) + delayMin;
        const aiSettings = getModelSettings(settings, [], message, conversation.contact, {});
        
        await queueTextResponse(supabase, conversation, message, fallbackMessage, settings, aiSettings, delay, agent);
        
        await supabase
          .from('conversations')
          .update({ 
            status: 'human',
            nina_context: {
              ...ninaContext,
              out_of_scope_insurance: outOfScopeCheck.insuranceType,
              transferred_to_human_at: new Date().toISOString()
            }
          })
        .eq('id', conversation.id);
        
        // Generate handoff summary in background
        try {
          const summaryUrl = `${supabaseUrl}/functions/v1/generate-handoff-summary`;
          fetch(summaryUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify({
              conversationId: conversation.id,
              contactId: conversation.contact_id,
              agentSlug: agent?.slug || 'atlas',
              qualificationData: { out_of_scope_insurance: outOfScopeCheck.insuranceType }
            })
          }).catch(err => console.error('[Nina] Error generating handoff summary:', err));
        } catch (e) {
          console.error('[Nina] Failed to trigger handoff summary:', e);
        }
        
        const responseTime = Date.now() - new Date(message.sent_at).getTime();
        await supabase
          .from('messages')
          .update({ 
            processed_by_nina: true,
            nina_response_time: responseTime
          })
          .eq('id', message.id);
        
        try {
          const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
          fetch(senderUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify({ triggered_by: 'nina-orchestrator-out-of-scope-fallback' })
          }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
        } catch (e) {
          console.error('[Nina] Failed to trigger whatsapp-sender:', e);
        }
        
        return;
      }
    }
  }
  // ===== END OUT OF SCOPE INSURANCE DETECTION =====

  // ===== REFERRAL CONTACT DETECTION (Atlas prospecting only) =====
  // Detect when lead provides phone number/name of responsible party - pause for human follow-up
  if (message.content && agent?.slug === 'atlas') {
    const referralCheck = detectReferralContact(message.content);
    
    if (referralCheck.hasReferralContact) {
      console.log(`[Nina] 📞 REFERRAL CONTACT DETECTED for Atlas prospecting`);
      console.log(`[Nina]   Phone: ${referralCheck.phoneNumber}`);
      console.log(`[Nina]   Referral Name: ${referralCheck.referralName || 'not detected'}`);
      console.log(`[Nina]   Matched Keyword: ${referralCheck.matchedKeyword}`);
      
      // Respostas de agradecimento profissionais (variadas)
      const thankYouResponses = [
        "Perfeito! Obrigado pela informação. Vou repassar para nossa equipe entrar em contato diretamente com a pessoa responsável. Tenha um ótimo dia! 🙏",
        "Excelente! Agradeço por compartilhar o contato. Nossa equipe vai entrar em contato com a pessoa responsável em breve. Obrigado pela atenção! 👍",
        "Ótimo! Obrigado por me direcionar. Vou passar essa informação para que nossa equipe entre em contato direto com o responsável. Até breve! ✨",
        "Entendido! Muito obrigado pela informação. Nossa equipe comercial vai fazer contato direto com o responsável. Agradeço sua colaboração! 🤝"
      ];
      
      const selectedResponse = thankYouResponses[Math.floor(Math.random() * thankYouResponses.length)];
      
      // 1. Salvar contato do responsável no deal/notes
      const { data: currentDeal } = await supabase
        .from('deals')
        .select('id, notes')
        .eq('contact_id', conversation.contact_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (currentDeal) {
        const newNote = `📞 CONTATO DO RESPONSÁVEL FORNECIDO:\n` +
          `Telefone: ${referralCheck.phoneNumber}\n` +
          (referralCheck.referralName ? `Nome: ${referralCheck.referralName}\n` : '') +
          `Data: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`;
        
        await supabase
          .from('deals')
          .update({
            notes: currentDeal.notes ? `${currentDeal.notes}\n\n${newNote}` : newNote
          })
          .eq('id', currentDeal.id);
        
        console.log(`[Nina] 📝 Referral contact saved to deal notes`);
      }
      
      // 2. Salvar na memória do contato
      const clientMemory = conversation.contact?.client_memory || {};
      await supabase
        .from('contacts')
        .update({
          client_memory: {
            ...clientMemory,
            referral_contact: {
              phone: referralCheck.phoneNumber,
              name: referralCheck.referralName,
              provided_at: new Date().toISOString(),
              original_message: message.content?.substring(0, 200)
            }
          }
        })
        .eq('id', conversation.contact_id);
      
      console.log(`[Nina] 💾 Referral contact saved to client_memory`);
      
      // 3. Enviar resposta de agradecimento
      const delayMin = settings?.response_delay_min || 1000;
      const delayMax = settings?.response_delay_max || 3000;
      const delay = Math.random() * (delayMax - delayMin) + delayMin;
      const aiSettings = getModelSettings(settings, [], message, conversation.contact, {});
      
      await queueTextResponse(supabase, conversation, message, selectedResponse, settings, aiSettings, delay, agent);
      
      // 4. PAUSAR conversa para humano assumir
      const updatedNinaContext = {
        ...(ninaContext || {}),
        referral_contact_received: true,
        referral_phone: referralCheck.phoneNumber,
        referral_name: referralCheck.referralName,
        paused_reason: 'referral_contact_provided',
        paused_at: new Date().toISOString(),
        followup_stopped: true  // Parar follow-ups automáticos
      };
      
      await supabase
        .from('conversations')
        .update({
          status: 'paused',
          nina_context: updatedNinaContext
        })
        .eq('id', conversation.id);
      
      console.log(`[Nina] ⏸️ Conversation PAUSED - referral contact provided, human follow-up required`);
      
      // 5. Marcar mensagem como processada
      const responseTime = Date.now() - new Date(message.sent_at).getTime();
      await supabase
        .from('messages')
        .update({ 
          processed_by_nina: true,
          nina_response_time: responseTime
        })
        .eq('id', message.id);
      
      // 6. Disparar envio da mensagem
      try {
        const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
        fetch(senderUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({ triggered_by: 'nina-orchestrator-referral-contact' })
        }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
      } catch (e) {
        console.error('[Nina] Failed to trigger whatsapp-sender:', e);
      }
      
      console.log(`[Nina] ✅ Referral contact handled - conversation PAUSED for human follow-up`);
      return;
    }
  }
  // ===== END REFERRAL CONTACT DETECTION =====

  // ===== CALLBACK REQUEST DETECTION =====
  // Detect when lead wants to be called back at a specific time
  if (message.content) {
    const callbackIntent = detectCallbackIntent(message.content);
    
    if (callbackIntent.hasIntent) {
      console.log(`[Nina] 📞 Callback intent detected: "${message.content}"`);
      
      // Get the pipeline for this conversation's deal
      const { data: deal } = await supabase
        .from('deals')
        .select('id, pipeline_id')
        .eq('contact_id', conversation.contact_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (deal) {
        // Calculate the scheduled callback time
        const scheduledAt = calculateNextBusinessHour(callbackIntent.suggestedDate, callbackIntent.suggestedTime);
        
        // Get next assignee using round-robin
        const assignee = await getNextAssignee(supabase, deal.pipeline_id);
        
        // Create the callback activity
        const created = await createCallbackActivity(
          supabase,
          conversation.contact_id,
          deal.pipeline_id,
          scheduledAt,
          message.content,
          assignee
        );
        
        if (created) {
          // Generate response with scheduled date and period (not exact time)
          const formattedDate = scheduledAt.toLocaleDateString('pt-BR', { 
            weekday: 'long', 
            day: '2-digit', 
            month: 'long',
            timeZone: 'America/Sao_Paulo'
          });
          
          // Determine period of day based on scheduled hour
          const scheduledHour = scheduledAt.getHours();
          let periodText = '';
          if (scheduledHour < 12) {
            periodText = 'pela manhã';
          } else if (scheduledHour < 18) {
            periodText = 'à tarde';
          } else {
            periodText = 'no fim do dia';
          }
          
          const contactName = normalizeContactName(conversation.contact?.call_name || conversation.contact?.name);
          const displayName = contactName !== 'Cliente' ? contactName : 'você';
          let responseText = `Perfeito, ${displayName}! `;
          
          if (assignee) {
            responseText += `${assignee.name} vai entrar em contato ${formattedDate}, ${periodText}.`;
          } else {
            responseText += `Vamos entrar em contato ${formattedDate}, ${periodText}.`;
          }
          
          // Calculate delay
          const delayMin = settings?.response_delay_min || 1000;
          const delayMax = settings?.response_delay_max || 3000;
          const delay = Math.random() * (delayMax - delayMin) + delayMin;
          
          // Get AI settings for metadata
          const aiSettings = getModelSettings(settings, [], message, conversation.contact, {});
          
          // Queue the confirmation response
          await queueTextResponse(supabase, conversation, message, responseText, settings, aiSettings, delay, agent);
          
          // Mark message as processed
          const responseTime = Date.now() - new Date(message.sent_at).getTime();
          await supabase
            .from('messages')
            .update({ 
              processed_by_nina: true,
              nina_response_time: responseTime
            })
            .eq('id', message.id);
          
          // Trigger whatsapp-sender
          try {
            const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
            fetch(senderUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseServiceKey}`
              },
              body: JSON.stringify({ triggered_by: 'nina-orchestrator-callback-scheduled' })
            }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
          } catch (e) {
            console.error('[Nina] Failed to trigger whatsapp-sender:', e);
          }
          
          console.log(`[Nina] ✅ Callback scheduled for ${scheduledAt.toISOString()}, assigned to ${assignee?.name || 'unassigned'}`);
          return;
        }
      }
      // If we couldn't create the callback, continue with normal processing
      console.log('[Nina] Could not create callback activity, continuing with normal flow');
    }
  }
  // ===== END CALLBACK REQUEST DETECTION =====

  // If this is a prospecting conversation and lead responded (not rejection), move to Em Qualificação
  if (conversationMetadata.origin === 'prospeccao' && message.content) {
    const { data: prospectingPipeline } = await supabase
      .from('pipelines')
      .select('id')
      .eq('slug', 'prospeccao')
      .single();
    
    if (prospectingPipeline) {
      const { data: qualifyingStage } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('pipeline_id', prospectingPipeline.id)
        .eq('title', 'Em Qualificação')
        .single();
      
      if (qualifyingStage) {
        await supabase
          .from('deals')
          .update({ stage_id: qualifyingStage.id })
          .eq('contact_id', conversation.contact_id)
          .eq('pipeline_id', prospectingPipeline.id);
        
        console.log(`[Nina] 📊 Prospecting deal moved to Em Qualificação`);
      }
    }
    
    // ===== PROSPECTING TEMPLATE RESPONSE DETECTION =====
    // Check if last Nina message was a prospecting template and user is responding
    const { data: lastNinaMessages } = await supabase
      .from('messages')
      .select('id, content, metadata, from_type, created_at')
      .eq('conversation_id', conversation.id)
      .eq('from_type', 'nina')
      .order('created_at', { ascending: false })
      .limit(2);
    
    const lastNinaMessage = lastNinaMessages?.[0];
    const isProspectingTemplateResponse = lastNinaMessage?.metadata?.is_template === true || 
                                           lastNinaMessage?.metadata?.is_prospecting === true ||
                                           // Also check if it's the first user response in a prospecting conversation
                                           (lastNinaMessages?.length === 1 && conversationMetadata.origin === 'prospeccao');
    
    if (isProspectingTemplateResponse) {
      console.log(`[Nina] 🎯 Prospecting template response detected - user replied to template`);
      console.log(`[Nina] 🎯 User message: "${message.content?.substring(0, 50)}..."`);
      
      // Check for common "what is this about?" type questions
      const userMsgLower = message.content?.toLowerCase() || '';
      const isWhatAboutQuestion = /qual\s*(é|e)?\s*(o)?\s*(assunto|setor|referente|motivo|sobre|objetivo)|o que|do que|pra que|sobre o que|em que posso|como posso|quem|oque/i.test(userMsgLower);
      
      if (isWhatAboutQuestion) {
        console.log(`[Nina] 🎯 User asking "what is this about?" - forcing full presentation`);
        
        // Force a complete introduction response
        const contactName = normalizeContactName(conversation.contact?.call_name || conversation.contact?.name);
        const prospectingIntroMessage = contactName !== 'Cliente'
          ? `Oi, ${contactName}! Somos da Jacometo Seguros, uma corretora especializada em seguros para transportadoras.\n\nEntramos em contato pois trabalhamos com proteção de cargas e frotas para empresas de transporte. Você é o responsável por essa área na empresa?`
          : `Oi! Somos da Jacometo Seguros, uma corretora especializada em seguros para transportadoras.\n\nEntramos em contato pois trabalhamos com proteção de cargas e frotas para empresas de transporte. Você é o responsável por essa área na empresa?`;
        
        // Calculate delay
        const delayMin = settings?.response_delay_min || 1000;
        const delayMax = settings?.response_delay_max || 3000;
        const delay = Math.random() * (delayMax - delayMin) + delayMin;
        
        // Get AI settings for metadata
        const aiSettings = getModelSettings(settings, [], message, conversation.contact, {});
        
        // Queue the prospecting introduction message
        await queueTextResponse(supabase, conversation, message, prospectingIntroMessage, settings, aiSettings, delay, agent);
        
        // Mark message as processed
        const responseTime = Date.now() - new Date(message.sent_at).getTime();
        await supabase
          .from('messages')
          .update({ 
            processed_by_nina: true,
            nina_response_time: responseTime
          })
          .eq('id', message.id);
        
        // Trigger whatsapp-sender
        try {
          const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
          fetch(senderUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify({ triggered_by: 'nina-orchestrator-prospecting-intro' })
          }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
        } catch (e) {
          console.error('[Nina] Failed to trigger whatsapp-sender:', e);
        }
        
        console.log(`[Nina] ✅ Prospecting introduction sent, skipping AI call`);
        return;
      }
    }
    // ===== END PROSPECTING TEMPLATE RESPONSE DETECTION =====
  }
  // ===== END PROSPECTING STAGE UPDATE =====

  // Update conversation with current agent if changed
  if (agent && conversation.current_agent_id !== agent.id) {
    await supabase
      .from('conversations')
      .update({ current_agent_id: agent.id })
      .eq('id', conversation.id);
    console.log(`[Nina] Updated conversation agent to: ${agent.name}`);

    // Auto-add "Plano de Saúde" tag for Clara agent
    await addHealthPlanTagIfClara(
      supabase, 
      conversation.contact_id, 
      agent.slug, 
      conversation.contact?.tags
    );

    // Move deal to agent's pipeline if this is a handoff
    if (isHandoff) {
      const { data: agentPipeline } = await supabase
        .from('pipelines')
        .select('id, name')
        .eq('agent_id', agent.id)
        .eq('is_active', true)
        .maybeSingle();

      if (agentPipeline) {
        const { data: firstStage } = await supabase
          .from('pipeline_stages')
          .select('id')
          .eq('pipeline_id', agentPipeline.id)
          .eq('is_active', true)
          .order('position', { ascending: true })
          .limit(1)
          .maybeSingle();

        if (firstStage) {
          // Get next owner based on agent distribution (round_robin or fixed)
          const { data: nextOwnerId } = await supabase.rpc('get_next_deal_owner', { 
            p_agent_id: agent.id 
          });
          
          await supabase
            .from('deals')
            .update({ 
              pipeline_id: agentPipeline.id,
              stage_id: firstStage.id,
              owner_id: nextOwnerId || null
            })
            .eq('contact_id', conversation.contact_id);
          
          console.log(`[Nina] Deal movido para pipeline: ${agentPipeline.name}, owner: ${nextOwnerId || 'not assigned'}`);
          
          // Also ensure tag is added when deal moves to health pipeline
          const { data: currentContact } = await supabase
            .from('contacts')
            .select('tags')
            .eq('id', conversation.contact_id)
            .maybeSingle();
          
          await addHealthPlanTagIfClara(
            supabase, 
            conversation.contact_id, 
            agent.slug, 
            currentContact?.tags
          );
        }
      }
    }

    // ===== VOICE QUALIFICATION TRIGGER FOR IRIS =====
    if (agent.slug === 'iris' && isHandoff) {
      try {
        // Check if there's already a pending/calling voice qualification for this contact
        const { data: existingVQ } = await supabase
          .from('voice_qualifications')
          .select('id, status')
          .eq('contact_id', conversation.contact_id)
          .in('status', ['pending', 'scheduled', 'calling'])
          .maybeSingle();

        if (!existingVQ) {
          // Get the deal for this contact
          const { data: contactDeal } = await supabase
            .from('deals')
            .select('id')
            .eq('contact_id', conversation.contact_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          // Schedule voice qualification call in 5 minutes
          const scheduledFor = new Date(Date.now() + 5 * 60 * 1000);
          await supabase
            .from('voice_qualifications')
            .insert({
              contact_id: conversation.contact_id,
              deal_id: contactDeal?.id || null,
              agent_id: agent.id,
              scheduled_for: scheduledFor.toISOString(),
              status: 'pending',
            });
          
          console.log(`[Nina][Iris] 📞 Voice qualification scheduled for contact ${conversation.contact_id} at ${scheduledFor.toISOString()}`);
        } else {
          console.log(`[Nina][Iris] ⏭️ Voice qualification already exists (${existingVQ.status}) for contact ${conversation.contact_id}`);
        }
      } catch (vqError) {
        console.error('[Nina][Iris] Error scheduling voice qualification:', vqError);
      }
    }
    // ===== END VOICE QUALIFICATION TRIGGER =====
  }

  // ===== ENSURE DEAL HAS OWNER (even without handoff) =====
  // Check if current deal has no owner and assign one based on agent
  if (agent) {
    const { data: currentDeal } = await supabase
      .from('deals')
      .select('id, owner_id')
      .eq('contact_id', conversation.contact_id)
      .is('owner_id', null)
      .maybeSingle();

    if (currentDeal) {
      const { data: nextOwnerId } = await supabase.rpc('get_next_deal_owner', { 
        p_agent_id: agent.id 
      });
      
      if (nextOwnerId) {
        await supabase
          .from('deals')
          .update({ owner_id: nextOwnerId })
          .eq('id', currentDeal.id);
        
        console.log(`[Nina] 👤 Auto-assigned owner ${nextOwnerId} to deal ${currentDeal.id} (first assignment)`);
      }
    }
  }

  // ===== RETURNING LEAD DETECTION =====
  // Detect if this is a returning lead (conversation was reactivated)
  const conversationCreatedAt = new Date(conversation.created_at);
  const conversationUpdatedAt = new Date(conversation.updated_at);
  const lastMessageAt = new Date(conversation.last_message_at || conversation.updated_at);
  
  // Calculate days since last contact (before current message)
  const hoursSinceLastMessage = message.sent_at 
    ? (new Date(message.sent_at).getTime() - lastMessageAt.getTime()) / (1000 * 60 * 60)
    : 0;
  const daysSinceLastContact = Math.floor(hoursSinceLastMessage / 24);
  
  // Consider returning lead if:
  // 1. Conversation existed for more than 1 day
  // 2. Last activity was more than 1 day ago
  const conversationAgeHours = (Date.now() - conversationCreatedAt.getTime()) / (1000 * 60 * 60);
  const isReturningLead = conversationAgeHours > 24 && daysSinceLastContact >= 1;
  
  // Expand message history for returning leads
  const messageLimit = isReturningLead ? 50 : 20;
  
  console.log(`[Nina] 📊 Returning lead check: conversationAge=${Math.round(conversationAgeHours)}h, daysSinceLastContact=${daysSinceLastContact}, isReturning=${isReturningLead}, messageLimit=${messageLimit}`);
  
  // Get recent messages for context
  const { data: recentMessages } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversation.id)
    .order('sent_at', { ascending: false })
    .limit(messageLimit);

  // ===== DETECT PREVIOUS TOPICS FOR RETURNING LEADS =====
  let previousTopics: string[] = [];
  let returningLeadContext: { hasJobInquiry: boolean; hasInsuranceInquiry: boolean; wasRejected: boolean; rejectionReason: string | null } = {
    hasJobInquiry: false,
    hasInsuranceInquiry: false,
    wasRejected: false,
    rejectionReason: null
  };
  
  if (isReturningLead && recentMessages && recentMessages.length > 5) {
    console.log('[Nina] 🔍 Analyzing previous conversation topics for returning lead...');
    
    const allMessageContents = recentMessages.map((m: any) => m.content?.toLowerCase() || '').join(' ');
    
    // Detect job/resume inquiry
    const jobKeywords = /emprego|curriculo|currículo|vaga|trabalho|trabalhar|contrat|motorista|operador|experiência|experiencia|contratar|CLT/i;
    if (jobKeywords.test(allMessageContents)) {
      previousTopics.push('emprego/currículo');
      returningLeadContext.hasJobInquiry = true;
    }
    
    // Detect insurance inquiry
    const insuranceKeywords = /seguro|cotação|cotacao|cotar|apólice|apolice|rctr|cobertura|sinistro|carga/i;
    if (insuranceKeywords.test(allMessageContents)) {
      previousTopics.push('seguro');
      returningLeadContext.hasInsuranceInquiry = true;
    }
    
    // Detect if was rejected/dismissed previously
    const rejectionPatterns = [
      { regex: /não (temos|estamos|trabalhamos com) vagas?/i, reason: 'Não temos vagas disponíveis' },
      { regex: /não (temos|estamos|trabalhamos com) essa modalidade/i, reason: 'Modalidade não atendida' },
      { regex: /no momento não/i, reason: 'Não disponível no momento' },
      { regex: /infelizmente não (podemos|conseguimos)/i, reason: 'Não foi possível atender' },
      { regex: /não é nosso (foco|segmento)/i, reason: 'Fora do segmento' }
    ];
    
    // Check Nina messages for rejections
    const ninaMessages = recentMessages.filter((m: any) => m.from_type === 'nina');
    for (const msg of ninaMessages) {
      const content = msg.content?.toLowerCase() || '';
      for (const pattern of rejectionPatterns) {
        if (pattern.regex.test(content)) {
          previousTopics.push('foi_dispensado');
          returningLeadContext.wasRejected = true;
          returningLeadContext.rejectionReason = pattern.reason;
          break;
        }
      }
      if (returningLeadContext.wasRejected) break;
    }
    
    console.log(`[Nina] 🔍 Previous topics detected: ${previousTopics.length > 0 ? previousTopics.join(', ') : 'nenhum'}`);
  }
  // ===== END RETURNING LEAD DETECTION =====

  // Build conversation history for AI (sanitize names to prevent CAPS/full name repetition)
  const conversationHistory = (recentMessages || [])
    .reverse()
    .map((msg: any) => ({
      role: msg.from_type === 'user' ? 'user' : 'assistant',
      content: sanitizeNameInHistory(msg.content || '[media]', conversation.contact)
    }));

  // Get client memory
  const clientMemory = conversation.contact?.client_memory || {};

  // ===== CNPJ CONFIRMATION RESPONSE DETECTION =====
  // Check if IMMEDIATELY PREVIOUS assistant message was a CNPJ confirmation request
  // recentMessages is in DESC order (newest first), so:
  // 1. Find the current message index
  // 2. Get the next nina message after it (which is the one immediately before in time)
  const currentMessageIndex = (recentMessages || []).findIndex((m: any) => m.id === message.id);
  const immediatelyPreviousNinaMessage = currentMessageIndex >= 0 
    ? (recentMessages || []).slice(currentMessageIndex + 1).find((m: any) => m.from_type === 'nina')
    : null;
  
  const isConfirmationResponse = immediatelyPreviousNinaMessage?.content?.includes('Encontrei:') && 
                                  immediatelyPreviousNinaMessage?.content?.includes('Está correto?');
  
  if (isConfirmationResponse && message.content) {
    const userResponse = message.content.toLowerCase().trim();
    
    // Check for positive confirmation
    const positiveResponses = ['sim', 'confirmo', 'isso', 'correto', 'certo', 'isso mesmo', 'é isso', 'exato', 'exatamente', 's', 'ss', 'sss', 'simmm', 'simm', 'isso aí', 'isso ai', 'certinho', 'é esse', 'é essa', 'é sim', 'é'];
    const isPositive = positiveResponses.some(r => userResponse === r || userResponse.startsWith(r + ' ') || userResponse.endsWith(' ' + r));
    
    // Check for negative response with company correction
    const negativeResponses = ['não', 'nao', 'n', 'nn', 'nnn', 'errado', 'incorreto', 'não é', 'nao é', 'não, é', 'nao, é', 'na verdade', 'na vdd'];
    const isNegative = negativeResponses.some(r => userResponse.startsWith(r));
    
    if (isPositive) {
      console.log(`[Nina] ✅ Client confirmed company name`);
      
      // Continue with qualification - let AI continue the conversation
      // No early return - flow continues to AI processing
      
    } else if (isNegative) {
      console.log(`[Nina] ❌ Client rejected company name, checking for correction...`);
      
      // Try to extract the correct company name from the response
      // Common patterns: "Não, é XYZ", "Na verdade é XYZ", "É [company name]"
      const correctionPatterns = [
        /(?:não|nao|na verdade|na vdd)[,\s]+(?:é|e|o nome é|a empresa é|é a|nome é)\s+(.+)/i,
        /(?:é|o nome é|a empresa é)\s+(.+)/i,
        /(?:não|nao)[,\s]+(.+)/i
      ];
      
      let correctedName: string | null = null;
      for (const pattern of correctionPatterns) {
        const match = userResponse.match(pattern);
        if (match && match[1]) {
          const rawName = match[1].trim();
          // Clean up common trailing words
          correctedName = rawName.replace(/\s*(mesmo|sim|ok|tá|ta|beleza)$/i, '').trim();
          break;
        }
      }
      
      if (correctedName && correctedName.length > 2) {
        // Update contact with corrected company name
        await supabase
          .from('contacts')
          .update({ 
            company: correctedName.toUpperCase(),
            updated_at: new Date().toISOString() 
          })
          .eq('id', conversation.contact_id);
        
        console.log(`[Nina] 📝 Company name corrected to: ${correctedName.toUpperCase()}`);
        
        // Send acknowledgment message
        const ackMessage = `Anotado: ${correctedName.toUpperCase()}.`;
        
        // Calculate delay
        const delayMin = settings?.response_delay_min || 1000;
        const delayMax = settings?.response_delay_max || 3000;
        const delay = Math.random() * (delayMax - delayMin) + delayMin;
        
        // Get AI settings for metadata
        const aiSettings = getModelSettings(settings, conversationHistory, message, conversation.contact, clientMemory);
        
        // Queue the acknowledgment message
        await queueTextResponse(supabase, conversation, message, ackMessage, settings, aiSettings, delay, agent);
        
        // Mark message as processed
        const responseTime = Date.now() - new Date(message.sent_at).getTime();
        await supabase
          .from('messages')
          .update({ 
            processed_by_nina: true,
            nina_response_time: responseTime
          })
          .eq('id', message.id);
        
        // Trigger whatsapp-sender
        try {
          const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
          fetch(senderUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify({ triggered_by: 'nina-orchestrator-cnpj-correction' })
          }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
        } catch (e) {
          console.error('[Nina] Failed to trigger whatsapp-sender:', e);
        }
        
        console.log(`[Nina] 📋 Company correction acknowledged`);
        return; // Return early, next message will continue qualification
      }
      // If we couldn't extract a correction, let AI handle the response naturally
    }
  }
  // ===== END CNPJ CONFIRMATION RESPONSE DETECTION =====

  // ===== IMMEDIATE CNPJ DETECTION WITH CONFIRMATION =====
  // Detect CNPJ in user message, fetch company data, and ask for confirmation
  if (message.content) {
    const cnpjRegex = /(\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\s]?\d{4}[-\.\s]?\d{2})/g;
    const cnpjMatch = message.content.match(cnpjRegex);
    
    if (cnpjMatch) {
      const cleanCnpj = cnpjMatch[0].replace(/\D/g, '');
      if (cleanCnpj.length === 14) {
        console.log(`[Nina] 📋 CNPJ detected in message: ${cleanCnpj}`);
        
        // Check if contact already has this CNPJ
        const existingCnpj = conversation.contact?.cnpj?.replace(/\D/g, '');
        if (existingCnpj !== cleanCnpj) {
          // Fetch company data from BrasilAPI
          try {
            const brasilApiResponse = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
            if (brasilApiResponse.ok) {
              const cnpjData = await brasilApiResponse.json();
              const companyName = cnpjData.nome_fantasia || cnpjData.razao_social;
              
              // Update contact with CNPJ and company name
              const updateData: Record<string, any> = { 
                cnpj: cleanCnpj,
                updated_at: new Date().toISOString() 
              };
              
              if (companyName) {
                updateData.company = companyName;
              }
              
              await supabase
                .from('contacts')
                .update(updateData)
                .eq('id', conversation.contact_id);
                
              console.log(`[Nina] ✅ Contact updated - CNPJ: ${cleanCnpj}, Company: ${companyName || 'N/A'}`);
              
              // If we got company name, send confirmation message and return early
              if (companyName) {
                const confirmationMessage = `Encontrei: ${companyName.toUpperCase()}. Está correto?`;
                
                // Calculate delay
                const delayMin = settings?.response_delay_min || 1000;
                const delayMax = settings?.response_delay_max || 3000;
                const delay = Math.random() * (delayMax - delayMin) + delayMin;
                
                // Get AI settings for metadata
                const aiSettings = getModelSettings(settings, conversationHistory, message, conversation.contact, clientMemory);
                
                // Queue the confirmation message
                await queueTextResponse(supabase, conversation, message, confirmationMessage, settings, aiSettings, delay, agent);
                
                // Mark message as processed
                const responseTime = Date.now() - new Date(message.sent_at).getTime();
                await supabase
                  .from('messages')
                  .update({ 
                    processed_by_nina: true,
                    nina_response_time: responseTime
                  })
                  .eq('id', message.id);
                
                // Trigger whatsapp-sender
                try {
                  const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
                  fetch(senderUrl, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${supabaseServiceKey}`
                    },
                    body: JSON.stringify({ triggered_by: 'nina-orchestrator-cnpj-confirmation' })
                  }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
                } catch (e) {
                  console.error('[Nina] Failed to trigger whatsapp-sender:', e);
                }
                
                console.log(`[Nina] 📋 CNPJ confirmation message queued for ${companyName}`);
                return new Response(JSON.stringify({ 
                  success: true, 
                  action: 'cnpj_confirmation_sent',
                  company: companyName
                }), {
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
              }
            } else {
              // BrasilAPI failed but still save the CNPJ
              await supabase
                .from('contacts')
                .update({ 
                  cnpj: cleanCnpj,
                  updated_at: new Date().toISOString() 
                })
                .eq('id', conversation.contact_id);
                
              console.log(`[Nina] ⚠️ CNPJ saved (BrasilAPI lookup failed): ${cleanCnpj}`);
            }
          } catch (err) {
            console.log('[Nina] ⚠️ BrasilAPI error, saving CNPJ anyway:', err);
            // Still save the CNPJ even if BrasilAPI fails
            await supabase
              .from('contacts')
              .update({ 
                cnpj: cleanCnpj,
                updated_at: new Date().toISOString() 
              })
              .eq('id', conversation.contact_id);
          }
        } else {
          console.log(`[Nina] CNPJ already saved: ${cleanCnpj}`);
        }
      }
    }
  }
  // ===== END CNPJ DETECTION =====

  // ===== IMMEDIATE EMAIL DETECTION =====
  // Detect email in user message and save to contact automatically
  if (message.content) {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
    const emailMatch = message.content.match(emailRegex);
    
    if (emailMatch) {
      const detectedEmail = emailMatch[0].toLowerCase();
      console.log(`[Nina] 📧 Email detected in message: ${detectedEmail}`);
      
      // Check if contact already has this email
      const existingEmail = conversation.contact?.email?.toLowerCase();
      if (existingEmail !== detectedEmail) {
        // Update contact with email
        const { error: emailUpdateError } = await supabase
          .from('contacts')
          .update({ 
            email: detectedEmail,
            updated_at: new Date().toISOString() 
          })
          .eq('id', conversation.contact_id);
          
        if (emailUpdateError) {
          console.error(`[Nina] ❌ Error updating contact email:`, emailUpdateError);
        } else {
          console.log(`[Nina] ✅ Contact email updated: ${detectedEmail}`);
        }
      } else {
        console.log(`[Nina] Email already saved: ${detectedEmail}`);
      }
    }
  }
  // ===== END EMAIL DETECTION =====

  // ===== ATLAS VEHICLE HANDOFF CHECK =====
  // Check if Atlas agent vehicle lead is ready for automatic handoff
  if (agent?.slug === 'atlas' && message.content) {
    // Re-read contact to get latest email after detection above
    const { data: updatedContact } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', conversation.contact_id)
      .single();
    
    const vehicleHandoffCheck = detectAtlasVehicleHandoff(agent, updatedContact, ninaContext);
    
    if (vehicleHandoffCheck.readyForHandoff) {
      console.log('[Nina] 🚗 Atlas vehicle lead ready for handoff!');
      
      const contactName = normalizeContactName(updatedContact?.call_name || updatedContact?.name);
      const contactPhone = updatedContact?.phone_number || '-';
      const contactEmail = updatedContact?.email || '-';
      
      // ===== MENSAGEM DE HANDOFF DIFERENCIADA =====
      // Para SUBCONTRATADOS: não falar de cotação, pegar dados do veículo
      // Para leads normais: mensagem padrão
      let handoffMessage: string;
      
      if (vehicleHandoffCheck.isSubcontratado) {
        // Subcontratado COM dados de veículo - handoff para seguro de veículo
        const qa = vehicleHandoffCheck.qualificationData;
        const qtdVeiculos = qa?.quantidade_veiculos || qa?.qtd_veiculos || '';
        const tipoVeiculo = qa?.tipo_veiculo || qa?.tipos_veiculos || '';
        
        if (qtdVeiculos || tipoVeiculo) {
          // Tem dados do veículo
          handoffMessage = `Perfeito, ${contactName}! 🚛 O Alessandro, nosso corretor especialista, vai entrar em contato para pegar os detalhes dos veículos e preparar a melhor proposta de seguro. Obrigado pelo contato!`;
        } else {
          // Fallback se chegou aqui sem dados (não deveria acontecer)
          handoffMessage = `Perfeito, ${contactName}! Nosso corretor vai entrar em contato para entender melhor suas necessidades de seguro. Obrigado!`;
        }
        console.log('[Nina] 🚛 Usando mensagem de handoff para SUBCONTRATADO');
      } else {
        // Lead normal com dados completos
        handoffMessage = `Perfeito, ${contactName}! 🎯 Já tenho todas as informações necessárias. Vou encaminhar para nossa equipe comercial que vai preparar a cotação e entrar em contato em breve. Obrigado pelo contato!`;
      }
      
      // Calculate delay
      const delayMin = settings?.response_delay_min || 1000;
      const delayMax = settings?.response_delay_max || 3000;
      const delay = Math.random() * (delayMax - delayMin) + delayMin;
      
      // Get AI settings
      const aiSettings = getModelSettings(settings, [], message, updatedContact, {});
      
      // Queue the handoff message
      await queueTextResponse(supabase, conversation, message, handoffMessage, settings, aiSettings, delay, agent);
      
      // Mark message as processed
      const responseTime = Date.now() - new Date(message.sent_at).getTime();
      await supabase
        .from('messages')
        .update({ 
          processed_by_nina: true,
          nina_response_time: responseTime
        })
        .eq('id', message.id);
      
      // Update conversation: set status to 'human', save handoff context
      await supabase
        .from('conversations')
        .update({ 
          status: 'human',
          nina_context: {
            ...ninaContext,
            vehicle_handoff_at: new Date().toISOString(),
            vehicle_handoff_type: 'auto_complete',
            vehicle_qualification_data: vehicleHandoffCheck.qualificationData
          }
        })
        .eq('id', conversation.id);
      
      console.log('[Nina] 🚗 Conversation status changed to human');
      
      // Generate handoff summary in background
      try {
        const summaryUrl = `${supabaseUrl}/functions/v1/generate-handoff-summary`;
        fetch(summaryUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({
            conversationId: conversation.id,
            contactId: conversation.contact_id,
            agentSlug: agent?.slug || 'atlas',
            qualificationData: vehicleHandoffCheck.qualificationData
          })
        }).catch(err => console.error('[Nina] Error generating handoff summary:', err));
      } catch (e) {
        console.error('[Nina] Failed to trigger handoff summary:', e);
      }
      
      // Move deal to "Qualificado" stage
      const { data: deal } = await supabase
        .from('deals')
        .select('id, pipeline_id, owner_id')
        .eq('contact_id', conversation.contact_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (deal) {
        const { data: qualifiedStage } = await supabase
          .from('pipeline_stages')
          .select('id')
          .eq('pipeline_id', deal.pipeline_id)
          .eq('title', 'Qualificado')
          .maybeSingle();
        
        if (qualifiedStage) {
          await supabase
            .from('deals')
            .update({ stage_id: qualifiedStage.id })
            .eq('id', deal.id);
          
          console.log(`[Nina] 🚗 Deal moved to Qualificado stage`);
        }
        
        // Send email notification to deal owner
        try {
          let ownerEmail = 'atendimento@jacometo.com.br';
          let ownerName = 'Equipe';
          
          if (deal.owner_id) {
            const { data: owner } = await supabase
              .from('team_members')
              .select('email, name')
              .eq('id', deal.owner_id)
              .single();
            
            if (owner?.email) {
              ownerEmail = owner.email;
              ownerName = owner.name || 'Equipe';
            }
          }
          
          const adminEmail = 'adriano@jacometo.com.br';
          const qa = vehicleHandoffCheck.qualificationData;
          
          const vehicleEmailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #1e40af;">🚗 Novo Lead de Veículos Qualificado!</h2>
              <p>Olá ${ownerName},</p>
              <p>Um novo lead de veículos/frota foi qualificado pelo Atlas e está aguardando atendimento.</p>
              
              <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <h3 style="color: #334155; margin-top: 0;">📋 Dados do Contato</h3>
                <ul style="list-style: none; padding: 0;">
                  <li><strong>Nome:</strong> ${contactName}</li>
                  <li><strong>Telefone:</strong> ${contactPhone}</li>
                  <li><strong>Email:</strong> ${contactEmail}</li>
                  <li><strong>Empresa:</strong> ${updatedContact?.company || '-'}</li>
                </ul>
              </div>
              
              <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <h3 style="color: #92400e; margin-top: 0;">🚙 Informações do Veículo</h3>
                <ul style="list-style: none; padding: 0;">
                  <li><strong>Tipo:</strong> ${qa.tipo_veiculo || '-'}</li>
                  <li><strong>Quantidade:</strong> ${qa.quantidade_veiculos || '-'}</li>
                  <li><strong>Modelo:</strong> ${qa.modelo_veiculo || '-'}</li>
                  <li><strong>Ano:</strong> ${qa.ano_veiculo || '-'}</li>
                  <li><strong>Uso:</strong> ${qa.uso_veiculo || '-'}</li>
                  <li><strong>Cobertura:</strong> ${qa.cobertura_desejada || '-'}</li>
                </ul>
              </div>
              
              <p style="margin-top: 24px;">
                <a href="https://jacometo.lovable.app/chat" style="background: #1e40af; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">
                  Acessar Sistema
                </a>
              </p>
              
              <p style="color: #64748b; font-size: 12px; margin-top: 24px;">
                Este email foi enviado automaticamente pelo agente Atlas.
              </p>
            </div>
          `;
          
          const emailPayload = {
            to: ownerEmail,
            bcc: [adminEmail],
            subject: `🚗 Novo Lead de Veículos: ${contactName}`,
            html: vehicleEmailHtml
          };
          
          const emailUrl = `${supabaseUrl}/functions/v1/send-email`;
          fetch(emailUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify(emailPayload)
          }).then(res => {
            if (res.ok) {
              console.log(`[Nina] 📧 Vehicle lead email sent to ${ownerEmail}`);
            } else {
              console.error(`[Nina] ❌ Failed to send vehicle email: ${res.status}`);
            }
          }).catch(err => console.error('[Nina] Error sending vehicle email:', err));
          
        } catch (emailError) {
          console.error('[Nina] Error preparing vehicle email notification:', emailError);
        }
      }
      
      // Trigger whatsapp-sender
      try {
        const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
        fetch(senderUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({ triggered_by: 'nina-orchestrator-atlas-vehicle-handoff' })
        }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
      } catch (e) {
        console.error('[Nina] Failed to trigger whatsapp-sender:', e);
      }
      
      console.log(`[Nina] 🚗 Atlas vehicle handoff complete!`);
      return;
    }
  }
  // ===== END ATLAS VEHICLE HANDOFF CHECK =====

  // ===== CRLV DOCUMENT DETECTION AND DATA EXTRACTION =====
  interface CRLVData {
    placa: string | null;
    renavam: string | null;
    marca_modelo: string | null;
    ano_fab: string | null;
    ano_mod: string | null;
    combustivel: string | null;
    cor: string | null;
    proprietario: string | null;
    cpf_cnpj: string | null;
    chassi: string | null;
  }

  function extractCRLVData(text: string): CRLVData | null {
    if (!text) return null;
    
    const upperText = text.toUpperCase();
    
    // Check if this looks like a CRLV
    const crlvIndicators = [
      'CRLV', 'CERTIFICADO DE REGISTRO', 'LICENCIAMENTO',
      'RENAVAM', 'DETRAN', 'REGISTRO NACIONAL', 'CRV'
    ];
    
    const isCRLV = crlvIndicators.some(indicator => upperText.includes(indicator));
    if (!isCRLV) return null;
    
    console.log('[Nina] CRLV document detected, extracting data...');
    
    const data: CRLVData = {
      placa: null,
      renavam: null,
      marca_modelo: null,
      ano_fab: null,
      ano_mod: null,
      combustivel: null,
      cor: null,
      proprietario: null,
      cpf_cnpj: null,
      chassi: null
    };
    
    // Placa patterns (old: ABC-1234, Mercosul: ABC1D23)
    const placaMatch = upperText.match(/\b([A-Z]{3}[-\s]?\d{4}|[A-Z]{3}\d[A-Z]\d{2})\b/);
    if (placaMatch) {
      data.placa = placaMatch[1].replace(/[-\s]/g, '');
    }
    
    // RENAVAM (11 digits)
    const renavamMatch = text.match(/RENAVAM[:\s]*(\d{11})/i) || 
                         text.match(/\b(\d{11})\b/);
    if (renavamMatch) {
      data.renavam = renavamMatch[1];
    }
    
    // Marca/Modelo (after MARCA/MODELO label or common patterns)
    const marcaModeloMatch = text.match(/MARCA[\/\s]*MODELO[:\s]*([A-Z0-9\/\s\-\.]+?)(?:\n|$)/i) ||
                             text.match(/(FIAT|VW|VOLKSWAGEN|CHEVROLET|GM|FORD|TOYOTA|HONDA|HYUNDAI|RENAULT|NISSAN|JEEP|BMW|MERCEDES|AUDI|KIA|MITSUBISHI|PEUGEOT|CITROEN)[\/\s]+([A-Z0-9\s\-\.]+?)(?:\n|$)/i);
    if (marcaModeloMatch) {
      data.marca_modelo = (marcaModeloMatch[1] + (marcaModeloMatch[2] ? '/' + marcaModeloMatch[2] : '')).trim().substring(0, 50);
    }
    
    // Ano fabricação/modelo
    const anoMatch = text.match(/ANO[:\s]*FAB(?:RICA[CÇ][AÃ]O)?[:\s]*(\d{4})[\/\s]*(?:MOD(?:ELO)?)?[:\s]*(\d{4})?/i) ||
                     text.match(/(\d{4})[\/\s](\d{4})/);
    if (anoMatch) {
      data.ano_fab = anoMatch[1];
      data.ano_mod = anoMatch[2] || anoMatch[1];
    }
    
    // Combustível
    const combustivelMatch = text.match(/COMBUST[ÍVEL]*[:\s]*(GASOLINA|ÁLCOOL|ALCOOL|ETANOL|FLEX|DIESEL|GNV|ELÉTRICO|ELETRICO|HÍBRIDO|HIBRIDO)/i);
    if (combustivelMatch) {
      data.combustivel = combustivelMatch[1].toUpperCase();
    }
    
    // Cor
    const corMatch = text.match(/COR[:\s]*(PRATA|PRETO|PRETO|BRANCO|CINZA|VERMELHO|AZUL|VERDE|AMARELO|BEGE|MARROM|DOURADO|PRAT[AO]|PRET[OA]|BRANC[OA])/i);
    if (corMatch) {
      data.cor = corMatch[1].toUpperCase();
    }
    
    // Proprietário
    const proprietarioMatch = text.match(/PROPRIET[ÁARIO]*[:\s]*([A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ\s]+?)(?:\n|CPF|CNPJ)/i) ||
                              text.match(/NOME[:\s]*([A-ZÁÉÍÓÚÃÕÂÊÎÔÛÇ\s]{5,50})/i);
    if (proprietarioMatch) {
      data.proprietario = proprietarioMatch[1].trim().substring(0, 60);
    }
    
    // CPF/CNPJ
    const cpfMatch = text.match(/CPF[:\s]*(\d{3}[\.\s]?\d{3}[\.\s]?\d{3}[-\s]?\d{2})/i);
    const cnpjMatch = text.match(/CNPJ[:\s]*(\d{2}[\.\s]?\d{3}[\.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2})/i);
    data.cpf_cnpj = cpfMatch?.[1] || cnpjMatch?.[1] || null;
    
    // Chassi (17 alphanumeric)
    const chassiMatch = text.match(/CHASSI[:\s]*([A-HJ-NPR-Z0-9]{17})/i);
    if (chassiMatch) {
      data.chassi = chassiMatch[1];
    }
    
    // Check if we extracted meaningful data
    const hasData = data.placa || data.renavam || data.marca_modelo;
    
    return hasData ? data : null;
  }

  // Check if any recent message contains CRLV data
  const recentUserMessagesForCRLV = (recentMessages || [])
    .filter((m: any) => m.from_type === 'user' && m.content)
    .slice(-5); // Last 5 messages

  for (const msg of recentUserMessagesForCRLV) {
    if (msg.content && (msg.content.includes('[Texto extraído') || msg.content.includes('CRLV') || msg.content.includes('RENAVAM'))) {
      const crlvData = extractCRLVData(msg.content);
      
      if (crlvData) {
        console.log('[Nina] CRLV data extracted:', JSON.stringify(crlvData));
        
        // Check if we already processed this CRLV
        const existingCRLV = conversation.nina_context?.crlv_data;
        const isNewCRLV = !existingCRLV || existingCRLV.placa !== crlvData.placa;
        
        if (isNewCRLV) {
          // Save to nina_context
          const updatedContext = {
            ...conversation.nina_context,
            crlv_detected: true,
            crlv_data: crlvData,
            crlv_extracted_at: new Date().toISOString(),
            qualification_answers: {
              ...conversation.nina_context?.qualification_answers,
              ...(crlvData.placa && { placa_veiculo: crlvData.placa }),
              ...(crlvData.marca_modelo && { modelo_veiculo: crlvData.marca_modelo }),
              ...(crlvData.ano_mod && { ano_veiculo: crlvData.ano_mod }),
              ...(crlvData.combustivel && { combustivel_veiculo: crlvData.combustivel }),
              ...(crlvData.cor && { cor_veiculo: crlvData.cor }),
              tipo_veiculo: 'carro' // Default assumption for CRLV
            }
          };
          
          await supabase
            .from('conversations')
            .update({ nina_context: updatedContext })
            .eq('id', conversation.id);
          
          conversation.nina_context = updatedContext;
          
          console.log(`[Nina] 🚗 CRLV data saved to nina_context:`, crlvData);
          
          // Mark vehicle lead interest for Atlas handoff
          if (agent?.slug === 'atlas') {
            console.log('[Nina] Atlas: Vehicle document received, data extracted for handoff');
          }
        }
        
        break; // Only process first CRLV found
      }
    }
  }
  // ===== END CRLV DOCUMENT DETECTION =====

  // ===== REAL-TIME QUALIFICATION EXTRACTION =====
  // Extract qualification answers from user messages immediately and save to nina_context
  // ENHANCED: Now includes agent messages for contextual extraction (correlate Q&A)
  const chronologicalMessages = (recentMessages || []).slice().reverse();
  
  const userMessagesContent = chronologicalMessages
    .filter((m: any) => m.from_type === 'user' && m.content)
    .map((m: any) => m.content);
  
  const agentMessagesContent = chronologicalMessages
    .filter((m: any) => (m.from_type === 'nina' || m.from_type === 'human') && m.content)
    .map((m: any) => m.content);
  
  // Pass both user and agent messages for contextual extraction
  const extractedQA = extractQualificationFromMessages(userMessagesContent, agentMessagesContent);
  const existingQA = conversation.nina_context?.qualification_answers || {};
  const mergedQA: { [key: string]: string } = { ...existingQA };
  
  // Merge only new non-empty values (don't overwrite existing)
  let hasNewData = false;
  for (const [key, value] of Object.entries(extractedQA)) {
    if (value && !mergedQA[key]) {
      mergedQA[key] = value;
      hasNewData = true;
    }
  }
  
  // Save if there are new answers
  if (hasNewData) {
    await supabase
      .from('conversations')
      .update({
        nina_context: {
          ...conversation.nina_context,
          qualification_answers: mergedQA,
          last_extraction: new Date().toISOString()
        }
      })
      .eq('id', conversation.id);
    
    // Update local reference for buildEnhancedPrompt
    conversation.nina_context = {
      ...conversation.nina_context,
      qualification_answers: mergedQA
    };
    
    console.log(`[Nina] 📝 Qualification answers extracted in real-time:`, mergedQA);
  }
  
  // ===== QUESTION TRACKING: Detect and persist which questions the agent has asked =====
  const detectedQuestionsAsked = detectQuestionsAskedByAgent(agentMessagesContent);
  const existingQuestionsAsked = (conversation.nina_context?.questions_asked || {}) as Record<string, string>;
  
  // Merge: preserve existing, add new
  let hasNewQuestions = false;
  const mergedQuestionsAsked = { ...existingQuestionsAsked };
  for (const [field, timestamp] of Object.entries(detectedQuestionsAsked)) {
    if (!mergedQuestionsAsked[field]) {
      mergedQuestionsAsked[field] = timestamp;
      hasNewQuestions = true;
    }
  }
  
  if (hasNewQuestions) {
    await supabase
      .from('conversations')
      .update({
        nina_context: {
          ...conversation.nina_context,
          qualification_answers: mergedQA,
          questions_asked: mergedQuestionsAsked,
          last_question_tracking: new Date().toISOString()
        }
      })
      .eq('id', conversation.id);
    
    // Update local reference
    conversation.nina_context = {
      ...conversation.nina_context,
      qualification_answers: mergedQA,
      questions_asked: mergedQuestionsAsked
    };
    
    console.log(`[Nina] 🔍 Questions asked by agent tracked:`, Object.keys(mergedQuestionsAsked));
  }
  // ===== END QUESTION TRACKING =====
  
  // ===== EXISTING INSURANCE DETECTION =====
  // Detect if lead already has insurance and track status
  const existingInsuranceStatus = conversation.nina_context?.insurance_status || {};
  const detectedInsuranceStatus = detectExistingInsurance(userMessagesContent, agentMessagesContent);
  
  // Merge with existing - don't overwrite true values
  const mergedInsuranceStatus = {
    has_vehicle_insurance: existingInsuranceStatus.has_vehicle_insurance || detectedInsuranceStatus.has_vehicle_insurance,
    has_cargo_insurance: existingInsuranceStatus.has_cargo_insurance || detectedInsuranceStatus.has_cargo_insurance,
    is_satisfied: detectedInsuranceStatus.is_satisfied ?? existingInsuranceStatus.is_satisfied,
    is_dissatisfied: detectedInsuranceStatus.is_dissatisfied ?? existingInsuranceStatus.is_dissatisfied,
    renewal_date: detectedInsuranceStatus.renewal_date || existingInsuranceStatus.renewal_date
  };
  
  // Check if anything changed
  const insuranceStatusChanged = 
    mergedInsuranceStatus.has_vehicle_insurance !== existingInsuranceStatus.has_vehicle_insurance ||
    mergedInsuranceStatus.has_cargo_insurance !== existingInsuranceStatus.has_cargo_insurance ||
    mergedInsuranceStatus.is_satisfied !== existingInsuranceStatus.is_satisfied ||
    mergedInsuranceStatus.is_dissatisfied !== existingInsuranceStatus.is_dissatisfied ||
    mergedInsuranceStatus.renewal_date !== existingInsuranceStatus.renewal_date;
  
  if (insuranceStatusChanged && (mergedInsuranceStatus.has_vehicle_insurance || mergedInsuranceStatus.has_cargo_insurance)) {
    console.log(`[Nina] 🛡️ Existing insurance detected:`, mergedInsuranceStatus);
    
    await supabase
      .from('conversations')
      .update({
        nina_context: {
          ...conversation.nina_context,
          qualification_answers: mergedQA,
          questions_asked: mergedQuestionsAsked,
          insurance_status: mergedInsuranceStatus,
          last_insurance_detection: new Date().toISOString()
        }
      })
      .eq('id', conversation.id);
    
    // Update local reference
    conversation.nina_context = {
      ...conversation.nina_context,
      qualification_answers: mergedQA,
      questions_asked: mergedQuestionsAsked,
      insurance_status: mergedInsuranceStatus
    };
    
    // Also update qualification_answers with insurance status for tracking
    if (mergedInsuranceStatus.has_vehicle_insurance && !mergedQA.tem_seguro_veiculo) {
      mergedQA.tem_seguro_veiculo = 'sim';
    }
    if (mergedInsuranceStatus.has_cargo_insurance && !mergedQA.tem_seguro_carga) {
      mergedQA.tem_seguro_carga = 'sim';
    }
    if (mergedInsuranceStatus.renewal_date && !mergedQA.vencimento_seguro) {
      mergedQA.vencimento_seguro = mergedInsuranceStatus.renewal_date;
    }
  }
  // ===== END EXISTING INSURANCE DETECTION =====

  // ===== END REAL-TIME QUALIFICATION EXTRACTION =====

  // ===== EMAIL CAPTURE AFTER QUALIFICATION =====
  // If awaiting email confirmation/capture, handle it first
  // (ninaContext already declared above)
  
  if (ninaContext.awaiting_qualification_email === true && message.content) {
    console.log(`[Nina] 📧 Awaiting qualification email - checking user response...`);
    
    // Try to extract email from message
    const emailMatch = message.content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi);
    const contactName = normalizeContactName(conversation.contact?.call_name || conversation.contact?.name);
    
    // Check for confirmation words (sim, pode, ok, isso, correto, esse mesmo, etc.)
    const confirmationWords = ['sim', 'pode', 'ok', 'isso', 'correto', 'esse', 'essa', 'certo', 'confirmo', 'confirma', 'confirmado', 'exato', 'perfeito', 'isso mesmo', 'esse mesmo'];
    const isConfirmation = confirmationWords.some(word => 
      message.content.toLowerCase().includes(word)
    );
    
    // Check for negation (não, outro, diferente, etc.)
    const negationWords = ['não', 'nao', 'outro', 'outra', 'diferente', 'muda', 'trocar', 'troca'];
    const isNegation = negationWords.some(word => 
      message.content.toLowerCase().includes(word)
    );
    
    let finalEmail = null;
    let responseMessage = '';
    
    if (emailMatch) {
      // User provided a new email
      finalEmail = emailMatch[0].toLowerCase();
      console.log(`[Nina] 📧 Email extracted from message: ${finalEmail}`);
    } else if (isConfirmation && conversation.contact?.email && !isNegation) {
      // User confirmed existing email
      finalEmail = conversation.contact.email;
      console.log(`[Nina] 📧 Email confirmed by user: ${finalEmail}`);
    } else if (isNegation || (!isConfirmation && !emailMatch)) {
      // User wants different email or unclear - ask again politely
      responseMessage = contactName 
        ? `Sem problemas, ${contactName}! Me passa o email que você prefere então. 😊`
        : `Sem problemas! Me passa o email que você prefere então. 😊`;
      
      const delayMin = settings?.response_delay_min || 1000;
      const delayMax = settings?.response_delay_max || 3000;
      const delay = Math.random() * (delayMax - delayMin) + delayMin;
      const aiSettings = getModelSettings(settings, conversationHistory, message, conversation.contact, clientMemory);
      
      await queueTextResponse(supabase, conversation, message, responseMessage, settings, aiSettings, delay, agent);
      
      const responseTime = Date.now() - new Date(message.sent_at).getTime();
      await markMessagesAsProcessed(supabase, message.id, aggregatedMessageIds, responseTime);
      
      // Trigger whatsapp-sender
      try {
        const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
        fetch(senderUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({ triggered_by: 'nina-orchestrator-email-retry' })
        }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
      } catch (e) {
        console.error('[Nina] Failed to trigger whatsapp-sender:', e);
      }
      
      return;
    }
    
    if (finalEmail) {
      // Save email to contact
      await supabase.from('contacts').update({ email: finalEmail }).eq('id', conversation.contact_id);
      console.log(`[Nina] 📧 Email saved to contact: ${finalEmail}`);
      
      // Build thank you message and proceed to handoff
      responseMessage = contactName 
        ? `Perfeito, ${contactName}! 🎯 Anotado. Vou encaminhar para o corretor responsável que vai entrar em contato em breve. Obrigada pelo contato!`
        : `Perfeito! 🎯 Anotado. Vou encaminhar para o corretor responsável que vai entrar em contato em breve. Obrigada pelo contato!`;
      
      const delayMin = settings?.response_delay_min || 1000;
      const delayMax = settings?.response_delay_max || 3000;
      const delay = Math.random() * (delayMax - delayMin) + delayMin;
      const aiSettings = getModelSettings(settings, conversationHistory, message, conversation.contact, clientMemory);
      
      await queueTextResponse(supabase, conversation, message, responseMessage, settings, aiSettings, delay, agent);
      
      const responseTime = Date.now() - new Date(message.sent_at).getTime();
      await markMessagesAsProcessed(supabase, message.id, aggregatedMessageIds, responseTime);
      
      // Update conversation: clear awaiting flag, mark qualified, change to human
      await supabase
        .from('conversations')
        .update({ 
          status: 'human',
          nina_context: {
            ...ninaContext,
            awaiting_qualification_email: false,
            qualification_completed_at: new Date().toISOString()
          }
          })
        .eq('id', conversation.id);
      
      // Generate handoff summary in background
      try {
        const summaryUrl = `${supabaseUrl}/functions/v1/generate-handoff-summary`;
        fetch(summaryUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({
            conversationId: conversation.id,
            contactId: conversation.contact_id,
            agentSlug: agent?.slug || 'atlas',
            qualificationData: conversation?.nina_context?.qualification_answers || {}
          })
        }).catch(err => console.error('[Nina] Error generating handoff summary:', err));
      } catch (e) {
        console.error('[Nina] Failed to trigger handoff summary:', e);
      }
      
      // Move deal to "Qualificado" stage and send email notification
      const { data: deal } = await supabase
        .from('deals')
        .select('id, pipeline_id')
        .eq('contact_id', conversation.contact_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (deal) {
        const { data: qualifiedStage } = await supabase
          .from('pipeline_stages')
          .select('id')
          .eq('pipeline_id', deal.pipeline_id)
          .eq('title', 'Qualificado')
          .maybeSingle();
        
        if (qualifiedStage) {
          await supabase
            .from('deals')
            .update({ stage_id: qualifiedStage.id })
            .eq('id', deal.id);
          
          console.log(`[Nina] 📊 Deal moved to Qualificado stage`);
        }
        
        // Send email notification to deal owner with admin in BCC
        try {
          const { data: dealWithOwner } = await supabase
            .from('deals')
            .select('owner_id')
            .eq('id', deal.id)
            .single();
          
          let ownerEmail = 'atendimento@jacometo.com.br';
          let ownerName = 'Equipe';
          
          if (dealWithOwner?.owner_id) {
            const { data: owner } = await supabase
              .from('team_members')
              .select('email, name')
              .eq('id', dealWithOwner.owner_id)
              .single();
            
            if (owner?.email) {
              ownerEmail = owner.email;
              ownerName = owner.name || 'Equipe';
            }
          }
          
          const adminEmail = 'adriano@jacometo.com.br';
          const contactPhone = conversation.contact?.phone_number || '-';
          const contactCnpj = conversation.contact?.cnpj || '-';
          const contactCompany = conversation.contact?.company || '-';
          
          const qa = mergedQA;
          const tipoCarga = qa.tipo_carga || '-';
          const estados = qa.estados || '-';
          const viagensMes = qa.viagens_mes || qa.valor_medio || '-';
          const tipoFrota = qa.tipo_frota || '-';
          const contratacao = qa.contratacao || '-';
          
          const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #1e40af;">🎯 Novo Lead Qualificado!</h2>
              <p>Olá ${ownerName},</p>
              <p>Um novo lead foi qualificado pela Nina e está aguardando seu atendimento.</p>
              
              <div style="background: #f8fafc; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <h3 style="color: #334155; margin-top: 0;">📋 Informações do Contato</h3>
                <ul style="list-style: none; padding: 0;">
                  <li><strong>Nome:</strong> ${contactName !== 'Cliente' ? contactName : 'Lead'}</li>
                  <li><strong>Telefone:</strong> ${contactPhone}</li>
                  <li><strong>Email:</strong> ${finalEmail}</li>
                  <li><strong>CNPJ:</strong> ${contactCnpj}</li>
                  <li><strong>Empresa:</strong> ${contactCompany}</li>
                </ul>
              </div>
              
              <div style="background: #f0fdf4; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <h3 style="color: #166534; margin-top: 0;">🚛 Informações de Qualificação</h3>
                <ul style="list-style: none; padding: 0;">
                  <li><strong>Tipo de Carga:</strong> ${tipoCarga}</li>
                  <li><strong>Estados Atendidos:</strong> ${estados}</li>
                  <li><strong>Volume/Viagens por Mês:</strong> ${viagensMes}</li>
                  <li><strong>Tipo de Frota:</strong> ${tipoFrota}</li>
                  <li><strong>Tipo de Contratação:</strong> ${contratacao}</li>
                </ul>
              </div>
              
              <p style="margin-top: 24px;">
                <a href="https://jacometo.lovable.app/chat" style="background: #1e40af; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">
                  Acessar Sistema
                </a>
              </p>
              
              <p style="color: #64748b; font-size: 12px; margin-top: 24px;">
                Este email foi enviado automaticamente pelo sistema Nina.
              </p>
            </div>
          `;
          
          const emailPayload = {
            to: ownerEmail,
            bcc: [adminEmail],
            subject: `🎯 Novo Lead Qualificado: ${contactName !== 'Cliente' ? contactName : 'Lead'}`,
            html: emailHtml
          };
          
          const emailUrl = `${supabaseUrl}/functions/v1/send-email`;
          fetch(emailUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`
            },
            body: JSON.stringify(emailPayload)
          }).then(res => {
            if (res.ok) {
              console.log(`[Nina] 📧 Email notification sent to ${ownerEmail} (BCC: ${adminEmail})`);
            } else {
              console.error(`[Nina] ❌ Failed to send email notification: ${res.status}`);
            }
          }).catch(err => console.error('[Nina] Error sending email notification:', err));
          
        } catch (emailError) {
          console.error('[Nina] Error preparing email notification:', emailError);
        }
      }
      
      // Trigger whatsapp-sender
      try {
        const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
        fetch(senderUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`
          },
          body: JSON.stringify({ triggered_by: 'nina-orchestrator-qualification-email-complete' })
        }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
      } catch (e) {
        console.error('[Nina] Failed to trigger whatsapp-sender:', e);
      }
      
      console.log(`[Nina] 🎯 Email captured! Qualification complete, conversation handed off to human`);
      return;
    }
  }
  // ===== END EMAIL CAPTURE =====

  // ===== QUALIFICATION COMPLETE CHECK - ASK FOR EMAIL FIRST =====
  // Check if all essential qualification fields are collected - if so, ask for email before handoff
  const qualificationComplete = isQualificationComplete(conversation.contact, mergedQA);
  
  if (qualificationComplete && ninaContext.awaiting_qualification_email !== true) {
    console.log(`[Nina] ✅ Qualificação completa! Dados coletados:`, mergedQA);
    
    const contactName = normalizeContactName(conversation.contact?.call_name || conversation.contact?.name);
    const existingEmail = conversation.contact?.email;
    
    let askEmailMessage: string;
    
    if (existingEmail) {
      // Already has email - confirm it
      askEmailMessage = contactName !== 'Cliente'
        ? `Perfeito, ${contactName}! 🎯 Tenho todas as informações para a cotação. Posso enviar para ${existingEmail}? Se preferir outro email, me passa!`
        : `Perfeito! 🎯 Tenho todas as informações para a cotação. Posso enviar para ${existingEmail}? Se preferir outro email, me passa!`;
    } else {
      // No email - ask for it
      askEmailMessage = contactName !== 'Cliente'
        ? `Ótimo, ${contactName}! 🎯 Tenho todas as informações para montar sua cotação. Qual seu melhor email para eu enviar?`
        : `Ótimo! 🎯 Tenho todas as informações para montar sua cotação. Qual seu melhor email para eu enviar?`;
    }
    
    // Calculate delay
    const delayMin = settings?.response_delay_min || 1000;
    const delayMax = settings?.response_delay_max || 3000;
    const delay = Math.random() * (delayMax - delayMin) + delayMin;
    
    // Get AI settings for metadata
    const aiSettings = getModelSettings(settings, conversationHistory, message, conversation.contact, clientMemory);
    
    // Queue the email request message
    await queueTextResponse(supabase, conversation, message, askEmailMessage, settings, aiSettings, delay, agent);
    
    // Mark message as processed
    const responseTime = Date.now() - new Date(message.sent_at).getTime();
    await markMessagesAsProcessed(supabase, message.id, aggregatedMessageIds, responseTime);
    
    // Set awaiting_qualification_email flag
    await supabase
      .from('conversations')
      .update({
        nina_context: {
          ...ninaContext,
          qualification_answers: mergedQA,
          awaiting_qualification_email: true
        }
      })
      .eq('id', conversation.id);
    
    // Trigger whatsapp-sender
    try {
      const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
      fetch(senderUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ triggered_by: 'nina-orchestrator-ask-email' })
      }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
    } catch (e) {
      console.error('[Nina] Failed to trigger whatsapp-sender:', e);
    }
    
    console.log(`[Nina] 📧 Qualification complete - asking for email before handoff`);
    return;
  }
  // ===== END QUALIFICATION COMPLETE CHECK =====

  // Check if this is the first interaction (only 1 user message, no assistant messages yet)
  const userMessages = conversationHistory.filter((m: any) => m.role === 'user');
  const assistantMessages = conversationHistory.filter((m: any) => m.role === 'assistant');
  const isFirstInteraction = userMessages.length === 1 && assistantMessages.length === 0;

  // If first interaction and agent has greeting_message, use it instead of AI
  if (isFirstInteraction && agent?.greeting_message) {
    // Check if lead already mentioned cargo insurance (from campaigns)
    const firstUserMessage = userMessages[0]?.content || '';
    const hasCargoInterest = agent.slug === 'iris' && hasExplicitCargoInterest(firstUserMessage);
    
    let greetingContent: string;
    
    if (hasCargoInterest && agent.cargo_focused_greeting) {
      // Lead from cargo campaign - use focused greeting that starts with cargo type question
      console.log(`[Nina] 🚛 Lead from cargo campaign detected - using cargo_focused_greeting for ${agent.name}`);
      greetingContent = processPromptTemplate(agent.cargo_focused_greeting, conversation.contact);
    } else {
      // Normal greeting
      console.log(`[Nina] First interaction - using greeting_message for ${agent.name}`);
      greetingContent = processPromptTemplate(agent.greeting_message, conversation.contact);
    }
    
    // Calculate delay
    const delayMin = settings?.response_delay_min || 1000;
    const delayMax = settings?.response_delay_max || 3000;
    const delay = Math.random() * (delayMax - delayMin) + delayMin;
    
    // Get AI settings for metadata
    const aiSettings = getModelSettings(settings, conversationHistory, message, conversation.contact, clientMemory);
    
    // Queue the greeting message
    await queueTextResponse(supabase, conversation, message, greetingContent, settings, aiSettings, delay, agent);
    
    // ===== SEND INTERACTIVE TRIAGING BUTTONS AFTER GREETING (Íris cargo flow) =====
    if (hasCargoInterest && agent.slug === 'iris') {
      const buttonDelay = delay + 2500; // 2.5s after greeting
      
      await queueInteractiveButtons(
        supabase,
        conversation,
        'Escolha uma opção:', // WhatsApp API requires non-empty body.text
        [
          { id: 'btn_transportador', title: 'Sou transportador' },
          { id: 'btn_outros_seguros', title: 'Outros seguros' },
          { id: 'btn_engano', title: 'Foi engano' }
        ],
        buttonDelay,
        agent
      );
      console.log('[Nina] 🔘 Triaging buttons queued after Íris greeting');
    }
    // ===== END TRIAGING BUTTONS =====
    
    // Mark message as processed
    const responseTime = Date.now() - new Date(message.sent_at).getTime();
    await supabase
      .from('messages')
      .update({ 
        processed_by_nina: true,
        nina_response_time: responseTime
      })
      .eq('id', message.id);

    // Trigger whatsapp-sender
    try {
      const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
      fetch(senderUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ triggered_by: 'nina-orchestrator-greeting' })
      }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
    } catch (err) {
      console.error('[Nina] Failed to trigger whatsapp-sender:', err);
    }

    console.log('[Nina] Greeting message queued, skipping AI call');
    return;
  }

  // Build system prompt - use agent prompt or fallback to settings/default
  let systemPrompt: string;
  if (agent) {
    systemPrompt = agent.system_prompt;
  } else {
    systemPrompt = settings?.system_prompt_override || getDefaultSystemPrompt();
  }

  // Build enhanced system prompt with context (including qualification answers from nina_context)
  // Also pass recent user messages for history verification
  const recentUserMsgs = (recentMessages || [])
    .filter((m: any) => m.from_type === 'user' && m.content)
    .slice(-8)
    .map((m: any) => m.content);
  
  // ===== FETCH RECENT CALL LOGS WITH TRANSCRIPTIONS FOR RETURNING LEADS =====
  let recentCallLogs: any[] = [];
  try {
    const { data: callLogs } = await supabase
      .from('call_logs')
      .select('started_at, status, transcription, duration_seconds')
      .eq('contact_id', conversation.contact_id)
      .not('transcription', 'is', null)
      .order('started_at', { ascending: false })
      .limit(3);
    
    if (callLogs && callLogs.length > 0) {
      recentCallLogs = callLogs;
      console.log(`[Nina] 📞 Loaded ${callLogs.length} call logs with transcriptions for context`);
    }
  } catch (err) {
    console.error('[Nina] Error fetching call logs:', err);
  }
  
  const enhancedSystemPrompt = buildEnhancedPrompt(
    systemPrompt, 
    conversation.contact, 
    clientMemory,
    agent,
    conversation.nina_context,
    recentUserMsgs,
    recentCallLogs,
    { 
      isReturning: isReturningLead, 
      daysSinceLastContact, 
      previousTopics, 
      context: returningLeadContext 
    }
  );

  // Process template variables
  const processedPrompt = processPromptTemplate(enhancedSystemPrompt, conversation.contact);

  console.log('[Nina] Calling Lovable AI...');

  // Get AI model settings
  const aiSettings = getModelSettings(settings, conversationHistory, message, conversation.contact, clientMemory);

  console.log('[Nina] Using AI settings:', aiSettings);

  // If this is a handoff, prepend the handoff message
  let aiContent: string;
  
  if (isHandoff && agent?.handoff_message) {
    // Send handoff message first, then process the actual question
    console.log(`[Nina] Sending handoff message for ${agent.name}`);
    
    const handoffContent = processPromptTemplate(agent.handoff_message, conversation.contact);
    
    // Queue handoff message
    await queueTextResponse(
      supabase, 
      conversation, 
      message, 
      handoffContent, 
      settings, 
      aiSettings, 
      500 // Short delay for handoff
    );
    
    // Wait a bit before generating AI response
    const aiResponse = await fetch(LOVABLE_AI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: aiSettings.model,
        messages: [
          { role: 'system', content: processedPrompt },
          ...conversationHistory
        ],
        temperature: aiSettings.temperature,
        max_tokens: 1000
      })
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[Nina] AI response error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        throw new Error('Rate limit exceeded, will retry later');
      }
      if (aiResponse.status === 402) {
        throw new Error('Payment required - please add credits');
      }
      throw new Error(`AI error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    aiContent = aiData.choices?.[0]?.message?.content;
    
    // Fallback to alternative model if primary returns empty response
    if (!aiContent) {
      console.warn('[Nina] ⚠️ Empty response from primary model in handoff, retrying with gemini-2.5-flash...');
      console.warn('[Nina] Original model was:', aiSettings.model);
      
      const fallbackResponse = await fetch(LOVABLE_AI_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: processedPrompt },
            ...conversationHistory
          ],
          temperature: 0.8,
          max_tokens: 1000
        })
      });

      if (fallbackResponse.ok) {
        const fallbackData = await fallbackResponse.json();
        aiContent = fallbackData.choices?.[0]?.message?.content;
        console.log('[Nina] Fallback model response:', aiContent ? 'success' : 'also empty');
      } else {
        console.error('[Nina] Fallback model also failed:', fallbackResponse.status);
      }
    }
    
    // If still no content, use generic fallback message
    if (!aiContent) {
      console.error('[Nina] All models returned empty response in handoff, using fallback message');
      aiContent = 'Desculpe, não consegui processar sua mensagem. Pode repetir de outra forma?';
    }
    
    // Queue AI response with additional delay after handoff
    const responseTime = Date.now() - new Date(message.sent_at).getTime();
    await supabase
      .from('messages')
      .update({ 
        processed_by_nina: true,
        nina_response_time: responseTime
      })
      .eq('id', message.id);

    const delayMin = settings?.response_delay_min || 1000;
    const delayMax = settings?.response_delay_max || 3000;
    const delay = Math.random() * (delayMax - delayMin) + delayMin + 2000; // Extra 2s after handoff

    await queueTextResponse(supabase, conversation, message, aiContent, settings, aiSettings, delay);
  } else {
    // Normal flow - no handoff
    const aiResponse = await fetch(LOVABLE_AI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: aiSettings.model,
        messages: [
          { role: 'system', content: processedPrompt },
          ...conversationHistory
        ],
        temperature: aiSettings.temperature,
        max_tokens: 1000
      })
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[Nina] AI response error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        throw new Error('Rate limit exceeded, will retry later');
      }
      if (aiResponse.status === 402) {
        throw new Error('Payment required - please add credits');
      }
      throw new Error(`AI error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    aiContent = aiData.choices?.[0]?.message?.content;

    // Log AI response details for debugging
    console.log('[Nina] AI Response Debug:', JSON.stringify({
      status: aiResponse.status,
      model: aiSettings.model,
      hasChoices: !!aiData.choices,
      choicesLength: aiData.choices?.length,
      finishReason: aiData.choices?.[0]?.finish_reason,
      contentLength: aiData.choices?.[0]?.message?.content?.length || 0,
      messageContent: message.content?.substring(0, 50)
    }));

    // Fallback to alternative model if primary returns empty response
    if (!aiContent) {
      console.warn('[Nina] ⚠️ Empty response from primary model, retrying with gemini-2.5-flash...');
      console.warn('[Nina] Original model was:', aiSettings.model);
      
      const fallbackResponse = await fetch(LOVABLE_AI_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: processedPrompt },
            ...conversationHistory
          ],
          temperature: 0.8,
          max_tokens: 1000
        })
      });

      if (fallbackResponse.ok) {
        const fallbackData = await fallbackResponse.json();
        aiContent = fallbackData.choices?.[0]?.message?.content;
        console.log('[Nina] Fallback model response:', aiContent ? 'success' : 'also empty');
      } else {
        console.error('[Nina] Fallback model also failed:', fallbackResponse.status);
      }
    }
    
    // ===== PROSPECTING RESPONSE MINIMUM LENGTH VALIDATION =====
    // For prospecting conversations, ensure response is not just a short greeting
    if (aiContent && conversationMetadata?.origin === 'prospeccao' && agent?.slug === 'atlas') {
      const contentTrimmed = aiContent.trim();
      
      // Check if response is too short (just a greeting like "Olá, Dami")
      if (contentTrimmed.length < 50 || /^(ol[aá]|oi|bom dia|boa tarde|boa noite)[,!.]?\s*[\w]{0,20}[!.]?$/i.test(contentTrimmed)) {
        console.warn(`[Nina] ⚠️ Prospecting response too short: "${contentTrimmed}" (${contentTrimmed.length} chars)`);
        console.warn('[Nina] 🔄 Regenerating with explicit prospecting instruction...');
        
        // Retry with explicit instruction
        const prospectingForcePrompt = processedPrompt + `

🚨🚨🚨 INSTRUÇÃO CRÍTICA - RESPONDA IMEDIATAMENTE 🚨🚨🚨

O cliente está RESPONDENDO ao template de prospecção que você enviou.
Você NÃO PODE responder apenas com "Olá" ou saudação curta.

SUA RESPOSTA OBRIGATÓRIA:
1. Se apresente: "Somos da Jacometo Seguros, corretora especializada em seguros para transportadoras."
2. Explique o motivo: "Entramos em contato pois trabalhamos com proteção de cargas e frotas."
3. Faça a pergunta: "Você é o responsável por essa área na empresa?"

MÍNIMO 2 PARÁGRAFOS. PROIBIDO resposta menor que 50 caracteres.`;
        
        const retryResponse = await fetch(LOVABLE_AI_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash', // Use more reliable model for retry
            messages: [
              { role: 'system', content: prospectingForcePrompt },
              ...conversationHistory
            ],
            temperature: 0.9,
            max_tokens: 1500
          })
        });
        
        if (retryResponse.ok) {
          const retryData = await retryResponse.json();
          const retryContent = retryData.choices?.[0]?.message?.content;
          
          if (retryContent && retryContent.trim().length > 40) {
            console.log(`[Nina] ✅ Retry successful, new response length: ${retryContent.length}`);
            aiContent = retryContent;
          } else {
            console.warn('[Nina] ⚠️ Retry also returned short response, using hardcoded fallback');
            const contactName = normalizeContactName(conversation.contact?.call_name || conversation.contact?.name);
            aiContent = contactName !== 'Cliente'
              ? `Oi, ${contactName}! Somos da Jacometo Seguros, corretora especializada em seguros para transportadoras.\n\nEntramos em contato pois trabalhamos com proteção de cargas e frotas para empresas de transporte. Você é o responsável por essa área na empresa?`
              : `Oi! Somos da Jacometo Seguros, corretora especializada em seguros para transportadoras.\n\nEntramos em contato pois trabalhamos com proteção de cargas e frotas para empresas de transporte. Você é o responsável por essa área na empresa?`;
          }
        } else {
          console.error('[Nina] ❌ Retry failed, using hardcoded fallback');
          const contactName = normalizeContactName(conversation.contact?.call_name || conversation.contact?.name);
          aiContent = contactName !== 'Cliente'
            ? `Oi, ${contactName}! Somos da Jacometo Seguros, corretora especializada em seguros para transportadoras.\n\nEntramos em contato pois trabalhamos com proteção de cargas e frotas para empresas de transporte. Você é o responsável por essa área na empresa?`
            : `Oi! Somos da Jacometo Seguros, corretora especializada em seguros para transportadoras.\n\nEntramos em contato pois trabalhamos com proteção de cargas e frotas para empresas de transporte. Você é o responsável por essa área na empresa?`;
        }
      }
    }
    // ===== END PROSPECTING RESPONSE MINIMUM LENGTH VALIDATION =====

    // ===== TRUNCATED RESPONSE DETECTION =====
    // Detect if AI response was cut mid-word (common with preview models)
    if (aiContent) {
      const trimmedContent = aiContent.trim();
      const endsWithPunctuation = /[.!?)"'\]…]$/.test(trimmedContent);
      const endsAbruptly = !endsWithPunctuation && trimmedContent.length > 20;
      
      if (endsAbruptly) {
        console.warn(`[Nina] ⚠️ AI response appears TRUNCATED (${trimmedContent.length} chars): ends with "...${trimmedContent.slice(-30)}"`);
        console.warn(`[Nina] 🔄 Retrying with stable model google/gemini-2.5-flash...`);
        
        try {
          const retryTruncResponse = await fetch(LOVABLE_AI_URL, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${lovableApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: 'google/gemini-2.5-flash',
              messages: [
                { role: 'system', content: processedPrompt },
                ...conversationHistory
              ],
              temperature: aiSettings.temperature || 0.8,
              max_tokens: 1500
            })
          });
          
          if (retryTruncResponse.ok) {
            const retryTruncData = await retryTruncResponse.json();
            const retryTruncContent = retryTruncData.choices?.[0]?.message?.content;
            
            if (retryTruncContent) {
              const retryTrimmed = retryTruncContent.trim();
              const retryEndsOk = /[.!?)"'\]…]$/.test(retryTrimmed);
              
              if (retryEndsOk || retryTrimmed.length > trimmedContent.length) {
                console.log(`[Nina] ✅ Truncation retry successful (${retryTrimmed.length} chars, ends properly: ${retryEndsOk})`);
                aiContent = retryTruncContent;
              } else {
                console.warn(`[Nina] ⚠️ Retry also truncated, using fallback`);
              }
            }
          } else {
            console.error(`[Nina] ❌ Truncation retry failed: ${retryTruncResponse.status}`);
          }
        } catch (retryErr) {
          console.error('[Nina] ❌ Truncation retry error:', retryErr);
        }
        
        // Final check: if still truncated after retry, use contextual fallback for prospecting
        const finalTrimmed = aiContent.trim();
        const stillTruncated = !/[.!?)"'\]…]$/.test(finalTrimmed) && finalTrimmed.length > 20;
        
        if (stillTruncated && conversationMetadata?.origin === 'prospeccao') {
          console.warn('[Nina] ⚠️ Still truncated after retry, using hardcoded prospecting fallback');
          const contactName = normalizeContactName(conversation.contact?.call_name || conversation.contact?.name);
          const fallbacks = [
            `${contactName !== 'Cliente' ? contactName + ', a' : 'A'} empresa tem seguro dos veículos (frota) e seguro de carga (RCTR-C) hoje? São duas proteções diferentes e essenciais para transportadoras.`,
            `${contactName !== 'Cliente' ? contactName + ', q' : 'Q'}uantos veículos tem na frota? Dependendo do tamanho, consigo condições especiais para a operação.`,
            `${contactName !== 'Cliente' ? contactName + ', v' : 'V'}ocês já tiveram algum sinistro com a frota ou carga recentemente? Isso me ajuda a entender melhor a necessidade.`
          ];
          const hash = conversation.id.charCodeAt(0) % fallbacks.length;
          aiContent = fallbacks[hash];
          console.log(`[Nina] Using prospecting fallback #${hash}`);
        }
      }
    }
    // ===== END TRUNCATED RESPONSE DETECTION =====
    
    // If still no content, use CONTEXTUAL fallback message instead of generic error
    if (!aiContent) {
      console.error('[Nina] All models returned empty response, using contextual fallback');
      console.error('[Nina] Message that caused empty response:', JSON.stringify({
        content: message.content?.substring(0, 100),
        from: message.from_type,
        conversationId: conversation.id
      }));
      
      // Use contextual fallbacks that continue the conversation naturally
      const contextualFallbacks = [
        'Entendi! Me conta mais sobre sua operação de transporte.',
        'Certo! E qual seria o valor médio das cargas transportadas?',
        'Anotado! Sua frota é própria ou agregada?',
        'Ok! Em quais estados vocês fazem entregas?',
        'Perfeito! Me passa o CNPJ da empresa para eu buscar mais informações.'
      ];
      
      // Select based on hash of conversation_id for consistency
      const hash = conversation.id.charCodeAt(0) % contextualFallbacks.length;
      aiContent = contextualFallbacks[hash];
      console.log(`[Nina] Using contextual fallback #${hash}: ${aiContent}`);
    }

    console.log('[Nina] AI response received, length:', aiContent.length);

    // Calculate response time
    const responseTime = Date.now() - new Date(message.sent_at).getTime();

    // Update original message as processed
    await supabase
      .from('messages')
      .update({ 
        processed_by_nina: true,
        nina_response_time: responseTime
      })
      .eq('id', message.id);

    // Add response delay if configured
    const delayMin = settings?.response_delay_min || 1000;
    const delayMax = settings?.response_delay_max || 3000;
    const delay = Math.random() * (delayMax - delayMin) + delayMin;

    // Check if audio response should be sent
    const incomingWasAudio = message.type === 'audio';
    const agentAudioEnabled = agent?.audio_response_enabled ?? false;
    
    // ===== DETAILED AUDIO DECISION LOGGING =====
    console.log('[Nina] 🎵 ========== AUDIO DECISION CHECK ==========');
    console.log(`[Nina] 🎵 Message type: ${message.type}`);
    console.log(`[Nina] 🎵 Incoming was audio: ${incomingWasAudio}`);
    console.log(`[Nina] 🎵 Global audio_response_enabled: ${settings?.audio_response_enabled}`);
    console.log(`[Nina] 🎵 Agent audio_response_enabled: ${agentAudioEnabled}`);
    console.log(`[Nina] 🎵 Agent name: ${agent?.name || 'nenhum'}`);
    console.log(`[Nina] 🎵 Agent ID: ${agent?.id || 'nenhum'}`);
    console.log(`[Nina] 🎵 Has ElevenLabs API key in table: ${!!settings?.elevenlabs_api_key}`);
    console.log(`[Nina] 🎵 ElevenLabs key in Vault flag: ${settings?.elevenlabs_key_in_vault}`);
    console.log(`[Nina] 🎵 Agent voice ID: ${agent?.elevenlabs_voice_id || 'usando global'}`);
    console.log(`[Nina] 🎵 Global voice ID: ${settings?.elevenlabs_voice_id || 'não configurado'}`);
    
    // Logic: respond with audio IF:
    // 1. Global audio_response_enabled is ON, OR
    // 2. Incoming was audio AND agent allows audio response
    // AND always: ElevenLabs is configured
    // AND NEVER: if it's a fallback/error message (those should always be text!)
    const isFallback = isFallbackMessage(aiContent);
    const shouldSendAudio = (
      settings?.audio_response_enabled || 
      (incomingWasAudio && agentAudioEnabled)
    ) && settings?.elevenlabs_api_key && !isFallback;

    console.log(`[Nina] 🎵 → Condition 1 (Global enabled): ${settings?.audio_response_enabled}`);
    console.log(`[Nina] 🎵 → Condition 2 (Incoming audio + Agent enabled): ${incomingWasAudio && agentAudioEnabled}`);
    console.log(`[Nina] 🎵 → Has ElevenLabs key: ${!!settings?.elevenlabs_api_key}`);
    console.log(`[Nina] 🎵 → Is fallback message: ${isFallback}`);
    console.log(`[Nina] 🎵 → FINAL DECISION - Should send audio: ${shouldSendAudio}`);
    console.log('[Nina] 🎵 ========== FIM AUDIO DECISION ==========');

    if (shouldSendAudio) {
      // ===== ANTI-DUPLICATION FOR AUDIO =====
      // Check if similar message was already sent recently
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      
      const { data: recentAudioMessages } = await supabase
        .from('messages')
        .select('content')
        .eq('conversation_id', conversation.id)
        .in('from_type', ['nina', 'human'])
        .gte('sent_at', fiveMinutesAgo)
        .order('sent_at', { ascending: false })
        .limit(5);

      const normalizedAudioContent = aiContent.toLowerCase().trim();
      const isAudioDuplicate = recentAudioMessages?.some((m: any) => {
        if (!m.content) return false;
        return m.content.toLowerCase().trim() === normalizedAudioContent;
      });

      if (isAudioDuplicate) {
        console.log('[Nina] ⚠️ Áudio duplicado detectado, não enviando resposta repetida');
        return;
      }
      // ===== END ANTI-DUPLICATION FOR AUDIO =====
      
      console.log('[Nina] 🎤 Attempting audio generation...');
      
      // Sanitize text for natural TTS pronunciation (simplify URLs)
      const sanitizedText = sanitizeTextForAudio(aiContent);
      console.log(`[Nina] 🎤 Text sanitized for TTS (${sanitizedText.length} chars)`);
      
      const audioResult = await generateAudioElevenLabs(supabase, settings, sanitizedText, agent);
      
      if (audioResult) {
        console.log(`[Nina] ✅ Audio generated successfully: ${audioResult.buffer.byteLength} bytes, format: ${audioResult.format}`);
        console.log('[Nina] 🎤 Uploading audio to storage (bucket: nina-audio)...');
        
        const audioUrl = await uploadAudioToStorage(supabase, audioResult.buffer, conversation.id, audioResult.format);
        
        if (audioUrl) {
          console.log(`[Nina] ✅ Audio uploaded successfully: ${audioUrl}`);
          
          const { error: sendQueueError } = await supabase
            .from('send_queue')
            .insert({
              conversation_id: conversation.id,
              contact_id: conversation.contact_id,
              content: aiContent,
              from_type: 'nina',
              message_type: 'audio',
              media_url: audioUrl,
              priority: 1,
              scheduled_at: new Date(Date.now() + delay).toISOString(),
              metadata: {
                response_to_message_id: message.id,
                ai_model: aiSettings.model,
                audio_generated: true,
                text_content: aiContent,
                agent_id: agent?.id,
                agent_name: agent?.name
              }
            });

          if (sendQueueError) {
            console.error('[Nina] ❌ Error queuing audio response:', sendQueueError);
            throw sendQueueError;
          }

          console.log('[Nina] ✅ Audio response queued for sending via WhatsApp');
        } else {
          console.error('[Nina] ❌ Failed to upload audio to storage (bucket may not exist or upload failed), falling back to TEXT');
          await queueTextResponse(supabase, conversation, message, aiContent, settings, aiSettings, delay, agent);
        }
      } else {
        console.error('[Nina] ❌ Failed to generate audio from ElevenLabs (API error or no key), falling back to TEXT');
        await queueTextResponse(supabase, conversation, message, aiContent, settings, aiSettings, delay, agent);
      }
    } else {
      console.log('[Nina] 📝 Sending TEXT response (audio not enabled for this case)');
      await queueTextResponse(supabase, conversation, message, aiContent, settings, aiSettings, delay, agent);
    }
  }

  // Trigger whatsapp-sender
  try {
    const senderUrl = `${supabaseUrl}/functions/v1/whatsapp-sender`;
    fetch(senderUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({ triggered_by: 'nina-orchestrator' })
    }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
  } catch (err) {
    console.error('[Nina] Failed to trigger whatsapp-sender:', err);
  }

  // Trigger analyze-conversation
  fetch(`${supabaseUrl}/functions/v1/analyze-conversation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseServiceKey}`
    },
    body: JSON.stringify({
      contact_id: conversation.contact_id,
      conversation_id: conversation.id,
      user_message: message.content,
      ai_response: aiContent,
      current_memory: clientMemory
    })
  }).catch(err => console.error('[Nina] Error triggering analyze-conversation:', err));
}

// Helper function to queue text response with chunking and duplicate check
async function queueTextResponse(
  supabase: any,
  conversation: any,
  message: any,
  aiContent: string,
  settings: any,
  aiSettings: any,
  delay: number,
  agent?: Agent | null
) {
  // ===== DUPLICATE MESSAGE CHECK =====
  // Check if the same message was sent in the last 5 minutes to prevent repetition
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  
  const { data: recentMessages } = await supabase
    .from('messages')
    .select('content')
    .eq('conversation_id', conversation.id)
    .in('from_type', ['nina', 'human'])
    .gte('sent_at', fiveMinutesAgo)
    .order('sent_at', { ascending: false })
    .limit(5);

  const normalizedNewContent = aiContent.toLowerCase().trim();
  const isDuplicate = recentMessages?.some((m: any) => {
    if (!m.content) return false;
    const normalizedExisting = m.content.toLowerCase().trim();
    // Check for exact match or very similar (>90% similarity)
    return normalizedExisting === normalizedNewContent || 
           (normalizedExisting.length > 20 && normalizedNewContent.includes(normalizedExisting.substring(0, 50)));
  });

  if (isDuplicate) {
    console.log('[Nina] ⚠️ Mensagem duplicada detectada, não enviando:', aiContent.substring(0, 50) + '...');
    return;
  }
  
  // Also check send_queue for pending duplicates
  const { data: pendingMessages } = await supabase
    .from('send_queue')
    .select('content')
    .eq('conversation_id', conversation.id)
    .in('status', ['pending', 'processing'])
    .limit(5);
    
  const isPendingDuplicate = pendingMessages?.some((m: any) => {
    if (!m.content) return false;
    return m.content.toLowerCase().trim() === normalizedNewContent;
  });
  
  if (isPendingDuplicate) {
    console.log('[Nina] ⚠️ Mensagem já está na fila de envio, não duplicando');
    return;
  }
  // ===== END DUPLICATE MESSAGE CHECK =====

  let messageChunks = settings?.message_breaking_enabled 
    ? breakMessageIntoChunks(aiContent)
    : [aiContent];

  // ===== CHUNK TRUNCATION VALIDATION =====
  // Validate that the last chunk is not truncated (cut mid-word)
  if (messageChunks.length > 1) {
    const lastChunk = messageChunks[messageChunks.length - 1].trim();
    const lastChunkEndsOk = /[.!?)"'\]…]$/.test(lastChunk);
    
    if (!lastChunkEndsOk && lastChunk.length > 10) {
      console.warn(`[Nina] ⚠️ Last chunk appears truncated: "...${lastChunk.slice(-30)}"`);
      
      // Merge last chunk into previous one if it's short, or discard if it looks incomplete
      if (lastChunk.length < 40) {
        // Short truncated chunk - merge with previous
        messageChunks[messageChunks.length - 2] += '\n' + lastChunk;
        messageChunks.pop();
        console.log('[Nina] Merged truncated last chunk into previous');
      } else {
        // Longer but still truncated - try to trim to last complete sentence
        const lastSentenceEnd = lastChunk.search(/[.!?]\s*(?=[A-ZÀ-Ú]|$)/);
        if (lastSentenceEnd > 10) {
          messageChunks[messageChunks.length - 1] = lastChunk.substring(0, lastSentenceEnd + 1);
          console.log(`[Nina] Trimmed truncated last chunk to ${lastSentenceEnd + 1} chars`);
        }
      }
    }
  }
  // ===== END CHUNK TRUNCATION VALIDATION =====

  console.log(`[Nina] Sending ${messageChunks.length} text message chunk(s)`);

  for (let i = 0; i < messageChunks.length; i++) {
    const chunkDelay = delay + (i * 1500);
    
    const { error: sendQueueError } = await supabase
      .from('send_queue')
      .insert({
        conversation_id: conversation.id,
        contact_id: conversation.contact_id,
        content: messageChunks[i],
        from_type: 'nina',
        message_type: 'text',
        priority: 1,
        scheduled_at: new Date(Date.now() + chunkDelay).toISOString(),
        metadata: {
          response_to_message_id: message.id,
          ai_model: aiSettings.model,
          chunk_index: i,
          total_chunks: messageChunks.length,
          agent_id: agent?.id,
          agent_name: agent?.name
        }
      });

    if (sendQueueError) {
      console.error('[Nina] Error queuing response chunk:', sendQueueError);
      throw sendQueueError;
    }
  }

  console.log('[Nina] Text response(s) queued for sending');
}

// ===== INTERACTIVE BUTTONS SUPPORT =====
// Helper function to queue interactive button messages
async function queueInteractiveButtons(
  supabase: any,
  conversation: any,
  bodyText: string,
  buttons: Array<{ id: string; title: string }>,
  delay: number,
  agent?: Agent | null
) {
  // Validate buttons (WhatsApp max 3 buttons, 20 chars each)
  if (buttons.length > 3) {
    console.warn('[Nina] Warning: More than 3 buttons provided, truncating to 3');
    buttons = buttons.slice(0, 3);
  }
  
  const validatedButtons = buttons.map(btn => ({
    id: btn.id.substring(0, 256), // Button ID max 256 chars
    title: btn.title.substring(0, 20) // Button title max 20 chars
  }));
  
  const interactivePayload = {
    type: 'button',
    body: { text: bodyText },
    action: {
      buttons: validatedButtons.map(btn => ({
        type: 'reply',
        reply: { id: btn.id, title: btn.title }
      }))
    }
  };

  const { error: sendQueueError } = await supabase
    .from('send_queue')
    .insert({
      conversation_id: conversation.id,
      contact_id: conversation.contact_id,
      content: bodyText,
      from_type: 'nina',
      message_type: 'interactive',
      priority: 1,
      scheduled_at: new Date(Date.now() + delay).toISOString(),
      metadata: {
        interactive_payload: interactivePayload,
        button_context: 'triagem_inicial',
        buttons: validatedButtons,
        agent_id: agent?.id,
        agent_name: agent?.name
      }
    });

  if (sendQueueError) {
    console.error('[Nina] Error queuing interactive buttons:', sendQueueError);
    throw sendQueueError;
  }

  console.log('[Nina] 🔘 Interactive buttons queued:', validatedButtons.map(b => b.title).join(', '));
}
// ===== END INTERACTIVE BUTTONS SUPPORT =====

function getDefaultSystemPrompt(): string {
  return `Você é Nina, assistente virtual inteligente da empresa. Seu papel é:

1. ATENDIMENTO: Responder de forma profissional, amigável e eficiente
2. QUALIFICAÇÃO: Entender as necessidades do cliente e qualificá-lo
3. VENDAS: Apresentar soluções e benefícios dos produtos/serviços
4. AGENDAMENTO: Quando necessário, sugerir agendar uma reunião ou demo

REGRAS:
- Use linguagem natural e amigável (estilo WhatsApp)
- Seja conciso (mensagens de até 3 parágrafos)
- Faça perguntas para entender melhor o cliente
- Nunca invente informações sobre preços ou produtos
- Se não souber algo, ofereça transferir para um atendente humano

INFORMAÇÕES DA EMPRESA:
- Oferecemos soluções de automação e IA para empresas
- Horário de atendimento: Segunda a Sexta, 9h às 18h
- Para casos urgentes, um humano pode assumir a conversa`;
}

function processPromptTemplate(prompt: string, contact: any): string {
  const now = new Date();
  const brOptions: Intl.DateTimeFormatOptions = { timeZone: 'America/Sao_Paulo' };
  
  const dateFormatter = new Intl.DateTimeFormat('pt-BR', { 
    ...brOptions, 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric' 
  });
  const timeFormatter = new Intl.DateTimeFormat('pt-BR', { 
    ...brOptions, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit',
    hour12: false
  });
  const weekdayFormatter = new Intl.DateTimeFormat('pt-BR', { 
    ...brOptions, 
    weekday: 'long' 
  });
  
  const variables: Record<string, string> = {
    'data_hora': `${dateFormatter.format(now)} ${timeFormatter.format(now)}`,
    'data': dateFormatter.format(now),
    'hora': timeFormatter.format(now),
    'dia_semana': weekdayFormatter.format(now),
    'cliente_nome': normalizeContactName(contact?.call_name || contact?.name),
    'cliente_telefone': contact?.phone_number || '',
  };
  
  return prompt.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, varName) => {
    return variables[varName] || match;
  });
}

function buildEnhancedPrompt(
  basePrompt: string, 
  contact: any, 
  memory: any,
  agent?: Agent | null,
  ninaContext?: any,
  recentUserMessages?: string[],
  recentCallLogs?: any[],
  returningLeadInfo?: { isReturning: boolean; daysSinceLastContact: number; previousTopics: string[]; context: any }
): string {
  let contextInfo = '';

  // Add agent info
  if (agent) {
    contextInfo += `\n\nAGENTE: ${agent.name}`;
    if (agent.specialty) contextInfo += ` (${agent.specialty})`;
  }

  if (contact) {
    contextInfo += `\n\nCONTEXTO DO CLIENTE:`;
    if (contact.name) contextInfo += `\n- Nome: ${normalizeContactName(contact.name)}`;
    if (contact.call_name) contextInfo += ` (trate por: ${normalizeContactName(contact.call_name)})`;
    if (contact.tags?.length) contextInfo += `\n- Tags: ${contact.tags.join(', ')}`;
    
    // Cidade/Estado do lead (extraído do DDD do telefone)
    if (contact.city && contact.state) {
      contextInfo += `\n- Localização (pelo DDD): ${contact.city} - ${contact.state}`;
      contextInfo += `\n  ⚠️ CONFIRME a cidade ao invés de perguntar! Ex: "Você está em ${contact.city}?" ou use diretamente.`;
    } else if (contact.state) {
      contextInfo += `\n- Estado (pelo DDD): ${contact.state}`;
      contextInfo += `\n  ⚠️ Use esta informação e pergunte apenas a cidade.`;
    }
    
    // ===== NOTAS/RESUMO ANTERIOR DO CLIENTE (HISTÓRICO) =====
    if (contact.notes && contact.notes.trim()) {
      contextInfo += `\n\n## NOTAS/RESUMO ANTERIOR (HISTÓRICO DO CLIENTE):
${contact.notes}

⚠️ IMPORTANTE: Este cliente já entrou em contato antes. Use essas informações para dar continuidade sem repetir perguntas já respondidas.`;
    }
  }
  
  // ===== RETURNING LEAD CONTEXT - CRITICAL FOR CONTEXTUAL RESPONSES =====
  if (returningLeadInfo?.isReturning && returningLeadInfo.daysSinceLastContact >= 1) {
    const ctx = returningLeadInfo.context || {};
    
    contextInfo += `\n\n## ⚠️ LEAD RECORRENTE (MUITO IMPORTANTE!)
Este cliente entrou em contato há ${returningLeadInfo.daysSinceLastContact} dia(s) e está VOLTANDO agora.`;
    
    if (returningLeadInfo.previousTopics.length > 0) {
      contextInfo += `\n\n### TÓPICOS ANTERIORES DETECTADOS:`;
      
      if (ctx.hasJobInquiry) {
        contextInfo += `\n- ❌ Perguntou sobre EMPREGO/CURRÍCULO anteriormente`;
      }
      if (ctx.hasInsuranceInquiry) {
        contextInfo += `\n- ✓ Já demonstrou interesse em SEGURO DE CARGA`;
      }
      if (ctx.wasRejected) {
        contextInfo += `\n- ⚠️ Foi dispensado na última conversa: "${ctx.rejectionReason || 'motivo não identificado'}"`;
      }
    }
    
    contextInfo += `\n\n### 🎯 COMO RESPONDER A ESTE LEAD:
1. RECONHEÇA o contato anterior de forma amigável
2. Se ele perguntou sobre EMPREGO antes e agora quer SEGURO, mencione naturalmente:
   "Que bom ter você de volta! Vi que você entrou em contato antes. Agora está buscando seguro de carga?"
3. Se ele foi dispensado antes por motivo X, mas agora busca algo que PODEMOS atender, seja empático e acolhedor
4. NUNCA trate como novo lead - use o contexto disponível
5. Caso não tenha certeza do interesse atual, pergunte diretamente:
   "Olá! Como posso te ajudar hoje? Está buscando seguro de carga ou deseja enviar currículo?"

### Exemplo de saudação para lead recorrente:
"Olá {nome}! Que bom ter você de volta! 😊 Como posso te ajudar hoje?"

Se detectar que era interesse em emprego antes e agora é seguro:
"Olá {nome}! Vi que você entrou em contato antes perguntando sobre vagas. Agora está buscando seguro de carga? Me conta: você trabalha como contratado direto ou subcontratado?"`;
  }
  
  // ===== HISTÓRICO DE LIGAÇÕES COM TRANSCRIÇÕES =====
  if (recentCallLogs && recentCallLogs.length > 0) {
    contextInfo += `\n\n## RESUMO DE LIGAÇÕES ANTERIORES:`;
    for (const call of recentCallLogs) {
      const date = new Date(call.started_at).toLocaleDateString('pt-BR');
      const status = call.status === 'completed' ? 'Atendida' : call.status;
      const transcription = call.transcription 
        ? call.transcription.substring(0, 500) + (call.transcription.length > 500 ? '...' : '')
        : 'Sem transcrição disponível';
      contextInfo += `\n[${date} - ${status}]: ${transcription}`;
    }
    contextInfo += `\n\n⚠️ Use o histórico de ligações para contextualizar a conversa e não repetir perguntas.`;
  }

  // ===== QUALIFICATION ANSWERS - CRITICAL ANTI-REPETITION =====
  if (ninaContext?.qualification_answers) {
    const qa = ninaContext.qualification_answers;
    const answeredFields: string[] = [];
    
    // Map field names to readable labels
    const fieldLabels: Record<string, string> = {
      contratacao: 'Tipo de contratação',
      tipo_carga: 'Tipo de carga',
      estados: 'Estados atendidos',
      viagens_mes: 'Viagens/mês',
      valor_medio: 'Valor médio por carga',
      maior_valor: 'Maior valor transportado',
      tipo_frota: 'Tipo de frota',
      antt: 'ANTT',
      cte: 'Emite CT-e',
      sinistros: 'Histórico de sinistros',
      plano_tipo: 'Tipo de plano',
      quantidade_vidas: 'Quantidade de vidas',
      idades: 'Idades dos beneficiários',
      cidade: 'Cidade/região',
      operadora_preferida: 'Operadora preferida',
      // New insurance status fields
      tem_seguro_veiculo: 'Já tem seguro de veículo',
      tem_seguro_carga: 'Já tem seguro de carga',
      vencimento_seguro: 'Vencimento do seguro',
      satisfacao_seguradora: 'Satisfação com seguradora'
    };
    
    for (const [key, value] of Object.entries(qa)) {
      if (value && fieldLabels[key]) {
        answeredFields.push(`- ${fieldLabels[key]}: ${value}`);
      }
    }
    
    if (answeredFields.length > 0) {
      contextInfo += `\n\n## INFORMAÇÕES JÁ COLETADAS (NÃO PERGUNTE NOVAMENTE, NÃO REPITA):\n${answeredFields.join('\n')}`;
    }
  }
  
  // ===== EXISTING INSURANCE CONTEXT - CRITICAL FOR RENEWAL FLOW =====
  if (ninaContext?.insurance_status) {
    const ins = ninaContext.insurance_status;
    
    if (ins.has_vehicle_insurance || ins.has_cargo_insurance) {
      contextInfo += `\n\n## ⚠️ ATENÇÃO: LEAD JÁ TEM SEGURO!`;
      
      if (ins.has_vehicle_insurance) {
        contextInfo += `\n- ✅ Confirmou que JÁ TEM seguro de VEÍCULOS/FROTA`;
      }
      if (ins.has_cargo_insurance) {
        contextInfo += `\n- ✅ Confirmou que JÁ TEM seguro de CARGA/RCTR-C`;
      }
      if (ins.renewal_date) {
        contextInfo += `\n- 📅 Vencimento informado: ${ins.renewal_date}`;
      }
      if (ins.is_dissatisfied) {
        contextInfo += `\n- 😞 INSATISFEITO com seguradora atual (oportunidade!)`;
      } else if (ins.is_satisfied) {
        contextInfo += `\n- 😊 Satisfeito com seguradora atual`;
      }
      
      contextInfo += `\n
### 🎯 FLUXO OBRIGATÓRIO PARA LEAD QUE JÁ TEM SEGURO:

1. **NÃO pergunte** "qual seguro você precisa?" - ELE JÁ TEM!
2. **Pergunte o VENCIMENTO** se ainda não informou: "Quando vence a apólice atual?"
3. **Pergunte sobre SATISFAÇÃO** se não informou: "Está satisfeito com o atendimento?"
4. **Ofereça COTAÇÃO COMPARATIVA**: "Posso preparar uma cotação comparativa sem compromisso!"
5. **CROSS-SELL**: Se só falou de veículo, pergunte sobre CARGA. Se só falou de carga, pergunte sobre VEÍCULO.

### Exemplo de resposta correta:
"Ótimo! E quando vence a apólice atual? Posso preparar uma cotação comparativa pra vocês avaliarem na renovação!"

### ❌ NUNCA FAÇA:
- Follow-up genérico "o que você precisa?"
- Repetir pergunta sobre produto
- Ignorar que ele já tem seguro`;
    }
  }

  if (memory && Object.keys(memory).length > 0) {
    contextInfo += `\n\nMEMÓRIA DO CLIENTE:`;
    
    if (memory.lead_profile) {
      const lp = memory.lead_profile;
      if (lp.interests?.length) contextInfo += `\n- Interesses: ${lp.interests.join(', ')}`;
      if (lp.products_discussed?.length) contextInfo += `\n- Produtos discutidos: ${lp.products_discussed.join(', ')}`;
      if (lp.lead_stage) contextInfo += `\n- Estágio: ${lp.lead_stage}`;
    }
    
    if (memory.sales_intelligence) {
      const si = memory.sales_intelligence;
      if (si.pain_points?.length) contextInfo += `\n- Dores: ${si.pain_points.join(', ')}`;
      if (si.next_best_action) contextInfo += `\n- Próxima ação sugerida: ${si.next_best_action}`;
    }
  }

  // ===== ÚLTIMAS RESPOSTAS DO CLIENTE - REFERÊNCIA PARA VERIFICAR HISTÓRICO =====
  if (recentUserMessages && recentUserMessages.length > 0) {
    contextInfo += `\n\n## ÚLTIMAS RESPOSTAS DO CLIENTE (VERIFIQUE ANTES DE PERGUNTAR):`;
    for (const msg of recentUserMessages) {
      contextInfo += `\n- "${msg}"`;
    }
  }

  // ===== DADOS JÁ OBTIDOS - RESUMO PARA O AGENTE =====
  // Build a clear list of what data we already have
  const qa = ninaContext?.qualification_answers || {};
  const collectedData: string[] = [];
  const pendingData: string[] = [];
  
  const fieldsToTrack = [
    { field: 'contratacao', label: 'Tipo contratação' },
    { field: 'tipo_carga', label: 'Tipo de carga' },
    { field: 'valor_medio', label: 'Valor médio' },
    { field: 'maior_valor', label: 'Maior valor' },
    { field: 'viagens_mes', label: 'Viagens/mês' },
    { field: 'tipo_frota', label: 'Tipo de frota' },
    { field: 'estados', label: 'Estados' },
    { field: 'antt', label: 'ANTT' },
    { field: 'cte', label: 'CT-e' },
  ];
  
  for (const item of fieldsToTrack) {
    if (qa[item.field]) {
      collectedData.push(`✅ ${item.label}: ${qa[item.field]}`);
    } else {
      pendingData.push(`⏳ ${item.label}: PENDENTE`);
    }
  }
  
  // Add contact CNPJ if available
  if (contact?.cnpj) {
    collectedData.push(`✅ CNPJ: ${contact.cnpj}`);
  } else {
    pendingData.push(`⏳ CNPJ: PENDENTE`);
  }
  
  if (collectedData.length > 0) {
    contextInfo += `\n\n## 📊 STATUS DA QUALIFICAÇÃO:\n### JÁ COLETADO (NÃO PERGUNTE):\n${collectedData.join('\n')}`;
  }
  
  if (pendingData.length > 0 && pendingData.length < 6) {
    contextInfo += `\n\n### AINDA FALTA COLETAR:\n${pendingData.join('\n')}`;
    contextInfo += `\n\n⚠️ ATENÇÃO: Pergunte APENAS sobre os itens PENDENTES acima.`;
  }

  // ===== PERGUNTAS JÁ FEITAS PELO AGENTE =====
  if (ninaContext?.questions_asked && Object.keys(ninaContext.questions_asked).length > 0) {
    const fieldLabelsForQuestions: Record<string, string> = {
      contratacao: 'Tipo de contratação (direto/subcontratado)',
      tipo_carga: 'Tipo de carga transportada',
      estados: 'Estados/regiões atendidos',
      viagens_mes: 'Quantidade de viagens por mês',
      valor_medio: 'Valor médio por carga',
      maior_valor: 'Maior valor transportado',
      tipo_frota: 'Tipo de frota (própria/agregada)',
      antt: 'Situação da ANTT/RNTRC',
      cte: 'Emissão de CT-e',
      cnpj: 'CNPJ da empresa',
      email: 'Email para contato'
    };
    
    const askedList = Object.entries(ninaContext.questions_asked)
      .filter(([_, timestamp]) => timestamp)
      .map(([field]) => fieldLabelsForQuestions[field] || field);
    
    if (askedList.length > 0) {
      contextInfo += `\n\n## ⚠️ PERGUNTAS QUE VOCÊ JÁ FEZ (NÃO REPITA!):`;
      for (const q of askedList) {
        contextInfo += `\n- ❌ ${q}`;
      }
      contextInfo += `\n\n🚫 PROIBIDO perguntar sobre estes itens novamente!`;
      contextInfo += `\nSe não recebeu resposta clara, prossiga para o próximo item PENDENTE.`;
    }
  }

  // ===== ANTI-ECO + VERIFICAÇÃO DE HISTÓRICO =====
  contextInfo += `\n\n## REGRAS CRÍTICAS DE COMUNICAÇÃO:

### REGRA ANTI-ECO (CRÍTICO):
- NUNCA repita ou resuma o que o cliente acabou de dizer
- Vá DIRETO para a próxima pergunta ou ação
- NÃO use frases como "Entendi que você...", "Então você transporta...", "Certo, [resposta]..."

ERRADO: "Entendi, alimentos. Quais estados atende?"
CORRETO: "Quais estados atende?"

### ⚠️ REGRA CRÍTICA DE USO DO NOME (OBRIGATÓRIO — PRIORIDADE MÁXIMA):
- O nome do lead é: {{cliente_nome}}. Use EXATAMENTE este nome, sem variações.
- SEMPRE use APENAS o PRIMEIRO NOME do lead, com inicial maiúscula (Title Case)
- NUNCA use o nome completo (ex: "Felipe Lazzari") — use apenas "Felipe"
- NUNCA use nome em CAIXA ALTA (ex: "FELIPE", "LEONARDO") — use "Felipe", "Leonardo"
- NUNCA repita o padrão de nome que aparece no histórico se estiver em CAPS ou completo
- A variável {{cliente_nome}} já contém o primeiro nome formatado — use-a diretamente

### REGRA VERIFICAR ANTES DE PERGUNTAR (OBRIGATÓRIO):
Antes de fazer QUALQUER pergunta:
1. LEIA o "STATUS DA QUALIFICAÇÃO" → Se está ✅, NÃO pergunte
2. LEIA "PERGUNTAS QUE VOCÊ JÁ FEZ" → Se listado, NÃO pergunte novamente
3. Avance APENAS para itens ⏳ PENDENTES que você AINDA NÃO PERGUNTOU

### REGRA DE RESPOSTAS NUMÉRICAS:
- Se cliente responde só número (ex: "140"), assuma que são valores razoáveis para carga
- "140" sozinho provavelmente significa "140 mil reais"
- Aguarde próxima mensagem se precisar de mais contexto, mas NÃO repita a pergunta

### Se cliente reclamar "já respondi" ou "já informei":
- NÃO peça para repetir
- Diga: "Desculpe! Vi aqui que você já informou. Vamos continuar..."
- Avance IMEDIATAMENTE para próximo item PENDENTE

### REGRA DE FINALIZAÇÃO:`;

  // Email rule only for Atlas (vehicle leads require email)
  // Íris explicitly does NOT request email (transporters prefer WhatsApp per agent instructions)
  if (agent?.slug === 'atlas') {
    contextInfo += `
- Ao coletar todas as informações de veículos, solicite o email para enviar a cotação
- Pergunte: "Qual seu melhor email para eu enviar a cotação?"`;
  }

  return basePrompt + contextInfo;
}

function breakMessageIntoChunks(content: string): string[] {
  const chunks = content
    .split(/\n\n+/)
    .map(chunk => chunk.trim())
    .filter(chunk => chunk.length > 0);
  
  return chunks.length > 0 ? chunks : [content];
}

function getModelSettings(
  settings: any,
  conversationHistory: any[],
  message: any,
  contact: any,
  clientMemory: any
): { model: string; temperature: number } {
  const modelMode = settings?.ai_model_mode || 'flash';
  
  switch (modelMode) {
    case 'flash':
      return { model: 'google/gemini-2.5-flash', temperature: 0.7 };
    case 'pro':
      return { model: 'google/gemini-2.5-pro', temperature: 0.7 };
    case 'pro3':
      return { model: 'google/gemini-3-pro-preview', temperature: 0.7 };
    case 'adaptive':
      return getAdaptiveSettings(conversationHistory, message, contact, clientMemory);
    default:
      return { model: 'google/gemini-2.5-flash', temperature: 0.7 };
  }
}

function getAdaptiveSettings(
  conversationHistory: any[], 
  message: any, 
  contact: any,
  clientMemory: any
): { model: string; temperature: number } {
  const defaultSettings = {
    model: 'google/gemini-2.5-flash',
    temperature: 0.7
  };

  const messageCount = conversationHistory.length;
  const userContent = message.content?.toLowerCase() || '';
  
  const isComplaintKeywords = ['problema', 'erro', 'não funciona', 'reclamação', 'péssimo', 'horrível'];
  const isSalesKeywords = ['preço', 'valor', 'desconto', 'comprar', 'contratar', 'plano'];
  const isTechnicalKeywords = ['como funciona', 'integração', 'api', 'configurar', 'instalar'];
  const isUrgentKeywords = ['urgente', 'agora', 'rápido', 'emergência'];

  const isComplaint = isComplaintKeywords.some(k => userContent.includes(k));
  const isSales = isSalesKeywords.some(k => userContent.includes(k));
  const isTechnical = isTechnicalKeywords.some(k => userContent.includes(k));
  const isUrgent = isUrgentKeywords.some(k => userContent.includes(k));
  
  const leadStage = clientMemory?.lead_profile?.lead_stage;
  const qualificationScore = clientMemory?.lead_profile?.qualification_score || 0;

  if (isComplaint || isUrgent) {
    return { model: 'google/gemini-2.5-pro', temperature: 0.3 };
  }

  if (isSales && qualificationScore > 50) {
    return { model: 'google/gemini-2.5-flash', temperature: 0.5 };
  }

  if (isTechnical) {
    return { model: 'google/gemini-2.5-pro', temperature: 0.4 };
  }

  if (messageCount < 5) {
    return { model: 'google/gemini-2.5-flash', temperature: 0.8 };
  }

  if (messageCount > 15) {
    return { model: 'google/gemini-2.5-flash', temperature: 0.5 };
  }

  return defaultSettings;
}
