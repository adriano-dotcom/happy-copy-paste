

# Corrigir Filtro "Arquivado" nos Contatos

## Problema

A query de conversations em `src/services/api.ts` (linha 363-367) busca conversas com `.in('contact_id', contactIds)`, mas o resultado esta limitado a 1.000 linhas pelo Supabase. Existem **1.529 conversas arquivadas** e **118 ativas** no banco (1.647 total). Como apenas 1.000 sao retornadas, muitos contatos ficam sem dados de conversa (`conversationActive = null`), e ao clicar em "Arquivado" nada aparece porque o filtro busca `conversationActive === false`.

## Solucao

Paginar a query de conversations da mesma forma que ja foi feito para os contatos outbound -- usando `.range()` em blocos paralelos.

### Arquivo: `src/services/api.ts`

Na funcao `fetchContacts`, substituir a query unica de conversations por 2 queries paginadas em paralelo:

```typescript
// Antes (limitado a 1000):
const conversationsResult = await supabase
  .from('conversations')
  .select('id, contact_id, is_active, status, updated_at')
  .in('contact_id', contactIds)
  .order('updated_at', { ascending: false });

// Depois (2 blocos de 1000):
const [convResult1, convResult2] = await Promise.all([
  supabase
    .from('conversations')
    .select('id, contact_id, is_active, status, updated_at')
    .in('contact_id', contactIds)
    .order('updated_at', { ascending: false })
    .range(0, 999),
  supabase
    .from('conversations')
    .select('id, contact_id, is_active, status, updated_at')
    .in('contact_id', contactIds)
    .order('updated_at', { ascending: false })
    .range(1000, 1999),
]);

const conversationsData = [
  ...(convResult1.data || []),
  ...(convResult2.data || []),
];
```

A mesma paginacao sera aplicada a query de deals (que tambem pode ser afetada pelo limite).

O restante do codigo (`conversationsByContact` map, filtros em `Contacts.tsx`) permanece inalterado -- com os dados corretos de `is_active`, o filtro "Arquivado" passara a funcionar.

## Resultado Esperado

- Filtro "Arquivado" mostra os ~1.477 contatos com conversa arquivada
- Filtro "Ativo no chat" mostra os ~118 contatos com conversa ativa
- Comportamento padrao (sem filtro) continua escondendo arquivados

## Arquivo modificado

| Arquivo | Mudanca |
|---------|---------|
| `src/services/api.ts` | Paginar query de conversations em 2 blocos de 1.000 |
