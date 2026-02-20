

# Bridge Meta WhatsApp Calling + ElevenLabs (sem Twilio)

## Analise do problema

Meta WhatsApp Calling usa WebRTC para transportar audio. ElevenLabs Conversational AI tambem usa WebRTC (via React SDK). Sao duas sessoes WebRTC independentes. Para conecta-las sem Twilio, precisamos de um "audio bridge" que pegue o audio de uma sessao e injete na outra.

A unica forma viavel de fazer isso sem um media server dedicado ou Twilio e usando o **navegador** como ponte de audio, via Web Audio API.

## Arquitetura proposta: Auto-Attendant (Bot Operator)

```text
Lead (WhatsApp)                    Auto-Attendant (Browser Tab)                ElevenLabs (Iris)
     |                                        |                                      |
     |   1. Liga via WhatsApp                 |                                      |
     | -------- SDP offer (Meta) -----------> |                                      |
     |                                        |                                      |
     |                            2. Auto-accept via WebRTC                          |
     |                               (mesma logica IncomingCallModal)                |
     |                                        |                                      |
     |                            3. Inicia sessao ElevenLabs                        |
     |                               via useConversation() / WebRTC                  |
     | <------- audio bidirecional ---------> |                                      |
     |                                        | <------ audio bidirecional --------> |
     |                                        |                                      |
     |                            4. Web Audio API bridge:                           |
     |                               Meta remoteTrack --> ElevenLabs mic input       |
     |                               ElevenLabs output --> Meta localTrack           |
     |                                        |                                      |
     |   5. Conversa com Iris                 |        Iris processa e responde      |
     |                                        |                                      |
```

## Como funciona o Audio Bridge

O navegador usa Web Audio API para conectar os dois streams:

```text
Meta WebRTC (remoteStream)
    |
    v
MediaStreamSource --> GainNode --> MediaStreamDestination
                                        |
                                        v
                                  ElevenLabs (como "microfone" virtual)


ElevenLabs (outputStream/speaker)
    |
    v
MediaStreamSource --> GainNode --> MediaStreamDestination
                                        |
                                        v
                                  Meta WebRTC (como localTrack - substitui microfone)
```

## Componentes a implementar

### 1. Nova pagina: `/auto-attendant`

Arquivo: `src/pages/AutoAttendant.tsx`

Pagina dedicada que roda em uma aba do navegador (pode ser headless futuramente). Responsabilidades:
- Escuta `whatsapp_calls` via Supabase Realtime (novas chamadas inbound com status 'ringing')
- Auto-aceita chamadas usando a mesma logica WebRTC do IncomingCallModal (setRemoteDescription, createAnswer, pre_accept + accept)
- Inicia sessao ElevenLabs via `useConversation()` do `@elevenlabs/react`
- Faz bridge de audio entre as duas sessoes via Web Audio API
- Monitora estado de ambas as conexoes
- Loga metricas e status para debugging
- Para chamadas outbound: escuta VQs pendentes e inicia chamada WhatsApp + ElevenLabs simultaneamente

### 2. Novo componente: `AudioBridge`

Arquivo: `src/components/AudioBridge.tsx`

Componente utilitario que gerencia o bridge de audio entre dois MediaStreams:
- Recebe `metaRemoteStream` e `elevenlabsOutputStream`
- Cria os AudioNodes necessarios (source, gain, destination)
- Retorna os MediaStreams sinteticos para cada lado
- Monitora niveis de audio (VAD basico) para logs
- Cleanup automatico ao desmontar

### 3. Novo hook: `useWhatsAppAutoAttendant`

Arquivo: `src/hooks/useWhatsAppAutoAttendant.ts`

Encapsula a logica de:
- Subscription Realtime para `whatsapp_calls` (inbound ringing)
- Subscription Realtime para `voice_qualifications` (outbound pending via WhatsApp)
- Gerenciamento da fila de chamadas (uma por vez)
- Estado do bridge (idle, connecting_meta, connecting_elevenlabs, bridged, ending)

### 4. Novo hook: `useElevenLabsBridge`

Arquivo: `src/hooks/useElevenLabsBridge.ts`

Wrapper ao redor do `useConversation` do ElevenLabs que:
- Solicita token de conversacao via edge function existente ou nova
- Configura dynamic variables (lead_name, horario, produto_interesse, vq_id)
- Intercepta o audio output do ElevenLabs para bridging
- Gerencia lifecycle (start, connected, ended)

### 5. Nova Edge Function: `elevenlabs-conversation-token`

Arquivo: `supabase/functions/elevenlabs-conversation-token/index.ts`

Gera um token de conversacao para o ElevenLabs agent (Iris):
- Chama `GET https://api.us.elevenlabs.io/v1/convai/conversation/token?agent_id=AGENT_ID`
- Retorna o token para o frontend iniciar a sessao WebRTC

### 6. Modificar `trigger-elevenlabs-call`

Quando `voice_call_channel === 'whatsapp'` em nina_settings:
- Em vez de chamar ElevenLabs API para outbound (que usa Twilio), cria um registro em `whatsapp_calls` com `direction: 'outbound'` e `status: 'pending_bridge'`
- O Auto-Attendant detecta esse registro e inicia o fluxo: WhatsApp outbound call (via `whatsapp-call-initiate`) + ElevenLabs session + bridge

### 7. Migracoes DB

