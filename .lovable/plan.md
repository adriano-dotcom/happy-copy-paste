

## Plano: Card de Tags Geradas no Dashboard de Prospecção

### Objetivo

Criar um novo card no Dashboard de Prospecção (`/prospecting`) que exiba as tags aplicadas automaticamente aos contatos durante o processo de triagem e qualificação. Este card permitirá visualizar rapidamente a distribuição e evolução das tags geradas pelo sistema.

---

### Dados Disponíveis

Conforme análise do banco de dados, existem as seguintes tags em uso:

| Tag | Contatos | Categoria |
|-----|----------|-----------|
| emprego | 24 | custom |
| engano | 14 | custom |
| prospeccao | 3 | custom |
| transportador | 2 | custom |
| frota | 1 | interest |
| frete | 1 | custom |
| fornecedor | 1 | custom |

As tags são armazenadas em `contacts.tags` (array) e definidas em `tag_definitions`.

---

### Arquitetura do Card

#### Localização
- Aba **"Triagem Interativa"** do ProspectingDashboard
- Posicionado após os gráficos existentes (ButtonClicksFunnel e ButtonDistributionChart)

#### Visual
- Card no mesmo estilo dos existentes (bg-slate-900/50, border-slate-800/50)
- Gráfico de barras horizontais mostrando contagem por tag
- Cores dinâmicas vindas de `tag_definitions.color`
- Badge com total de tags aplicadas no período

---

### Componentes a Criar

#### 1. TagDistributionCard.tsx
Novo componente em `src/components/prospecting/`

```text
+------------------------------------------+
|  Tags Geradas                    [?]     |
|  Classificação automática de contatos    |
+------------------------------------------+
|                                          |
|  ████████████████████  Emprego      24   |
|  ██████████████       Engano        14   |
|  ██                   Prospecção     3   |
|  ██                   Transportador  2   |
|  █                    Frota          1   |
|                                          |
|  Total: 45 tags aplicadas (30 dias)      |
+------------------------------------------+
```

#### 2. Integração no ButtonMetricsDashboard

Adicionar o card na grid existente, após o ButtonDistributionChart.

---

### Alterações nos Arquivos

| Arquivo | Alteração |
|---------|-----------|
| `src/components/prospecting/TagDistributionCard.tsx` | **NOVO** - Card com gráfico de barras horizontais |
| `src/components/prospecting/ButtonMetricsDashboard.tsx` | Importar e renderizar TagDistributionCard |

---

### Implementação Detalhada

#### TagDistributionCard.tsx

**Props:**
```typescript
interface TagDistributionCardProps {
  period: string; // '1', '7', '30' - dias
}
```

**Dados buscados:**
```sql
SELECT 
  td.key,
  td.label,
  td.color,
  COUNT(DISTINCT c.id) as count
FROM tag_definitions td
LEFT JOIN contacts c ON c.tags @> ARRAY[td.key]
  AND c.updated_at >= NOW() - INTERVAL '{period} days'
WHERE td.is_active = true
GROUP BY td.id
ORDER BY count DESC
LIMIT 10
```

**Funcionalidades:**
- Gráfico de barras horizontais (usando Recharts BarChart)
- Tooltip com informações detalhadas
- Cores personalizadas por tag (vindas do banco)
- Loading skeleton enquanto carrega
- Mensagem de "Nenhuma tag aplicada" se vazio

#### Integração no ButtonMetricsDashboard

```typescript
// Após o grid de charts existente
<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
  <ButtonClicksFunnel ... />
  <ButtonDistributionChart ... />
</div>

// Adicionar:
<TagDistributionCard period={period} />
```

---

### Visual do Componente

```text
Card com:
- Header: ícone Tag + título "Tags Geradas" + descrição
- Gráfico: BarChart horizontal com cores dinâmicas
- Legenda: Lista com cor + label + contagem + percentual
- Footer: Total de tags e período selecionado
```

**Cores padrão por categoria:**
- `status`: Azul (#3b82f6)
- `interest`: Verde (#22c55e)
- `action`: Amarelo (#eab308)
- `qualification`: Roxo (#8b5cf6)
- `custom`: Cinza (#64748b) ou cor definida

---

### Fluxo de Dados

```text
1. ButtonMetricsDashboard renderiza
2. Passa `period` para TagDistributionCard
3. TagDistributionCard busca:
   - tag_definitions (todas ativas)
   - contacts filtrados por updated_at no período
4. Agrupa contatos por tag
5. Renderiza BarChart com dados
```

---

### Seção Técnica

#### Query otimizada para buscar tags com contagens

```typescript
// Em TagDistributionCard.tsx
const fetchTagData = async () => {
  const periodStart = new Date();
  periodStart.setDate(periodStart.getDate() - parseInt(period));
  
  // Buscar definições de tags
  const { data: tagDefs } = await supabase
    .from('tag_definitions')
    .select('key, label, color, category')
    .eq('is_active', true);
  
  // Buscar contatos com tags no período
  const { data: contacts } = await supabase
    .from('contacts')
    .select('id, tags, updated_at')
    .gte('updated_at', periodStart.toISOString())
    .not('tags', 'eq', '{}');
  
  // Contar por tag
  const tagCounts = new Map<string, number>();
  contacts?.forEach(c => {
    c.tags?.forEach(tag => {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    });
  });
  
  // Combinar com definições
  return tagDefs?.map(td => ({
    ...td,
    count: tagCounts.get(td.key) || 0
  }))
  .filter(t => t.count > 0)
  .sort((a, b) => b.count - a.count);
};
```

#### Estilo do BarChart (Recharts)

```typescript
<ResponsiveContainer width="100%" height={data.length * 40 + 40}>
  <BarChart
    data={data}
    layout="vertical"
    margin={{ left: 80, right: 30 }}
  >
    <XAxis type="number" />
    <YAxis 
      type="category" 
      dataKey="label" 
      width={80}
      tick={{ fill: '#94a3b8', fontSize: 12 }}
    />
    <Tooltip content={<CustomTooltip />} />
    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
      {data.map((entry, index) => (
        <Cell key={index} fill={entry.color} />
      ))}
    </Bar>
  </BarChart>
</ResponsiveContainer>
```

---

### Resumo das Entregas

1. **Novo arquivo**: `src/components/prospecting/TagDistributionCard.tsx`
   - Componente completo com fetch de dados
   - Gráfico de barras horizontais
   - Loading state e empty state
   - Tooltip customizado

2. **Edição**: `src/components/prospecting/ButtonMetricsDashboard.tsx`
   - Import do TagDistributionCard
   - Renderização passando period como prop

