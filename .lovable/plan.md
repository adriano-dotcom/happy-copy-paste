

# Adicionar seleção rápida de 50 leads por vez na aba Outbound

## Problema
O usuário precisa selecionar leads em lotes de 50 para envio de campanhas WhatsApp, mas hoje só tem "Selecionar Todos" (que pega os 2069+) ou seleção manual um a um.

## Solução

Adicionar um dropdown no header do checkbox (ao lado do ícone de seleção) com opções de seleção em lote:

- **Selecionar 50 primeiros** — seleciona os próximos 50 contatos não selecionados da lista filtrada
- **Selecionar página atual** (100) — comportamento atual
- **Selecionar todos** — comportamento atual
- **Limpar seleção**

### Implementação em `src/components/Contacts.tsx`

1. **Substituir o `onClick={toggleAllContacts}` no `<th>` do checkbox master** por um `DropdownMenu` com as opções acima

2. **Nova função `selectNextN(n: number)`**:
   - Pega os primeiros `n` contatos de `filteredContacts` que ainda NÃO estão em `selectedContactIds`
   - Adiciona ao Set existente (acumulativo)
   - Se todos já estiverem selecionados, mostra toast informativo

3. **Opções do dropdown**:
   - "Selecionar 50" → `selectNextN(50)`
   - "Selecionar página (100)" → seleciona apenas os `paginatedContacts`
   - "Selecionar todos ({total})" → `toggleAllContacts()` atual
   - "Limpar seleção" → `setSelectedContactIds(new Set())`

4. **Visual**: O ícone do checkbox master continua mostrando o estado atual (check/minus/empty). Ao clicar no ícone faz toggle da página, mas um botão `ChevronDown` ao lado abre o dropdown com as opções.

### Arquivo editado
- `src/components/Contacts.tsx`

