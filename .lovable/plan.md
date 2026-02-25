
Diagnóstico aprofundado (com evidência objetiva)

1) O problema principal agora não é mais CAS/duplicidade de accept.
- O fluxo de pre_accept/accept está ocorrendo com CAS e chegou em `answered`.
- Logs mostram:
  - `pre_accept claimed — ElevenLabs gate opened`
  - `Sending accept...`
  - `Inbound call ... accepted and bridged!`
  - chamada foi para `answered` no banco.

2) O sintoma “agente atendendo no navegador e não na ligação WhatsApp” bate com falha de roteamento de áudio de saída.
- No código atual:
  - `AudioBridge` tem rota de volta (`setElevenLabsOutput`) pronta.
  - Mas `AutoAttendantEngine` nunca chama `setElevenLabsOutput`.
  - Também não existe `replaceTrack` no sender WebRTC para trocar o track silencioso pelo áudio da Iris.
- Evidência de log:
  - aparece `Meta → ElevenLabs path connected`
  - não aparece `ElevenLabs → Meta path connected`

3) Resultado prático dessa lacuna:
- A Iris fala localmente no browser (saída padrão do SDK), mas o lado WhatsApp recebe track silencioso.
- O cliente na chamada ouve silêncio, a conversa degrada e “cai”.
- Isso explica exatamente o relato: “atende no navegador, não na ligação”.

4) Há um endurecimento adicional necessário:
- `useElevenLabsBridge` restaura `getUserMedia` logo após `startSession`.
- Se o SDK fizer reacquire de input, pode voltar para mic do navegador.
- Mesmo não sendo a única causa, isso aumenta risco de “capturar browser em vez da call”.

Plano de implementação (correção definitiva)

Escopo de arquivos
- `src/hooks/useElevenLabsBridge.ts`
- `src/components/AudioBridge.tsx`
- `src/components/AutoAttendantEngine.tsx`
- (opcional hardening multiaba) `src/hooks/useWhatsAppAutoAttendant.ts`

Fase 1 — Consertar ponte de áudio bidirecional (crítico)
1. Em `useElevenLabsBridge`, capturar áudio bruto da Iris via callback `onAudio` do SDK.
2. Decodificar chunks base64 PCM para buffer de áudio e enfileirar com clock contínuo (jitter-safe).
3. Expor um `MediaStream` de saída da Iris (ex.: `agentOutputStream`) para consumo do engine.
4. Em `AutoAttendantEngine`, quando sessão ElevenLabs conectar:
   - ligar `bridge.setElevenLabsOutput(agentOutputStream)`;
   - pegar o track de saída resultante;
   - fazer `sender.replaceTrack(trackDaIris)` no peer connection com a Meta.
5. Manter track silencioso apenas como placeholder até a Iris conectar.

Fase 2 — Garantir que entrada da Iris continue sendo a chamada WhatsApp
1. Ajustar `useElevenLabsBridge` para “pin” do input stream da chamada durante toda a sessão ativa.
2. Só restaurar `navigator.mediaDevices.getUserMedia` no `endSession`/cleanup final.
3. Adicionar guardas para impedir fallback para mic local durante call ativa.

Fase 3 — Evitar percepção “falando no navegador”
1. Definir monitor local da Iris como:
   - padrão: desligado (volume local 0) para operação headless;
   - opcional: modo monitor (se desejarem escuta local).
2. Evitar que áudio local do navegador seja confundido com áudio da chamada.

Fase 4 — Hardening de concorrência entre abas (recomendado)
1. Adicionar lock de “tab líder” (heartbeat com TTL) para que só 1 aba opere engine por vez.
2. Manter CAS backend como defesa adicional.
3. Evita pre_accept concorrente desnecessário e SDP inválido por aba secundária.

Fluxo alvo após correção

```text
WhatsApp caller audio (Meta remote track)
  -> AudioBridge Meta→Iris
  -> ElevenLabs input (mic virtual)

ElevenLabs output chunks (onAudio)
  -> decoder + scheduler
  -> MediaStream de saída da Iris
  -> AudioBridge Iris→Meta
  -> RTCRtpSender.replaceTrack(...)
  -> caller ouve Iris na ligação WhatsApp
```

Plano de validação (E2E obrigatório)

1) Teste fim a fim principal (obrigatório)
- Receber ligação real no WhatsApp.
- Confirmar simultaneamente:
  - cliente ouve a Iris na ligação;
  - Iris ouve o cliente (transcrição com conteúdo, não “...” repetido);
  - navegador não é a “origem principal” de atendimento.

2) Teste de estabilidade
- Manter chamada por 2–3 minutos.
- Validar que não cai por silêncio indevido.
- Verificar transição `answered -> ended` com causa coerente.

3) Teste com 2 abas abertas
- Confirmar que apenas aba líder processa mídia.
- Sem pre_accept/accept redundante, sem “duas agentes”.

4) Teste de encerramento
- Encerrar pelo cliente e pelo sistema.
- Garantir cleanup sem sessões órfãs da Iris.

5) Teste de regressão
- Outbound e inbound continuam funcionando.
- Banner/estado visual continuam corretos.

Detalhes técnicos (time dev)

- `useElevenLabsBridge`:
  - adicionar refs: `outputAudioContextRef`, `outputDestinationRef`, `nextPlaybackTimeRef`, `outputFormatRef`.
  - `onConversationMetadata` para ler `agent_output_audio_format` (sample rate).
  - `onAudio(base64)`:
    - base64 -> ArrayBuffer -> PCM16 -> Float32;
    - criar `AudioBufferSourceNode`;
    - agendar em `nextPlaybackTimeRef` (nunca em `currentTime` direto sem fila).
  - expor:
    - `getAgentOutputStream(): MediaStream | null`
    - `bindInputStream(stream)` / `unbindInputStream()` (ou equivalente).

- `AutoAttendantEngine`:
  - após `elevenLabs.status === connected`, se houver `pcRef` e `bridgeRef`:
    - `const metaOut = bridge.setElevenLabsOutput(elevenLabs.getAgentOutputStream())`
    - `pc.getSenders().find(audio).replaceTrack(metaOut.getAudioTracks()[0])`
  - log explícito:
    - `ElevenLabs->Meta connected`
    - `replaceTrack success/fail`
    - níveis de entrada/saída.

- `AudioBridge`:
  - manter ganho/analyser das duas pernas.
  - garantir `disconnect()` encerrando nodes/tracks para não vazar.

Risco e mitigação

- Risco: áudio picotado por scheduler de chunks.
  - Mitigação: buffer mínimo (ex. 100–200ms) e clock monotônico (`nextPlaybackTimeRef`).
- Risco: sample rate incorreto.
  - Mitigação: usar formato de `onConversationMetadata`.
- Risco: regressão de concorrência multiaba.
  - Mitigação: lock líder + CAS já existente.

Resultado esperado

- A Iris deixa de “falar só no navegador”.
- A voz da Iris passa a sair na chamada WhatsApp.
- A ligação deixa de cair por silêncio/fluxo quebrado.
- Operação fica estável mesmo com múltiplas abas/sessões abertas.
