

# Teste Atlas: Mensagem ambígua de identidade

## Objetivo
Rodar o teste via `test-prospecting-flow` com a mensagem `"nao sei se esse numero ainda eh dele"` para verificar se o orchestrator **não** desqualifica indevidamente (falso positivo no `wrong_number`).

## Expectativa
- A mensagem é **ambígua** — não confirma nem nega identidade de forma clara
- O orchestrator **não deve** disparar `wrong_number` porque nenhum dos keywords hardcoded (`"errou de numero"`, `"numero errado"`, `"engano"`, etc.) está presente
- O Atlas deve tratar via LLM e responder normalmente, pedindo esclarecimento
- Resposta sem emojis (RC3)

## Execução
1. **Cleanup**: `{ "cleanup_only": true }` no `test-prospecting-flow`
2. **Teste**: `{ "agent_slug": "atlas", "messages": ["nao sei se esse numero ainda eh dele"] }`

## O que validar nos resultados
- `status` permanece `nina` (não pausado)
- Sem tags de desqualificação (`engano`, `numero_errado`, etc.)
- `nina_context` sem `identity_mismatch: true`
- Resposta do Atlas coerente e sem emojis

