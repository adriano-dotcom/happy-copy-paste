

# Excluir Contatos Arquivados da Query Padrao

## Situacao Atual

Dos 3.347 contatos no banco, **1.477 tem conversa arquivada** (`is_active = false`). Esses contatos estao sendo carregados junto com todos os outros, ocupando espaco nas queries e deixando as abas poluidas.

## Solucao

Adicionar filtro `.eq('is_active', true)` nas queries de conversations em `src/services/api.ts`, e ajustar `Contacts.tsx` para so incluir arquivados quando o usuario buscar ou filtrar explicitamente.

### 1. `src/services/api.ts` - Excluir contatos com conversa arquivada

Nas 6 queries paralelas de `fetchContacts`, adicionar `.eq('is_blocked', false)` para excluir bloqueados. Alem disso, na query de conversations (linha ~363-368), filtrar apenas conversas ativas por padrao.

Porem, a abordagem mais simples e **filtrar no lado do cliente**: apos montar os dados, remover contatos cujo `conversationActive === false`, exceto quando ha busca ativa ou filtro de "Arquivado" selecionado.

### 2. `src/components/Contacts.tsx` - Filtrar arquivados por padrao

Na logica de filtragem (por volta da linha 320), adicionar exclusao de contatos com `conversationActive === false` **por padrao**, a menos que:
- O usuario tenha digitado algo no campo de busca (`searchTerm` nao vazio), ou
- O filtro de status de chat esteja em "Arquivado" (`chatStatusFilter === 'archived'`)

```typescript
// Antes dos filtros existentes, excluir arquivados por padrao
if (!searchTerm && chatStatusFilter !== 'archived') {
  filtered = filtered.filter(c => {
    const ext = c as ExtendedContact;
    // Manter se nao tem conversa ou se conversa esta ativa
    return ext.conversationActive === null || 
           ext.conversationActive === undefined || 
           ext.conversationActive === true;
  });
}
```

## Resultado Esperado

- Por padrao: apenas contatos ativos ou sem conversa aparecem nas abas
- Ao selecionar filtro "Arquivado": mostra contatos arquivados
- Ao pesquisar por nome/telefone: busca em TODOS os contatos (inclusive arquivados)

## Arquivo modificado

| Arquivo | Mudanca |
|---------|---------|
| `src/components/Contacts.tsx` | Excluir arquivados do filtro padrao, manter ao buscar/filtrar |

