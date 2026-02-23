
# Corrigir Exibicao de Templates nos Contatos

## Problema Raiz

A query que busca **conversations** e **deals** usa `.in('contact_id', contactIds)` com **3365 UUIDs** (gerando URLs de ~125.000 caracteres). Isso excede o limite do PostgREST e faz as queries falharem silenciosamente, retornando arrays vazios.

Como resultado, `conversationsData` fica vazio, `conversationIds` tambem, e a query de template messages **nunca executa** -- por isso a coluna Template mostra "-" para todos os contatos.

O batching aplicado anteriormente so cobriu a query de template messages, mas nao as queries anteriores de conversations e deals que tambem sofrem do mesmo problema.

## Solucao

Aplicar batching de 300 IDs nas queries de conversations e deals dentro do `fetchContacts`, seguindo o mesmo padrao ja usado para template messages.

### Arquivo: `src/services/api.ts`

**1. Batching das queries de deals e conversations (linhas ~348-390)**

Substituir as 4 queries paralelas com `.in('contact_id', contactIds)` por batches de 300 IDs:

```typescript
// Batch contactIds to avoid URL length limits
const BATCH_SIZE = 300;
const contactBatches: string[][] = [];
for (let i = 0; i < contactIds.length; i += BATCH_SIZE) {
  contactBatches.push(contactIds.slice(i, i + BATCH_SIZE));
}

// Fetch deals in batches
const dealsResults = await Promise.all(
  contactBatches.map(batch =>
    supabase
      .from('deals')
      .select(`id, contact_id, owner_id, pipeline_id, created_at,
        team_members!deals_owner_id_fkey(id, name),
        pipelines(id, name, slug, icon, color)`)
      .in('contact_id', batch)
      .order('created_at', { ascending: false })
  )
);
const dealsData = dealsResults.flatMap(r => r.data || []);

// Fetch conversations in batches
const convResults = await Promise.all(
  contactBatches.map(batch =>
    supabase
      .from('conversations')
      .select('id, contact_id, is_active, status, updated_at')
      .in('contact_id', batch)
      .order('updated_at', { ascending: false })
  )
);
const conversationsData = convResults.flatMap(r => r.data || []);
```

**2. Manter o batching de template messages como esta** (ja corrigido anteriormente).

## Resultado Esperado

- Todas as conversations e deals serao carregadas corretamente (sem falha de URL)
- A coluna Template exibira o nome do template para os 524 contatos que o possuem
- Os contatos "Em Prospecao" mostrarao o badge verde com o template enviado
- Os filtros "Com template" / "Sem template" funcionarao corretamente

## Impacto

| Arquivo | Mudanca |
|---------|---------|
| `src/services/api.ts` | Aplicar batching de 300 IDs nas queries de deals e conversations |
