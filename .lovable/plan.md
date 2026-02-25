

# Estudo da API de Chamadas Meta WhatsApp vs. implementacao atual

## Descobertas da documentacao Meta

A documentacao oficial (https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/) confirma o fluxo WebRTC que ja implementamos, com um detalhe critico sobre timing de midia:

### Fluxo correto segundo Meta

```text
1. Webhook "connect" chega com SDP Offer
2. Business envia pre_accept com SDP Answer
   -> Conexao WebRTC se estabelece (ICE+DTLS+SRTP)
   -> MAS midia NAO deve fluir ainda
3. Business envia accept com SDP Answer
   -> Esperar 200 OK
   -> SO DEPOIS do 200 OK a midia deve comecar a fluir
4. terminate quando encerrar
```

Citacao direta da Meta:
> "make sure to flow the call media only after you receive a 200 OK response back [from accept]. If call media flows too early, the caller will miss the first few words. If call media flows too late, callers will hear silence."

### Protocolo de midia
- Media: WebRTC (ICE + DTLS + SRTP)
- Audio codec: OPUS
- SDP: RFC 8866 compliant
- O SDP do accept DEVE ser igual ao do pre_accept (senao erro 138008)

## Diagnostico: o que esta errado no sistema atual

### Problema 1 -- Evento `audio` do ElevenLabs pode nao estar habilitado

O pipeline atual depende de capturar chunks PCM via `onMessage` com `message.type === 'audio'`. A documentacao do ElevenLabs diz explicitamente:

> "audio: Base64 encoded audio for playback (WebSocket only, not sent over WebRTC)"
> "These must be individually enabled in the ElevenLabs web UI"

Se o evento `audio` **nao estiver habilitado** na configuracao do agente ElevenLabs, o `onMessage` nunca recebe chunks, o `outputDestRef.stream` fica silencioso para sempre, e o `replaceTrack` injeta uma track sem audio no WebRTC. O caller ouve silencio.

**Acao**: Verificar no painel ElevenLabs se o evento `audio` esta habilitado. Se nao estiver, habilitar. Adicionalmente, implementar logging diagnostico para confirmar se chunks estao chegando.

### Problema 2 -- Sample rate incompativel

O `outputCtxRef` e criado com `sampleRate: 16000` (ou o valor que o metadata do agente retornar). Porem, o WebRTC do navegador opera tipicamente em 48000Hz com codec OPUS. A Meta espera OPUS.

Quando o `AudioContext` de 16000Hz produz uma `MediaStream` e essa stream e passada para `replaceTrack`, o WebRTC encoder (OPUS) precisa resampling. Nem todos os navegadores fazem isso automaticamente quando os contextos tem sample rates diferentes.

**Acao**: Criar o output pipeline com sample rate nativo (48000Hz) e fazer o resampling internamente no decode dos chunks PCM.

### Problema 3 -- Timing do `wireElevenLabsOutputToMeta`

Atualmente, a funcao `wireElevenLabsOutputToMeta` e chamada com `setTimeout(..., 500)` apos `elevenLabs.status === 'connected'`. Mas:
- `getAgentOutputStream()` pode nao ter audio ainda (nenhum chunk decodificado)
- Se falhar (stream null ou track null), nao ha retry
- O log mostra "no agent output stream yet" e desiste

**Acao**: Implementar retry com polling (ex: tentar a cada 200ms por ate 5s) ate que a stream esteja disponivel e tenha tracks.

### Problema 4 -- Midia fluindo antes do `accept` 200 OK

Segundo a Meta, midia so deve fluir apos o `accept` retornar 200. No codigo atual:
1. `pre_accept` retorna sucesso
2. ElevenLabs session inicia (pode comecar a enviar audio)
3. `wireElevenLabsOutputToMeta` pode trocar o track antes do `accept`
4. `accept` e enviado depois

Embora o track inicial seja silencioso (o que evita o pior caso), a troca para o track da Iris pode acontecer antes do `accept` 200 OK. Isso pode causar comportamento imprevisivel.

**Acao**: So chamar `wireElevenLabsOutputToMeta` apos confirmacao de que `accept` retornou com sucesso (nao apenas apos ElevenLabs conectar).

