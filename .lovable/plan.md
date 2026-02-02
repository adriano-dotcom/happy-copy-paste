
# Plano: Relatorio de Motivos de Fechamento por Agente

## Objetivo
Criar um sistema de relatorio que analisa os motivos de encerramento de conversas por agente IA, com execucao diaria via cron job para acompanhamento de leads.

---

## Visao Geral

O sistema ira:
- Coletar dados de fechamento (campo `lost_reason` em `deals`) agrupados por agente
- Gerar relatorios diarios com metricas, tendencias e insights
- Armazenar historico em nova tabela
- Enviar email com resumo para administradores
- Exibir dashboard visual na area de Configuracoes

---

## 1. Nova Tabela: `closure_reason_reports`

Armazena os relatorios diarios de motivos de fechamento.

**Colunas:**
| Campo | Tipo | Descricao |
|-------|------|-----------|
| id | uuid | Chave primaria |
| agent_id | uuid | Referencia ao agente |
| agent_name | text | Nome do agente (cache) |
| report_date | date | Data do relatorio |
| period_start | timestamptz | Inicio do periodo analisado |
| period_end | timestamptz | Fim do periodo analisado |
| total_closures | integer | Total de encerramentos |
| by_reason | jsonb | Breakdown por motivo |
| comparison_previous | jsonb | Comparacao com dia anterior |
| top_reasons | jsonb | Top 3 motivos |
| avg_time_to_close | integer | Tempo medio ate encerramento (minutos) |
| insights | text[] | Insights gerados por IA |
| sent_at | timestamptz | Quando email foi enviado |
| created_at | timestamptz | Data de criacao |

**RLS:** Apenas admins podem gerenciar, usuarios autenticados podem visualizar.

---

## 2. Edge Function: `generate-closure-report`

Nova funcao que roda diariamente para gerar o relatorio.

**Fluxo:**
1. Busca todos agentes ativos
2. Para cada agente:
   - Query deals fechados nas ultimas 24h vinculados ao agente
   - Agrupa por `lost_reason`
   - Calcula metricas (total, %, tempo medio)
   - Compara com dia anterior
   - Gera insights via IA (opcional)
3. Salva relatorio na tabela
4. Envia email resumo para admins

**Query de dados:**
```sql
SELECT 
  a.id as agent_id,
  a.name as agent_name,
  d.lost_reason,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (d.lost_at - d.created_at))/60) as avg_minutes
FROM deals d
JOIN contacts ct ON d.contact_id = ct.id
JOIN conversations c ON c.contact_id = ct.id
JOIN agents a ON c.current_agent_id = a.id
WHERE d.lost_at >= NOW() - INTERVAL '24 hours'
  AND d.lost_reason IS NOT NULL
GROUP BY a.id, a.name, d.lost_reason
```

**Insights gerados:**
- "Iris tem 45% de encerramentos por 'Sem resposta' - verificar follow-ups"
- "Atlas zerou rejeicoes hoje - fluxo de prospeccao funcionando"
- "Clara teve aumento de 200% em 'Fora do perfil' - revisar segmentacao"

---

## 3. Cron Job Diario

Agendar execucao as 7h da manha (horario de Sao Paulo).

```sql
SELECT cron.schedule(
  'generate-closure-report-daily',
  '0 10 * * *',  -- 10:00 UTC = 7:00 BRT
  $$
  SELECT net.http_post(
    url := 'https://xaqepnvvoljtlsyofifu.supabase.co/functions/v1/generate-closure-report',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <anon_key>"}'::jsonb,
    body := '{"triggered_by": "cron"}'::jsonb
  );
  $$
);
```

---

## 4. Componente UI: `ClosureReasonsDashboard`

Novo componente em `src/components/settings/ClosureReasonsDashboard.tsx`

**Elementos:**
- Header com icone e titulo "Motivos de Fechamento por Agente"
- Filtro por agente e periodo
- Cards por agente com:
  - Total de encerramentos
  - Grafico de pizza com distribuicao de motivos
  - Comparacao com periodo anterior (setas up/down)
  - Badge de alerta se algum motivo > 40%
- Tabela detalhada com todos motivos
- Botao para gerar relatorio manualmente
- Secao de insights

**Estilo:** Seguir o padrao glassmorphism do `SalesCoachingSettings.tsx`

---

## 5. Integracao no Settings

Adicionar nova aba ou secao em `src/components/Settings.tsx` para exibir o dashboard.

**Navegacao:** Configuracoes > Coaching IA > Motivos de Fechamento

---

## 6. Email de Resumo Diario

Template HTML similar ao `generate-disqualified-report`:
- Header com gradiente
- Cards com totais por agente
- Tabela de motivos mais frequentes
- Tendencias (comparacao com dia anterior)
- Alertas destacados (motivos que cresceram muito)

---

## Arquivos a Criar/Modificar

| Arquivo | Acao |
|---------|------|
| `supabase/migrations/xxx.sql` | Criar tabela closure_reason_reports |
| `supabase/functions/generate-closure-report/index.ts` | Nova edge function |
| `src/components/settings/ClosureReasonsDashboard.tsx` | Novo componente |
| `src/components/Settings.tsx` | Adicionar nova secao |
| `src/integrations/supabase/types.ts` | Atualizado automaticamente |

---

## Secao Tecnica

### Estrutura da Edge Function
```typescript
// Pseudocodigo simplificado
serve(async (req) => {
  const supabase = createClient(url, serviceKey);
  const agents = await supabase.from('agents').select('*').eq('is_active', true);
  
  for (const agent of agents) {
    const closures = await getClosuresForAgent(supabase, agent.id);
    const previousDay = await getPreviousDayClosures(supabase, agent.id);
    
    const report = {
      agent_id: agent.id,
      agent_name: agent.name,
      report_date: today,
      total_closures: closures.length,
      by_reason: groupByReason(closures),
      comparison_previous: calculateTrends(closures, previousDay),
      top_reasons: getTopReasons(closures),
      insights: await generateInsights(closures, agent)
    };
    
    await supabase.from('closure_reason_reports').insert(report);
  }
  
  await sendEmailSummary(reports);
});
```

### RLS Policy
```sql
-- Admins full access
CREATE POLICY "Admins can manage closure_reason_reports" 
ON closure_reason_reports FOR ALL 
USING (has_role(auth.uid(), 'admin'));

-- Authenticated users read access
CREATE POLICY "Authenticated users can view closure_reason_reports"
ON closure_reason_reports FOR SELECT
USING (is_authenticated_user());
```

### Formato do JSON `by_reason`
```json
{
  "Sem resposta": { "count": 15, "percentage": 45 },
  "Lead desqualificado": { "count": 10, "percentage": 30 },
  "Fora do perfil": { "count": 5, "percentage": 15 },
  "Outro": { "count": 3, "percentage": 10 }
}
```

---

## Resultado Esperado

Apos implementacao:
1. Todo dia as 7h, o sistema gera relatorio automatico
2. Admins recebem email com resumo de encerramentos
3. Dashboard visual mostra performance de cada agente
4. Facilita identificar problemas (ex: muitos "Sem resposta" = melhorar follow-ups)
5. Historico permite analise de tendencias ao longo do tempo
