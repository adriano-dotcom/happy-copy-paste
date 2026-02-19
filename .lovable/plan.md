
# Fix: Aguardar conexao ICE antes de enviar accept

## Problema
Os dois sinais (`pre_accept` e `accept`) retornam 200, mas o audio fica mudo nos dois lados. A causa: o `accept` esta sendo enviado imediatamente apos `pre_accept` (em milissegundos), sem dar tempo para a Meta processar o SDP e estabelecer a conexao ICE.

O fluxo correto da Meta e:
1. `pre_accept` com SDP -- Meta inicia negociacao ICE
2. Aguardar a conexao ICE se estabelecer (estado `connected` ou `completed`)
3. `accept` com SDP -- Meta ativa o fluxo de midia

## Solucao
Substituir o envio imediato do `accept` por uma espera pelo estado ICE `connected` ou `completed`, com timeout de 10 segundos como fallback.

A diferenca do codigo anterior (que causava deadlock) e que agora monitoramos o `iceConnectionState` em vez do `connectionState`. O `iceConnectionState` pode atingir `connected` apos o `pre_accept` sem precisar do `accept`, porque a negociacao ICE e independente da sinalizacao de midia.

## Detalhes tecnicos

### Arquivo: `src/components/IncomingCallModal.tsx`

**Substituir linhas 452-461** (envio imediato do accept) pelo seguinte bloco:

```typescript
// 7. Wait for ICE connection before sending accept
console.log(`[WebRTC][${ts()}] Waiting for ICE connection before sending accept...`);
await new Promise<void>((resolve) => {
  const checkIce = () => {
    const state = pc.iceConnectionState;
    if (state === 'connected' || state === 'completed') {
      console.log(`[WebRTC][${ts()}] ICE connected (${state}), proceeding with accept`);
      resolve();
      return true;
    }
    return false;
  };

  // Check immediately
  if (checkIce()) return;

  // Listen for changes
  const handler = () => { if (checkIce()) pc.removeEventListener('iceconnectionstatechange', handler); };
  pc.addEventListener('iceconnectionstatechange', handler);

  // Timeout fallback: send accept anyway after 10s
  setTimeout(() => {
    pc.removeEventListener('iceconnectionstatechange', handler);
    console.warn(`[WebRTC][${ts()}] ICE wait timeout (10s), sending accept anyway. Current state: ${pc.iceConnectionState}`);
    resolve();
  }, 10000);
});

// Send accept
console.log(`[WebRTC][${ts()}] Sending accept...`);
const { error: acceptError } = await supabase.functions.invoke('whatsapp-call-accept', {
  body: {
    call_id: call.id,
    sdp_answer: finalSdp,
    action: 'accept',
  },
});
```

Esta abordagem:
- Da tempo para a Meta processar o `pre_accept` e estabelecer ICE
- Usa `iceConnectionState` (que pode atingir `connected` sem `accept`) em vez de `connectionState`
- Tem timeout de 10s como seguranca para nao travar indefinidamente
- Mantem todo o resto do fluxo identico
