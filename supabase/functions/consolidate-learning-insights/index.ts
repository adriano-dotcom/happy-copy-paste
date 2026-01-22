import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Lovable AI Gateway endpoint - updated 2026-01-22
const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface LearningInsight {
  id: string;
  agent_id: string | null;
  pipeline_id: string | null;
  category: string;
  title: string;
  description: string;
  suggestion: string | null;
  priority: number;
  occurrence_count: number;
  examples: any[];
  status: string;
}

interface ConsolidatedInsight {
  title: string;
  description: string;
  suggestion: string;
  priority: number;
  merged_from: string[];
  total_occurrences: number;
  impact: 'alto' | 'médio' | 'baixo';
  category: string;
  examples: any[];
}

interface ConsolidationResult {
  consolidated_insights: ConsolidatedInsight[];
  discarded_insights: string[];
  daily_summary: string;
}

const SUPERVISOR_PROMPT = `PAPEL: Você é um Supervisor de Aprendizados responsável por consolidar insights de coaching para um agente de vendas IA.

TAREFA:
Analise os insights pendentes fornecidos e:
1. Identifique grupos de insights similares ou relacionados (mesmo tema, problema ou sugestão)
2. Consolide cada grupo em 1 único insight acionável e claro
3. Mantenha apenas os insights mais impactantes (máximo 8 consolidados)
4. Descarte redundâncias óbvias e insights de baixo valor
5. Priorize por impacto no negócio (conversão, qualificação, fechamento)

REGRAS DE CONSOLIDAÇÃO:
- Insights sobre "falta de atividade" e "inatividade" são o mesmo tema
- Insights sobre "qualificação fraca" e "perguntas insuficientes" são relacionados
- Combine occurrence_count ao mesclar (some os valores)
- Mantenha os melhores exemplos de cada grupo
- Gere uma suggestion clara e acionável para cada consolidado
- Seja conciso e direto nas descrições

CATEGORIAS VÁLIDAS: prompt, process, communication, qualification, closing, objection_handling

OUTPUT: Retorne APENAS JSON válido no formato especificado, sem markdown ou texto extra.`;

