

# Plano: Testar Atlas com dois cenarios de identidade

## Objetivo
Rodar dois testes via `test-prospecting-flow` Edge Function para validar o comportamento do Atlas quando o lead confirma ou nega que o telefone pertence a ele.

## Cenarios

### Teste 1: "Este telefone pertence a mim"
- Mensagem: `"Sim, este telefone pertence a mim, quem fala?"`
- Resultado esperado: **NAO desqualifica**. O Atlas deve continuar o fluxo normal de prospecao (gancho regulatorio, qualificacao).
- Validar: `status` permanece `nina`, sem tags de desqualificacao, sem `identity_mismatch`.

### Teste 2: "Este telefone nao pertence a essa pessoa"
- Mensagem: `"Nao, esse telefone nao pertence a essa pessoa, errou de numero"`
- Resultado esperado: **Desqualifica** via categoria `wrong_number`. Conversa pausada, tag `engano`, `identity_mismatch: true`.
- Validar: resposta sem emojis (RC3), `status: paused`, resposta hardcoded limpa.

## Implementacao
Usar a tool `supabase--curl_edge_functions` para chamar `test-prospecting-flow` duas vezes sequencialmente:

1. **Cleanup** primeiro
2. **Teste 1** (pertence): `{ "agent_slug": "atlas", "messages": ["Sim, este telefone pertence a mim, quem fala?"] }`
3. **Cleanup** entre testes
4. **Teste 2** (nao pertence): `{ "agent_slug": "atlas", "messages": ["Nao, esse telefone nao pertence a essa pessoa, errou de numero"] }`

## O que verificar nos resultados
- Resposta do Atlas sem emojis (RC3)
- Fluxo de desqualificacao ativado apenas no Teste 2
- `nina_context` com `identity_mismatch: true` apenas no Teste 2
- Cleanup funcionando entre os testes (sem mensagens residuais)

