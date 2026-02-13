

# Corrigir envio de audio: mapear audio/webm para audio/ogg no backend

## Problema
O Chrome grava audio como `audio/webm; codecs=opus`. O WhatsApp **nao aceita** `audio/webm` - nem via upload direto nem via link. Os formatos aceitos sao: `audio/ogg, audio/mpeg, audio/amr, audio/mp4, audio/aac`.

O que acontece hoje:
1. Chrome grava `audio/webm; codecs=opus`
2. Backend tenta upload na WhatsApp Media API com `audio/webm` -> **rejeitado** (erro 100)
3. Cai no fallback de link -> WhatsApp entrega mas depois rejeita assincronamente (erro 131053)

## Causa raiz
O `uploadMediaToWhatsApp` no `whatsapp-sender` so mapeia `audio/mp4` para `audio/aac`, mas nao mapeia `audio/webm` para nada. O `audio/webm; codecs=opus` e enviado tal qual, e o WhatsApp rejeita.

## Solucao

### Arquivo: `supabase/functions/whatsapp-sender/index.ts`

Adicionar mapeamento de `audio/webm` e `audio/webm; codecs=opus` para `audio/ogg` na funcao `uploadMediaToWhatsApp`. Isso funciona porque ambos os containers (WebM e OGG) usam o codec Opus - a diferenca e apenas o container, e o WhatsApp aceita OGG com Opus nativamente.

Alteracoes:
- Mapear `audio/webm` -> `audio/ogg` (alem do mapeamento existente `audio/mp4` -> `audio/aac`)
- Garantir que a extensao do arquivo enviado na multipart seja `.ogg` quando o mimeType for mapeado

### Codigo da mudanca (na funcao `uploadMediaToWhatsApp`, apos o bloco de sanitizacao existente):

```typescript
let effectiveMimeType = mimeType;
if (mimeType === 'audio/mp4' || mimeType === 'audio/mp4; codecs=mp4a.40.2') {
  effectiveMimeType = 'audio/aac';
  console.log('[Sender] Mapped audio/mp4 -> audio/aac for WhatsApp compatibility');
}
// WebM com Opus e essencialmente o mesmo que OGG/Opus - apenas container diferente
// WhatsApp aceita audio/ogg nativamente mas rejeita audio/webm
if (mimeType === 'audio/webm' || mimeType === 'audio/webm; codecs=opus') {
  effectiveMimeType = 'audio/ogg';
  console.log('[Sender] Mapped audio/webm -> audio/ogg for WhatsApp compatibility');
}
```

Nenhuma alteracao no frontend e necessaria - o Chrome ja grava corretamente em `audio/webm; codecs=opus`, que e o formato ideal. A conversao acontece apenas no backend na hora de enviar para o WhatsApp.
