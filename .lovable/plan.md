

# Corrigir seleção de contatos (checkboxes) na página /contacts

## Problemas encontrados

1. **Contatos duplicados na lista** — O console mostra erro de chave duplicada (`a9bca72a-a224-4722-aef2-3dde78f0cbc9`), indicando que o mesmo contato aparece duas vezes na tabela. Isso quebra o React e faz os checkboxes não responderem corretamente.

2. **Lógica de "selecionar todos" incorreta** — `allSelected` compara `selectedContactIds.size` com `contacts.length`, mas `selectedContactIds` pode conter IDs de outras abas, gerando estado inconsistente no checkbox master.

## Mudanças propostas

### 1. Deduplicar contatos antes de renderizar (`Contacts.tsx`)
- Na função `getFilteredContacts()`, adicionar deduplicação por ID usando `Map` ou `filter` com `Set` antes de retornar os resultados.

### 2. Corrigir lógica de seleção no `ContactsTable`
- `allSelected`: verificar se **todos os IDs da lista atual** estão no `selectedContactIds`, não comparar `.size`.
- `someSelected`: verificar se **algum ID da lista atual** está no `selectedContactIds`.
- Código atual (errado):
  ```typescript
  const allSelected = contacts.length > 0 && selectedContactIds.size === contacts.length;
  const someSelected = selectedContactIds.size > 0 && selectedContactIds.size < contacts.length;
  ```
- Código correto:
  ```typescript
  const allSelected = contacts.length > 0 && contacts.every(c => selectedContactIds.has(c.id));
  const someSelected = !allSelected && contacts.some(c => selectedContactIds.has(c.id));
  ```

### 3. Limpar seleção ao trocar de aba
- Adicionar `useEffect` que limpa `selectedContactIds` quando `activeTab` muda, evitando seleção fantasma entre abas.

### Arquivo editado
- `src/components/Contacts.tsx` (3 pontos de edição)

