

# Corrigir e ampliar área de seleção dos checkboxes em /contacts

## Problema
O checkbox individual de cada contato tem apenas 16x16px (`h-4 w-4`), tornando difícil acertar o clique no desktop. Além disso, o checkbox master no header usa um `<button>` customizado em vez do componente `<Checkbox>`, criando inconsistência visual.

## Solução

### 1. Tornar toda a célula `<td>` clicável (linhas individuais)
- Adicionar `onClick={() => toggleContactSelection(contact.id)}` e `cursor-pointer` na `<td>` que contém o checkbox (linha ~1122).
- Isso permite clicar em qualquer parte da célula esquerda para marcar/desmarcar.

### 2. Aumentar o tamanho do checkbox
- Mudar de `h-4 w-4` para `h-5 w-5` no checkbox individual para facilitar o toque preciso.

### 3. Tornar a célula do header também clicável
- Adicionar `onClick={toggleAllContacts}` e `cursor-pointer` na `<th>` do checkbox master (linha ~675), mantendo o ícone atual.

### Arquivo editado
- `src/components/Contacts.tsx` — 2 pontos de edição (header `<th>` e row `<td>`).

