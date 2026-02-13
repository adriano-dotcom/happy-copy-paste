

# Corrigir envio de audio do operador para WhatsApp (erro 131053)

## Problema
Audios gravados pelo operador no chat falham com erro **131053** do WhatsApp:
```
Audio file uploaded with mimetype as audio/mp4, however on processing 
it is of type application/octet-stream
```

Isso acontece em **todos os audios de operador** (from_type = 'human') - nenhum foi entregue com sucesso.

## Causa raiz
Dois problemas encadeados:

1. **O navegador (Safari/Chrome no Mac) grava como `audio/mp4`**, mas o container gerado pelo MediaRecorder nao e um MP4 valido que o WhatsApp reconhece. O WhatsApp espera codificacao AAC dentro do container MP4, mas o MediaRecorder pode gerar um formato ligeiramente diferente.

2. **O Supabase Storage serve arquivos publicos como `application/octet-stream`**, independente do content-type usado no upload. Quando o `whatsapp-sender` baixa o arquivo e faz upload na WhatsApp Media API, o WhatsApp valida o conteudo real e rejeita.

Evidencia: O media upload para o WhatsApp retorna sucesso (ID 952267164644964), mas ao enviar a mensagem, o WhatsApp rejeita o conteudo com 131053. Isso indica que o formato do arquivo nao e realmente `audio/mp4` valido.

## Solucao

### 1. Frontend: Fazer upload direto do Blob (sem roundtrip base64)

O fluxo atual converte Blob -> base64 -> Blob desnecessariamente, o que pode corromper headers do container. Simplificar para enviar o Blob diretamente ao Storage.

**Arquivo:** `src/components/ChatInterface.tsx`

- Na funcao `stopRecording`: ao inves de ler como base64 e passar para `sendAudioMessage`, enviar o `audioBlob` diretamente
- Na funcao `sendAudioMessage`: aceitar um `Blob` ao inves de `string` base64, eliminando a reconversao

### 2. Frontend: Forcar upload com content-type correto via upsert

Garantir que o upload ao Storage use `upsert: true` e o `contentType` correto para evitar conflitos.

### 3. Backend: Melhorar `uploadMediaToWhatsApp` para sanitizar o mimeType

**Arquivo:** `supabase/functions/whatsapp-sender/index.ts`

- Se o mimeType for `audio/mp4` e o upload ao WhatsApp falhar, tentar novamente com `audio/aac` (WhatsApp aceita AAC e o container MP4 do browser geralmente contem AAC)
- Adicionar log do content-type recebido no download para diagnostico

### Detalhes tecnicos

**ChatInterface.tsx - stopRecording (simplificar):**
```typescript
mediaRecorderRef.current!.onstop = async () => {
  const audioBlob = new Blob(audioChunksRef.current, { type: format.mimeType });
  await sendAudioMessage(audioBlob, format.mimeType, format.extension);
  resolve();
};
```

**ChatInterface.tsx - sendAudioMessage (aceitar Blob diretamente):**
```typescript
const sendAudioMessage = async (audioBlob: Blob, mimeType: string, extension: string) => {
  // Upload direto do Blob, sem conversao base64
  const { error: uploadError } = await supabase.storage
    .from('whatsapp-media')
    .upload(fileName, audioBlob, {
      contentType: mimeType,
      cacheControl: '3600',
      upsert: false
    });
  // ... resto igual
};
```

**whatsapp-sender/index.ts - uploadMediaToWhatsApp (retry com mimeType alternativo):**
```typescript
// Apos download do media, sanitizar o mimeType
// Se audio/mp4 falhar, tentar como audio/aac
let effectiveMimeType = mimeType;
// Alguns navegadores gravam "audio/mp4" mas o conteudo e AAC puro
// WhatsApp aceita audio/aac nativamente
if (mimeType === 'audio/mp4') {
  effectiveMimeType = 'audio/aac';
}
```

### Arquivos a editar
1. `src/components/ChatInterface.tsx` - Simplificar fluxo de audio (eliminar roundtrip base64)
2. `supabase/functions/whatsapp-sender/index.ts` - Mapear audio/mp4 para audio/aac no upload ao WhatsApp

