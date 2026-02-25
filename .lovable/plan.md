
Objetivo: eliminar de vez o toast genérico “Edge Function returned a non-2xx status code” e garantir que a mensagem de solicitação de autorização seja realmente enviada ao lead.

1) O que eu verifiquei na investigação
- A chamada para `whatsapp-call-initiate` está retornando `400` com `error_code: 138006` (regra da Meta: sem permissão de chamada do destinatário).
- Em seguida, o frontend chama `whatsapp-sender` e recebe `200`, porém com `{"sent":0}`.
- O replay de sessão mostra toast de sucesso de envio de mensagem, mas esse retorno `sent:0` indica que a mensagem não foi enviada de fato nesse fluxo.
- O texto genérico ainda pode aparecer quando o parse do erro falha em alguns formatos de `error/context`.

Do I know what the issue is?
- Sim. São 2 problemas combinados:
  1. Parse frágil do erro da função (nem sempre extrai `error_code`).
  2. Fluxo de fallback usa `whatsapp-sender` como se fosse envio direto, mas essa função processa fila; o body `to/message` não é o caminho principal de envio nesse projeto.

2) Causa raiz consolidada
- O erro 138006 é esperado de negócio (não é falha técnica da função de chamada).
- O frontend ainda cai em mensagem genérica quando não consegue extrair `error_code` de todos os formatos possíveis do erro.
- A “mensagem pedindo autorização” atualmente pode não sair, porque o fluxo atual não garante enfileiramento correto antes de acionar `whatsapp-sender`.

3) Plano de implementação
Arquivo 1: `src/components/OutboundCallModal.tsx` (principal)
- Criar helper único `extractInvokeErrorDetails(error, data)` para normalizar erro:
  - ler `data.error_code` / `data.error`
  - ler `error.context` quando for `Response` (`json()` e fallback `text()`)
  - ler `error.context` quando já vier como objeto/string
  - fallback parseando JSON embutido em `error.message` (quando vier no formato `... , {"error_code":...}`)
  - normalizar `errorCode` para `number`
- Substituir lógica duplicada (bloco `if (error || !data?.success)` e `catch`) para usar esse helper único.
- Classificar códigos `[138006, 138021, 138000]` de forma centralizada e sempre mostrar toast específico (nunca o genérico para esses casos).
- Corrigir fallback de envio da mensagem:
  - usar o fluxo já padrão do projeto (enfileirar + disparar sender), reaproveitando `api.sendMessage(...)` em vez de chamar `whatsapp-sender` com `to/message` direto.
  - se `conversationId` estiver ausente, mostrar aviso claro de que não foi possível enviar automaticamente (em vez de sucesso falso).
- Ajustar toasts de sucesso:
  - só mostrar “mensagem enviada” quando o enfileiramento for confirmado.
  - em falha de enfileiramento, mostrar toast de erro específico.

Arquivo 2: `src/components/AutoAttendantEngine.tsx` (consistência)
- Melhorar tratamento de erro em `whatsapp-call-initiate` para também extrair `error_code`/mensagem específica (evita logs genéricos e diagnósticos confusos).
- Não precisa alterar UX principal aqui, mas melhora rastreabilidade.

4) Detalhes técnicos (seu time pode usar como referência)
- Hoje existem dois pontos de tratamento em `OutboundCallModal` (ramo de retorno com `error` e ramo `catch`). A proposta é convergir ambos para uma única função de parse/classificação.
- O parser deve ser tolerante a múltiplos formatos do SDK:
  - `error.context` como `Response`
  - `error.context` como objeto já parseado
  - JSON embutido em `error.message`
- O fallback de mensagem deve seguir o padrão já existente no projeto (`api.sendMessage` + fila + trigger), evitando falso positivo de envio (`sent:0`).

5) Validação (E2E primeiro)
1. Testar ponta a ponta no `/chat` com lead sem permissão de chamada:
   - esperado: não aparecer toast genérico “non-2xx”
   - esperado: aparecer toast específico de permissão
2. Confirmar que a mensagem de solicitação entra na conversa e/ou fila corretamente.
3. Confirmar que, para erro diferente de permissão (ex.: 500), a mensagem de erro permanece informativa.
4. Repetir no fluxo manual e no fluxo automático (auto attendant) para garantir consistência.
5. Validar que não há regressão no encerramento/cleanup da chamada.

6) Escopo e risco
- Escopo: 2 arquivos frontend, sem alteração de schema do banco e sem mudança de função backend.
- Risco: baixo-médio (somente tratamento de erro + fallback de envio).
- Ganho: elimina erro genérico persistente, evita “sucesso falso” e melhora confiabilidade operacional.
