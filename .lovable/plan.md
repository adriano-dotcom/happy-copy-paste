

# Corrigir envio de audio: WhatsApp rejeita audio/mp4 do Safari (erro 131053)

## Problema persistente

Mesmo apos mapear `audio/mp4` para `audio/aac` no header, o WhatsApp continua rejeitando os audios com erro 131053. Isso acontece porque:

- O WhatsApp aceita o **upload** do arquivo (retorna um media ID)
- Mas **rejeita o conteudo** durante a entrega assincrona
- O problema nao e o label do MIME type, mas sim o **formato real do container MP4** gerado pelo MediaRecorder do Safari

O Safari no macOS nao suporta `audio/ogg; codecs=opus` (formato nativo do WhatsApp), entao o sistema cai para `audio/mp4` — que o WhatsApp nao processa corretamente.

## Solucao

### 1. Frontend: Reordenar prioridade de formatos

No `ChatInterface.tsx`, a funcao `getPreferredAudioMimeType` deve priorizar `audio/webm` (aceito pelo WhatsApp e suportado pelo Chrome/Firefox) e mover `audio/mp4` para ultima opcao:

```
Ordem atual:    ogg > mp4 > mp3 > aac
Nova ordem:     ogg > webm > aac > mp3 > mp4 (ultimo recurso)
```

O `audio/webm` e suportado por Chrome e Firefox e e aceito pelo WhatsApp. Para Safari (que so suporta `audio/mp4`), a conversao sera feita no backend.

### 2. Backend: Converter audio/mp4 para OGG/Opus no whatsapp-sender

No `whatsapp-sender/index.ts`, quando o mimeType for `audio/mp4`:
- Usar a WhatsApp Media API com `audio/aac` (manter o mapeamento existente)
- Adicionar um fallback: se o envio falhar com 131053, tentar fazer upload como `audio/ogg` usando o mesmo buffer (alguns containers MP4 do Safari sao aceitos quando rotulados como OGG)

Porem, a solucao mais robusta e:
- No `uploadMediaToWhatsApp`, apos baixar o arquivo, verificar se o envio com `audio/aac` funciona
- Se nao funcionar (erro 131053 vem assincronamente), a alternativa real e **nao usar audio/mp4 de forma alguma**

### 3. Frontend: Forcara audio/webm no Safari com polyfill ou alerta

Para Safari, que nao suporta nem OGG nem WebM nativamente:
- Adicionar `audio/mp4; codecs=mp4a.40.2` como formato especifico (AAC-LC em container MP4, que o WhatsApp aceita)
- Se nenhum formato compativel for encontrado, mostrar um toast informando que o navegador nao suporta envio de audio e sugerir usar Chrome

## Arquivos a editar

### `src/components/ChatInterface.tsx`
- Funcao `getPreferredAudioMimeType` (linhas 163-183): Reordenar formatos para priorizar `audio/webm` e adicionar `audio/mp4; codecs=mp4a.40.2`
- Adicionar toast de aviso se o formato selecionado for `audio/mp4` sem codec especifico

### `supabase/functions/whatsapp-sender/index.ts`
- Funcao `uploadMediaToWhatsApp` (ja editada): Adicionar suporte para `audio/webm` no mapa de extensoes
- Manter o mapeamento `audio/mp4 -> audio/aac`

## Detalhe tecnico: formatos por navegador

```text
Chrome/Edge:  audio/ogg; codecs=opus  (OK para WhatsApp)
Firefox:      audio/ogg; codecs=opus  (OK para WhatsApp)  
Safari:       audio/mp4               (REJEITADO pelo WhatsApp)
Safari 17.4+: audio/webm              (OK para WhatsApp, verificar suporte)
```

A mudanca principal e testar `audio/webm` antes de `audio/mp4` na lista de prioridade. Versoes recentes do Safari (17.4+) ja suportam WebM, o que resolve o problema para a maioria dos usuarios Mac atualizados.