```sql
-- Campo para indicar canal de voz preferido
ALTER TABLE public.nina_settings 
  ADD COLUMN voice_call_channel text NOT NULL DEFAULT 'pstn';
-- Valores: 'pstn' (Twilio direto, atual) | 'whatsapp' (bridge Meta+ElevenLabs)

-- Novo status para chamadas aguardando bridge
-- (usar o campo status existente com valor 'pending_bridge')
```

### 8. Configuracoes

Arquivo: `src/components/settings/ApiSettings.tsx`

- Toggle "Canal de voz da Iris": PSTN (atual) / WhatsApp
- Quando WhatsApp selecionado, mostrar instrucoes para abrir a aba Auto-Attendant
- Status indicator mostrando se o Auto-Attendant esta ativo (via presenca Realtime)

### 9. config.toml

```toml
[functions.elevenlabs-conversation-token]
verify_jwt = true
```

### 10. Rota no App.tsx

```tsx
<Route path="/auto-attendant" element={<ProtectedRoute><AutoAttendant /></ProtectedRoute>} />
```

## Fluxo detalhado: Inbound

| Etapa | Acao | Componente |
|-------|------|-----------|
| 1 | Lead liga para numero WhatsApp | WhatsApp do lead |
| 2 | Meta envia webhook com SDP offer | whatsapp-call-webhook |
| 3 | Webhook cria registro `whatsapp_calls` status=ringing | whatsapp-call-webhook |
| 4 | Auto-Attendant detecta via Realtime | useWhatsAppAutoAttendant |
| 5 | Cria RTCPeerConnection, setRemoteDescription(offer), createAnswer | AutoAttendant |
| 6 | Envia pre_accept + accept via whatsapp-call-accept | AutoAttendant |
| 7 | WebRTC Meta conectado, audio do lead disponivel | AutoAttendant |
| 8 | Busca token ElevenLabs | elevenlabs-conversation-token |
| 9 | Inicia sessao ElevenLabs com dynamic vars | useElevenLabsBridge |
| 10 | Bridge audio: lead audio -> Iris input, Iris output -> lead audio | AudioBridge |
| 11 | Iris conversa com lead | ElevenLabs Agent |
| 12 | Chamada termina (terminate webhook ou Iris encerra) | whatsapp-call-webhook |
| 13 | Post-call: ElevenLabs envia transcricao/analise | elevenlabs-post-call-webhook |

## Fluxo detalhado: Outbound

| Etapa | Acao | Componente |
|-------|------|-----------|
| 1 | auto-voice-trigger cria VQ | auto-voice-trigger |
| 2 | trigger-elevenlabs-call detecta channel=whatsapp | trigger-elevenlabs-call |
| 3 | Cria registro whatsapp_calls status=pending_bridge | trigger-elevenlabs-call |
| 4 | Auto-Attendant detecta via Realtime | useWhatsAppAutoAttendant |
| 5 | Cria RTCPeerConnection, createOffer | AutoAttendant |
| 6 | Envia offer via whatsapp-call-initiate | AutoAttendant |
| 7 | Meta liga para lead, webhook retorna SDP answer | whatsapp-call-webhook |
| 8 | Auto-Attendant detecta sdp_answer via Realtime | AutoAttendant |
| 9 | setRemoteDescription(answer), WebRTC conectado | AutoAttendant |
| 10 | Busca token ElevenLabs, inicia sessao | useElevenLabsBridge |
| 11 | Bridge audio bidirecional | AudioBridge |
| 12 | Iris conversa com lead | ElevenLabs Agent |

## Secao tecnica

### Dependencia necessaria
- `@elevenlabs/react` (npm install)

### Arquivos criados
- `src/pages/AutoAttendant.tsx` -- pagina do auto-attendant
- `src/components/AudioBridge.tsx` -- bridge de audio Web Audio API
- `src/hooks/useWhatsAppAutoAttendant.ts` -- logica de auto-atendimento
- `src/hooks/useElevenLabsBridge.ts` -- integracao ElevenLabs para bridge
- `supabase/functions/elevenlabs-conversation-token/index.ts` -- token de conversacao

### Arquivos modificados
- `supabase/functions/trigger-elevenlabs-call/index.ts` -- suporte channel whatsapp
- `src/components/settings/ApiSettings.tsx` -- toggle canal de voz
- `src/App.tsx` -- rota /auto-attendant
- `supabase/config.toml` -- nova edge function

### Migracao SQL
```sql
ALTER TABLE public.nina_settings 
  ADD COLUMN voice_call_channel text NOT NULL DEFAULT 'pstn';
```

### Limitacoes e consideracoes

1. **Aba precisa estar aberta**: O Auto-Attendant precisa de uma aba de navegador ativa. Se a aba fechar, chamadas nao serao atendidas. No futuro, pode ser migrado para um servidor headless (Puppeteer/Playwright)
2. **Uma chamada por vez**: O bridge processa uma chamada de cada vez. Chamadas simultaneas entram em fila
3. **Latencia**: Ha latencia adicional do double-hop WebRTC (Meta -> Browser -> ElevenLabs), estimada em 100-300ms
4. **Audio context**: O navegador precisa de interacao do usuario para desbloquear AudioContext. A pagina tera um botao "Ativar Auto-Attendant"
5. **Fallback**: Se o Auto-Attendant nao estiver ativo, chamadas inbound continuam tocando normalmente para agentes humanos via IncomingCallModal

### Rollback
- Alterar `voice_call_channel` para 'pstn' em nina_settings
- Fechar a aba do Auto-Attendant
- Sistema volta ao comportamento atual (Iris via Twilio PSTN, chamadas WhatsApp via agente humano)

