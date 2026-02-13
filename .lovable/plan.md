

# Corrigir acesso ao microfone para envio de audio

## Problema
Ao clicar no botao de microfone no chat, aparece o erro "Erro ao acessar microfone. Verifique as permissoes." O audio nao funciona.

## Diagnostico
O codigo atual (linha 971-1005 do `ChatInterface.tsx`) chama `navigator.mediaDevices.getUserMedia` corretamente no handler de click, mas:

1. **Nao verifica se `navigator.mediaDevices` existe** - em contextos HTTP (sem HTTPS), esse objeto e `undefined`, causando um erro generico
2. **A mensagem de erro e generica demais** - nao diferencia entre "sem HTTPS", "permissao negada", "sem microfone" ou "formato nao suportado"
3. **Nao tem fallback** caso o formato preferido nao seja suportado pelo MediaRecorder

## Solucao

### Alteracoes no `src/components/ChatInterface.tsx`

**1. Adicionar verificacao de seguranca antes de chamar getUserMedia:**
- Verificar se `navigator.mediaDevices` e `navigator.mediaDevices.getUserMedia` existem
- Se nao existirem, mostrar mensagem especifica informando que o site precisa ser acessado via HTTPS

**2. Melhorar o tratamento de erros com mensagens especificas:**
- `NotAllowedError` -> "Permissao do microfone negada. Clique no icone de cadeado na barra de endereco para permitir."
- `NotFoundError` -> "Nenhum microfone encontrado neste dispositivo."
- `NotReadableError` -> "Microfone em uso por outro aplicativo."
- Erro generico -> manter mensagem atual

**3. Adicionar tratamento robusto para formato de audio:**
- Se o MediaRecorder falhar com o formato preferido, tentar sem especificar mimeType (usar padrao do navegador)

### Codigo proposto para `startRecording`:

```typescript
const startRecording = async () => {
  try {
    // Verificar se API de midia esta disponivel (requer HTTPS)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast.error('Microfone nao disponivel. Verifique se o site esta sendo acessado via HTTPS.');
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
      }
    });

    // Detectar melhor formato
    const preferredFormat = getPreferredAudioMimeType();
    audioFormatRef.current = preferredFormat;

    let mediaRecorder: MediaRecorder;
    try {
      mediaRecorder = new MediaRecorder(stream, { mimeType: preferredFormat.mimeType });
    } catch (formatError) {
      console.warn('[Audio] Format not supported, using default:', formatError);
      mediaRecorder = new MediaRecorder(stream);
      audioFormatRef.current = { mimeType: mediaRecorder.mimeType, extension: 'webm' };
    }

    // ... resto do codigo igual ...

  } catch (error) {
    console.error('Error accessing microphone:', error);
    if (error instanceof DOMException) {
      switch (error.name) {
        case 'NotAllowedError':
          toast.error('Permissao do microfone negada. Clique no cadeado na barra de endereco para permitir.');
          break;
        case 'NotFoundError':
          toast.error('Nenhum microfone encontrado neste dispositivo.');
          break;
        case 'NotReadableError':
          toast.error('Microfone em uso por outro aplicativo.');
          break;
        default:
          toast.error('Erro ao acessar microfone. Verifique as permissoes.');
      }
    } else {
      toast.error('Erro ao acessar microfone. Verifique as permissoes.');
    }
  }
};
```

## Arquivo a editar
- `src/components/ChatInterface.tsx` - funcao `startRecording` (linhas 971-1006)

Essa mudanca melhora significativamente o diagnostico do problema, adicionando verificacoes previas e mensagens de erro especificas que ajudam o usuario a resolver o problema de permissao.
