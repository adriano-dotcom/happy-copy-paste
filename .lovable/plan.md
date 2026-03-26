

# Dashboard Visual de Métricas WhatsApp

## O que será criado

Um novo componente `WhatsAppMetricsDashboard` com gráficos interativos de entrega por hora, acessível como uma nova aba na página de Configurações.

## Componentes

### 1. Novo componente: `src/components/settings/WhatsAppMetricsDashboard.tsx`

Dashboard completo com:

- **KPIs no topo**: Total enviadas, entregues, lidas, falhas, taxa de entrega (cards coloridos)
- **Gráfico de barras por hora** (Recharts `BarChart`): Mostra `messages_sent`, `messages_delivered`, `messages_read`, `messages_failed` agrupados por `metric_hour` — dados da tabela `whatsapp_metrics`
- **Gráfico de linha de taxa de entrega por hora** (`LineChart`): delivery_rate ao longo das horas
- **Gráfico de erros empilhado** (`StackedBarChart`): error_131026, error_131042, error_131049, error_other por hora
- **Seletor de período**: Hoje / 7 dias / 30 dias (filtra por `metric_date`)
- **Botão refresh** para atualizar dados

Dados vêm diretamente da tabela `whatsapp_metrics` (já tem `metric_date`, `metric_hour`, e todos os contadores necessários).

### 2. Integração: Nova aba "Métricas WA" em `Settings.tsx`

- Adicionar `TabsTrigger` com ícone `BarChart3` e label "Métricas WA"
- Adicionar `TabsContent` renderizando o novo componente
- Atualizar `showSaveButtons` para excluir a nova aba

### Tecnologias

- `recharts` (já usado no projeto — `TopCampaignsChart.tsx` confirma)
- Estilo consistente com o dark theme existente (slate-800/900, cyan/green/red accents)
- Query via `supabase` client direto (padrão do `WhatsAppDiagnosticsCard`)

### Dados disponíveis na tabela `whatsapp_metrics`

```text
metric_date, metric_hour (0-23)
messages_sent, messages_delivered, messages_read, messages_failed
templates_sent, delivery_rate
error_131026_count, error_131042_count, error_131049_count, error_other_count
quality_score
```

