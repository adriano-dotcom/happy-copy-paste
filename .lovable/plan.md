
# Fix: Audio track encerrado pela Meta apos accept

## Problema identificado
Os logs mostram claramente o que esta acontecendo:

```
Remote audio track unmuted  (20:54:44.536Z)
Remote audio track ended    (20:54:44.626Z)  -- 90ms depois!
```

O audio remoto e ativado, mas a Meta **encerra o track** quase imediatamente. A causa: o `accept` esta sendo enviado **com o SDP answer duplicado** no campo `session`. A Meta interpreta isso como uma nova negociacao de sessao, o que invalida a sessao ja estabelecida pelo `pre_accept`.

Segundo o protocolo da Meta, `pre_accept` carrega o SDP answer, e `accept` e apenas uma confirmacao final -- **sem sessao/SDP**.

## Solucao
Duas mudancas coordenadas:

### 1. Edge Function: `supabase/functions/whatsapp-call-accept/index.ts`

Modificar o bloco `accept` para **nao enviar o SDP** na chamada a Meta. Remover a obrigatoriedade do `sdp_answer` para a acao `accept` e enviar o payload sem o campo `session`:

```typescript
if (requestedAction === 'accept') {
  console.log(`Sending accept for call ${whatsappCallId}`);
  const acceptRes = await fetch(metaUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      call_id: whatsappCallId,
      action: 'accept',
    }),
  });
  // ... resto igual
}
```

### 2. Frontend: `src/components/IncomingCallModal.tsx`

Remover o envio do `sdp_answer` na chamada de `accept`, ja que a edge function nao precisa mais dele:

```typescript
const { error: acceptError } = await supabase.functions.invoke('whatsapp-call-accept', {
  body: {
    call_id: call.id,
    action: 'accept',
    // sem sdp_answer
  },
});
```

Essas mudancas garantem que o `pre_accept` negocia a sessao WebRTC e o `accept` apenas confirma, sem reenviar o SDP que causa a Meta a encerrar o track de audio.
