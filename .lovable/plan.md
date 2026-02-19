

# Fix: Audio morre apos 2 segundos + Terminate nao funciona

## Diagnostico

Audio funciona por ~2 segundos e depois para. Erro 138021 da Meta: "not receiving any media."

### Causa raiz: accept reenvia SDP sem candidatos ICE

O `accept` na linha 456 envia `immediateSdp` — o mesmo SDP capturado ANTES do ICE gathering (linha 408). Este SDP nao tem linhas `a=candidate`. Quando Meta recebe o `accept` com este SDP incompleto, ela re-processa a sessao e invalida o DTLS que ja estava funcionando.

### Evidencia

```text
22:36:10 — ICE gathering completo (candidatos coletados)
22:36:11 — pre_accept enviado com SDP sem candidatos (OK para DTLS fingerprint)
22:36:12 — connectionState=connected, accept enviado com MESMO SDP sem candidatos
22:36:12 — Audio unmuted (funciona!)
22:36:14 — Remote track ended (Meta re-processou o SDP e matou a sessao)
```

### Bug adicional: whatsapp-call-terminate

A edge function envia `{ call_id, action: 'terminate' }` sem `messaging_product: 'whatsapp'`. Meta retorna erro 400. Desligar nunca funciona do lado da Meta.

## Solucao: 2 mudancas

### Mudanca 1: Enviar SDP FINAL (com candidatos) no accept

No `src/components/IncomingCallModal.tsx`, apos aguardar `connectionState=connected`, capturar o SDP atualizado de `pc.localDescription.sdp` (que agora inclui todos os candidatos ICE) e enviar ESTE no `accept`.

**Linhas 454-461** — substituir:

```typescript
// 7. Send accept with FINAL SDP (includes ICE candidates gathered during DTLS wait)
const finalSdp = fixSdpForMeta(pc.localDescription?.sdp || immediateSdp);
console.log(`[WebRTC][${ts()}] Sending accept with final SDP...`);
logSdpDetails('ANSWER (final for accept)', finalSdp);

const { error: acceptError } = await supabase.functions.invoke('whatsapp-call-accept', {
  body: {
    call_id: call.id,
    sdp_answer: finalSdp,
    action: 'accept',
  },
});
```

A diferenca: `finalSdp` e capturado de `pc.localDescription.sdp` APOS o ICE gathering ter completado. Este SDP inclui todas as linhas `a=candidate` que Meta precisa para rotear media corretamente.

### Mudanca 2: Corrigir whatsapp-call-terminate

No `supabase/functions/whatsapp-call-terminate/index.ts`, adicionar `messaging_product: 'whatsapp'` ao body da requisicao para Meta (linha 64-67).

De:
```typescript
body: JSON.stringify({
  call_id: call.whatsapp_call_id,
  action: 'terminate',
}),
```

Para:
```typescript
body: JSON.stringify({
  messaging_product: 'whatsapp',
  call_id: call.whatsapp_call_id,
  action: 'terminate',
}),
```

## Resultado esperado

- pre_accept envia SDP com fingerprint DTLS (sem candidatos) — DTLS inicia
- connectionState=connected (DTLS completo)
- accept envia SDP COMPLETO (com candidatos) — Meta roteia media corretamente
- Audio flui continuamente nos dois lados
- Desligar funciona corretamente via Meta API

