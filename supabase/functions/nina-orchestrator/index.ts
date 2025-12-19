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

    // Get Nina settings
    const { data: settings } = await supabase
      .from('nina_settings')
      .select('*')
      .maybeSingle();

    if (!settings) {
      console.log('[Nina] Sistema não configurado, marcando mensagens como não processadas');
      for (const item of queueItems) {
        await supabase
          .from('nina_processing_queue')
          .update({ 
            status: 'failed', 
            processed_at: new Date().toISOString(),
            error_message: 'Sistema não configurado - acesse /settings para configurar'
          })
          .eq('id', item.id);
      }
      return new Response(JSON.stringify({ 
        processed: 0, 
        reason: 'system_not_configured',
        message: 'Acesse /settings para configurar o sistema' 
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
  
  // PRIORIDADE 1: Se conversa é de prospecção ativa, usar Leonardo
  const conversationMetadata = conversation.metadata || {};
  if (conversationMetadata.origin === 'prospeccao') {
    const leonardoAgent = agents.find(a => a.slug === 'leonardo');
    if (leonardoAgent) {
      console.log(`[Nina] Prospecting conversation - using Leonardo agent`);
      return { agent: leonardoAgent, isHandoff: false };
    }
  }
  
  // PRIORIDADE 2: Verificar keywords para permitir handoffs pós-triagem
  for (const agent of agents) {
    if (agent.is_default) continue;
    
    const hasKeywordMatch = agent.detection_keywords.some(keyword => 
      content.includes(keyword.toLowerCase())
    );
    
    if (hasKeywordMatch) {
      console.log(`[Nina] Detected keyword match for agent: ${agent.name}`);
      const isNewHandoff = conversation.current_agent_id !== agent.id;
      return { agent, isHandoff: isNewHandoff };
    }
  }
  
  // Se não houver match de keyword, continuar com agente atual
  if (conversation.current_agent_id) {
    const currentAgent = agents.find(a => a.id === conversation.current_agent_id);
    if (currentAgent) {
      console.log(`[Nina] Continuing with assigned agent: ${currentAgent.name}`);
      return { agent: currentAgent, isHandoff: false };
    }
  }
  
  // Return default agent
  return { agent: defaultAgent || null, isHandoff: false };
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
    'número antigo', 'numero antigo', 'mudou de dono'
  ];
  
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
];

// Patterns for minimalist client responses confirming closure
const CLIENT_CLOSURE_PATTERNS = [
  /^(ok|ok\.|okay|certo|blz|vlw|valeu|obrigad)\.?$/i,
  /^(entendi|beleza|tá\s*bom|ta\s*bom|combinado)\.?$/i,
  /^(pode\s*ser|tranquilo|de\s*boa|suave)\.?$/i,
  /^(brigad|obg|grato|grata)\.?$/i,
  /^👍$/,
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
    return { hasIntent: false };
  }
  
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
  
  // Try to extract specific day
  const now = new Date();
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
  }
  
  // Next week
  if (content.includes('semana que vem') || content.includes('próxima semana') || content.includes('proxima semana')) {
    suggestedDate = new Date(now);
    suggestedDate.setDate(suggestedDate.getDate() + 7);
  }
  
  return {
    hasIntent: true,
    suggestedDate,
    suggestedTime,
    rawText: content
  };
}

