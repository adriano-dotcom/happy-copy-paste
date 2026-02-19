

# Fix: Accept chega tarde demais na Meta (18s) — usar action "both"

## Diagnostico

A chamada funciona por ~7 segundos e depois Meta termina com erro 100. O problema e **latencia**, nao o conteudo do SDP.

### Timeline real da ultima chamada

```text
23:03:35 — Meta envia connect (SDP offer)
23:03:44 — pre_accept chega na Meta (9s)      → 200 OK
23:03:45 — Edge function do accept BOOTA       (nova instancia!)
23:03:51 — Edge function envia accept          (6s para DB + vault)
23:03:52 — Meta recebe accept                  (18s apos connect!)
23:03:52 — Meta termina: erro 100              (timeout/sessao invalida)
```

O accept chega 18 segundos apos o connect. Meta provavelmente tem um timeout de ~15s para completar o handshake. A sessao ja expirou quando o accept chega.

### Por que o accept demora 7 segundos?

A segunda chamada `supabase.functions.invoke('whatsapp-call-accept')` repete TODO o trabalho:
1. Boot da edge function (75ms)
2. Parse do request
3. Query no DB para buscar o call record
4. Check no vault para access token
5. Query fallback em nina_settings
6. Finalmente envia para Meta

Total: ~6-7 segundos de overhead, somados aos 9s do pre_accept = 18s total.

## Solucao: Enviar pre_accept e accept numa UNICA chamada de edge function

Usar a action `both` que ja existe na edge function. Isso elimina o segundo boot + DB + vault lookup. O accept chega na Meta ~2 segundos apos o pre_accept (em vez de 8 segundos).

### Mudanca 1: Frontend — usar action "both" em vez de chamadas separadas

No `src/components/IncomingCallModal.tsx`, substituir os passos 5-7 (linhas 406-469) por uma unica chamada com `action: 'both'`:

```typescript
// 5. Send pre_accept IMMEDIATELY (don't wait for ICE gathering)
const immediateSdp = fixSdpForMeta(pc.localDescription?.sdp || '');
console.log(`[WebRTC][${ts()}] Sending both (pre_accept + accept) immediately...`);
logSdpDetails('ANSWER (immediate)', immediateSdp);

const { data: acceptData, error: acceptError } = await supabase.functions.invoke('whatsapp-call-accept', {
  body: {
    call_id: call.id,
    sdp_answer: immediateSdp,
    action: 'both',
  },
});

if (acceptError) {
  throw new Error(acceptError.message || 'accept failed');
}

console.log(`[WebRTC][${ts()}] both completed:`, acceptData);

// 6. Wait for connectionState === 'connected' (may already be connected)
if (pc.connectionState !== 'connected') {
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => resolve(), 10000);
    const handler = () => {
      if (pc.connectionState === 'connected' || pc.connectionState === 'failed') {
        clearTimeout(timeout);
        pc.removeEventListener('connectionstatechange', handler);
        resolve();
      }
    };
    pc.addEventListener('connectionstatechange', handler);
  });
}
console.log(`[WebRTC][${ts()}] Connection state: ${pc.connectionState}`);
```

Isso elimina a segunda chamada de edge function e seus 7 segundos de overhead.

### Mudanca 2: Edge function — aumentar delay entre pre_accept e accept

No `supabase/functions/whatsapp-call-accept/index.ts`, aumentar o delay na action `both` de 200ms para 1500ms. O DTLS precisa de ~500ms para completar apos o pre_accept. Com 1500ms temos margem de seguranca.

Linha 107: `await new Promise(r => setTimeout(r, 200));`
Mudar para: `await new Promise(r => setTimeout(r, 1500));`

### Resultado esperado

```text
ANTES (nao funciona):
connect → [9s] → pre_accept → [7s boot+DB+vault] → accept = 18s total

DEPOIS:
connect → [9s] → pre_accept → [1.5s delay] → accept = 10.5s total
```

Reducao de 18s para ~10.5s. O accept chega dentro do timeout da Meta.

### Notas

- O delay de 9s ate o pre_accept (boot da edge function + DB + vault) permanece igual. Uma otimizacao futura seria cachear o access token ou usar variaveis de ambiente.
- A espera pelo connectionState=connected no frontend agora acontece DEPOIS do accept (para confirmar que DTLS completou), nao como pre-requisito.
- A action `both` ja atualiza o status no DB para "answered", entao o frontend nao precisa fazer isso separadamente.

