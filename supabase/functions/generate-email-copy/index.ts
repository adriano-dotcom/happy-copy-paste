import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Conhecimento especializado por vertical
const VERTICAL_KNOWLEDGE: Record<string, string> = {
  transporte: `
PRODUTOS DE SEGURO DE TRANSPORTE:
- RCTR-C (Responsabilidade Civil do Transportador Rodoviário de Cargas): Cobre danos à carga durante o transporte
- RC-DC (Responsabilidade Civil Desaparecimento de Carga): Cobre roubo e furto de carga
- RC-V (Responsabilidade Civil Veicular): Cobre danos a terceiros

CONTEXTO LEGAL:
- Lei 14.599/2023 torna os seguros OBRIGATÓRIOS para RNTRC
- Resolução ANTT 6.068/2025 e Portaria SUROC 27/2025 fiscalizam digitalmente
- CT-e é documento obrigatório para emissão do seguro
- Todos os 3 seguros são obrigatórios, não opcionais

COBERTURAS ACESSÓRIAS RCTR-C:
- Limpeza de Pista
- Avarias (danos físicos à carga)
- Despesas Emergenciais/Salvamento
- Operações de Carga e Descarga
- Cobertura de Frete

COBERTURAS ACESSÓRIAS RC-DC:
- Desaparecimento de Carga
- Roubo em Depósitos
- Despesas Extraordinárias
- Impostos Suspensos e Benefícios Fiscais
- Cobertura de Frete

TOM: Profissional, técnico mas acessível, sem emojis, foco em compliance e proteção do patrimônio.
`,
  saude: `
PRODUTOS DE PLANOS DE SAÚDE:
- Planos empresariais (mínimo 2 vidas, vantagens fiscais)
- Planos individuais/familiares
- Planos odontológicos

OPERADORAS PARCEIRAS:
- Unimed, Bradesco Saúde, SulAmérica, Amil, Hapvida, Notre Dame, Porto Saúde

BENEFÍCIOS PARA EMPRESAS:
- Dedução fiscal (lucro real)
- Carência reduzida para grupos
- Coparticipação flexível
- Rede credenciada ampla

DIFERENCIAIS:
- Análise personalizada do perfil
- Comparativo entre operadoras
- Acompanhamento pós-venda
- Gestão de benefícios

TOM: Humanizado, foco em cuidado e bem-estar, empático, profissional.
`,
  prospeccao: `
OBJETIVO: Primeiro contato com leads, despertar interesse, gerar curiosidade

TÉCNICAS DE COLD EMAIL:
- Personalização é essencial (usar nome e empresa)
- Assunto curto e intrigante (máx 50 caracteres)
- Primeira linha captura atenção
- Benefício claro em 2-3 frases
- Call-to-action único e claro
- Senso de urgência sutil (sem pressão)
- PS pode reforçar valor

ESTRUTURA IDEAL:
1. Saudação personalizada
2. Contexto rápido (1 frase)
3. Proposta de valor (1-2 frases)
4. CTA claro
5. Assinatura profissional

TOM: Direto, personalizado, curioso, sem ser invasivo ou agressivo.
`
};