// Calculate next business hour for callback scheduling
function calculateNextBusinessHour(suggestedDate?: Date, suggestedTime?: string): Date {
  const now = new Date();
  let targetDate = suggestedDate ? new Date(suggestedDate) : new Date(now);
  
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
  while (targetDate.getDay() === 0 || targetDate.getDay() === 6) {
    targetDate.setDate(targetDate.getDate() + 1);
    targetDate.setHours(9, 0, 0, 0);
  }
  
  // Ensure it's in the future
  if (targetDate <= now) {
    targetDate = new Date(now);
    targetDate.setMinutes(targetDate.getMinutes() + 30);
  }
  
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
    const contactName = contact?.name || contact?.call_name || 'Cliente';
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

// ===== REAL-TIME QUALIFICATION EXTRACTION FUNCTION =====
// Extract qualification answers from user messages for immediate saving
function extractQualificationFromMessages(userMessages: string[]): { [key: string]: string | null } {
  const extracted: { [key: string]: string | null } = {};
  const allText = userMessages.join(' ').toLowerCase();
  
  // Patterns for qualification fields
  const patterns: { [key: string]: RegExp } = {
    contratacao: /\b(direto|subcontratado|ambos|contratado direto|subcontrata|sub-contratado)\b/i,
    tipo_carga: /\b(alumínio|aluminio|ferro|grão|grãos|graos|grao|alimento|alimentos|químico|quimicos|químicos|madeira|cimento|frigorific|refrigerad|seca|geral|carga geral|paletizada|granel|container|containers|bebidas?|perecíveis|pereciveis|eletrônicos|eletronicos|máquinas|maquinas|equipamentos?)\b/i,
    tipo_frota: /\b(própria|propria|próprio|proprio|agregado|agregados|terceiro|terceiros|frota própria|frota propria|mista)\b/i,
    antt: /\b(regularizada|pessoa física|pessoa fisica|ativa|não tenho antt|nao tenho antt|em processo|sim tenho|tenho sim|antt ok|antt ativa)\b/i,
    cte: /\b(sim|não|nao|emito|emite|vou começar|vou comecar|já emito|ja emito|emitimos|não emito|nao emito|emissão|emissao)\b/i,
  };
  
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
  
  // Extract viagens/mes (numeric pattern)
  const viagensMatch = allText.match(/(\d+)\s*(?:viagens?|vezes?|por mês|ao mês|por mes|mensal|mensais)/i);
  if (viagensMatch) {
    extracted.viagens_mes = viagensMatch[1];
  }
  
  // Extract valor médio (currency pattern)
  const valorMatch = allText.match(/(?:R\$|reais)\s*(\d+(?:\.\d{3})*(?:,\d{2})?)|(\d+(?:\.\d{3})*(?:,\d{2})?)\s*(?:mil|reais)/gi);
  if (valorMatch && valorMatch.length > 0) {
    extracted.valor_medio = valorMatch[0];
  }
  
  return extracted;
}

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

    const { data: urlData } = supabase.storage
      .from('nina-audio')
      .getPublicUrl(fileName);

    console.log(`[Nina] Audio uploaded (${format}):`, urlData.publicUrl);
    return urlData.publicUrl;
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

  // Check if auto-response is enabled
  if (!settings?.auto_response_enabled) {
    console.log('[Nina] Auto-response disabled, marking as processed without responding');
    await supabase
      .from('messages')
      .update({ processed_by_nina: true })
      .eq('id', message.id);
    return;
  }

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
  if (message.content) {
    // Get last agent message before this client message
    const { data: lastAgentMessages } = await supabase
      .from('messages')
      .select('content')
      .eq('conversation_id', conversation.id)
      .in('from_type', ['nina', 'human'])
      .lt('sent_at', message.sent_at)
      .order('sent_at', { ascending: false })
      .limit(1);
    
    const lastAgentMessage = lastAgentMessages?.[0]?.content || null;
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

  // ===== PROSPECTING REJECTION DETECTION =====
  // Check if this is a prospecting conversation and message is a rejection
  if (conversationMetadata.origin === 'prospeccao' && message.content && isProspectingRejection(message.content)) {
    console.log(`[Nina] 🚫 Prospecting rejection detected: "${message.content}"`);
    
    // Use agent's handoff_message (graceful exit message)
    const rejectionResponse = agent?.handoff_message || 'Obrigado pelo retorno! Desculpe o contato.';
    
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
          // Generate response with scheduled time and assignee name
          const formattedDate = scheduledAt.toLocaleDateString('pt-BR', { 
            weekday: 'long', 
            day: '2-digit', 
            month: 'long',
            timeZone: 'America/Sao_Paulo'
          });
          const formattedTime = scheduledAt.toLocaleTimeString('pt-BR', { 
            hour: '2-digit', 
            minute: '2-digit',
            timeZone: 'America/Sao_Paulo'
          });
          
          const contactName = conversation.contact?.call_name || conversation.contact?.name || 'você';
          let responseText = `Perfeito, ${contactName}! `;
          
          if (assignee) {
            responseText += `${assignee.name} vai entrar em contato ${formattedDate} às ${formattedTime}.`;
          } else {
            responseText += `Vamos entrar em contato ${formattedDate} às ${formattedTime}.`;
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
  }
  // ===== END PROSPECTING STAGE UPDATE =====

  // Update conversation with current agent if changed
  if (agent && conversation.current_agent_id !== agent.id) {
    await supabase
      .from('conversations')
      .update({ current_agent_id: agent.id })
      .eq('id', conversation.id);
    console.log(`[Nina] Updated conversation agent to: ${agent.name}`);

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
        }
      }
    }
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

  // Get recent messages for context (last 20)
  const { data: recentMessages } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversation.id)
    .order('sent_at', { ascending: false })
    .limit(20);

  // Build conversation history for AI
  const conversationHistory = (recentMessages || [])
    .reverse()
    .map((msg: any) => ({
      role: msg.from_type === 'user' ? 'user' : 'assistant',
      content: msg.content || '[media]'
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

  // ===== REAL-TIME QUALIFICATION EXTRACTION =====
  // Extract qualification answers from user messages immediately and save to nina_context
  const userMessagesContent = (recentMessages || [])
    .filter((m: any) => m.from_type === 'user' && m.content)
    .map((m: any) => m.content);
  
  const extractedQA = extractQualificationFromMessages(userMessagesContent);
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
  // ===== END REAL-TIME QUALIFICATION EXTRACTION =====

  // ===== QUALIFICATION COMPLETE CHECK - HANDOFF TO HUMAN =====
  // Check if all essential qualification fields are collected - if so, thank and handoff
  const qualificationComplete = isQualificationComplete(conversation.contact, mergedQA);
  
  if (qualificationComplete) {
    console.log(`[Nina] ✅ Qualificação completa! Dados coletados:`, mergedQA);
    
    // Send thank you / transition message
    const contactName = conversation.contact?.call_name || conversation.contact?.name || '';
    const thankYouMessage = contactName 
      ? `Perfeito, ${contactName}! 🎯 Tenho todas as informações para montar sua cotação. Vou encaminhar para o corretor responsável que vai entrar em contato em breve. Obrigada pelo contato!`
      : `Perfeito! 🎯 Tenho todas as informações para montar sua cotação. Vou encaminhar para o corretor responsável que vai entrar em contato em breve. Obrigada pelo contato!`;
    
    // Calculate delay
    const delayMin = settings?.response_delay_min || 1000;
    const delayMax = settings?.response_delay_max || 3000;
    const delay = Math.random() * (delayMax - delayMin) + delayMin;
    
    // Get AI settings for metadata
    const aiSettings = getModelSettings(settings, conversationHistory, message, conversation.contact, clientMemory);
    
    // Queue the handoff message
    await queueTextResponse(supabase, conversation, message, thankYouMessage, settings, aiSettings, delay, agent);
    
    // Mark message as processed
    const responseTime = Date.now() - new Date(message.sent_at).getTime();
    await markMessagesAsProcessed(supabase, message.id, aggregatedMessageIds, responseTime);
    
    // Change conversation status to human
    await supabase
      .from('conversations')
      .update({ 
        status: 'human',
        nina_context: {
          ...conversation.nina_context,
          qualification_answers: mergedQA,
          qualification_completed_at: new Date().toISOString()
        }
      })
      .eq('id', conversation.id);
    
    // Move deal to "Qualificado" stage if it exists
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
        // Fetch deal owner email
        const { data: dealWithOwner } = await supabase
          .from('deals')
          .select('owner_id')
          .eq('id', deal.id)
          .single();
        
        let ownerEmail = 'atendimento@jacometo.com.br'; // fallback
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
        const contactName = conversation.contact?.name || conversation.contact?.phone_number || 'Lead';
        const contactPhone = conversation.contact?.phone_number || '-';
        const contactCnpj = conversation.contact?.cnpj || '-';
        const contactCompany = conversation.contact?.company || '-';
        const contactEmail = conversation.contact?.email || '-';
        
        // Build qualification info
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
                <li><strong>Nome:</strong> ${contactName}</li>
                <li><strong>Telefone:</strong> ${contactPhone}</li>
                <li><strong>Email:</strong> ${contactEmail}</li>
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
          subject: `🎯 Novo Lead Qualificado: ${contactName}`,
          html: emailHtml
        };
        
        // Send email via edge function
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
        body: JSON.stringify({ triggered_by: 'nina-orchestrator-qualification-complete' })
      }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
    } catch (e) {
      console.error('[Nina] Failed to trigger whatsapp-sender:', e);
    }
    
    console.log(`[Nina] 🎯 Qualification complete! Conversation handed off to human`);
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
    const hasCargoInterest = agent.slug === 'adri' && hasExplicitCargoInterest(firstUserMessage);
    
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
  
  const enhancedSystemPrompt = buildEnhancedPrompt(
    systemPrompt, 
    conversation.contact, 
    clientMemory,
    agent,
    conversation.nina_context,
    recentUserMsgs
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
    
    // Queue AI response with additional delay after handoff
    if (aiContent) {
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
    }
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

    if (!aiContent) {
      throw new Error('Empty AI response');
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
    
    // Logic: respond with audio IF:
    // 1. Global audio_response_enabled is ON, OR
    // 2. Incoming was audio AND agent allows audio response
    // AND always: ElevenLabs is configured
    const shouldSendAudio = (
      settings?.audio_response_enabled || 
      (incomingWasAudio && agentAudioEnabled)
    ) && settings?.elevenlabs_api_key;

    console.log(`[Nina] Audio decision - Global: ${settings?.audio_response_enabled}, Agent (${agent?.name}): ${agentAudioEnabled}, Incoming audio: ${incomingWasAudio} -> Send audio: ${shouldSendAudio}`);

    if (shouldSendAudio) {
      // Sanitize text for natural TTS pronunciation (simplify URLs)
      const sanitizedText = sanitizeTextForAudio(aiContent);
      const audioResult = await generateAudioElevenLabs(supabase, settings, sanitizedText, agent);
      
      if (audioResult) {
        const audioUrl = await uploadAudioToStorage(supabase, audioResult.buffer, conversation.id, audioResult.format);
        
        if (audioUrl) {
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
            console.error('[Nina] Error queuing audio response:', sendQueueError);
            throw sendQueueError;
          }

          console.log('[Nina] Audio response queued for sending');
        } else {
          await queueTextResponse(supabase, conversation, message, aiContent, settings, aiSettings, delay, agent);
        }
      } else {
        await queueTextResponse(supabase, conversation, message, aiContent, settings, aiSettings, delay, agent);
      }
    } else {
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

// Helper function to queue text response with chunking
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
  const messageChunks = settings?.message_breaking_enabled 
    ? breakMessageIntoChunks(aiContent)
    : [aiContent];

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
    'cliente_nome': contact?.name || contact?.call_name || 'Cliente',
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
  recentUserMessages?: string[]
): string {
  let contextInfo = '';

  // Add agent info
  if (agent) {
    contextInfo += `\n\nAGENTE: ${agent.name}`;
    if (agent.specialty) contextInfo += ` (${agent.specialty})`;
  }

  if (contact) {
    contextInfo += `\n\nCONTEXTO DO CLIENTE:`;
    if (contact.name) contextInfo += `\n- Nome: ${contact.name}`;
    if (contact.call_name) contextInfo += ` (trate por: ${contact.call_name})`;
    if (contact.tags?.length) contextInfo += `\n- Tags: ${contact.tags.join(', ')}`;
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
      operadora_preferida: 'Operadora preferida'
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

  // ===== ANTI-ECO + VERIFICAÇÃO DE HISTÓRICO =====
  contextInfo += `\n\n## REGRAS CRÍTICAS DE COMUNICAÇÃO:

### REGRA ANTI-ECO:
- NUNCA repita ou resuma o que o cliente acabou de dizer
- Vá DIRETO para a próxima pergunta ou ação
- NÃO use frases como "Entendi que você...", "Então você transporta...", "Certo, [resposta]..."

ERRADO: "Entendi, alimentos. Quais estados atende?"
CORRETO: "Quais estados atende?"

### REGRA VERIFICAR HISTÓRICO (CRÍTICO):
Antes de fazer QUALQUER pergunta:
1. LEIA as "ÚLTIMAS RESPOSTAS DO CLIENTE" acima
2. VERIFIQUE as "INFORMAÇÕES JÁ COLETADAS" acima
3. Se o dado já foi informado, PULE para a próxima pergunta

### Se cliente disser "já respondi" ou "já informei":
- NUNCA peça para repetir
- Consulte o histórico e reconheça o dado que está lá
- Responda: "Vi aqui. Sobre [próxima pergunta pendente]?"
- Continue para o próximo item pendente

### Lista de verificação antes de perguntar:
- Tipo de contratação (direto/subcontratado) - já informou?
- Tipo de carga - já mencionou no histórico?
- Estados/regiões - já apareceu nas mensagens?
- CNPJ - já está no contexto do cliente?
- Tipo de frota - própria/agregado/terceiro definido?
- ANTT - já falou sobre regularização?
- CT-e - já confirmou se emite ou não?`;

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
