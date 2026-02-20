

# Fix: Reintroduzir accept com SDP minimo apos pre_accept

## Diagnostico confirmado

A chamada de teste mostra o seguinte timeline:

```text
00:23:26.998 — Remote audio track UNMUTED (audio comecou a fluir!)
00:23:27.027 — Remote audio track ENDED (29ms depois — Meta cortou)
00:23:27.043 — Resposta do both recebida (DB atualizado para answered)
00:24:00     — Meta termina: erro 138021 "not receiving any media"
```

O audio FUNCIONA por 29ms e depois Meta encerra. Isso confirma que:
- `pre_accept` estabelece a sessao de midia corretamente (track unmute prova que audio flui)
- Sem o sinal `accept`, Meta trata como "preview" e termina a sessao rapidamente
- Meta **exige** o `accept` para manter a chamada ativa

O desafio anterior: `accept` com SDP completo reseta a sessao de midia. A solucao: enviar `accept` com SDP **minimo** (sem media section, sem ICE candidates) para formalizar a chamada sem re-negociar.

## Mudancas necessarias

### 1. Edge function: adicionar accept com SDP minimo no flow `both`

No `supabase/functions/whatsapp-call-accept/index.ts`, no flow `both` (linhas 106-108):

**Antes:**
```typescript
// accept intentionally omitted
console.log(`[both] Skipping accept...`);
```

**Depois:**
```typescript
// Step 2: accept with minimal SDP (no media section) to formally accept
// without re-negotiating the media session established by pre_accept
await new Promise(r => setTimeout(r, 1500)); // Wait for DTLS to complete

const minimalSdp = 'v=0\r\no=- 0 0 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\n';
console.log(`[both] Sending accept with minimal SDP for call ${whatsappCallId}`);
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
    session: { sdp_type: 'answer', sdp: minimalSdp },
  }),
});

const acceptBody = await acceptRes.text();
console.log(`[both] accept response: ${acceptRes.status} ${acceptBody}`);

if (!acceptRes.ok) {
  // Non-fatal: log but continue — pre_accept already established media
  console.warn(`[both] accept failed (non-fatal): ${acceptBody}`);
}
```

O delay de 1.5s e critico: permite que o DTLS handshake complete entre o browser e o server Meta antes de enviar o accept. Sem esse delay, o accept pode chegar antes do DTLS e causar conflito.

### 2. Nenhuma mudanca no frontend

O frontend ja envia `action: 'both'` e aguarda a resposta. A unica diferenca e que a resposta vai demorar ~1.5s a mais (por causa do delay antes do accept), o que esta dentro do timeout de 20s existente.

## Resultado esperado

```text
1. pre_accept com SDP completo → sessao de midia estabelecida
2. Delay 1.5s → DTLS handshake completa
3. accept com SDP minimo → Meta formaliza a chamada
4. Audio bidirecional flui indefinidamente
5. Chamada permanece ativa ate usuario desligar
```

## Secao tecnica

### Arquivo modificado
- `supabase/functions/whatsapp-call-accept/index.ts` — linhas 106-108 substituidas por accept com SDP minimo

### Risco e mitigacao
- **Risco**: SDP minimo sem media section pode ser rejeitado por Meta
- **Mitigacao**: O accept e tratado como non-fatal. Se falhar, a chamada continua com apenas pre_accept (comportamento atual). Os logs vao mostrar o resultado para decidir proximo passo
- **Risco**: Delay de 1.5s pode ser insuficiente ou excessivo
- **Mitigacao**: O DTLS tipicamente completa em ~200ms. 1.5s da margem generosa. Se necessario, pode ser ajustado

