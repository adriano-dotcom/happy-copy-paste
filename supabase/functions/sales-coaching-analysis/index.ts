import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SALES_MANAGER_PROMPT = `# PAPEL
Você é um Gerente de Vendas experiente e especialista em coaching de equipes comerciais.
Você tem profundo conhecimento em:
- Metodologias: SPIN Selling, Challenger Sale, Solution Selling, BANT, MEDDIC
- Psicologia de vendas e gatilhos mentais
- Mercado de seguros de transporte de cargas (RCTR-C, RC-DC, RC-V)
- Atendimento via WhatsApp e telefone

# OBJETIVO
Analisar as interações do agente de IA e dos operadores humanos para:
1. Identificar padrões de sucesso e fracasso
2. Mapear objeções mais comuns e como são tratadas
3. Avaliar qualidade das perguntas de qualificação
4. Verificar se informações técnicas estão corretas
5. Gerar feedbacks construtivos e acionáveis

# CRITÉRIOS DE AVALIAÇÃO
- Clareza e objetividade nas respostas (máximo 2 linhas, sem emojis)
- Progressão lógica da qualificação (perguntas na ordem correta)
- Tratamento de objeções (preço, complexidade, urgência)
- Uso correto de informações técnicas (CT-e, ANTT, tipos de seguro)
- Engajamento do lead (respostas rápidas, continuidade)
- Conversão para próximo estágio do funil

# REGRAS DO AGENTE ADRI
O agente Adri deve seguir estas regras - avalie se estão sendo cumpridas:
- Sem emojis
- Máximo 2 linhas por mensagem
- Nunca repetir nome do cliente mais de 2x na conversa
- Nunca inventar URLs (só jacometoseguros.com.br é permitido)
- Nunca repetir perguntas já respondidas
- Priorizar responder perguntas do cliente antes de continuar qualificação

# OUTPUT
Responda APENAS com um JSON válido no formato:
{
  "overall_score": <0-100>,
  "qualification_effectiveness": <0-100>,
  "objection_handling_score": <0-100>,
  "closing_skills_score": <0-100>,
  "strengths": [
    {"title": "...", "description": "...", "example": "..."}
  ],
  "improvement_areas": [
    {"title": "...", "description": "...", "example": "...", "suggestion": "..."}
  ],
  "recommended_actions": [
    {"priority": <1-5>, "action": "...", "impact": "...", "category": "prompt|training|process"}
  ],
  "prompt_suggestions": "Texto com sugestões específicas de ajuste no prompt do agente",
  "good_examples": [
    {"conversation_id": "...", "excerpt": "...", "why_good": "..."}
  ],
  "bad_examples": [
    {"conversation_id": "...", "excerpt": "...", "why_bad": "...", "better_response": "..."}
  ]
}`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!lovableApiKey) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { report_type = 'daily', agent_id, days = 1 } = await req.json();

    console.log(`[sales-coaching] Starting ${report_type} analysis for ${days} day(s)`);

    // Calculate period
    const periodEnd = new Date();
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - days);

    // Fetch agent info
    let agentFilter = agent_id;
    let agentName = 'Todos';
    
    if (agent_id) {
      const { data: agent } = await supabase
        .from('agents')
        .select('name')
        .eq('id', agent_id)
        .single();
      agentName = agent?.name || 'Desconhecido';
    }

    // Fetch conversations with messages from the period
    const { data: conversations, error: convError } = await supabase
      .from('conversations')
      .select(`
        id,
        status,
        current_agent_id,
        nina_context,
        contacts!inner (
          id,
          name,
          phone_number
        )
      `)
      .gte('last_message_at', periodStart.toISOString())
      .lte('last_message_at', periodEnd.toISOString())
      .order('last_message_at', { ascending: false })
      .limit(50);

    if (convError) {
      console.error('[sales-coaching] Error fetching conversations:', convError);
      throw convError;
    }

    console.log(`[sales-coaching] Found ${conversations?.length || 0} conversations`);

    // Fetch messages for these conversations
    const conversationIds = conversations?.map(c => c.id) || [];
    
    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .in('conversation_id', conversationIds)
      .gte('created_at', periodStart.toISOString())
      .order('created_at', { ascending: true });

    if (msgError) {
      console.error('[sales-coaching] Error fetching messages:', msgError);
      throw msgError;
    }

    console.log(`[sales-coaching] Found ${messages?.length || 0} messages`);

    // Fetch call logs with transcriptions
    const { data: calls, error: callError } = await supabase
      .from('call_logs')
      .select('*')
      .gte('created_at', periodStart.toISOString())
      .not('transcription', 'is', null)
      .limit(20);

    if (callError) {
      console.error('[sales-coaching] Error fetching calls:', callError);
    }

    console.log(`[sales-coaching] Found ${calls?.length || 0} calls with transcriptions`);

    // Group messages by conversation
    const conversationsWithMessages = conversations?.map(conv => {
      const convMessages = messages?.filter(m => m.conversation_id === conv.id) || [];
      return {
        ...conv,
        messages: convMessages.map(m => ({
          from: m.from_type,
          content: m.content,
          type: m.type,
          time: m.sent_at
        }))
      };
    }) || [];

    // Count human vs nina interactions
    const ninaMessages = messages?.filter(m => m.from_type === 'nina').length || 0;
    const humanMessages = messages?.filter(m => m.from_type === 'human').length || 0;
    const userMessages = messages?.filter(m => m.from_type === 'user').length || 0;

    // Prepare analysis data
    const analysisData = {
      period: {
        start: periodStart.toISOString(),
        end: periodEnd.toISOString(),
        days
      },
      agent: agentName,
      metrics: {
        total_conversations: conversations?.length || 0,
        total_messages: messages?.length || 0,
        nina_messages: ninaMessages,
        human_messages: humanMessages,
        user_messages: userMessages,
        calls_with_transcription: calls?.length || 0
      },
      conversations: conversationsWithMessages.slice(0, 20), // Limit for API
      call_transcriptions: calls?.map(c => ({
        id: c.id,
        duration: c.duration_seconds,
        transcription: c.transcription?.substring(0, 2000) // Limit size
      })) || []
    };

    // Call AI for analysis
    console.log('[sales-coaching] Calling AI for analysis...');
    
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: SALES_MANAGER_PROMPT },
          { 
            role: 'user', 
            content: `Analise os dados de vendas abaixo e gere um relatório de coaching:\n\n${JSON.stringify(analysisData, null, 2)}`
          }
        ],
        max_tokens: 4000
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[sales-coaching] AI error:', aiResponse.status, errorText);
      throw new Error(`AI analysis failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const analysisContent = aiData.choices?.[0]?.message?.content;

    console.log('[sales-coaching] AI response received, parsing...');

    // Parse JSON from AI response
    let report;
    try {
      // Try to extract JSON from the response
      const jsonMatch = analysisContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        report = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('[sales-coaching] Failed to parse AI response:', parseError);
      console.log('[sales-coaching] Raw response:', analysisContent);
      
      // Create a basic report if parsing fails
      report = {
        overall_score: 70,
        qualification_effectiveness: 70,
        objection_handling_score: 70,
        closing_skills_score: 70,
        strengths: [{ title: 'Análise em andamento', description: 'Não foi possível gerar análise detalhada', example: '' }],
        improvement_areas: [],
        recommended_actions: [],
        prompt_suggestions: 'Análise não disponível - tente novamente',
        good_examples: [],
        bad_examples: []
      };
    }

    // Save report to database
    const { data: savedReport, error: saveError } = await supabase
      .from('sales_coaching_reports')
      .insert({
        agent_id: agent_id || null,
        report_type,
        analysis_period_start: periodStart.toISOString(),
        analysis_period_end: periodEnd.toISOString(),
        conversations_analyzed: conversations?.length || 0,
        calls_analyzed: calls?.length || 0,
        human_interactions_analyzed: humanMessages,
        strengths: report.strengths || [],
        improvement_areas: report.improvement_areas || [],
        recommended_actions: report.recommended_actions || [],
        prompt_suggestions: report.prompt_suggestions || '',
        good_examples: report.good_examples || [],
        bad_examples: report.bad_examples || [],
        overall_score: report.overall_score,
        qualification_effectiveness: report.qualification_effectiveness,
        objection_handling_score: report.objection_handling_score,
        closing_skills_score: report.closing_skills_score
      })
      .select()
      .single();

    if (saveError) {
      console.error('[sales-coaching] Error saving report:', saveError);
      throw saveError;
    }

    console.log('[sales-coaching] Report saved:', savedReport.id);

    return new Response(JSON.stringify({
      success: true,
      report_id: savedReport.id,
      report: savedReport
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[sales-coaching] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
