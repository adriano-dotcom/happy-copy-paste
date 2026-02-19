

## Implementar Chamadas WhatsApp via Meta Cloud API

Este plano cria toda a infraestrutura de chamadas WhatsApp neste projeto: tabela, 4 edge functions, hook realtime com ringtone e modal WebRTC fullscreen.

---

### Passo 1: Criar tabela `whatsapp_calls` (Migracao SQL)

```sql
CREATE TABLE public.whatsapp_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_call_id text,
  contact_id uuid,
  conversation_id uuid,
  direction text NOT NULL DEFAULT 'inbound',
  status text NOT NULL DEFAULT 'ringing',
  phone_number_id text,
  from_number text,
  to_number text,
  sdp_offer text,
  started_at timestamptz DEFAULT now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  hangup_cause text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view whatsapp_calls"
  ON public.whatsapp_calls FOR SELECT
  USING (is_authenticated_user());

CREATE POLICY "Authenticated users can manage whatsapp_calls"
  ON public.whatsapp_calls FOR ALL
  USING (is_authenticated_user())
  WITH CHECK (is_authenticated_user());

ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_calls;
```

Nota: inclui coluna `sdp_offer` para armazenar o SDP recebido da Meta, necessario para o frontend gerar o SDP answer via WebRTC.

---

### Passo 2: Criar 4 Edge Functions

Todas com `verify_jwt = false` no `supabase/config.toml` (webhook e chamadas precisam funcionar sem JWT do frontend).

#### 2.1 `whatsapp-call-webhook` (recebe eventos da Meta)

- **GET**: verificacao de webhook (challenge/verify_token) -- usa `whatsapp_verify_token` da `nina_settings`
- **POST**: processa eventos de chamada da Meta:
  - Evento `connect` (chamada entrando): cria registro na `whatsapp_calls` com `status='ringing'`, armazena `sdp_offer` e `whatsapp_call_id`, resolve contato pelo numero
  - Evento `terminate` (chamada encerrada pelo caller): atualiza para `status='missed'` ou `status='ended'`
  - Retorna 200 imediatamente para a Meta

Fluxo da Meta:
```text
Meta envia POST com:
{
  "entry": [{
    "changes": [{
      "value": {
        "calls": [{
          "id": "wacid.xxx",
          "from": "5511999999999",
          "type": "connect",  // ou "terminate"
          "session": {
            "sdp_type": "offer",
            "sdp": "v=0\r\n..."
          }
        }]
      }
    }]
  }]
}
```

#### 2.2 `whatsapp-call-accept` (atender chamada)

- Recebe `{ call_id, sdp_answer }` do frontend
- Busca `whatsapp_call_id` e `phone_number_id` na tabela
- Envia `pre_accept` para Meta API (`POST /{phone_number_id}/calls`)
- Envia `accept` com o SDP answer para Meta API
- Atualiza status para `answered` na tabela

Endpoint Meta:
```text
POST https://graph.facebook.com/v20.0/{phone_number_id}/calls
{
  "call_id": "wacid.xxx",
  "action": "pre_accept",  // depois "accept"
  "session": {
    "sdp_type": "answer",
    "sdp": "v=0\r\n..."
  }
}
Authorization: Bearer {whatsapp_access_token}
```

#### 2.3 `whatsapp-call-reject` (rejeitar chamada)

- Recebe `{ call_id }`
- Envia `reject` para Meta API
- Atualiza status para `rejected` na tabela

#### 2.4 `whatsapp-call-terminate` (desligar chamada em andamento)

- Recebe `{ call_id }`
- Envia `terminate` para Meta API
- Calcula duracao, atualiza status para `ended`

---

### Passo 3: Criar Hook `useIncomingWhatsAppCall`

**Arquivo:** `src/hooks/useIncomingWhatsAppCall.ts`

Funcionalidades:
- Escuta canal Realtime na tabela `whatsapp_calls` (filtro `status=eq.ringing` ou `direction=eq.inbound`)
- Quando recebe INSERT com `status='ringing'`:
  - Busca dados do contato (nome, foto) via `contact_id`
  - Toca ringtone usando Web Audio API (padrao similar ao `notificationSound.ts`)
  - Expoe `incomingCall` no estado