async function callAIToConsolidate(
  insights: LearningInsight[], 
  agentName: string,
  lovableApiKey: string
): Promise<ConsolidationResult> {
  const insightsText = insights.map((i, idx) => 
    `[${idx + 1}] ID: ${i.id}
    Título: ${i.title}
    Descrição: ${i.description}
    Sugestão: ${i.suggestion || 'N/A'}
    Categoria: ${i.category}
    Prioridade: ${i.priority}
    Ocorrências: ${i.occurrence_count}
    Exemplos: ${JSON.stringify(i.examples || []).slice(0, 200)}`
  ).join('\n\n');

  const userPrompt = `Agente: ${agentName}
Total de insights pendentes: ${insights.length}

INSIGHTS PARA CONSOLIDAR:
${insightsText}

Retorne o JSON no formato:
{
  "consolidated_insights": [
    {
      "title": "Título consolidado claro",
      "description": "Descrição unificada do problema",
      "suggestion": "Ação específica para corrigir",
      "priority": 1,
      "merged_from": ["id1", "id2"],
      "total_occurrences": 15,
      "impact": "alto",
      "category": "prompt",
      "examples": []
    }
  ],
  "discarded_insights": ["id_baixo_valor"],
  "daily_summary": "Resumo executivo de 2-3 linhas sobre os principais temas identificados"
}`;

  const response = await fetch(LOVABLE_AI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${lovableApiKey}`,
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: SUPERVISOR_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('AI API error:', errorText);
    throw new Error(`AI API error: ${response.status}`);
  }

  const data = await response.json();
  let content = data.choices?.[0]?.message?.content || '';
  
  console.log('[Consolidate] Raw AI response length:', content.length);
  
  // Remove markdown code blocks - more robust regex
  content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  
  // Parse JSON from response - find the outermost JSON object
  const startIdx = content.indexOf('{');
  const endIdx = content.lastIndexOf('}');
  
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    console.error('No valid JSON object found in AI response');
    throw new Error('Invalid AI response format');
  }
  
  const jsonStr = content.substring(startIdx, endIdx + 1);

  try {
    const result = JSON.parse(jsonStr) as ConsolidationResult;
    
    // Deduplicate merged_from arrays
    result.consolidated_insights = result.consolidated_insights.map(insight => ({
      ...insight,
      merged_from: [...new Set(insight.merged_from)],
    }));
    
    console.log('[Consolidate] Successfully parsed', result.consolidated_insights.length, 'consolidated insights');
    return result;
  } catch (e) {
    console.error('Failed to parse JSON:', e);
    throw new Error('Failed to parse AI response');
  }
}

async function consolidateInsightsForAgent(
  supabase: any,
  agent: { id: string; name: string },
  lovableApiKey: string
): Promise<{ before: number; after: number; discarded: number; summary: string } | null> {
  console.log(`\n📊 Consolidating insights for agent: ${agent.name}`);

  // Fetch all pending insights for this agent
  const { data: pendingInsights, error } = await supabase
    .from('learning_insights')
    .select('*')
    .eq('agent_id', agent.id)
    .eq('status', 'pending')
    .order('occurrence_count', { ascending: false });

  if (error) {
    console.error(`Error fetching insights for ${agent.name}:`, error);
    return null;
  }

  if (!pendingInsights || pendingInsights.length < 5) {
    console.log(`  ⏭️ Skipping ${agent.name}: only ${pendingInsights?.length || 0} pending insights`);
    return null;
  }

  console.log(`  📝 Found ${pendingInsights.length} pending insights`);

  try {
    // Call AI to consolidate
    const result = await callAIToConsolidate(pendingInsights, agent.name, lovableApiKey);
    console.log(`  🤖 AI consolidated into ${result.consolidated_insights.length} insights`);
    console.log(`  🗑️ AI marked ${result.discarded_insights.length} for discard`);

    // Create consolidated insights
    for (const consolidated of result.consolidated_insights) {
      // Insert new consolidated insight
      const { data: newInsight, error: insertError } = await supabase
        .from('learning_insights')
        .insert({
          agent_id: agent.id,
          category: consolidated.category,
          title: consolidated.title,
          description: consolidated.description,
          suggestion: consolidated.suggestion,
          priority: consolidated.priority,
          occurrence_count: consolidated.total_occurrences,
          examples: consolidated.examples || [],
          status: 'pending',
          impact: consolidated.impact,
        })
        .select()
        .single();

      if (insertError) {
        console.error('Error creating consolidated insight:', insertError);
        continue;
      }

      // Mark original insights as consolidated
      if (newInsight && consolidated.merged_from.length > 0) {
        const { error: updateError } = await supabase
          .from('learning_insights')
          .update({
            status: 'consolidated',
            consolidated_into: newInsight.id,
          })
          .in('id', consolidated.merged_from);

        if (updateError) {
          console.error('Error marking insights as consolidated:', updateError);
        }
      }
    }

    // Mark discarded insights
    if (result.discarded_insights.length > 0) {
      const { error: discardError } = await supabase
        .from('learning_insights')
        .update({ status: 'discarded' })
        .in('id', result.discarded_insights);

      if (discardError) {
        console.error('Error marking insights as discarded:', discardError);
      }
    }

    // Save daily summary
    const today = new Date().toISOString().split('T')[0];
    const { error: summaryError } = await supabase
      .from('agent_daily_summaries')
      .upsert({
        agent_id: agent.id,
        summary_date: today,
        insights_before: pendingInsights.length,
        insights_after: result.consolidated_insights.length,
        consolidation_ratio: ((pendingInsights.length - result.consolidated_insights.length) / pendingInsights.length * 100).toFixed(1),
        executive_summary: result.daily_summary,
        top_priorities: result.consolidated_insights.slice(0, 3).map(i => ({
          title: i.title,
          priority: i.priority,
          impact: i.impact,
        })),
        discarded_count: result.discarded_insights.length,
      }, {
        onConflict: 'agent_id,summary_date',
      });

    if (summaryError) {
      console.error('Error saving daily summary:', summaryError);
    }

    return {
      before: pendingInsights.length,
      after: result.consolidated_insights.length,
      discarded: result.discarded_insights.length,
      summary: result.daily_summary,
    };
  } catch (e) {
    console.error(`Error consolidating for ${agent.name}:`, e);
    return null;
  }
}

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

    // Parse request body for optional agent_id filter
    let targetAgentId: string | null = null;
    try {
      const body = await req.json();
      targetAgentId = body.agent_id || null;
    } catch {
      // No body provided, process all agents
    }

    // Fetch agents
    const agentsQuery = supabase.from('agents').select('id, name').eq('is_active', true);
    if (targetAgentId) {
      agentsQuery.eq('id', targetAgentId);
    }

    const { data: agents, error: agentsError } = await agentsQuery;

    if (agentsError || !agents) {
      throw new Error(`Error fetching agents: ${agentsError?.message}`);
    }

    console.log(`🚀 Starting consolidation for ${agents.length} agent(s)`);

    const results: Record<string, any> = {};

    for (const agent of agents) {
      const result = await consolidateInsightsForAgent(supabase, agent, lovableApiKey);
      if (result) {
        results[agent.name] = result;
      }
    }

    const totalBefore = Object.values(results).reduce((sum: number, r: any) => sum + r.before, 0);
    const totalAfter = Object.values(results).reduce((sum: number, r: any) => sum + r.after, 0);
    const totalDiscarded = Object.values(results).reduce((sum: number, r: any) => sum + r.discarded, 0);

    console.log(`\n✅ Consolidation complete!`);
    console.log(`   Total before: ${totalBefore}`);
    console.log(`   Total after: ${totalAfter}`);
    console.log(`   Total discarded: ${totalDiscarded}`);
    console.log(`   Reduction: ${totalBefore > 0 ? ((1 - totalAfter / totalBefore) * 100).toFixed(1) : 0}%`);

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Consolidation complete',
        stats: {
          agents_processed: Object.keys(results).length,
          total_before: totalBefore,
          total_after: totalAfter,
          total_discarded: totalDiscarded,
          reduction_percentage: totalBefore > 0 ? ((1 - totalAfter / totalBefore) * 100).toFixed(1) : 0,
        },
        details: results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Consolidation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
