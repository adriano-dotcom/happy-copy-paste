

# Corrigir tratamento de objeções e violação RC3 no Atlas

## Diagnóstico
O teste mostrou que o Atlas:
1. Ignora a objeção "nunca tive problema" e faz handoff direto
2. Usa emoji 🎯 (viola RC3)
3. O contexto de qualificação residual de testes anteriores faz o Atlas pular o fluxo

## Plano de Correção

### 1. Reforçar no system_prompt do Atlas (migration SQL)

Adicionar no bloco de regras críticas:
- **RC3 reforço**: Adicionar exemplos explícitos de violação (🎯, ✅, etc.) e instrução "NUNCA use caracteres Unicode decorativos"
- **Objeção "nunca tive problema"**: Mover para uma seção de prioridade alta no prompt, antes do bloco de handoff, com instrução explícita: "Se o lead expressar que nunca precisou de seguro, OBRIGATORIAMENTE responda com o argumento regulatório ANTT/Lei 14.599/2023 ANTES de qualquer tentativa de handoff"
- **Anti-handoff prematuro**: Adicionar regra "NÃO faça handoff se a última mensagem do lead contém uma objeção não respondida"

### 2. Melhorar cleanup do test-prospecting-flow (edge function)

No `cleanupTestConversation`, também limpar:
- `deals` associados ao contato de teste (resetar `lost_reason`, pipeline)
- Garantir que `client_memory` é efetivamente nulo

### Arquivos alterados
- Migration SQL para `UPDATE agents SET system_prompt` (Atlas)
- `supabase/functions/test-prospecting-flow/index.ts` (cleanup mais robusto)

