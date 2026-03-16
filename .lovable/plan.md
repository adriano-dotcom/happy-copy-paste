

# Diagnóstico: Problemas Identificados na Campanha

## Problemas encontrados

### 1. Mensagens no chat com `{{1}}` não substituído
As mensagens salvas no banco mostram `_Pode confirmar se este WhatsApp é do responsável pela empresa {{1}}?_` — a variável `{{1}}` não foi substituída no conteúdo gravado.

**Causa raiz**: No `process-campaign/index.ts` (linha 407), o código faz:
```
const bodyVars = templateVars.body_vars || [];
```
Mas `template_variables` está vazio `{}`, então `body_vars` não existe. O template usa variáveis no BODY (via `body_1`, `body_2`...) que são corretamente enviadas para a API do WhatsApp (linhas 311-322, usando `contact.name` como fallback), mas na hora de gravar a mensagem no banco, tenta usar `templateVars.body_vars` que não existe.

**Correção**: Na seção de criação da mensagem (linhas 404-410), substituir as variáveis usando a mesma lógica do envio (linhas 311-322), ou seja, usar os valores reais que foram enviados à API.

### 2. Contadores de falha da campanha não atualizados pelo webhook
A campanha mostra `sent_count: 26, failed_count: 0`, mas várias mensagens têm `status: failed` com erro 131026 no metadata. Isso acontece porque:
- O `process-campaign` envia com sucesso (recebe 200 da API) e marca como `sent`
- Depois, o webhook do WhatsApp reporta erro 131026 e atualiza o `messages.status` para `failed`, mas **não atualiza** `campaign_contacts` nem os contadores da campanha

**Correção**: No `whatsapp-webhook/index.ts`, quando receber um status de falha para uma mensagem que tem `campaign_id` no metadata, atualizar o `campaign_contacts` e chamar `update_campaign_counters` para decrementar `sent` e incrementar `failed`.

### 3. Mensagens aparecem no chat mas com conteúdo errado
As mensagens **estão** sendo gravadas e **aparecem** no chat, mas mostram `{{1}}` em vez do nome real. O problema não é de visibilidade, é de conteúdo.

## Plano de implementação

| # | Arquivo | Mudança |
|---|---------|---------|
| 1 | `supabase/functions/process-campaign/index.ts` | Corrigir substituição de variáveis no conteúdo da mensagem (linhas 404-410): usar os mesmos valores computados para bodyParams/headerParams |
| 2 | `supabase/functions/whatsapp-webhook/index.ts` | Ao processar status de falha (131026 etc.), verificar se a mensagem tem `campaign_id` no metadata e atualizar `campaign_contacts` + contadores |

## Sem mudanças no banco de dados
Não são necessárias migrações. Os dados existentes com `{{1}}` ficarão como estão (mensagens já enviadas), mas todas as novas mensagens terão o conteúdo correto.

