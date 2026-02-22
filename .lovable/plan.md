
# Mostrar Contatos com Template Enviado (Mesmo Arquivados)

## Problema

Dos 634 contatos outbound que receberam template WhatsApp, **613 tem conversa arquivada** (`is_active = false`). O filtro implementado anteriormente exclui arquivados da visualizacao padrao, o que esconde esses contatos -- dando a impressao de que o envio nao foi registrado.

| Status | Contatos com template |
|--------|----------------------|
| Conversa ativa | 21 (visiveis) |
| Conversa arquivada | 613 (escondidos) |
| **Total** | **634** |

## Solucao

Alterar o filtro de exclusao de arquivados em `src/components/Contacts.tsx` (linha 272-279) para **manter visivel** qualquer contato que tenha `hasTemplateSent === true`, mesmo que a conversa esteja arquivada.

### Arquivo: `src/components/Contacts.tsx`

Na linha 272-279, ajustar a condicao para:

```typescript
// Excluir arquivados por padrao, MAS manter contatos que receberam template
if (!searchTerm && chatStatusFilter !== 'archived') {
  filtered = filtered.filter(c => {
    const ext = c as ExtendedContact;
    // Sempre mostrar contatos com template enviado
    if (ext.hasTemplateSent) return true;
    // Manter se nao tem conversa ou se conversa esta ativa
    return ext.conversationActive === null || 
           ext.conversationActive === undefined || 
           ext.conversationActive === true;
  });
}
```

## Resultado Esperado

- Todos os 634 contatos outbound com template enviado aparecem na aba "Outbound" com o badge de template
- Contatos arquivados SEM template continuam escondidos por padrao
- Filtro "Arquivado" continua funcionando normalmente
- Busca por nome/telefone continua buscando em todos

## Arquivo modificado

| Arquivo | Mudanca |
|---------|---------|
| `src/components/Contacts.tsx` | Adicionar excecao para `hasTemplateSent` no filtro de arquivados |
