
# Plano: Otimizacao de Performance da Tela de Chat

## Diagnostico Atual

Apos analise detalhada do codigo, identifiquei os seguintes gargalos de performance:

### 1. Carregamento de Mensagens
- **Problema**: `fetchConversations` carrega ate 20.000 mensagens de uma vez para 200 conversas
- **Impacto**: Carregamento inicial lento, memoria alta no browser
- **Local**: `src/services/api.ts` linhas 1730-1760

### 2. Realtime Ineficiente
- **Problema**: 3 canais Realtime separados (messages, conversations, contacts)
- **Impacto**: Overhead de conexao WebSocket, processamento duplicado
- **Local**: `src/hooks/useConversations.ts` linhas 40-240

### 3. Re-renders Excessivos
- **Problema**: `ChatInterface.tsx` tem 3400+ linhas, sem memoizacao adequada
- **Impacto**: Re-renders completos a cada nova mensagem
- **Local**: `src/components/ChatInterface.tsx`

### 4. Timeline Recalculada a Cada Render
- **Problema**: Merge de mensagens + chamadas em cada render
- **Impacto**: O(n log n) a cada render
- **Local**: `ChatInterface.tsx` linhas 2336-2354

---

## Otimizacoes Propostas

### 1. Lazy Loading de Mensagens (Alto Impacto)

**Estrategia**: Carregar apenas ultimas 20 mensagens inicialmente, buscar mais sob demanda

```text
+----------------------------------+
|  Conversa Selecionada            |
|----------------------------------|
|  [Carregar mais...]  <- Trigger  |
|  Mensagem 1                      |
|  Mensagem 2                      |
|  ...                             |
|  Mensagem 20                     |
+----------------------------------+
```

**Arquivos Modificados**:
- `src/services/api.ts`: Nova funcao `fetchMoreMessages(conversationId, beforeDate)`
- `src/hooks/useConversations.ts`: Estado para paginacao
- `src/components/ChatInterface.tsx`: Botao "Carregar mais"

**Mudancas Tecnicas**:

1. Reduzir carga inicial para 20 mensagens por conversa:
```typescript
// api.ts - fetchConversations
.limit(4000) // 20 msgs * 200 convs = 4000 (muito menor que 20000)
```

2. Nova funcao de paginacao:
```typescript
fetchMoreMessages: async (conversationId: string, beforeDate: string, limit = 50) => {
  const { data } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .lt('sent_at', beforeDate)
    .order('sent_at', { ascending: false })
    .limit(limit);
  return data?.reverse() || [];
}
```

3. Hook com estado de paginacao:
```typescript
const [hasMoreMessages, setHasMoreMessages] = useState<Record<string, boolean>>({});
const loadMoreMessages = useCallback(async (conversationId: string) => {
  const oldestMessage = activeChat?.messages[0];
  if (!oldestMessage) return;
  const moreMessages = await api.fetchMoreMessages(conversationId, oldestMessage.sentAt);
  // Prepend messages to conversation
}, [activeChat]);
```

---

### 2. Canal Realtime Unificado (Medio Impacto)

**Estrategia**: Consolidar 3 canais em 1 com filtros

**Antes**:
```typescript
const messagesChannel = supabase.channel('messages-realtime');
const conversationsChannel = supabase.channel('conversations-realtime');
const contactsChannel = supabase.channel('contacts-realtime');
```

**Depois**:
```typescript
const unifiedChannel = supabase
  .channel('chat-realtime')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, handleMessage)
  .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, handleConversation)
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'contacts' }, handleContact)
  .subscribe();
```

**Beneficio**: 1 conexao WebSocket em vez de 3, menos overhead de rede

---

### 3. Memoizacao de Componentes (Alto Impacto)

**Estrategia**: Extrair componentes memoizados do ChatInterface

**Componentes a Extrair**:

| Componente | Linhas Atuais | Memoizacao |
|------------|---------------|------------|
| `MessageBubble` | 2417-2495 | `React.memo` + `useMemo` |
| `ConversationListItem` | 1700-1900 | `React.memo` |
| `MessageTimeline` | 2336-2500 | `useMemo` para merge |
| `ChatHeader` | 2020-2330 | `React.memo` |

**Implementacao**:

```typescript
// src/components/chat/MessageBubble.tsx (novo arquivo)
const MessageBubble = React.memo(({ msg, isOutgoing, isMobile, onPdfPreview }) => {
  // Renderizacao do bubble
}, (prev, next) => prev.msg.id === next.msg.id && prev.msg.status === next.msg.status);
```

```typescript
// ChatInterface.tsx - Timeline memoizada
const timelineItems = useMemo(() => {
  if (!activeChat) return [];
  return [
    ...activeChat.messages.map(msg => ({
      type: 'message' as const,
      data: msg,
      date: msg.sentAt ? new Date(msg.sentAt) : new Date()
    })),
    ...callHistory.map(call => ({
      type: 'call' as const,
      data: call,
      date: new Date(call.started_at)
    }))
  ].sort((a, b) => a.date.getTime() - b.date.getTime());
}, [activeChat?.messages, callHistory]);
```

