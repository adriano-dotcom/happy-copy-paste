

## Plano: Melhorias no Card de Tags Geradas

### Alterações Solicitadas

| # | Melhoria | Estado Atual | Novo Estado |
|---|----------|--------------|-------------|
| 1 | Números nas barras | Só aparecem no tooltip ao passar o mouse | Visíveis diretamente na barra |
| 2 | Período no título | Título fixo "Tags Geradas" | "Tags Geradas (30 dias)" |

---

### Alterações no Arquivo

**Arquivo:** `src/components/prospecting/TagDistributionCard.tsx`

#### 1. Adicionar período no título do card

**De:**
```tsx
<CardTitle className="text-white text-lg">Tags Geradas</CardTitle>
```

**Para:**
```tsx
<CardTitle className="text-white text-lg">Tags Geradas ({getPeriodLabel()})</CardTitle>
```

#### 2. Adicionar LabelList para exibir números nas barras

Usar o componente `LabelList` do Recharts para mostrar os valores diretamente nas barras:

**Importação atualizada:**
```tsx
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
```

**Adicionar dentro do componente Bar:**
```tsx
<Bar 
  dataKey="count" 
  radius={[0, 4, 4, 0]}
  maxBarSize={24}
>
  {data.map((entry, index) => (
    <Cell key={`cell-${index}`} fill={entry.color} />
  ))}
  <LabelList 
    dataKey="count" 
    position="right" 
    fill="#94a3b8"
    fontSize={12}
    fontWeight={500}
  />
</Bar>
```

#### 3. Remover informação duplicada do footer

Como o período agora estará no título, podemos simplificar o footer removendo o texto "(últimos X dias)".

---

### Resultado Visual

```text
+--------------------------------------------------+
|  Tags Geradas (últimos 30 dias)          [?]     |
|  Classificação automática de contatos            |
+--------------------------------------------------+
|                                                  |
|  Emprego   ████████████████████████████████  24  |
|  Engano    ███████████████████████           14  |
|  Prospecção  ██                               3  |
|  Transportador ██                             2  |
|  Fornecedor █                                 1  |
|  Frota     █                                  1  |
|  Frete     █                                  1  |
|                                                  |
|  [46 tags aplicadas]                    ● ● ●    |
+--------------------------------------------------+
```

---

### Resumo das Alterações

| Linha | Alteração |
|-------|-----------|
| ~8 | Adicionar `LabelList` na importação do Recharts |
| ~163 | Alterar título para incluir `{getPeriodLabel()}` |
| ~192 | Aumentar margem direita para acomodar labels (`right: 40`) |
| ~209-217 | Adicionar `<LabelList>` dentro do componente `<Bar>` |
| ~226 | Remover período duplicado do footer |

