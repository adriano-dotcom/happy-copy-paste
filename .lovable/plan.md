
# Atualizar Status do Contato para "Em Prospecção" ao Enviar Template

## Mudanca

No bloco `if (is_prospecting)` da edge function `send-whatsapp-template`, adicionar um `UPDATE` na tabela `contacts` para mudar o `lead_status` de `'new'` para `'prospecting'`.

### Arquivo: `supabase/functions/send-whatsapp-template/index.ts`

Dentro do bloco de prospeccao (apos a linha 288, onde atualiza a conversa), adicionar:

```typescript
// Update contact status to 'prospecting'
await supabase
  .from('contacts')
  .update({ lead_status: 'prospecting' })
  .eq('id', contact_id)
  .eq('lead_status', 'new'); // Only update if still 'new'
```

A condicao `.eq('lead_status', 'new')` garante que contatos ja qualificados ou em outro estagio nao sejam regredidos.

## Resultado Esperado

- Ao enviar template de prospecao, o contato muda automaticamente de "Novo Lead" para "Em Prospecção"
- Contatos que ja estao em estagios mais avancados nao sao afetados
- O badge de status na lista de contatos reflete a mudanca imediatamente

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/send-whatsapp-template/index.ts` | Adicionar update de `lead_status` para `'prospecting'` no bloco `is_prospecting` |
