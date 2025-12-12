import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { contact_id, conversation_id, user_message, ai_response, current_memory } = await req.json();

    console.log(`[Analyze Conversation] Starting analysis for contact ${contact_id}`);

    // Calculate interaction count
    const interactionCount = (current_memory.interaction_summary?.total_conversations || 0) + 1;
    
    // Determine if full AI analysis should run (message 1, 5, 10, 15, 20...)
    const shouldAnalyze = interactionCount === 1 || interactionCount % 5 === 0;
    
    console.log(`[Analyze] Interaction #${interactionCount}, full analysis: ${shouldAnalyze}`);

    if (!shouldAnalyze) {
      // BASIC UPDATE: Just increment counter and add to history
      const basicMemory = {
        ...current_memory,
        last_updated: new Date().toISOString(),
        interaction_summary: {
          ...current_memory.interaction_summary,
          total_conversations: interactionCount,
          last_contact_reason: user_message?.substring(0, 100) || ''
        },
        conversation_history: [
          ...(current_memory.conversation_history || []).slice(-9),
          {
            timestamp: new Date().toISOString(),
            user_summary: user_message?.substring(0, 200),
            ai_action: ai_response?.substring(0, 200)
          }
        ]
      };
      
      await supabase.rpc('update_client_memory', {
        p_contact_id: contact_id,
        p_new_memory: basicMemory
      });
      
      console.log('[Analyze] Basic update completed');
      return new Response(JSON.stringify({ updated: true, type: 'basic' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // FULL ANALYSIS: Fetch pipeline stages and current deal
    // Only fetch AI-managed stages with criteria
    const { data: stages } = await supabase
      .from('pipeline_stages')
      .select('id, title, ai_trigger_criteria, position')
      .eq('is_ai_managed', true)
      .not('ai_trigger_criteria', 'is', null)
      .eq('is_active', true)
      .order('position', { ascending: true });

    const { data: currentDeal } = await supabase
      .from('deals')
      .select('id, stage_id, stage')
      .eq('contact_id', contact_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const hasAiManagedStages = stages && stages.length > 0;
    
    if (!hasAiManagedStages) {
      console.log('[Analyze] ⏭️ No AI-managed stages with criteria - skipping stage determination');
    }

    console.log(`[Analyze] Running full AI analysis${hasAiManagedStages ? ' with stage determination' : ' (insights only)'}...`);

    // Prepare stage criteria for AI (only if there are AI-managed stages)
    const stagesCriteria = hasAiManagedStages
      ? stages.map(s => `- ${s.title} (ID: ${s.id}): ${s.ai_trigger_criteria}`).join('\n')
      : '';

    // Prepare conversation snippet for AI analysis
    const conversationSnippet = `
MENSAGEM DO CLIENTE:
${user_message}

RESPOSTA DO ASSISTENTE:
${ai_response}

CONTEXTO ATUAL:
- Interesses conhecidos: ${current_memory.lead_profile?.interests?.join(', ') || 'Nenhum'}
- Dores identificadas: ${current_memory.sales_intelligence?.pain_points?.join(', ') || 'Nenhuma'}
- Score atual: ${current_memory.lead_profile?.qualification_score || 0}/100
${hasAiManagedStages ? `
CRITÉRIOS DOS ESTÁGIOS DO PIPELINE:
${stagesCriteria}

ESTÁGIO ATUAL DO DEAL: ${currentDeal?.stage || 'Sem estágio'}` : ''}
    `.trim();

    // Build tools array - always include memory insights and contact data extraction, conditionally include stage determination
    const tools: any[] = [
      {
        type: "function",
        function: {
          name: "update_memory_insights",
          description: "Extrair insights estruturados da conversa para atualizar memória do cliente",
          parameters: {
            type: "object",
            properties: {
              interests: {
                type: "array",
                items: { type: "string" },
                description: "Lista de interesses ou necessidades mencionados pelo cliente (max 5)"
              },
              pain_points: {
                type: "array",
                items: { type: "string" },
                description: "Dores, problemas ou desafios mencionados (max 5)"
              },
              qualification_score: {
                type: "number",
                description: "Score de qualificação de 0 a 100 baseado em: interesse demonstrado, budget implícito, urgência, fit com produto",
                minimum: 0,
                maximum: 100
              },
              next_best_action: {
                type: "string",
                enum: ["qualify", "demo", "followup", "close", "nurture"],
                description: "Próxima melhor ação"
              },
              budget_indication: {
                type: "string",
                enum: ["unknown", "low", "medium", "high"],
                description: "Indicação de orçamento baseado em sinais implícitos"
              },
              decision_timeline: {
                type: "string",
                enum: ["unknown", "immediate", "1month", "3months", "6months+"],
                description: "Timeline de decisão baseado em urgência"
              }
            },
            required: ["interests", "pain_points", "qualification_score", "next_best_action", "budget_indication", "decision_timeline"],
            additionalProperties: false
          }
        }
      },
      {
        type: "function",
        function: {
          name: "extract_contact_data",
          description: "Extrair dados de contato mencionados pelo cliente na conversa (CNPJ, email, nome da empresa). Use apenas se o cliente fornecer explicitamente esses dados.",
          parameters: {
            type: "object",
            properties: {
              cnpj: {
                type: "string",
                description: "CNPJ mencionado pelo cliente (qualquer formato, ex: 12.345.678/0001-90 ou 12345678000190)"
              },
              email: {
                type: "string",
                description: "Email mencionado pelo cliente"
              },
              name: {
                type: "string",
                description: "Nome completo do cliente se mencionado"
              },
              company: {
                type: "string",
                description: "Nome da empresa se mencionado"
              }
            },
            additionalProperties: false
          }
        }
      },
      {
        type: "function",
        function: {
          name: "extract_qualification_answers",
          description: "Extrair respostas específicas de qualificação dadas pelo cliente na conversa. Use para identificar informações já coletadas.",
          parameters: {
            type: "object",
            properties: {
              contratacao: {
                type: "string",
                enum: ["direto", "subcontratado", "ambos"],
                description: "Tipo de contratação: direto, subcontratado, ou ambos"
              },
              tipo_carga: {
                type: "string",
                description: "Tipo de mercadoria/carga transportada (ex: grãos, alimentos, químicos)"
              },
              estados: {
                type: "string",
                description: "Estados/regiões atendidos (ex: SP, PR, MT)"
              },
              viagens_mes: {
                type: "string",
                description: "Quantidade de viagens por mês"
              },
              valor_medio: {
                type: "string",
                description: "Valor médio por carga transportada"
              },
              maior_valor: {
                type: "string",
                description: "Maior valor já transportado"
              },
              tipo_frota: {
                type: "string",
                description: "Tipo de frota: própria, agregados, terceiros, ou combinação"
              },
              antt: {
                type: "string",
                description: "Status da ANTT: regularizada, pendente, ou não possui"
              },
              cte: {
                type: "string",
                enum: ["sim", "nao", "as_vezes"],
                description: "Se emite CT-e"
              },
              sinistros: {
                type: "string",
                description: "Histórico de sinistros (roubo, acidente)"
              },
              plano_tipo: {
                type: "string",
                enum: ["individual", "familiar", "empresarial"],
                description: "Tipo de plano de saúde (para agente Barbara)"
              },
              quantidade_vidas: {
                type: "string",
                description: "Quantidade de pessoas/vidas para plano de saúde"
              },
              idades: {
                type: "string",
                description: "Idades dos beneficiários do plano"
              },
              cidade: {
                type: "string",
                description: "Cidade/região para cobertura do plano"
              },
              operadora_preferida: {
                type: "string",
                description: "Operadora de preferência (Unimed, Bradesco, etc)"
              }
            },
            additionalProperties: false
          }
        }
      }
    ];

    // Only add stage determination tool if there are AI-managed stages
    if (hasAiManagedStages) {
      tools.push({
        type: "function",
        function: {
          name: "determine_deal_stage",
          description: "Determinar para qual estágio do pipeline o deal deve ir com base nos critérios",
          parameters: {
            type: "object",
            properties: {
              suggested_stage_id: {
                type: "string",
                enum: stages.map(s => s.id),
                description: "ID do estágio sugerido"
              },
              confidence: {
                type: "number",
                minimum: 0,
                maximum: 100,
                description: "Confiança na sugestão (0-100)"
              },
              reasoning: {
                type: "string",
                description: "Justificativa breve para a mudança (max 200 chars)"
              }
            },
            required: ["suggested_stage_id", "confidence", "reasoning"],
            additionalProperties: false
          }
        }
      });
    }

    const systemPrompt = hasAiManagedStages 
      ? `Você é um analista de conversas de vendas. Analise a interação e:
1. Extraia insights estruturados para atualizar a memória do cliente
2. Determine para qual estágio do pipeline o deal deve ir com base nos critérios fornecidos`
      : `Você é um analista de conversas de vendas. Analise a interação e extraia insights estruturados para atualizar a memória do cliente.`;

    // Call AI to extract insights AND determine deal stage (if applicable)
    const analysisResponse = await fetch(LOVABLE_AI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: conversationSnippet }
        ],
        tools: tools
      })
    });

    if (!analysisResponse.ok) {
      console.error('[Analyze] AI analysis failed:', analysisResponse.status);
      throw new Error('AI analysis failed');
    }

    const analysisData = await analysisResponse.json();
    const toolCalls = analysisData.choices?.[0]?.message?.tool_calls || [];
    
    if (toolCalls.length === 0) {
      console.error('[Analyze] No tool calls in AI response');
      throw new Error('No insights extracted');
    }

    // Extract insights from tool calls
    let insights = null;
    let stageResult = null;
    let contactData = null;
    let qualificationAnswers = null;

    for (const toolCall of toolCalls) {
      if (toolCall.function?.name === 'update_memory_insights') {
        insights = JSON.parse(toolCall.function.arguments);
      } else if (toolCall.function?.name === 'determine_deal_stage') {
        stageResult = JSON.parse(toolCall.function.arguments);
      } else if (toolCall.function?.name === 'extract_contact_data') {
        contactData = JSON.parse(toolCall.function.arguments);
      } else if (toolCall.function?.name === 'extract_qualification_answers') {
        qualificationAnswers = JSON.parse(toolCall.function.arguments);
      }
    }

    console.log('[Analyze] Insights extracted:', insights);
    console.log('[Analyze] Stage suggestion:', stageResult);
    console.log('[Analyze] Contact data extracted:', contactData);
    console.log('[Analyze] Qualification answers extracted:', qualificationAnswers);

    // ===== UPDATE NINA_CONTEXT WITH QUALIFICATION ANSWERS =====
    if (qualificationAnswers && Object.keys(qualificationAnswers).filter(k => qualificationAnswers[k]).length > 0) {
      // Get current nina_context from conversation
      const { data: convData } = await supabase
        .from('conversations')
        .select('nina_context')
        .eq('id', conversation_id)
        .maybeSingle();
      
      const currentContext = convData?.nina_context || {};
      const existingAnswers = currentContext.qualification_answers || {};
      
      // Merge new answers with existing ones (don't overwrite with empty/null values)
      const mergedAnswers: Record<string, any> = { ...existingAnswers };
      for (const [key, value] of Object.entries(qualificationAnswers)) {
        if (value && String(value).trim()) {
          mergedAnswers[key] = value;
        }
      }
      
      // Update nina_context on conversation
      const updatedContext = {
        ...currentContext,
        qualification_answers: mergedAnswers,
        last_qualification_update: new Date().toISOString()
      };
      
      const { error: contextUpdateError } = await supabase
        .from('conversations')
        .update({ nina_context: updatedContext })
        .eq('id', conversation_id);
      
      if (contextUpdateError) {
        console.error('[Analyze] Error updating nina_context:', contextUpdateError);
      } else {
        console.log('[Analyze] ✅ Nina context updated with qualification answers:', Object.keys(mergedAnswers).length, 'fields');
      }
    }

    // Auto-update contact data if extracted
    if (contactData && (contactData.cnpj || contactData.email || contactData.name || contactData.company)) {
      const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
      
      if (contactData.cnpj) {
        // Normalize CNPJ (remove formatting)
        const cleanCnpj = contactData.cnpj.replace(/\D/g, '');
        updateData.cnpj = cleanCnpj;
        
        // Auto-fetch company name from BrasilAPI if not already provided
        if (!contactData.company && cleanCnpj.length === 14) {
          console.log('[Analyze] 🔍 Fetching company data from BrasilAPI for CNPJ:', cleanCnpj);
          try {
            const brasilApiResponse = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
            if (brasilApiResponse.ok) {
              const cnpjData = await brasilApiResponse.json();
              const companyName = cnpjData.nome_fantasia || cnpjData.razao_social;
              if (companyName) {
                updateData.company = companyName;
                console.log('[Analyze] ✅ Company auto-filled from BrasilAPI:', companyName);
              }
            } else {
              console.log('[Analyze] ⚠️ BrasilAPI returned status:', brasilApiResponse.status);
            }
          } catch (brasilApiError) {
            console.log('[Analyze] ⚠️ BrasilAPI lookup failed:', brasilApiError);
          }
        }
      }
      if (contactData.email) {
        updateData.email = contactData.email.toLowerCase().trim();
      }
      if (contactData.name) {
        updateData.name = contactData.name.trim();
      }
      if (contactData.company) {
        updateData.company = contactData.company.trim();
      }

      const { error: contactUpdateError } = await supabase
        .from('contacts')
        .update(updateData)
        .eq('id', contact_id);

      if (contactUpdateError) {
        console.error('[Analyze] Error updating contact data:', contactUpdateError);
      } else {
        console.log('[Analyze] ✅ Contact data auto-updated:', updateData);
      }
    }

    // Update client memory with insights
    if (insights) {
      const updatedMemory = {
        ...current_memory,
        last_updated: new Date().toISOString(),
        lead_profile: {
          ...current_memory.lead_profile,
          interests: Array.from(new Set([
            ...(current_memory.lead_profile?.interests || []),
            ...insights.interests
          ])).slice(0, 10),
          qualification_score: insights.qualification_score,
          lead_stage: insights.qualification_score > 70 ? 'qualified' : 
                      insights.qualification_score > 40 ? 'engaged' : 'new',
          budget_indication: insights.budget_indication,
          decision_timeline: insights.decision_timeline
        },
        sales_intelligence: {
          ...current_memory.sales_intelligence,
          pain_points: Array.from(new Set([
            ...(current_memory.sales_intelligence?.pain_points || []),
            ...insights.pain_points
          ])).slice(0, 10),
          next_best_action: insights.next_best_action
        },
        interaction_summary: {
          ...current_memory.interaction_summary,
          total_conversations: interactionCount,
          last_contact_reason: user_message?.substring(0, 100) || ''
        },
        conversation_history: [
          ...(current_memory.conversation_history || []).slice(-9),
          {
            timestamp: new Date().toISOString(),
            user_summary: user_message?.substring(0, 200),
            ai_action: ai_response?.substring(0, 200),
            insights_extracted: {
              qualification_score: insights.qualification_score,
              next_action: insights.next_best_action
            }
          }
        ]
      };

      await supabase.rpc('update_client_memory', {
        p_contact_id: contact_id,
        p_new_memory: updatedMemory
      });

      console.log('[Analyze] Memory updated successfully');
    }

    // Move deal if confidence > 70% and stage is different
    let dealMoved = false;
    if (stageResult && currentDeal && stageResult.suggested_stage_id !== currentDeal.stage_id && stageResult.confidence > 70) {
      const newStage = stages?.find(s => s.id === stageResult.suggested_stage_id);
      
      if (newStage) {
        const { error: updateError } = await supabase
          .from('deals')
          .update({ 
            stage_id: stageResult.suggested_stage_id,
            stage: newStage.title
          })
          .eq('id', currentDeal.id);

        if (!updateError) {
          dealMoved = true;
          console.log(`[Analyze] Deal moved to stage: ${newStage.title} (confidence: ${stageResult.confidence}%)`);
          console.log(`[Analyze] Reasoning: ${stageResult.reasoning}`);
        } else {
          console.error('[Analyze] Error moving deal:', updateError);
        }
      }
    } else if (stageResult && currentDeal) {
      console.log(`[Analyze] Deal NOT moved: same stage or low confidence (${stageResult.confidence}%)`);
    }

    return new Response(JSON.stringify({ 
      updated: true, 
      type: 'full',
      insights,
      stage_result: stageResult,
      deal_moved: dealMoved
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[Analyze] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
