

# Analise do envio WhatsApp via Meta API

## Status atual

- **56 mensagens falharam** nas últimas 6 horas (59% do total de 95 envios)
- **0 contatos bloqueados** no banco — o auto-blocking que implementamos **não está funcionando**
- Todas as falhas são erro **131026 (Message undeliverable)** — números sem WhatsApp
- A send_queue também mostra falhas por **"Janela de 24h expirada"** — tentativas de enviar mensagem livre fora da janela de conversa

## Causa raiz do auto-blocking não funcionar

O webhook recebe o erro 131026 corretamente (confirmado nos logs: `[Webhook] Message failed with errors: [{"code":131026,...}]`), mas o log de `"blocking contact"` nunca aparece. Duas causas possíveis:

1. **Edge function não re-deployed** — o código foi editado mas a versão em produção é a antiga
2. **Comparação de tipo** — o `errorCode` pode chegar como string `"131026"` em vez de number `131026`, falhando no `===`

## Solução

### 1. Forçar deploy das edge functions afetadas
- `whatsapp-webhook`
- `send-whatsapp-template`
- `process-campaign`

### 2. Corrigir comparação de tipo no webhook (segurança)

**Arquivo: `supabase/functions/whatsapp-webhook/index.ts`**

Trocar `if (errorCode === 131026)` por `if (Number(errorCode) === 131026)` para funcionar tanto com number quanto string.

Mesmo tratamento para `errorCode === 131042`.

### 3. Corrigir comparação no send-whatsapp-template

**Arquivo: `supabase/functions/send-whatsapp-template/index.ts`**

Trocar `if (errorCode === 131026)` por `if (Number(errorCode) === 131026)`.

### Detalhes técnicos
- 2 arquivos: `whatsapp-webhook/index.ts`, `send-whatsapp-template/index.ts`
- Deploy manual das 3 edge functions
- Sem migração de banco
- Risco: nenhum — apenas robustez na comparação de tipo

