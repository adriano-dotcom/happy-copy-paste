
# Fix: Audio mudo nas chamadas WhatsApp

## Problema
O botao de atender funciona, a sinalizacao com a Meta acontece, mas o audio fica mudo. Isso indica que o WebRTC conecta no nivel de sinalizacao, porem o audio nao flui no navegador.

## Causa raiz
Duas causas provaveis trabalhando juntas:

1. **Audio element "unlock" falho**: O codigo cria `new Audio()` e chama `play()` em um elemento vazio (linha 258-260). Em muitos navegadores, tocar um Audio vazio NAO desbloqueia o elemento para uso futuro com streams WebRTC. Quando o `ontrack` dispara mais tarde (fora do contexto do gesto do usuario), o `play()` falha silenciosamente.

2. **AudioContext suspensa**: O navegador pode manter o AudioContext em estado "suspended", bloqueando toda reproducao de audio mesmo que o elemento esteja configurado corretamente.

## Solucao

### Arquivo: `src/components/IncomingCallModal.tsx`

Tres mudancas no `handleAccept`:

1. **Desbloquear AudioContext imediatamente no clique** — chamar `new AudioContext().resume()` dentro do handler de clique para garantir que o sistema de audio do navegador esta ativo.

2. **Criar Audio element com um "silent unlock" real** — em vez de tocar um elemento vazio, criar um AudioContext oscillator silencioso (frequencia 0, ganho 0) por 100ms para desbloquear o pipeline de audio.

3. **Forcar play() com retry no ontrack** — quando o track remoto chega, tentar `play()` com retry apos 500ms se falhar na primeira tentativa. Tambem garantir que `volume = 1` e `muted = false` estao explicitamente setados.

### Mudancas especificas:

**Substituir linhas 257-261** (unlock do audio) por:
```typescript
// Unlock audio pipeline in user gesture context
const audioCtx = new AudioContext();
if (audioCtx.state === 'suspended') await audioCtx.resume();
// Create silent oscillator to fully unlock audio output
const silentOsc = audioCtx.createOscillator();
const silentGain = audioCtx.createGain();
silentGain.gain.value = 0;
silentOsc.connect(silentGain);
silentGain.connect(audioCtx.destination);
silentOsc.start();
silentOsc.stop(audioCtx.currentTime + 0.1);

const audio = new Audio();
audio.autoplay = true;
audio.volume = 1;
audio.muted = false;
remoteAudioRef.current = audio;
```

**No ontrack (linhas 338-344)**, melhorar o play com retry:
```typescript
if (remoteAudioRef.current) {
  remoteAudioRef.current.srcObject = event.streams[0];
  remoteAudioRef.current.volume = 1;
  remoteAudioRef.current.muted = false;
  const tryPlay = () => {
    remoteAudioRef.current?.play()
      .then(() => {
        console.log(`[WebRTC] Audio playing successfully`);
        logAudioState(remoteAudioRef.current, event.track);
      })
      .catch(err => {
        console.warn(`[WebRTC] Audio play failed, retrying in 500ms:`, err);
        setTimeout(tryPlay, 500);
      });
  };
  tryPlay();
}
```

Estas mudancas garantem que o pipeline de audio do navegador esta totalmente desbloqueado antes de qualquer operacao WebRTC, e que a reproducao do audio remoto tem mecanismo de retry.
