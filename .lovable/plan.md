

# Fix: accept envia SDP quando nao deveria (erro 100)

## Diagnostico

A ultima chamada mostra claramente o problema:
- pre_accept com SDP: 200 OK (correto)
- accept com SDP: 200 OK da Meta, mas logo depois Meta envia terminate com erro 100 "Invalid parameter"

A documentacao oficial da Meta e implementacoes de referencia (webrtc.ventures, Pipecat) confirmam: o `accept` NAO deve incluir o campo `session` (SDP). Apenas `pre_accept` precisa do SDP. Quando enviamos SDP no `accept`, Meta tenta re-processar a sessao e falha com "Invalid parameter".

Referencia do webrtc.ventures:
```
peerConnection.onconnectionstatechange = () => {
  if (peerConnection.connectionState === 'connected' && currentCall?.preAcceptSent) {
    sendAccept();  // Sem SDP!
  }
};
```

## Solucao: 2 mudancas

### Mudanca 1: Edge function — accept sem session/SDP

No `supabase/functions/whatsapp-call-accept/index.ts`, modificar a action `accept` para NAO enviar o campo `session` na requisicao para Meta. O body deve conter apenas:

```typescript
{
  messaging_product: 'whatsapp',
  call_id: whatsappCallId,
  action: 'accept',
}
```

Remover a validacao de `sdp_answer` obrigatorio para action `accept` (linhas 197-202) e remover o campo `session` do body (linhas 215-218).

Tambem corrigir a action `both` (linhas 117-131) para nao enviar session no accept.

### Mudanca 2: Frontend — nao enviar sdp_answer no accept

No `src/components/IncomingCallModal.tsx`, na chamada de accept (linhas 459-465), remover o campo `sdp_answer` do body:

```typescript
const { error: acceptError } = await supabase.functions.invoke('whatsapp-call-accept', {
  body: {
    call_id: call.id,
    action: 'accept',
  },
});
```

## Resultado esperado

- pre_accept envia SDP com fingerprint DTLS (correto, ja funciona)
- accept envia apenas call_id + action (sem session) — Meta aceita e inicia media
- Erro 100 "Invalid parameter" eliminado
- Audio flui nos dois lados

