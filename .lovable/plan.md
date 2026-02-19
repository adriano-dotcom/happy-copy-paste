

# Fix: Tratamento de erro "Requested device not found" ao atender chamada

## Problema

Ao clicar em "Atender", o sistema tenta acessar o microfone via `getUserMedia({ audio: true })`. Se nao ha microfone disponivel (ou a permissao foi negada), o erro "Requested device not found" aparece e a chamada nao conecta.

O ringtone funciona normalmente porque usa `AudioContext` com oscilador sintetico (nao precisa de microfone). Mas a conexao WebRTC precisa de uma track de audio local.

## Solucao

Duas melhorias:

### 1. Mensagem de erro amigavel e orientativa

Detectar especificamente o erro `NotFoundError` / "Requested device not found" e mostrar uma mensagem clara ao usuario explicando que precisa conectar um microfone ou liberar permissao.

No `catch` (linha 447-451 de `IncomingCallModal.tsx`):

```typescript
catch (error: any) {
  console.error(`[WebRTC][${ts()}] Error accepting call:`, error);

  let userMessage = error.message || 'Erro desconhecido';
  if (error.name === 'NotFoundError' || error.message?.includes('Requested device not found')) {
    userMessage = 'Microfone nao encontrado. Conecte um microfone e tente novamente.';
  } else if (error.name === 'NotAllowedError') {
    userMessage = 'Permissao de microfone negada. Libere o acesso nas configuracoes do navegador.';
  }

  toast.error('Erro ao atender chamada: ' + userMessage);
  setLocalStatus(null);
  clearTimeout(totalTimeoutId);
}
```

### 2. Fallback: conectar sem microfone (listen-only mode)

Se `getUserMedia` falhar, criar uma stream silenciosa para que o usuario consiga pelo menos **ouvir** o interlocutor, mesmo sem poder falar. Isso e melhor do que perder a chamada completamente.

Na secao de captura do microfone (linha 276-280):

```typescript
let stream: MediaStream;
try {
  stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  console.log(`[WebRTC] Microphone acquired`);
} catch (micError: any) {
  console.warn(`[WebRTC] Microphone unavailable: ${micError.message}. Using silent track (listen-only).`);
  toast.warning('Microfone indisponivel. Voce pode ouvir, mas nao falar.');

  // Create silent audio track as fallback
  const ctx = new AudioContext();
  const oscillator = ctx.createOscillator();
  const dst = ctx.createMediaStreamDestination();
  oscillator.connect(dst);
  oscillator.start();
  stream = dst.stream;
  // Mute the oscillator (it produces silence by default at freq 0)
  oscillator.frequency.setValueAtTime(0, ctx.currentTime);
}
localStreamRef.current = stream;
```

Isso permite que a chamada conecte e o usuario ouca o audio remoto, mesmo sem microfone.

## Resultado esperado

- Sem microfone: chamada conecta em modo "somente ouvir", toast amarelo avisa o usuario
- Com permissao negada: mensagem clara orientando o usuario a liberar acesso
- Com microfone disponivel: comportamento normal, sem mudanca

