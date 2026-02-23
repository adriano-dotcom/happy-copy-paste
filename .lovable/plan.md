
# Corrigir Filtro de Template WhatsApp nos Contatos

## Problema Encontrado

A query que busca mensagens de template esta falhando silenciosamente porque passa **~1668 UUIDs** de conversas no filtro `.in('conversation_id', conversationIds)`. Isso gera uma URL com ~62.000 caracteres, que excede o limite do PostgREST (~8.000-16.000 chars dependendo da configuracao).

Resultado: `contactTemplateMap` fica vazio, e todos os contatos mostram `-` na coluna Template.

## Dados do Banco

- 785 mensagens de template existem no banco
- 524 contatos outbound tem template associado
- 1668 conversas totais (passadas no `.in()`)

## Solucao

Dividir a query de template messages em lotes de 300 IDs (similar ao que ja e feito para deals e conversations).

### Arquivo: `src/services/api.ts`

Substituir o bloco de template messages (linhas 411-446) por uma versao com batching:

```typescript
// Fetch contacts that have WhatsApp template messages sent
const conversationIds = (conversationsData || []).map(c => c.id);
const contactTemplateMap = new Map<string, string>();

if (conversationIds.length > 0) {
  // Batch conversation IDs to avoid URL length limits (max ~300 per batch)
  const BATCH_SIZE = 300;
  const batches = [];
  for (let i = 0; i < conversationIds.length; i += BATCH_SIZE) {
    batches.push(conversationIds.slice(i, i + BATCH_SIZE));
  }

  const templateResults = await Promise.all(
    batches.map(batch =>
      supabase
        .from('messages')
        .select('conversation_id, metadata')
        .in('conversation_id', batch)
        .eq('from_type', 'nina')
        .contains('metadata', { is_template: true })
        .order('sent_at', { ascending: false })
        .limit(500)
    )
  );

  const allTemplateMessages = templateResults.flatMap(r => r.data || []);

  if (allTemplateMessages.length > 0) {
    const convToTemplate = new Map<string, string>();
    allTemplateMessages.forEach(m => {
      const meta = m.metadata as Record<string, any> | null;
      if (meta?.template_name && !convToTemplate.has(m.conversation_id)) {
        convToTemplate.set(m.conversation_id, meta.template_name);
      }
    });

    (conversationsData || []).forEach(conv => {
      const templateName = convToTemplate.get(conv.id);
      if (templateName) {
        contactTemplateMap.set(conv.contact_id, templateName);
      }
    });
  }
}
```

## Resultado Esperado

- Os 524 contatos outbound com template enviado mostrarao o badge verde com o nome do template
- O filtro "Com template" / "Sem template" funcionara corretamente
- Queries em lotes de 300 evitam o limite de URL do PostgREST

| Arquivo | Mudanca |
|---------|---------|
| `src/services/api.ts` | Dividir query de template messages em batches de 300 IDs |
