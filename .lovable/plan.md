

# Adicionar botão visual de Bloquear/Desbloquear no header do chat

## Problema

O botão de bloqueio só existe na barra de ações rápidas lateral. O usuário quer um botão visível no **header** do chat (a barra superior com nome, tags e ícones de ação).

## Alteração

### `src/components/ChatInterface.tsx`

Adicionar um botão de bloqueio/desbloqueio no header, posicionado **antes do divisor** (`<div className="h-6 w-px ...">`) na linha ~2393, ao lado dos botões de telefone.

Detalhes:
- Adicionar estados: `isBlocked`, `showBlockDialog`, `blockReason`, `isBlocking`
- `useEffect` para buscar `is_blocked` do contato ao trocar de chat
- Botão com ícone `Ban` (vermelho pulsante quando desbloqueado) ou `ShieldOff` (verde quando bloqueado)
- Ao clicar em bloquear: abre dialog com seleção de motivo
- Ao clicar em desbloquear: desbloqueia direto
- Dialog de confirmação com Select de motivos (mesmo padrão do QuickActionsBar)
- Invalidar queries após ação

Layout no header:
```text
[📞] [📞] [📱] [🚫] | [ℹ️] [⋮]
                      ↑ novo botão
```

O botão terá estilo destacado:
- Desbloqueado: `text-red-400 hover:bg-red-500/20` com tooltip "Bloquear contato"
- Bloqueado: `text-emerald-400 bg-emerald-500/20` com tooltip "Desbloquear contato"

