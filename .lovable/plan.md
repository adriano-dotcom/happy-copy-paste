
# 🔍 Auditoria Técnica Completa do CRM Jacometo

## Resumo Executivo

Após análise detalhada do codebase, identifiquei **15 melhorias críticas** que podem aumentar significativamente a performance, segurança e experiência do usuário. O CRM já possui uma arquitetura sólida com boas práticas implementadas (React Query, Supabase Realtime, RLS), mas existem oportunidades importantes de otimização.

---

## 📊 1. ANÁLISE DE PERFORMANCE

### A) Problema Crítico: N+1 Query no fetchConversations

**Localização:** `src/services/api.ts` (linhas 1728-1763)

**Problema Identificado:**
```typescript
// Para CADA conversa, faz uma query separada de mensagens
const conversationsWithMessages = await Promise.all(
  allConversations.map(async (conv) => {
    const { data: messages } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conv.id)  // N queries!
```

**Impacto:** Com 200 conversas, são feitas 200+ queries ao banco de dados no carregamento do chat.

**Estimativa de ganho:** 70-80% de redução no tempo de carregamento inicial do chat.

---

### B) Bundle Optimization

**Dependências que podem ser otimizadas:**

| Dependência | Tamanho | Recomendação |
|-------------|---------|--------------|
| `recharts` | ~400KB | Usar apenas em Dashboard (lazy load) |
| `framer-motion` | ~150KB | Usado em todo app, manter |
| `@playwright/test` | ~500KB | ⚠️ Em dependencies! Mover para devDependencies |
| `canvas-confetti` | ~20KB | Lazy load apenas quando necessário |

---

### C) Queries sem Limite

**Queries identificadas sem `.limit()`:**

1. `fetchDashboardMetrics` - busca `nina_response_time` sem limite
2. `fetchLeadsEvolution` - busca todos os deals do período
3. `fetchAgentStats` - busca todas as conversas
4. `fetchTeam` - busca todos os membros (OK para volume atual)

---

## 🗄️ 2. OTIMIZAÇÃO DO SUPABASE

### A) Índices Necessários

Analisei os índices existentes e identifiquei **gaps críticos**:

```sql
-- ÍNDICE 1: Otimizar busca de mensagens por conversa (usado em N+1)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conversation_sent_at 
ON messages(conversation_id, sent_at DESC);

-- ÍNDICE 2: Otimizar busca de templates enviados
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_template_lookup
ON messages(conversation_id, from_type, sent_at DESC)
WHERE from_type = 'nina';

-- ÍNDICE 3: Otimizar filtro de conversas ativas
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_active_last_message
ON conversations(is_active, last_message_at DESC)
WHERE is_active = true;

-- ÍNDICE 4: Otimizar busca de deals por contato
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deals_contact_created
ON deals(contact_id, created_at DESC);
```

---

### B) Realtime - Uso Atual

O projeto utiliza Supabase Realtime corretamente em:

| Tabela | Local | Necessário? |
|--------|-------|-------------|
| `messages` | useConversations.ts | ✅ Sim - core do chat |
| `conversations` | useConversations.ts | ✅ Sim - status updates |
| `contacts` | useConversations.ts | ✅ Sim - dados AI updates |
| `deals` | Kanban.tsx | ✅ Sim - drag-drop sync |
| `pipeline_stages` | Kanban.tsx | ⚠️ Raramente muda |

---

### C) RLS Policies - Problemas Identificados

O linter do Supabase identificou **4 warnings** de políticas permissivas:

```
WARN: RLS Policy Always True
Detects policies that use USING (true) or WITH CHECK (true)
```

**Tabelas afetadas (baseado em análise):**
- `whatsapp_metrics` - `USING (true)` para SELECT
- `webhook_dead_letter` - `USING (true)` para SELECT
- `disqualification_reports` - `USING (true)` para SELECT

**Recomendação:** Revisar se realmente precisam ser públicas ou adicionar `is_authenticated_user()`.

---

## ⚡ 3. MELHORIAS DE VELOCIDADE

### A) Cache - React Query já implementado

O projeto **já usa** `@tanstack/react-query` corretamente. Sugestões de refinamento:

```typescript
// Adicionar staleTime para dados que mudam pouco
const { data: pipelines } = useQuery({
  queryKey: ['pipelines'],
  queryFn: api.fetchPipelines,
  staleTime: 5 * 60 * 1000, // 5 minutos
});
```

---

### B) Chat - Virtualização de Mensagens

**Problema:** ChatInterface.tsx renderiza até 100 mensagens sem virtualização (linha 1735).

**Solução:** Implementar `react-window` para listas longas.

```typescript
import { FixedSizeList as List } from 'react-window';

// Virtualizar lista de mensagens
<List
  height={containerHeight}
  itemCount={messages.length}
  itemSize={80}
  width="100%"
>
  {({ index, style }) => (
    <div style={style}>
      <MessageBubble message={messages[index]} />
    </div>
  )}
</List>
```