- Quando recebe UPDATE para `status != 'ringing'` (answered, ended, rejected, missed):
  - Para o ringtone
  - Limpa `incomingCall`
- Expoe: `{ incomingCall, dismissCall, stopRingtone }`

Ringtone: loop de tons alternados (440Hz e 523Hz, 1s cada, simulando toque telefonico) usando `OscillatorNode` + `GainNode`, respeitando `isNotificationSoundEnabled()` e `getNotificationVolume()`.

---

### Passo 4: Criar Componente `IncomingCallModal`

**Arquivo:** `src/components/IncomingCallModal.tsx`

UI:
- Modal fullscreen com fundo escuro translucido (`bg-slate-950/90 backdrop-blur-xl`)
- Foto/avatar do contato com animacao de pulsacao (anel cyan pulsante via framer-motion)
- Nome do contato e numero
- **Estado "ringing"**: botoes "Atender" (verde) e "Rejeitar" (vermelho)
- **Estado "answered"**: timer de duracao, botoes "Mudo" e "Desligar" (vermelho)

WebRTC (no atender):
1. `navigator.mediaDevices.getUserMedia({ audio: true })` -- captura microfone
2. Cria `RTCPeerConnection` com STUN servers
3. Seta SDP offer remoto (recebido do webhook via `whatsapp_calls.sdp_offer`)
4. Cria SDP answer local
5. Chama edge function `whatsapp-call-accept` com `{ call_id, sdp_answer }`
6. Estabelece conexao de audio bidirecional

Botoes:
- **Atender**: inicia WebRTC, chama `whatsapp-call-accept`
- **Rejeitar**: chama `whatsapp-call-reject`, fecha modal
- **Mudo**: toggle `audioTrack.enabled`
- **Desligar**: chama `whatsapp-call-terminate`, fecha `RTCPeerConnection`, fecha modal

---

### Passo 5: Integrar no Layout Principal

**Arquivo:** `src/App.tsx`

Dentro do `AppLayout` (que ja esta protegido por `ProtectedRoute`):
```typescript
const { incomingCall, dismissCall, stopRingtone } = useIncomingWhatsAppCall();

// No JSX, antes do <Outlet />:
<IncomingCallModal 
  call={incomingCall} 
  onDismiss={dismissCall} 
  onStopRingtone={stopRingtone} 
/>
```

---

### Passo 6: Atualizar `supabase/config.toml`

Adicionar as 4 novas funcoes com `verify_jwt = false`.

---

### Resumo dos Arquivos

| Arquivo | Acao |
|---|---|
| Migracao SQL | Criar tabela `whatsapp_calls` + RLS + Realtime |
| `supabase/config.toml` | Adicionar 4 funcoes |
| `supabase/functions/whatsapp-call-webhook/index.ts` | Criar (webhook Meta) |
| `supabase/functions/whatsapp-call-accept/index.ts` | Criar (atender + WebRTC SDP) |
| `supabase/functions/whatsapp-call-reject/index.ts` | Criar (rejeitar) |
| `supabase/functions/whatsapp-call-terminate/index.ts` | Criar (desligar) |
| `src/hooks/useIncomingWhatsAppCall.ts` | Criar (Realtime + ringtone) |
| `src/components/IncomingCallModal.tsx` | Criar (modal + WebRTC) |
| `src/App.tsx` | Integrar hook + modal no AppLayout |

### Prerequisito do usuario

Apos a implementacao, o usuario precisa:
1. Ir no Meta Developer Dashboard
2. Em WhatsApp > Configuration > Webhook, adicionar a URL: `https://xaqepnvvoljtlsyofifu.supabase.co/functions/v1/whatsapp-call-webhook`
3. Assinar o campo **calls** (alem de messages)
4. Habilitar calling no numero via `POST /{phone_number_id}/settings` com `{"calling":{"status":"ENABLED"}}`

