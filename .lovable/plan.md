

# Otimizar performance da aba Outbound (2069 contatos) em /contacts

## Problema
A aba Outbound renderiza todos os 2069 contatos simultaneamente no DOM. Isso causa:
1. **Carregamento lento** — 2069 `<tr>` com checkboxes, dropdowns, ícones Lucide e badges são montados de uma vez
2. **Seleção lenta** — `toggleAllContacts` cria um Set com 2069 IDs e força re-render de todas as linhas, pois cada `<tr>` depende de `selectedContactIds.has(contact.id)`

## Solução: Paginação client-side

Implementar paginação no componente `Contacts.tsx` para limitar a renderização a **100 contatos por página**.

### Mudanças em `src/components/Contacts.tsx`

1. **Adicionar estado de paginação**
   - `currentPage` (default: 1) e `pageSize` (100)
   - Resetar página ao trocar aba, filtros ou busca

2. **Fatiar `filteredContacts` antes do render**
   - `const paginatedContacts = filteredContacts.slice((currentPage - 1) * pageSize, currentPage * pageSize)`
   - Renderizar apenas `paginatedContacts` no `<tbody>`

3. **Controles de paginação**
   - Barra inferior com: "Mostrando 1-100 de 2069" + botões Anterior/Próxima
   - Manter estilo visual existente (slate/cyan)

4. **Ajustar "Selecionar Todos"**
   - `toggleAllContacts` continua operando sobre **todos** os `filteredContacts` (não apenas a página visível), para que o envio em massa funcione com todos os contatos filtrados
   - A verificação visual (checkbox master) usa `filteredContacts.every(...)` como já faz

5. **Memoizar `getFilteredContacts`**
   - Envolver com `useMemo` para evitar recálculo a cada re-render causado pela seleção

### Arquivo editado
- `src/components/Contacts.tsx` — adicionar paginação + memoização