**Estimativa de ganho:** 60-80% menos uso de memória em conversas longas.

---

### C) Lazy Loading de Rotas

**Implementação atual:** Todas as rotas são importadas no App.tsx.

```typescript
// ATUAL - tudo importado diretamente
import Dashboard from './components/Dashboard';
import ProspectingDashboard from './components/ProspectingDashboard';
import CampaignsDashboard from './components/CampaignsDashboard';
```

**Solução proposta:**
```typescript
// OTIMIZADO - lazy loading
const Dashboard = React.lazy(() => import('./components/Dashboard'));
const ProspectingDashboard = React.lazy(() => import('./components/ProspectingDashboard'));
const CampaignsDashboard = React.lazy(() => import('./components/CampaignsDashboard'));
```

---

## 🎨 4. USABILIDADE (UX/UI)

### A) Skeleton Loaders

✅ **Já implementado** em:
- Dashboard (loading state com skeletons)
- Kanban (loading state com skeletons)

❌ **Faltando em:**
- ChatInterface (lista de conversas)
- Contacts (tabela de contatos)

---

### B) Navegação por Teclado

✅ **Já implementado:**
- `useKeyboardShortcuts` hook existe
- KeyboardShortcutsHelp component existe
- Quick questions com `/` no chat

---

## 🔒 5. SEGURANÇA

### Análise do Security Scan

| Finding | Severidade | Status |
|---------|------------|--------|
| API Keys em plain text (nina_settings) | WARN | Migração para Vault em andamento |
| SECURITY DEFINER sem validação | WARN | ✅ Aceitável (service role) |
| Storage público (whatsapp-media) | INFO | ⚠️ Revisar quotas por usuário |

### Validação de Inputs

✅ **Bem implementado:**
- Uso de Zod para validação
- DOMPurify para sanitização HTML
- Rate limit em algumas ações

❌ **Gaps identificados:**
- Importação CSV sem rate limiting
- Chamadas diretas a APIs externas (ViaCEP) sem throttle

---

## 📋 TOP 15 MELHORIAS PRIORIZADAS

| # | Melhoria | Impacto | Esforço | Ganho Estimado |
|---|----------|---------|---------|----------------|
| 1 | ⚡ Resolver N+1 no fetchConversations | Alto | Médio | -70% tempo loading |
| 2 | ⚡ Virtualização de mensagens (react-window) | Alto | Médio | -60% memória |
| 3 | 📦 Mover @playwright/test para devDeps | Baixo | Trivial | -500KB bundle |
| 4 | 📦 Lazy loading de rotas | Médio | Baixo | -30% FCP |
| 5 | 🗄️ Adicionar índice messages(conv_id, sent_at) | Alto | Trivial | -50% query time |
| 6 | 🗄️ Adicionar índice conversations(is_active, last_message_at) | Médio | Trivial | -30% query time |
| 7 | ⚡ Adicionar staleTime ao React Query | Baixo | Trivial | -20% requests |
| 8 | 🎨 Skeleton loaders no Chat/Contacts | Médio | Baixo | +20% percepção |
| 9 | 🔒 Revisar RLS policies permissivas | Médio | Médio | Segurança |
| 10 | 🗄️ Limite em fetchDashboardMetrics | Baixo | Trivial | Estabilidade |
| 11 | ⚡ Lazy load recharts/canvas-confetti | Baixo | Baixo | -50KB inicial |
| 12 | 🔒 Rate limit na importação CSV | Médio | Baixo | Segurança |
| 13 | 🗄️ Remover Realtime de pipeline_stages | Baixo | Trivial | Menos conexões |
| 14 | 📦 Tree-shake lucide-react icons | Baixo | Médio | -30KB bundle |
| 15 | ⚡ Paginação server-side em Contacts | Médio | Médio | Escalabilidade |

---

## 🔧 CÓDIGO PARA TOP 5 MELHORIAS

### 1. Resolver N+1 no fetchConversations

```typescript
// src/services/api.ts - SUBSTITUIR fetchConversations

fetchConversations: async (includeConversationId?: string): Promise<UIConversation[]> => {
  console.log('[API] Fetching conversations from Supabase...');
  
  // Query única com mensagens agregadas
  const { data: conversations, error } = await supabase
    .from('conversations')
    .select(`
      *,
      contact:contacts(*),
      agent:agents!conversations_current_agent_id_fkey(id, name, slug),
      messages:messages(id, content, from_type, type, status, sent_at, media_url, metadata, whatsapp_message_id)
    `)
    .eq('is_active', true)
    .order('last_message_at', { ascending: false })
    .limit(200);

  if (error) throw error;

  // Processar em memória (muito mais rápido que N queries)
  const conversationsWithMessages = conversations.map(conv => {
    const messages = (conv.messages || [])
      .sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime())
      .slice(-100); // Últimas 100 mensagens
    
    return transformDBToUIConversation(
      { ...conv, messages: undefined } as DBConversation,
      messages as DBMessage[]
    );
  });

  return conversationsWithMessages;
}
```

