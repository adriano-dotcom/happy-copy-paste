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

interface CompactAIResponse {
  consolidated?: Array<{
    title: string;
    desc: string;
    sug: string;
    pri: number;
    idx: number[];
    occ: number;
    impact: string;
    cat: string;
  }>;
  del?: number[];
  sum?: string;
}

function sanitizeAndParseJSON(content: string, indexToId: Record<number, string>): ConsolidationResult {
  // Remove markdown code blocks (more aggressive)
  let cleaned = content
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim();
  
  // Find JSON boundaries
  const startIdx = cleaned.indexOf('{');
  const endIdx = cleaned.lastIndexOf('}');
  
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error('No JSON object found in response');
  }
  
  let jsonStr = cleaned.substring(startIdx, endIdx + 1);
  
  // JSON fixes:
  // 1. Remove trailing commas
  jsonStr = jsonStr.replace(/,(\s*[\]}])/g, '$1');
  // 2. Remove control characters
  jsonStr = jsonStr.replace(/[\x00-\x1F\x7F]/g, ' ');
  // 3. Fix newlines
  jsonStr = jsonStr.replace(/\\n/g, ' ');
  
  try {
    const parsed = JSON.parse(jsonStr) as CompactAIResponse;
    
    // Convert compact format to full format
    const consolidated_insights: ConsolidatedInsight[] = (parsed.consolidated || []).map(c => ({
      title: c.title || '',
      description: c.desc || '',
      suggestion: c.sug || '',
      priority: c.pri || 3,
      merged_from: (c.idx || []).map(i => indexToId[i]).filter(Boolean),
      total_occurrences: c.occ || 1,
      impact: (c.impact as 'alto' | 'médio' | 'baixo') || 'médio',
      category: c.cat || 'process',
      examples: [],
    }));
    
    const discarded_insights: string[] = (parsed.del || []).map(i => indexToId[i]).filter(Boolean);
    
    return {
      consolidated_insights,
      discarded_insights,
      daily_summary: parsed.sum || '',
    };
  } catch (e) {
    console.error('[Consolidate] JSON parse error:', e);
    console.error('[Consolidate] Problematic JSON (first 600 chars):', jsonStr.substring(0, 600));
    throw e;
  }
}

async function callAIToConsolidate(
  insights: LearningInsight[], 
  agentName: string,
  lovableApiKey: string,
  attempt: number = 1
): Promise<ConsolidationResult> {
  const maxAttempts = 3;
  
  // Limit insights to prevent JSON overflow - use indices instead of UUIDs
  const maxInsights = insights.length > 80 ? 15 : insights.length > 50 ? 20 : 30;
  const insightsToProcess = insights.slice(0, maxInsights);
  
  // Create index-to-ID mapping for later use
  const indexToId: Record<number, string> = {};
  const simplifiedInsights = insightsToProcess.map((i, idx) => {
    indexToId[idx + 1] = i.id;
    return `[${idx + 1}] ${i.title.slice(0, 60)} | ${i.category} | Ocorrências: ${i.occurrence_count}`;
  }).join('\n');

  const userPrompt = `Agente: ${agentName}
Total: ${insights.length} insights (processando ${insightsToProcess.length})

INSIGHTS:
${simplifiedInsights}

Retorne JSON puro (sem markdown):
{"consolidated":[{"title":"string","desc":"string","sug":"string","pri":1,"idx":[1,2,3],"occ":10,"impact":"alto","cat":"prompt"}],"del":[4,5],"sum":"Resumo breve"}

Regras:
- Use ÍNDICES (números) em idx e del, NÃO UUIDs
- Máximo 6 consolidated
- impact: alto/médio/baixo
- cat: prompt/process/communication/qualification/closing/objection_handling`;

  try {
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
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Consolidate] AI API error:', errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    console.log(`[Consolidate] AI response length: ${content.length} chars (attempt ${attempt})`);
    
    const result = sanitizeAndParseJSON(content, indexToId);
    console.log(`[Consolidate] Parsed ${result.consolidated_insights.length} consolidated insights`);
    
    return result;
  } catch (e) {
    if (attempt < maxAttempts) {
      console.log(`[Consolidate] Retrying (attempt ${attempt + 1})...`);
      await new Promise(r => setTimeout(r, 1000)); // Delay between retries
      return callAIToConsolidate(insights, agentName, lovableApiKey, attempt + 1);
    }
    
    // Fallback: return minimal valid result instead of throwing
    console.warn(`[Consolidate] All ${maxAttempts} attempts failed for ${agentName}, using fallback`);
    return {
      consolidated_insights: [],
      discarded_insights: [],
      daily_summary: `Consolidação automática falhou após ${maxAttempts} tentativas. ${insights.length} insights mantidos para revisão manual.`
    };
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
