
Objetivo: impedir que follow-ups saiam com nome completo e/ou em CAPS, sempre usando apenas primeiro nome em Title Case.

1) Confirmar origem do problema no fluxo de follow-up
- Validar no código que a mensagem vem de `process-followups` (fallback) e não do orquestrador principal.
- Manter referência do caso real já identificado: mensagem padrão de fallback iniciando com `NOME COMPLETO, ...`.

2) Padronizar normalização de nome no `process-followups`
- Atualizar `normalizeContactName()` para:
  - usar `call_name || name`
  - extrair somente primeiro nome
  - retornar Title Case
- Aplicar essa normalização em:
  - `replaceVariables()`
  - `getVariedFallback()`
  - payload enviado para `generate-followup-message`
  - fallback local quando IA falhar
  - variáveis de template (`contact.name` e `contact.call_name`).

3) Blindar saída final antes de enfileirar envio
- Adicionar helper de sanitização de nome em `process-followups` para o texto final (`messageContent`):
  - substituir ocorrência de nome completo (qualquer caixa) pelo primeiro nome normalizado
  - substituir primeiro nome em CAPS pela versão Title Case
- Rodar essa sanitização imediatamente antes do insert na `send_queue`.

4) Padronizar normalização no `generate-followup-message`
- Atualizar `normalizeContactName()` para primeiro nome + Title Case (mesmo padrão).
- Reforçar regra no prompt para usar exatamente esse nome.
- Sanitizar `generatedMessage` antes do retorno (mesma lógica de substituição de full name/CAPS).

5) Melhorar fallback quando resposta da IA vier não-2xx
- Em `generateAIMessage()` de `process-followups`, ao receber non-2xx:
  - tentar ler `data.message` do body de erro (quando existir)
  - usar esse texto sanitizado antes de cair no fallback local.
- Isso reduz volume de mensagens genéricas e mantém consistência de nome.

6) Validação pós-implementação
- Testar uma conversa com contato em CAPS e nome completo.
- Forçar cenário de fallback (erro de geração) e validar que ainda sai só primeiro nome.
- Conferir no banco (mensagens/followup_logs) que novas saídas não iniciam com `NOME COMPLETO,`.
- Validar fim-a-fim no fluxo real de follow-up.

Detalhes técnicos
- Arquivos:  
  - `supabase/functions/process-followups/index.ts`  
  - `supabase/functions/generate-followup-message/index.ts`
- Sem alteração de schema, sem migração de banco.
- Escopo: apenas lógica de geração/sanitização de texto de follow-up.