// Tipos de email com instruções específicas
const EMAIL_TYPES: Record<string, string> = {
  'follow-up': `
OBJETIVO: Reengajar lead que não respondeu
- Referência ao contato anterior
- Novo ângulo ou informação
- Pergunta aberta para retomar diálogo
- Sem cobranças ou pressão
`,
  'proposta': `
OBJETIVO: Apresentar proposta comercial
- Resumo do que foi discutido
- Benefícios principais
- Próximos passos claros
- Disponibilidade para dúvidas
`,
  'boas-vindas': `
OBJETIVO: Onboarding de novo cliente
- Agradecimento caloroso
- O que esperar a partir de agora
- Canais de contato/suporte
- Próximos passos práticos
`,
  'renewal': `
OBJETIVO: Lembrete de renovação
- Valor do relacionamento
- Benefícios de renovar
- Condições especiais (se houver)
- Prazo claro mas sem pressão
`,
  'cotacao': `
OBJETIVO: Envio de valores/proposta
- Resumo da necessidade identificada
- Valores claros e organizados
- Diferenciais inclusos
- Validade da proposta
- CTA para fechamento
`
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { vertical, emailType, briefing, leadContext } = await req.json();

    if (!vertical || !emailType) {
      return new Response(
        JSON.stringify({ error: 'vertical e emailType são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY não configurada');
    }

    const verticalKnowledge = VERTICAL_KNOWLEDGE[vertical] || '';
    const emailTypeInstructions = EMAIL_TYPES[emailType] || '';

    const systemPrompt = `Você é um copywriter especialista em emails B2B para uma corretora de seguros (Jacometo Seguros).

${verticalKnowledge}

${emailTypeInstructions}

REGRAS CRÍTICAS:
1. NUNCA use emojis no corpo do email
2. Use as variáveis disponíveis: {{nome}}, {{empresa}}, {{valor}}, {{email}}, {{telefone}}
3. O HTML deve ser simples e responsivo (max-width: 600px)
4. Parágrafos curtos (máx 3 linhas)
5. Assunto máximo 60 caracteres
6. Tom profissional e brasileiro
7. NÃO inclua assinatura no final - ela será adicionada automaticamente pelo sistema com o nome do operador

FORMATO DE RESPOSTA (JSON):
{
  "subject": "Assunto do email aqui",
  "body_html": "<div style='...'>HTML do email aqui</div>"
}

IMPORTANTE: Retorne APENAS o JSON, sem markdown, sem explicações.`;

    // Build context-aware user prompt
    let userPrompt = `Gere um email do tipo "${emailType}" para a vertical "${vertical}".`;
    
    if (leadContext) {
      userPrompt += `\n\nDADOS DO LEAD:`;
      if (leadContext.name) userPrompt += `\n- Nome: ${leadContext.name}`;
      if (leadContext.company) userPrompt += `\n- Empresa: ${leadContext.company}`;
      if (leadContext.cnpj) userPrompt += `\n- CNPJ: ${leadContext.cnpj}`;
      if (leadContext.phone) userPrompt += `\n- Telefone: ${leadContext.phone}`;
      if (leadContext.email) userPrompt += `\n- Email: ${leadContext.email}`;
      if (leadContext.qualification_score) userPrompt += `\n- Score de qualificação: ${leadContext.qualification_score}%`;
      
      if (leadContext.qualification_answers && Object.keys(leadContext.qualification_answers).length > 0) {
        userPrompt += `\n\nRESPOSTAS DE QUALIFICAÇÃO:`;
        const qaLabels: Record<string, string> = {
          contratacao: 'Tipo de contratação',
          tipo_carga: 'Tipo de carga',
          estados: 'Estados atendidos',
          viagens_mes: 'Viagens por mês',
          valor_medio: 'Valor médio por carga',
          maior_valor: 'Maior valor transportado',
          tipo_frota: 'Tipo de frota',
          antt: 'ANTT',
          cte: 'CT-e',
        };
        for (const [key, value] of Object.entries(leadContext.qualification_answers)) {
          if (value) {
            const label = qaLabels[key] || key;
            userPrompt += `\n- ${label}: ${value}`;
          }
        }
      }
      
      if (leadContext.interests && leadContext.interests.length > 0) {
        userPrompt += `\n\nINTERESSES: ${leadContext.interests.join(', ')}`;
      }
      
      if (leadContext.pain_points && leadContext.pain_points.length > 0) {
        userPrompt += `\n\nDORES IDENTIFICADAS: ${leadContext.pain_points.join(', ')}`;
      }
      
      if (leadContext.conversation_summary) {
        userPrompt += `\n\nRESUMO DA CONVERSA:\n${leadContext.conversation_summary}`;
      }
    }
    
    if (briefing) {
      userPrompt += `\n\nBRIEFING ADICIONAL:\n${briefing}`;
    }
    
    userPrompt += `\n\nGere um email ALTAMENTE PERSONALIZADO usando os dados acima. Mencione informações específicas do lead para criar conexão.`;

    console.log(`Gerando email: vertical=${vertical}, tipo=${emailType}`);

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
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Erro na API:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de requisições atingido. Tente novamente em alguns segundos.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`Erro na API de IA: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    
    console.log('Resposta da IA:', content.substring(0, 200));

    // Parse do JSON da resposta
    let result;
    try {
      // Remove possíveis backticks de markdown
      const cleanContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      result = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error('Erro ao parsear resposta:', parseError);
      // Fallback: tenta extrair subject e body_html manualmente
      const subjectMatch = content.match(/"subject"\s*:\s*"([^"]+)"/);
      const bodyMatch = content.match(/"body_html"\s*:\s*"([\s\S]*?)"\s*}/);
      
      if (subjectMatch && bodyMatch) {
        result = {
          subject: subjectMatch[1],
          body_html: bodyMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')
        };
      } else {
        throw new Error('Não foi possível parsear a resposta da IA');
      }
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Erro no generate-email-copy:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro ao gerar email';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
