

# Adicionar botão "Bloquear Contato" na área de chat

## Problema

O botão "Bloquear Contato" foi implementado apenas no drawer da página **Contatos** (`/contacts`). Na tela de **Chat** (`/chat`), onde o usuário está, ele não aparece porque o componente `ContactDetailsDrawer` não é usado lá. A área de ações rápidas do chat usa o componente `QuickActionsBar`.

## Alteração

### `src/components/chat/QuickActionsBar.tsx`

- Adicionar botão "Bloquear" ao lado dos botões Qualificar / Callback / Pipedrive
- Carregar status `is_blocked` do contato via query ao montar
- Ao clicar, exibir diálogo de confirmação com seleção de motivo (mesmo padrão do drawer)
- Se já bloqueado, mostrar botão "Desbloquear" no lugar
- Usar ícone `Ban` (vermelho) para bloquear e `ShieldOff` (verde) para desbloquear

O layout ficará:

```text
┌──────────┐ ┌──────────┐ ┌───┐ ┌───┐
│ Qualificar│ │ Callback │ │ ⇗ │ │ 🚫│  ← novo
└──────────┘ └──────────┘ └───┘ └───┘
┌────────────────────────────────────┐
│        Ligar com Iris              │
└────────────────────────────────────┘
```

### Detalhes técnicos

- Buscar `is_blocked` e `blocked_reason` do contato com `supabase.from('contacts').select(...)` usando `activeChat.contactId`
- Reutilizar a mesma lógica de update já implementada no drawer
- Adicionar `Dialog` para confirmação com `Select` de motivos
- Invalidar queries `['conversations']` após bloqueio/desbloqueio

