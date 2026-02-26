

# Corrigir follow-up fora de contexto e nome em CAPS para prospecção

## Problemas identificados na screenshot

1. **Mensagem fora de contexto**: O agente já perguntou "a empresa tem seguro dos veículos (frota) e seguro de carga (RCTR-C) hoje?" às 09:57. O follow-up às 13:00 pergunta "é pra proteger veículo, carga ou os dois?" — pergunta básica redundante que ignora o que já foi conversado.

2. **Nome completo em CAPS**: "MARINA DE LOURDES GOMES" aparece no follow-up, apesar das correções anteriores.

## Causa raiz

**Contexto insuficiente**: A função `analyzeConversationHistory` (process-followups, linha 807-815) gera um `conversationContext` muito raso — apenas `Última resposta do cliente: "Sim"`. Não inclui as mensagens do agente, então a IA não sabe que a pergunta sobre tipos de seguro já foi feita.

**Prompt `direct_question` genérico**: Para prospecção attempt 1, usa-se `direct_question` que pede "UMA pergunta objetiva de qualificação" sem saber o que já foi perguntado. O fallback genérico inclui literalmente `"É pra proteger veículo, carga ou os dois?"`.

**Sanitização parcial no `generate-followup-message`**: A função `sanitizeNameInOutput` recebe só `contact_name` (1 param), não recebe `call_name`. Além disso, o `process-followups` envia `contact_name` já normalizado via `normalizeContactName()`, então a sanitização no retorno não tem o nome original para comparar/substituir.

## Solução

### Arquivo: `supabase/functions/process-followups/index.ts`

**Alteração 1 — Enriquecer `conversationContext` com últimas mensagens do agente**
- Na função `analyzeConversationHistory` (linhas 806-815), incluir as últimas 2-3 mensagens do agente (não apenas do usuário) no contexto
- Formato: incluir um resumo das mensagens recentes de ambos os lados para que a IA saiba o que já foi perguntado

```
conversationContext = `Últimas mensagens da conversa:\n` + 
  messages.slice(0, 5).reverse().map(m => 
    `${m.from_type === 'user' ? 'Cliente' : 'Agente'}: "${m.content?.substring(0,120)}"`
  ).join('\n');
```

**Alteração 2 — Passar nome original (não normalizado) no payload para generate-followup-message**
- Na chamada `generateAIMessage` (linha 462-463), além de enviar `contact_name` normalizado, enviar também `contact_name_original` e `contact_call_name` para que a sanitização no lado do `generate-followup-message` funcione corretamente

### Arquivo: `supabase/functions/generate-followup-message/index.ts`

**Alteração 1 — Receber e usar nome original para sanitização**
- Aceitar `contact_name_original` e `contact_call_name` no request body
- Atualizar `sanitizeNameInOutput` para usar o nome original (com CAPS/completo) como base de busca

**Alteração 2 — Prompt `direct_question` deve usar o contexto da conversa**
- Reforçar no prompt que a IA DEVE ler o contexto e NÃO repetir perguntas que o agente já fez
- Adicionar instrução: "Se o agente já perguntou sobre tipos de seguro, NÃO pergunte de novo"

### Detalhes técnicos
- 2 arquivos backend: `process-followups/index.ts`, `generate-followup-message/index.ts`
- Sem alteração de schema
- Risco: baixo — enriquecimento de contexto e sanitização

