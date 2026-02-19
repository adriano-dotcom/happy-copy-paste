
## Diagnóstico: Carregamento Excessivo nas Páginas Contatos e Chat

### Causa Raiz Identificada

Foram identificados **3 problemas de performance** encadeados que causam lentidão, especialmente quando templates Meta estão sendo disparados em massa (via campanha ou prospecção):

---

### Problema 1 — Query de Templates sem LIMIT na página Contatos

**Arquivo:** `src/services/api.ts` → função `fetchContacts()` (linhas 349-378)

A função `fetchContacts` executa uma query extra na tabela `messages` para detectar templates enviados:

```typescript
// Query atual — SEM LIMIT (retorna TODAS as mensagens de template de TODAS as conversas)
const { data: templateMessages } = await supabase
  .from('messages')
  .select('conversation_id, metadata')
  .in('conversation_id', conversationIds)   // até 500 IDs
  .eq('from_type', 'nina')
  .contains('metadata', { is_template: true })
  .order('sent_at', { ascending: false });  // sem .limit()
```

Quando uma campanha de prospecção dispara 100-500 templates simultaneamente, essa query retorna **todos os registros** de template de todas as conversas — potencialmente milhares de linhas — sem nenhum limite. Isso travava a página de Contatos para todos os usuários ao mesmo tempo.

**Fix:** Adicionar `.limit(1000)` e um select mais enxuto.

---

### Problema 2 — Realtime global "chat-realtime-unified" causa re-renders em cascade

**Arquivo:** `src/hooks/useConversations.ts` (linhas 238-263)

O canal unificado escuta TODOS os eventos de `messages UPDATE` no banco. Quando uma campanha dispara 200 templates e a Meta confirma a entrega (`status: delivered`) para cada um, isso gera **200 eventos UPDATE simultâneos** no canal realtime. Cada evento dispara `handleMessageUpdate` que chama `setConversations(prev => prev.map(...))`, causando um re-render completo do estado com 200+ conversas para cada evento.

O session replay confirmou: a UI fica com o spinner "Sincronizando conversas..." por longos períodos quando templates são enviados.

**Fix:** Adicionar debounce nos updates de status de mensagem (delivered/read) — esses eventos não precisam ser processados imediatamente pois só mudam o ícone de status (✓/✓✓). Filtrar eventos `UPDATE` de mensagem que são apenas mudanças de `status`/`delivered_at`/`read_at` para não disparar re-render completo do estado de conversas.

---

### Problema 3 — `fetchConversations` busca 4000 mensagens em uma única query sem filtro temporal

**Arquivo:** `src/services/api.ts` → `fetchConversations()` (linhas 1737-1742)

```typescript
const { data: allMessages } = await supabase
  .from('messages')
  .select('id, conversation_id, content, ...')
  .in('conversation_id', conversationIds)  // até 200 IDs
  .order('sent_at', { ascending: false })
  .limit(4000);  // 4000 mensagens sem filtro de data
```

Com 200 conversas ativas e disparos de campanha acontecendo, o PostgREST precisa varrer todas as mensagens de cada conversa para ordenar e limitar. Sem índice combinado em `(conversation_id, sent_at)`, isso gera um table scan pesado, especialmente com mensagens recém-inseridas pela campanha.

**Fix:** Adicionar filtro temporal para buscar mensagens apenas dos últimos 30 dias na carga inicial. Conversas antigas mostrarão botão "carregar mais" (já implementado via `loadMoreMessages`).

---

### Solução Técnica

#### Mudança 1 — Limitar query de templates em `fetchContacts` (`src/services/api.ts`)

```typescript
// ANTES: sem limit
const { data: templateMessages } = await supabase
  .from('messages')
  .select('conversation_id, metadata')
  .in('conversation_id', conversationIds)
  .eq('from_type', 'nina')
  .contains('metadata', { is_template: true })
  .order('sent_at', { ascending: false });

// DEPOIS: com limit e select menor
const { data: templateMessages } = await supabase
  .from('messages')
  .select('conversation_id, metadata->template_name')
  .in('conversation_id', conversationIds)
  .eq('from_type', 'nina')
  .contains('metadata', { is_template: true })
  .order('sent_at', { ascending: false })
  .limit(500); // Suficiente para 500 contatos (1 template por conversa)
```

#### Mudança 2 — Filtrar eventos UPDATE de mensagem no realtime para não re-renderizar em status changes (`src/hooks/useConversations.ts`)

Adicionar verificação no `handleMessageUpdate`: se a única coisa que mudou foi `status`, `delivered_at` ou `read_at`, fazer uma atualização cirúrgica apenas do ícone da mensagem, sem re-mapear toda a lista de conversas com `setConversations(prev => prev.map(...))`.

```typescript
const handleMessageUpdate = useCallback((payload: any) => {
  const updatedMessage = payload.new as DBMessage;
  const oldMessage = payload.old as Partial<DBMessage>;
  
  // OTIMIZAÇÃO: Se apenas status/timestamps mudaram, atualizar só o necessário
  const isOnlyStatusChange = 
    updatedMessage.content === oldMessage?.content &&
    updatedMessage.from_type === oldMessage?.from_type;
  
  if (isOnlyStatusChange) {
    // Atualização leve: só muda o status da mensagem específica
    setConversations(prev => prev.map(conv => {
      if (conv.id !== updatedMessage.conversation_id) return conv; // early return
      // ... apenas atualiza a mensagem específica
    }));
    return;
  }
  
  // ... lógica completa de update para mudanças de conteúdo
}, []);
```

Obs: o `payload.old` já vem disponível no canal realtime quando `REPLICA IDENTITY FULL` está configurado para a tabela (que é o caso para tabelas com realtime ativo).

#### Mudança 3 — Filtro temporal em `fetchConversations` (`src/services/api.ts`)

```typescript
// ANTES: sem filtro de data
const { data: allMessages } = await supabase
  .from('messages')
  .select('...')
  .in('conversation_id', conversationIds)
  .order('sent_at', { ascending: false })
  .limit(4000);

// DEPOIS: apenas mensagens dos últimos 30 dias na carga inicial
const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

const { data: allMessages } = await supabase
  .from('messages')
  .select('...')
  .in('conversation_id', conversationIds)
  .gte('sent_at', thirtyDaysAgo.toISOString()) // filtro temporal
  .order('sent_at', { ascending: false })
  .limit(4000);
```

Isso permite que o PostgREST use o índice em `sent_at` ao invés de escanear toda a tabela.

---

### Arquivos Modificados

1. `src/services/api.ts`
   - `fetchContacts()`: adicionar `.limit(500)` na query de templates (linha ~357)
   - `fetchConversations()`: adicionar filtro temporal de 30 dias na query de mensagens (linha ~1742)

2. `src/hooks/useConversations.ts`
   - `handleMessageUpdate`: adicionar detecção de "apenas status change" para fazer update leve sem re-render completo do estado

### Resultado Esperado

| Cenário | Antes | Depois |
|---|---|---|
| Campanha dispara 200 templates | Página de Contatos trava por 5-10s para todos | Contatos carrega normalmente (query limitada a 500 rows) |
| Meta confirma entrega de 200 templates | 200 re-renders completos do estado de conversas | Atualização leve só na mensagem específica |
| Chat abre com 200 conversas | 4000 mensagens sem filtro temporal | 4000 msgs apenas dos últimos 30 dias (query mais rápida com índice) |
| Outro usuário com chat aberto | UI fica instável com spinners | Apenas mensagens com mudança de conteúdo causam re-renders |