### 2. Virtualização de Mensagens

```bash
# Instalar dependência
npm install react-window @types/react-window
```

```typescript
// Novo componente: src/components/chat/VirtualizedMessageList.tsx
import { VariableSizeList as List } from 'react-window';
import { useRef, useCallback } from 'react';
import { UIMessage } from '@/types';

interface Props {
  messages: UIMessage[];
  height: number;
}

export const VirtualizedMessageList: React.FC<Props> = ({ messages, height }) => {
  const listRef = useRef<List>(null);
  
  // Estimar altura de cada mensagem
  const getItemSize = useCallback((index: number) => {
    const msg = messages[index];
    const baseHeight = 60;
    const contentLength = msg.content?.length || 0;
    const extraLines = Math.floor(contentLength / 50);
    return baseHeight + (extraLines * 20);
  }, [messages]);

  return (
    <List
      ref={listRef}
      height={height}
      itemCount={messages.length}
      itemSize={getItemSize}
      width="100%"
    >
      {({ index, style }) => (
        <div style={style}>
          <MessageBubble message={messages[index]} />
        </div>
      )}
    </List>
  );
};
```

### 3. Mover @playwright/test

```json
// package.json - MOVER para devDependencies
{
  "dependencies": {
    // REMOVER: "@playwright/test": "^1.57.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.57.0"  // ADICIONAR AQUI
  }
}
```

### 4. Lazy Loading de Rotas

```typescript
// src/App.tsx - SUBSTITUIR imports

import React, { Suspense } from 'react';
// ... outros imports

// Lazy loading para rotas pesadas
const Dashboard = React.lazy(() => import('./components/Dashboard'));
const ProspectingDashboard = React.lazy(() => import('./components/ProspectingDashboard'));
const CampaignsDashboard = React.lazy(() => import('./components/CampaignsDashboard'));
const Settings = React.lazy(() => import('./components/Settings'));
const Team = React.lazy(() => import('./components/Team'));
const Functions = React.lazy(() => import('./components/Functions'));

// Fallback component
const RouteLoader = () => (
  <div className="h-full flex items-center justify-center bg-slate-950">
    <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
  </div>
);

// Nas rotas, envolver com Suspense
<Route path="/dashboard" element={
  <Suspense fallback={<RouteLoader />}>
    <Dashboard />
  </Suspense>
} />
```

### 5. Índices SQL

```sql
-- Executar no Supabase SQL Editor

-- Índice para resolver N+1 de mensagens
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conversation_sent_at 
ON public.messages(conversation_id, sent_at DESC);

-- Índice para conversas ativas ordenadas
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_active_last_message
ON public.conversations(is_active, last_message_at DESC)
WHERE is_active = true;

-- Índice para busca de templates
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_template_lookup
ON public.messages(conversation_id, from_type)
WHERE from_type = 'nina';

-- Índice para deals por contato
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deals_contact_created
ON public.deals(contact_id, created_at DESC);

-- Verificar índices criados
SELECT tablename, indexname FROM pg_indexes 
WHERE schemaname = 'public' 
AND indexname LIKE 'idx_%'
ORDER BY tablename;
```

---

## ✅ CHECKLIST DE VERIFICAÇÃO

### Para cada implementação:

- [ ] **Backup:** Fazer backup do código antes de modificar
- [ ] **Teste local:** Verificar em ambiente de desenvolvimento
- [ ] **Métricas:** Medir tempo de loading antes/depois
- [ ] **Rollback:** Ter plano de reversão se houver problemas
- [ ] **Monitor:** Acompanhar logs de erro após deploy

### Ordem de implementação recomendada:

1. **Dia 1:** Índices SQL (trivial, grande impacto)
2. **Dia 1:** Mover @playwright/test (trivial)
3. **Dia 2:** Lazy loading de rotas (baixo esforço)
4. **Dia 2-3:** Resolver N+1 query (médio esforço)
5. **Dia 4-5:** Virtualização de mensagens (médio esforço)

---

## 📈 ESTIMATIVA DE GANHOS TOTAIS

| Métrica | Antes (estimado) | Depois | Ganho |
|---------|------------------|--------|-------|
| First Contentful Paint | ~2.5s | ~1.5s | -40% |
| Time to Interactive | ~4s | ~2.5s | -37% |
| Bundle Size | ~2.5MB | ~1.8MB | -28% |
| Chat Loading (200 convs) | ~3s | ~0.8s | -73% |
| Memória em conversas longas | ~150MB | ~60MB | -60% |
