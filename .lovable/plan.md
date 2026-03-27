

# Adicionar botão "Bloquear Contato" na interface

## Situação atual

O sistema já tem campos `is_blocked`, `blocked_reason` e `blocked_at` na tabela `contacts`, mas só são usados automaticamente (erro 131026). Não existe botão na UI para bloqueio manual.

## Alterações

### 1. `src/components/ContactDetailsDrawer.tsx` — Botão de bloqueio

- Adicionar botão "Bloquear Contato" (ícone `Ban`) na área de ações do drawer
- Ao clicar, exibir diálogo de confirmação perguntando o motivo (dropdown: "Número indesejado", "Spam", "Solicitou remoção", "Outro")
- Ao confirmar: atualizar `contacts` com `is_blocked: true`, `blocked_reason: motivo`, `blocked_at: now()`
- Se contato já estiver bloqueado, mostrar botão "Desbloquear" no lugar
- Exibir badge visual "Bloqueado" no header quando `is_blocked = true`

### 2. `src/components/ContactDetailsDrawer.tsx` — Carregar status de bloqueio

- Buscar `is_blocked` e `blocked_reason` do contato via query ao abrir o drawer (já temos acesso ao `contact.id`)
- Adicionar esses campos ao interface `ContactData`

### 3. Proteção no envio

O `send-whatsapp-template` já verifica `is_blocked` antes de enviar — nenhuma alteração necessária no backend.

## Impacto

- Usuários podem bloquear/desbloquear contatos manualmente pelo drawer
- Contatos bloqueados não recebem mais mensagens (já implementado no backend)
- Ação reversível com botão de desbloqueio

