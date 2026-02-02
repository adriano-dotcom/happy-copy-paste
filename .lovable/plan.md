
# Plano: Correcao do Relatorio de Motivos de Fechamento

## Problemas Identificados

### 1. Contraste ruim na secao de Insights
O card "Insights do Periodo" esta usando cores claras de texto (amber-100, amber-200) sobre um fundo claro (amber-500/10), tornando o texto praticamente invisivel.

### 2. Relatorios duplicados no banco de dados
A Edge Function gera novos registros a cada execucao sem verificar se ja existe um relatorio para aquele agente+data. Isso causa:
- Multiplas linhas identicas na tabela
- Insights repetidos
- Dados inflados nos cards de resumo

### 3. Insights redundantes
Mensagens como "zerou encerramentos hoje" aparecem repetidamente para todos os agentes sem fechamentos, poluindo a visualizacao.

---

## Solucao Proposta

### Correcao 1: Melhorar contraste do card de Insights

**Arquivo:** `src/components/settings/ClosureReasonsDashboard.tsx`

**Mudancas:**
- Mudar fundo do card para tema dark consistente (`bg-slate-900/60`)
- Usar cores de texto com bom contraste (`text-amber-400`, `text-slate-300`)
- Manter icones e destaques em amber para identificacao visual

**Antes:**
```jsx
<Card className="bg-gradient-to-br from-amber-500/10 to-orange-500/10 ...">
  <CardDescription className="text-amber-200/60">
  <li className="text-sm text-amber-100/80">
```

**Depois:**
```jsx
<Card className="bg-slate-900/60 border-amber-500/30 ...">
  <CardDescription className="text-slate-400">
  <li className="text-sm text-slate-300">
```

---

### Correcao 2: Evitar duplicacao de relatorios (Upsert)

**Arquivo:** `supabase/functions/generate-closure-report/index.ts`

**Mudancas:**
- Verificar se ja existe relatorio para agente+data antes de inserir
- Usar upsert ou deletar anterior antes de inserir
- Adicionar constraint UNIQUE no banco (agent_id + report_date)

**Logica:**
```typescript
// Antes de inserir, deletar relatorio existente para mesmo agente+data
await supabase
  .from('closure_reason_reports')
  .delete()
  .eq('agent_id', agent.id)
  .eq('report_date', reportDate);

// Depois inserir novo relatorio
await supabase
  .from('closure_reason_reports')
  .insert(report);
```

---

### Correcao 3: Filtrar insights redundantes no dashboard

**Arquivo:** `src/components/settings/ClosureReasonsDashboard.tsx`

**Mudancas:**
- Remover insights duplicados
- Filtrar mensagens de "zerou encerramentos" quando ha varios
- Priorizar insights com alertas reais (alta taxa de motivo especifico)

**Logica:**
```typescript
const allInsights = [...new Set(reports.flatMap(r => r.insights))]
  .filter(i => !i.includes('zerou encerramentos') || totalClosures === 0)
  .slice(0, 6);
```

---

### Correcao 4: Limpar dados duplicados existentes

**Migracao SQL:**
```sql
-- Adicionar constraint unique para evitar duplicatas futuras
ALTER TABLE closure_reason_reports 
ADD CONSTRAINT unique_agent_report_date UNIQUE (agent_id, report_date);

-- Limpar duplicatas existentes (manter apenas o mais recente)
DELETE FROM closure_reason_reports a
USING closure_reason_reports b
WHERE a.id < b.id 
  AND a.agent_id = b.agent_id 
  AND a.report_date = b.report_date;
```

---

## Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `src/components/settings/ClosureReasonsDashboard.tsx` | Corrigir cores do card de insights e filtrar duplicados |
| `supabase/functions/generate-closure-report/index.ts` | Adicionar verificacao/delete antes de insert |
| Nova migracao SQL | Adicionar constraint UNIQUE e limpar duplicatas |

---

## Resultado Visual Esperado

1. **Card de Insights**: Fundo escuro (slate-900) com texto claro (slate-300), icones em amber para destaque
2. **Tabela de Historico**: Sem linhas duplicadas, apenas um relatorio por agente por dia
3. **Insights**: Lista limpa sem repeticoes, focando em alertas importantes

---

## Secao Tecnica

### Constraint UNIQUE
```sql
UNIQUE (agent_id, report_date)
```
Impede que a Edge Function insira multiplos relatorios para o mesmo agente no mesmo dia.

### Estrategia de Upsert
Em vez de INSERT simples, usar DELETE + INSERT para garantir que apenas o relatorio mais recente seja mantido. Isso e mais simples que configurar ON CONFLICT com JSONB.

### Cores corrigidas
- Fundo: `bg-slate-900/60 border-amber-500/30`
- Titulo: `text-amber-400`
- Descricao: `text-slate-400`
- Itens: `text-slate-300`
- Icones: `text-amber-400` (mantido)
