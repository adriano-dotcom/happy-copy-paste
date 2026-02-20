

# Fix: Aguardar ICE gathering antes de enviar SDP ao Meta

## Diagnostico

O SDP answer esta sendo enviado ao Meta ANTES do ICE gathering completar. Resultado:
- SDP sem `a=candidate` lines (confirmado: "has inline ICE candidates: false")
- Meta nao sabe para onde enviar pacotes de audio
- Track fica `muted=true` (zero dados recebidos) e morre apos ~5s

O ICE do browser conecta (outbound funciona), mas Meta nao tem os candidates para enviar media de volta.

## Solucao: coletar ICE candidates antes de enviar

No `IncomingCallModal.tsx`, apos `setLocalDescription`, aguardar o ICE gathering completar (ou timeout de 3s) antes de capturar o SDP e enviar ao Meta.

## Secao tecnica

### Arquivo: `src/components/IncomingCallModal.tsx`

**Mudanca nas linhas ~416-423:**

Antes:
```typescript
await pc.setLocalDescription(answer);
const immediateSdp = fixSdpForMeta(pc.localDescription?.sdp || '');
// envia imediatamente sem candidates
```

Depois:
```typescript
await pc.setLocalDescription(answer);
console.log(`[WebRTC] Waiting for ICE gathering to complete...`);

// Aguardar ICE gathering completar (max 3s)
if (pc.iceGatheringState !== 'complete') {
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      console.warn(`[WebRTC] ICE gathering timeout (3s), sending with available candidates`);
      resolve();
    }, 3000);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
}

const fullSdp = fixSdpForMeta(pc.localDescription?.sdp || '');
logSdpDetails('ANSWER (with ICE candidates)', fullSdp);
// agora o SDP contem a=candidate lines
```

### Resultado esperado

```text
1. setLocalDescription → inicia ICE gathering
2. Aguarda ~200ms para ICE gathering completar
3. SDP com candidates enviado via pre_accept
4. Meta sabe para onde enviar audio → track unmuted
5. Audio flui bidirecional
```

### Nenhuma mudanca na edge function

A edge function ja esta correta (apenas pre_accept, sem accept). O problema e exclusivamente no frontend enviando SDP incompleto.

