

# Logs de debug avancados para WebRTC

Adicionar logs mais detalhados em `src/components/IncomingCallModal.tsx` para facilitar o diagnostico de problemas de audio nas chamadas WhatsApp.

## Logs a adicionar

### 1. ICE Gathering detalhado
- Log do `iceGatheringState` inicial antes de comecar
- Contador de ICE candidates coletados (total por tipo: host, srflx, relay)
- Log quando ICE gathering termina com resumo dos candidates

### 2. Connection state completo
- Adicionar `onsignalingstatechange` para rastrear estado de sinalizacao
- Log de `pc.getStats()` apos conexao para verificar bytes enviados/recebidos e codec negociado
- Log do `iceCandidatePairState` (par de candidates selecionado)

### 3. Audio track status detalhado
- Log de `enabled`, `muted`, `readyState` da track remota a cada segundo por 5 segundos apos conexao
- Log do `AudioContext` state (running/suspended) para detectar bloqueio do navegador
- Log de `audio.volume`, `audio.muted`, `audio.paused` do elemento de audio
- Verificar se `srcObject` tem tracks ativas

### 4. SDP diagnostico
- Log completo das linhas `m=audio` e `a=rtpmap` do SDP offer recebido (para verificar codecs)
- Log completo das mesmas linhas do SDP answer enviado
- Verificar se o SDP offer contem candidates ICE inline (trickle vs full)

### 5. Timing
- Timestamp em cada log para medir latencia entre etapas
- Tempo total desde clique em "atender" ate audio tocando

## Detalhes tecnicos

### Arquivo: `src/components/IncomingCallModal.tsx`

**Novas funcoes auxiliares:**
- `logSdpDetails(label, sdp)` - extrai e loga linhas relevantes do SDP (m=audio, a=rtpmap, a=setup, candidates)
- `logAudioState(audio, track)` - loga estado completo do audio element e track remota
- `logPeerStats(pc)` - chama `pc.getStats()` e loga bytes, codec, candidate pair

**Novos event handlers no PeerConnection:**
- `pc.onsignalingstatechange` - loga mudancas de sinalizacao
- `pc.onicecandidateerror` - loga erros de ICE candidate (importante para diagnosticar STUN failures)

**Monitor de audio pos-conexao:**
- `setInterval` de 1 segundo por 5 segundos apos `ontrack` para logar estado da track e do audio element
- Limpa automaticamente apos 5 iteracoes

**Correcao menor:**
- Remover a linha duplicada `peerConnectionRef.current = pc;` (linha 109)

