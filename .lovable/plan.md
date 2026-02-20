
# Chamadas Outbound via WhatsApp Calling API

## Visao geral

Implementar chamadas iniciadas pelo business (outbound) via WhatsApp Cloud API, permitindo que agentes liguem diretamente para leads pelo WhatsApp a partir do chat. O fluxo inclui:

1. Botao de chamada WhatsApp no chat (ao lado do botao de telefone existente)
2. Edge function que envia SDP offer para Meta API
3. Webhook que recebe o SDP answer do lead
4. Frontend que gerencia a sessao WebRTC (offer/answer invertido vs inbound)
5. Modal de chamada outbound reutilizando componentes existentes

## Fluxo da chamada outbound

```text
+------------------+     +-------------------+     +------------------+
|  Frontend        |     |  Edge Function    |     |  Meta Cloud API  |
|  (Chat)          |     |  (whatsapp-call-  |     |                  |
|                  |     |   initiate)       |     |                  |
+--------+---------+     +--------+----------+     +--------+---------+
         |                         |                         |
  1. Agente clica                  |                         |
     "Ligar WhatsApp"             |                         |
         |                         |                         |
  2. getUserMedia()                |                         |
     createOffer()                 |                         |
         |                         |                         |
  3. POST sdp_offer  -----------> |                         |
     + contact phone               |                         |
         |                  4. POST /calls   -------------> |
         |                     action: connect               |
         |                     sdp: offer                    |
         |                         |                         |
         |                  5. Insere whatsapp_calls         |
         |                     direction: outbound           |
         |                     status: calling               |
         |                         |                         |
         |                         |    6. Webhook connect   |
         |                         |    <----- SDP answer    |
         |                         |                         |
         |              7. whatsapp-call-webhook              |
         |                 atualiza call com                  |
         |                 sdp_answer + status: ringing       |
         |                         |                         |
  8. Realtime detecta              |                         |
     sdp_answer no DB              |                         |
         |                         |                         |
  9. setRemoteDescription          |                         |
     (SDP answer)                  |                         |
         |                         |                         |
  10. WebRTC connected             |                         |
      Audio bidirecional           |                         |
         |                         |                         |
```

## Mudancas detalhadas

### 1. Nova Edge Function: `whatsapp-call-initiate`

Arquivo: `supabase/functions/whatsapp-call-initiate/index.ts`

Responsabilidades:
- Recebe `contact_id`, `to_number`, `sdp_offer` do frontend
- Busca `whatsapp_access_token` e `whatsapp_phone_number_id` do Vault/nina_settings
- Envia `POST /<phone_number_id>/calls` para Meta com `action: "connect"`, `sdp_type: "offer"`, `sdp: <sdp_offer>`
- Cria registro em `whatsapp_calls` com `direction: 'outbound'`, `status: 'calling'`
- Retorna o `call_id` (interno) e o `whatsapp_call_id` da resposta Meta

### 2. Atualizar Webhook: `whatsapp-call-webhook`

Arquivo: `supabase/functions/whatsapp-call-webhook/index.ts`

Alteracoes:
- Atualmente so trata `callType === 'connect'` como inbound (cria novo registro)
- Adicionar tratamento para quando recebe `connect` com `direction: "BUSINESS_INITIATED"`:
  - Em vez de criar novo registro, busca o registro existente pelo `whatsapp_call_id`
  - Atualiza com `sdp_answer` (o SDP do lead) e `status: 'ringing'`
- O campo `event` no webhook vem como `"connect"` e o `direction` indica se e business-initiated

### 3. Novo componente: `OutboundCallModal`

Arquivo: `src/components/OutboundCallModal.tsx`

Componente que gerencia o fluxo WebRTC outbound (inverso do IncomingCallModal):
- Ao abrir: captura microfone, cria `RTCPeerConnection`, gera SDP offer
- Envia offer para edge function `whatsapp-call-initiate`
- Escuta via Realtime por atualizacoes no registro `whatsapp_calls` (aguardando sdp_answer)
- Quando recebe sdp_answer: `setRemoteDescription` e conecta audio
- UI: avatar do contato, status (chamando/conectado), duracao, botoes mute/desligar
- Reutiliza helpers existentes: `logPeerStats`, `logSdpDetails`, `fixSdpForMeta`, `ICE_SERVERS`

### 4. Botao WhatsApp Call no ChatInterface

Arquivo: `src/components/ChatInterface.tsx`

- Adicionar botao com icone `PhoneCall` ao lado do botao `Phone` existente (API4Com)
- Ao clicar: abre `OutboundCallModal` passando dados do contato
- Estado: `showWhatsAppCallModal` + `setShowWhatsAppCallModal`
- Diferenciar visualmente do botao de telefone existente (cor verde WhatsApp)

### 5. Adicionar ao config.toml

```toml
[functions.whatsapp-call-initiate]
verify_jwt = true
```

### 6. Atualizar tabela `whatsapp_calls`

Migracao SQL:
- Adicionar coluna `sdp_answer text` para armazenar o SDP do lead em chamadas outbound
- O campo `sdp_offer` ja existe e sera usado tanto para inbound (offer do lead) quanto outbound (offer do business)

## Secao tecnica

### Arquivos criados
- `supabase/functions/whatsapp-call-initiate/index.ts` -- nova edge function
- `src/components/OutboundCallModal.tsx` -- modal de chamada outbound

### Arquivos modificados
- `supabase/functions/whatsapp-call-webhook/index.ts` -- tratar connect de outbound
- `src/components/ChatInterface.tsx` -- botao + estado do modal
- `supabase/config.toml` -- registro da nova edge function

### Migracao SQL
- `ALTER TABLE whatsapp_calls ADD COLUMN sdp_answer text;`

### Fluxo WebRTC (outbound vs inbound)

| Etapa | Inbound (atual) | Outbound (novo) |
|-------|-----------------|-----------------|
| Quem gera offer | Lead (via Meta) | Business (frontend) |
| Quem gera answer | Business (frontend) | Lead (via Meta) |
| SDP no DB | sdp_offer = offer do lead | sdp_offer = offer do business, sdp_answer = answer do lead |
| Sinalizacao Meta | pre_accept + accept | connect (com offer) |
| Webhook resposta | connect com offer | connect com answer |

### Pre-requisitos Meta
- A chamada outbound so funciona se o lead ja deu permissao de chamada (call permission)
- Nao disponivel em US/Canada/Egito/Vietna/Nigeria
- O `phone_number_id` ja esta configurado no nina_settings

### Tratamento de erros
- Lead nao atende: webhook `terminate` com reason (timeout apos ~60s)
- Lead recusa: webhook `terminate`
- Permissao negada: erro 138xxx da Meta -- exibir toast informativo
- Microfone indisponivel: modo listen-only com trilha silenciosa (mesmo padrao do inbound)