---

### 4. Virtualizacao da Lista de Mensagens (Alto Impacto para Muitas Mensagens)

**Estrategia**: Usar virtualizacao para renderizar apenas mensagens visiveis

**Problema**: Conversas com 500+ mensagens renderizam todos os DOM nodes

**Solucao**: Implementar virtualizacao simples sem dependencia externa

```typescript
// Hook customizado para virtualizacao
const useVirtualizedMessages = (messages: UIMessage[], containerRef: RefObject<HTMLDivElement>) => {
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 50 });
  
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    
    const handleScroll = () => {
      const scrollTop = container.scrollTop;
      const viewportHeight = container.clientHeight;
      const avgItemHeight = 80; // Estimativa
      
      const start = Math.max(0, Math.floor(scrollTop / avgItemHeight) - 10);
      const end = Math.min(messages.length, Math.ceil((scrollTop + viewportHeight) / avgItemHeight) + 10);
      
      setVisibleRange({ start, end });
    };
    
    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    
    return () => container.removeEventListener('scroll', handleScroll);
  }, [messages.length]);
  
  return {
    visibleMessages: messages.slice(visibleRange.start, visibleRange.end),
    paddingTop: visibleRange.start * 80,
    paddingBottom: (messages.length - visibleRange.end) * 80
  };
};
```

---

### 5. Debounce do Scroll Handler (Baixo Impacto)

**Problema**: `handleMessagesScroll` dispara em cada pixel de scroll

**Solucao**: Debounce de 100ms

```typescript
const handleMessagesScroll = useMemo(() => {
  let timeoutId: NodeJS.Timeout;
  return (e: React.UIEvent<HTMLDivElement>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      const target = e.currentTarget;
      const isNearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 100;
      setIsScrolledUp(!isNearBottom);
      if (isNearBottom) setNewMessagesCount(0);
    }, 100);
  };
}, []);
```

---

### 6. Cache de Conversas Selecionadas (Medio Impacto)

**Estrategia**: Manter cache das ultimas 5 conversas abertas

```typescript
const conversationCache = useRef(new Map<string, UIConversation>());

useEffect(() => {
  if (activeChat) {
    conversationCache.current.set(activeChat.id, activeChat);
    // Limitar cache a 5 conversas
    if (conversationCache.current.size > 5) {
      const firstKey = conversationCache.current.keys().next().value;
      conversationCache.current.delete(firstKey);
    }
  }
}, [activeChat]);
```

---

## Resumo de Arquivos

| Arquivo | Acao | Prioridade |
|---------|------|------------|
| `src/services/api.ts` | Editar (paginacao + limite) | Alta |
| `src/hooks/useConversations.ts` | Editar (canal unificado + paginacao) | Alta |
| `src/components/ChatInterface.tsx` | Editar (memoizacao + virtualizacao) | Alta |
| `src/components/chat/MessageBubble.tsx` | Criar | Media |
| `src/components/chat/MessageTimeline.tsx` | Criar | Media |
| `src/hooks/useVirtualizedMessages.ts` | Criar | Media |

---

## Ordem de Implementacao

1. **Lazy Loading** - Maior impacto no carregamento inicial
2. **Memoizacao da Timeline** - Reducao imediata de re-renders
3. **Canal Realtime Unificado** - Menos conexoes WebSocket
4. **Extracao de Componentes** - Melhora manutenibilidade
5. **Virtualizacao** - Para conversas com muitas mensagens

---

## Metricas de Sucesso Esperadas

| Metrica | Antes | Depois |
|---------|-------|--------|
| Tempo de carregamento inicial | ~3-5s | ~1s |
| Memoria JS (200 conversas) | ~150MB | ~40MB |
| Re-renders por nova mensagem | Componente inteiro | Apenas MessageBubble |
| Conexoes WebSocket | 3 | 1 |

---

## Secao Tecnica

### Consideracoes de Compatibilidade

1. **Scroll Position**: Ao carregar mensagens antigas, manter posicao do scroll
2. **Realtime**: Garantir que mensagens otimistas ainda funcionem
3. **Deep Links**: Suporte a `includeConversationId` mantido

### Riscos e Mitigacoes

| Risco | Mitigacao |
|-------|-----------|
| Scroll jump ao carregar mais | Calcular delta de altura e ajustar scrollTop |
| Mensagens perdidas no realtime | Manter logica de deduplicacao existente |
| Componentes desincronizados | Usar keys estáveis (message.id) |

### Trade-offs

- **Virtualizacao**: Aumenta complexidade, mas essencial para 500+ mensagens
- **Memoizacao**: Mais memoria para cache, mas muito menos CPU
- **Lazy loading**: UX de "carregar mais", mas carregamento 5x mais rapido
