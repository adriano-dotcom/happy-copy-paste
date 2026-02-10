

# Correcao: "lastAgentMessage is not defined"

## Problema

O Atlas nao seguiu com a prospeccao porque o nina-orchestrator esta crashando com o erro:

```
ReferenceError: lastAgentMessage is not defined
```

Este erro esta acontecendo em TODAS as mensagens processadas, nao apenas no caso de "nao e o responsavel". Isso significa que nenhuma conversa de prospeccao esta funcionando.

## Causa Raiz

A variavel `lastAgentMessage` e declarada dentro do bloco `if (message.content) { ... }` na linha 3351 (dentro da secao "AUTOMATIC CONVERSATION CLOSURE DETECTION"). Esse bloco fecha na linha 3446.

O bloco "NOT RESPONSIBLE DETECTION" na linha 3449 esta FORA desse escopo, e tenta usar `lastAgentMessage` que nao existe mais.

## Correcao

Mover a busca de `lastAgentMessage` para ANTES do bloco de closure detection, no escopo externo da funcao, para que fique acessivel tanto pelo closure detection quanto pelo not-responsible detection.

### Arquivo: `supabase/functions/nina-orchestrator/index.ts`

### Mudancas:

1. **Linha ~3339**: Mover a query de `lastAgentMessage` para fora do `if (message.content)` do closure detection, declarando-a no escopo da funcao:

```typescript
const conversationMetadata = conversation.metadata || {};

// Fetch last agent message (used by closure detection AND not-responsible detection)
let lastAgentMessage: string | null = null;
if (message.content) {
    const { data: lastAgentMessages } = await supabase
      .from('messages')
      .select('content')
      .eq('conversation_id', conversation.id)
      .in('from_type', ['nina', 'human'])
      .lt('sent_at', message.sent_at)
      .order('sent_at', { ascending: false })
      .limit(1);
    
    lastAgentMessage = lastAgentMessages?.[0]?.content || null;
}
```

2. **Dentro do bloco closure detection**: Remover a declaracao duplicada de `lastAgentMessage` e usar a variavel do escopo externo.

3. **Bloco not-responsible detection**: Continuara funcionando normalmente pois `lastAgentMessage` agora esta acessivel.

## Impacto

- Corrige o crash que esta impedindo TODAS as conversas de serem processadas pelo nina-orchestrator
- A deteccao de "nao e o responsavel" passara a funcionar corretamente
- A deteccao de closure continuara funcionando como antes