## Plano de implementacao

### Fase 1 -- Diagnostico (sem mudanca funcional)

**Arquivo**: `src/hooks/useElevenLabsBridge.ts`

- Adicionar contador de chunks recebidos no `onMessage` handler
- Log a cada 10 chunks: `[ElevenLabsBridge] Audio chunks received: N, total bytes: M`
- Log se NENHUM chunk chegou apos 5s de sessao: `[ElevenLabsBridge] WARNING: No audio chunks received after 5s — is 'audio' event enabled in ElevenLabs agent config?`
- Expor `getAudioChunkCount()` para o Engine monitorar

### Fase 2 -- Corrigir sample rate do output pipeline

**Arquivo**: `src/hooks/useElevenLabsBridge.ts`

- Criar o `AudioContext` do output com `sampleRate: 48000` (nativo WebRTC/OPUS)
- No decode dos chunks, fazer resampling de `outputSampleRateRef.current` (16000) para 48000 ao criar o `AudioBuffer`:
  ```typescript
  // Resample: create buffer at agent's rate, then use OfflineAudioContext to resample
  // OR: create buffer at 48000 and stretch samples
  ```
- Alternativa mais simples: criar o AudioBuffer com o sample rate do AudioContext e deixar o `createBuffer` com o sample rate correto do chunk -- o Web Audio API faz resampling automatico quando sample rates diferem entre buffer e contexto

### Fase 3 -- Mover `wireElevenLabsOutputToMeta` para apos `accept` 200 OK

**Arquivo**: `src/components/AutoAttendantEngine.tsx`

Mudancas no `processInbound`:
1. Adicionar ref `acceptSucceededRef` (boolean)
2. Apos `accept` retornar sem `skipped`:
   - Setar `acceptSucceededRef.current = true`
   - Se ElevenLabs ja estiver connected, chamar `wireElevenLabsOutputToMeta()`
3. No watcher de `elevenLabs.status === 'connected'`:
   - So chamar `wireElevenLabsOutputToMeta` se `acceptSucceededRef.current === true`
   - Se `accept` ainda nao retornou, armazenar flag para wire depois

Sequencia alvo:
```text
pre_accept -> OK
  -> ElevenLabs session inicia (comeca a decodificar chunks)
  -> WebRTC conecta (track silencioso)
accept -> 200 OK
  -> wireElevenLabsOutputToMeta() -> replaceTrack
  -> caller ouve Iris
```

### Fase 4 -- Retry robusto no `wireElevenLabsOutputToMeta`

**Arquivo**: `src/components/AutoAttendantEngine.tsx`

- Substituir o `setTimeout(..., 500)` por loop de retry:
  ```typescript
  const wireWithRetry = async () => {
    for (let attempt = 0; attempt < 25; attempt++) { // 25 * 200ms = 5s
      wireElevenLabsOutputToMeta();
      if (elOutputWiredRef.current) return;
      await new Promise(r => setTimeout(r, 200));
    }
    addLog('CRITICAL: Failed to wire ElevenLabs output after 5s');
  };
  ```
- Log explicito em cada tentativa com razao de falha

### Fase 5 -- Alerta se `audio` event nao esta habilitado

**Arquivo**: `src/hooks/useElevenLabsBridge.ts`

- Apos 3 segundos de sessao `connected`, se nenhum chunk de audio chegou:
  - Log warning critico
  - Opcionalmente, expor flag `audioEventsActive: boolean` para o Engine reagir

## Checklist de configuracao ElevenLabs (acao manual obrigatoria)

Antes de testar, verificar no painel do agente ElevenLabs:
1. O evento `audio` esta habilitado nas configuracoes de "Client Events"?
2. O formato de saida esta configurado (pcm_16000 ou similar)?
3. O agente esta usando WebSocket (signedUrl) e nao WebRTC?

## Validacao

1. **Teste de chunks**: Apos Fase 1, verificar nos logs se chunks estao chegando
2. **Teste de audio E2E**: Apos Fases 2-4, ligar e confirmar que o caller ouve Iris
3. **Teste de timing**: Confirmar que `replaceTrack` so ocorre apos `accept` 200
4. **Teste de estabilidade**: Chamada de 2-3 minutos sem corte

