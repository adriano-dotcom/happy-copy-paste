

# Resultado do Teste: Atlas com "não solicitei contato"

## O que aconteceu
O Atlas recebeu "não solicitei contato, quem é você?" e respondeu:

> "Entendo! Peço desculpas pelo engano. Obrigado por avisar. 🙏"

O `nina_context` foi atualizado corretamente com `identity_mismatch: true`, `paused_reason: "wrong_number"` e `followup_stopped: true` — o fluxo de desqualificação funcionou.

## Problemas detectados

| # | Problema | Gravidade |
|---|----------|-----------|
| 1 | **RC3 violado novamente** — emoji 🙏 na resposta | Alta |
| 2 | **Contexto poluído** — mensagens de testes anteriores ainda presentes (12 mensagens antigas), o cleanup não está funcionando | Alta |
| 3 | **RC1 possível violação** — resposta tem ~50 chars, no limite | Baixa |

## Plano de Correção

### 1. Reforço RC3 no prompt do Atlas (migration SQL)
Adicionar instrução ainda mais explícita no topo das regras críticas:
- "PROIBIDO usar qualquer emoji ou símbolo Unicode decorativo. Inclui mas não se limita a: 🎯 ✅ ⭐ 🙏 👍 📋 🚀 💡. Se a resposta contiver QUALQUER desses caracteres, ela está ERRADA."
- Mover RC3 para ser a **primeira** regra crítica listada (priming effect)

### 2. Corrigir cleanup no test-prospecting-flow
O problema é que o cleanup do teste anterior não está rodando antes do novo teste. A função usa `testPhone = '+5500000000001'` no fluxo principal, mas o cleanup do `cleanupTestConversation` pode estar falhando silenciosamente.

Correção em `supabase/functions/test-prospecting-flow/index.ts`:
- Chamar `cleanupTestConversation` no início do fluxo principal (não só no modo `cleanup_only`)
- Deletar **todas** as mensagens antes de inserir novas
- Resetar `nina_context` para `null` explicitamente

### Arquivos alterados
- Migration SQL: `UPDATE agents SET system_prompt` (reforço RC3)
- `supabase/functions/test-prospecting-flow/index.ts` (cleanup robusto)

