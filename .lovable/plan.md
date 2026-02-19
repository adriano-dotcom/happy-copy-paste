
# Analise Profunda: DTLS Nunca Completa - Raiz do Audio Mudo

## Diagnostico Definitivo

A sinalizacao (pre_accept + accept) funciona perfeitamente -- ambos retornam 200 OK. O problema e que **nenhum dado de audio flui pela conexao WebRTC**. A Meta encerra a chamada apos 21 segundos com erro 138021: *"not receiving any media for a long time."*

### Evidencia nos logs

```text
22:11:14.690 — ICE connection state: connected    (ICE funciona)
22:11:14.690 — Connection state: ???               (NUNCA APARECE!)
22:11:15-19  — Audio track muted=true              (5 monitoramentos consecutivos)
22:11:20.237 — Remote audio track ended            (Meta desistiu)
```

O log critico: `Connection state: connected` **nunca aparece**. Temos o handler configurado (linha 318-337), mas ele nunca dispara com "connected". Isso significa que o **DTLS handshake nunca completa**.

### Por que o DTLS nao completa?

```text
Timeline:
22:11:08  — Usuario clica "Atender"
22:11:09  — ICE gathering inicia (coleta de candidatos)
22:11:14  — ICE gathering completa (5s depois!)
22:11:14  — ICE connection state: connected (STUN funciona)
22:11:14  — Browser envia SDP para edge function
22:11:18  — Edge function envia pre_accept para Meta (4s de boot+rede)
22:11:19  — Meta recebe o SDP com fingerprint DTLS
22:11:20  — Track de audio encerra (Meta ja desistiu)
```

A Meta usa `a=ice-lite` no SDP offer. Com ice-lite:
- ICE conecta sem a Meta precisar do SDP do browser (STUN funciona unilateralmente)
- Mas DTLS precisa do fingerprint do browser, que so chega via `pre_accept`
- O browser tenta DTLS ClientHello em 22:11:14, mas Meta nao tem o fingerprint ainda
- DTLS retransmite em intervalos exponenciais: 1s, 2s, 4s...
- Quando Meta recebe o SDP (22:11:19), a proxima retransmissao DTLS e em ~22:11:22
- Mas a media track ja encerrou em 22:11:20

**O gargalo real: esperamos 5 segundos pelo ICE gathering antes de enviar o SDP.** Com ice-lite, os candidatos do browser sao irrelevantes -- a Meta ja tem seu proprio candidato fixo (31.13.85.130:3484) e o browser conecta A ela. O browser nao precisa enviar seus candidatos.

## Solucao: Enviar pre_accept ANTES do ICE gathering + separar pre_accept/accept

### Duas mudancas fundamentais:

**1. Enviar pre_accept imediatamente apos createAnswer() (sem esperar ICE gathering)**

O SDP answer ja contem o fingerprint DTLS e ice-ufrag/ice-pwd mesmo antes do ICE gathering. Como a Meta usa ice-lite, ela nao precisa dos candidatos do browser. Enviar o SDP 5 segundos antes permite que o DTLS complete a tempo.

**2. Separar pre_accept e accept novamente, mas com connectionState como gatilho**

O fluxo correto da Meta e:
1. pre_accept (com SDP) -> Meta processa, DTLS pode iniciar
2. Aguardar connectionState === 'connected' (DTLS completo)
3. accept -> Media comeca a fluir

Enviar ambos juntos (action=both) nao funciona porque Meta precisa de tempo para processar o SDP e completar o DTLS antes de receber o accept.

### Fluxo proposto:

```text
ANTES (nao funciona):
[5s ICE wait] -> Browser -> [4s rede] -> Edge(pre_accept + accept) -> Meta
Total ate pre_accept na Meta: ~9s
DTLS: impossivel completar a tempo

DEPOIS:
Browser -> [2s rede] -> Edge(pre_accept) -> Meta -> DTLS completa
Browser espera connectionState=connected (max 10s)
Browser -> [2s rede] -> Edge(accept) -> Meta -> Media flui
Total ate pre_accept na Meta: ~2s
DTLS: 7+ segundos para completar
```

## Detalhes tecnicos

### Arquivo: `src/components/IncomingCallModal.tsx`

Substituir os passos 5 e 6 (linhas 406-448) por:

```typescript
// 5. Send pre_accept IMMEDIATELY (don't wait for ICE gathering)
// With ice-lite, Meta doesn't need our candidates — only our DTLS fingerprint
const immediateSdp = fixSdpForMeta(pc.localDescription?.sdp || '');
console.log(`[WebRTC][${ts()}] Sending pre_accept immediately (no ICE wait)...`);
logSdpDetails('ANSWER (immediate)', immediateSdp);

const { error: preAcceptError } = await supabase.functions.invoke('whatsapp-call-accept', {
  body: {
    call_id: call.id,
    sdp_answer: immediateSdp,
    action: 'pre_accept',
  },
});

if (preAcceptError) {
  throw new Error(preAcceptError.message || 'pre_accept failed');
}

console.log(`[WebRTC][${ts()}] pre_accept OK. Waiting for connectionState=connected (DTLS)...`);

// 6. Wait for connectionState === 'connected' (DTLS handshake completes)
await new Promise<void>((resolve, reject) => {
  if (pc.connectionState === 'connected') {
    console.log(`[WebRTC][${ts()}] connectionState already connected`);
    resolve();
    return;
  }
  const timeout = setTimeout(() => {
    console.warn(`[WebRTC][${ts()}] connectionState timeout (15s). Current: ${pc.connectionState}`);
    // Proceed anyway — accept might trigger media even without DTLS confirmation
    resolve();
  }, 15000);

  const handler = () => {
    console.log(`[WebRTC][${ts()}] connectionState changed to: ${pc.connectionState}`);
    if (pc.connectionState === 'connected') {
      clearTimeout(timeout);
      pc.removeEventListener('connectionstatechange', handler);
      resolve();
    } else if (pc.connectionState === 'failed') {
      clearTimeout(timeout);
      pc.removeEventListener('connectionstatechange', handler);
      reject(new Error('WebRTC connection failed'));
    }
  };
  pc.addEventListener('connectionstatechange', handler);
});

// 7. Send accept (DTLS is done, media can flow)
console.log(`[WebRTC][${ts()}] Sending accept...`);
const { error: acceptError } = await supabase.functions.invoke('whatsapp-call-accept', {
  body: {
    call_id: call.id,
    sdp_answer: immediateSdp,
    action: 'accept',
  },
});

if (acceptError) {
  throw new Error(acceptError.message || 'accept failed');
}

// Update DB status
await supabase
  .from('whatsapp_calls')
  .update({ status: 'answered', answered_at: new Date().toISOString() })
  .eq('id', call.id);

const totalElapsed = (performance.now() - acceptStartRef.current).toFixed(0);
console.log(`[WebRTC][${ts()}] pre_accept + DTLS + accept completed in ${totalElapsed}ms`);

setLocalStatus('answered');
clearTimeout(totalTimeoutId);
```

### Edge function: sem alteracoes

A edge function `whatsapp-call-accept` ja suporta as actions `pre_accept` e `accept` separadamente. A action `both` continua disponivel como fallback.

### Resultado esperado

- pre_accept chega na Meta ~2s apos clique (em vez de ~9s)
- DTLS completa dentro de ~1-3s apos pre_accept
- accept e enviado apos DTLS confirmar
- Media flui nos dois sentidos
- Erro 138021 eliminado
