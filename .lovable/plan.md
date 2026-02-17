

## Painel ElevenLabs - Dashboard de Ligacoes da Iris

### O que sera construido

Uma nova pagina `/voice-dashboard` acessivel apenas por admins, com um item "Ligacoes IA" no menu lateral (icone de telefone/headset), posicionado entre "Prospeccao" e "Equipe".

### Conteudo do Dashboard

**KPIs principais (cards no topo):**
- Total de ligacoes (todas as voice_qualifications)
- Taxa de atendimento (completed vs total)
- Taxa de qualificacao (qualificado vs completed)
- Ligacoes pendentes/agendadas (status pending/scheduled)
- Ligacoes canceladas
- Ligacoes com falha (failed, not_contacted)

**Tabela de ligacoes recentes:**
- Colunas: Contato (nome + telefone), Status (badge colorido), Resultado da qualificacao, Nivel de interesse, Tentativa (X/Y), Data/hora, Resumo (truncado)
- Filtros por status e periodo
- Ordenacao por data

**Graficos:**
- Distribuicao por status (pie/donut chart)
- Ligacoes por dia (area chart, ultimos 30 dias)
- Taxa de qualificacao por dia (line chart)

**Secao de erros/falhas:**
- Lista das ultimas falhas com motivo (observations)
- Contagem de call_initiation_failure vs no_answer vs completed

### Secao tecnica

**Novos arquivos:**
1. `src/components/VoiceDashboard.tsx` - Componente principal do dashboard
2. `src/hooks/useVoiceDashboardMetrics.ts` - Hook com useQuery para buscar metricas agregadas da tabela voice_qualifications

**Arquivos modificados:**
1. `src/components/Sidebar.tsx`
   - Adicionar item `{ id: 'voice-dashboard', label: 'Ligacoes IA', icon: Headphones, adminOnly: true }` no array `allMenuItems`, entre Prospeccao e Equipe

2. `src/App.tsx`
   - Importar VoiceDashboard com lazy loading
   - Adicionar rota `/voice-dashboard` dentro de AdminRoute

**Consultas ao banco (dentro do hook):**
```typescript
// Buscar todas as VQs com dados do contato
const { data } = await supabase
  .from('voice_qualifications')
  .select('*, contacts(name, phone_number)')
  .order('created_at', { ascending: false })
  .limit(500);
```

**Metricas calculadas no frontend a partir dos dados:**
- Contagem por status (completed, pending, failed, cancelled, etc)
- Taxa de atendimento = completed / (completed + no_answer + failed + not_contacted)
- Taxa de qualificacao = qualificados / completed
- Agrupamento por dia para graficos temporais
- Duracao estimada (diferenca entre called_at e completed_at)

**Padrao visual:** Mesmo estilo dark do Dashboard existente (bg-slate-950, cards com bg-white/5, bordas com gradiente cyan/teal, badges coloridos por status)
