

# Corrigir áudio "indisponível" no WhatsApp ao enviar gravações do painel

## Problema
Quando o operador grava e envia áudio pelo painel, o cliente recebe "mensagem indisponível" no WhatsApp. Os áudios recentes foram gravados como `audio/webm; codecs=opus` (formato do Chrome) e o sistema tenta remuxar para OGG antes de enviar ao WhatsApp.

O remuxer WebM→OGG customizado (linhas 19-230 do `whatsapp-sender`) é frágil e pode:
1. Falhar silenciosamente e cair no fallback (linha 519-521) que apenas muda o label de mime para `audio/ogg` sem converter os bytes - WhatsApp aceita o upload mas não consegue reproduzir
2. Produzir um OGG malformado que o WhatsApp aceita mas não toca

## Solução

Substituir o remuxer customizado por **FFmpeg via API** ou, mais pragmaticamente, usar a **API de conversão do ElevenLabs** que já está integrada. Porém a solução mais simples e confiável:

### Abordagem: Gravar diretamente em formato nativo WhatsApp (audio/ogg; codecs=opus)

O Chrome **suporta** `audio/ogg; codecs=opus` nativamente no MediaRecorder. O código atual já tenta isso como primeira opção (linha 171), mas se falhar, cai para webm.

A verdadeira correção é em **duas frentes**:

### 1. Melhorar o fallback do remuxer no `whatsapp-sender` (Edge Function)
- Quando o remux falhar, em vez de enviar bytes WebM rotulados como OGG (que gera arquivo corrompido), **não fazer fallback de relabel** - manter como `audio/webm` e deixar o WhatsApp rejeitar explicitamente, ou melhor, usar a abordagem de link direto sem upload
- Adicionar log explícito quando o remux falha para diagnóstico

### 2. Usar FFmpeg real via fetch a um serviço de conversão (mais robusto)
- Alternativa: Usar a API da ElevenLabs (já configurada) para converter WebM→MP3 via Text-to-Speech com input de áudio, ou simplesmente salvar como `.mp3` usando a Web Audio API no frontend

### 3. Solução recomendada (mais simples): Converter no frontend antes do upload
- No `ChatInterface.tsx`, após gravar o áudio, usar **Web Audio API** para decodificar o WebM e re-encodar como WAV, ou simplesmente enviar para o edge function `simulate-audio-webhook` que já faz transcrição
- **Melhor ainda**: Forçar o upload com o mime type correto e ajustar o sender para quando o remux falhar, enviar como texto com transcrição em vez de áudio corrompido

### Implementação proposta (pragmática)

**Arquivo**: `supabase/functions/whatsapp-sender/index.ts`

1. No bloco de remux (linhas 512-522), quando `remuxWebmToOgg()` lançar erro, **não fazer fallback de relabel**. Em vez disso, tentar enviar o webm diretamente como `audio/webm` (que a Graph API v18+ pode aceitar) ou retornar erro claro
2. Adicionar validação do OGG gerado: verificar se os primeiros bytes são `OggS` (magic bytes do formato OGG) antes de prosseguir com o upload
3. Se a validação falhar, logar erro detalhado e **converter a mensagem de áudio para texto** usando o transcriber existente, enviando como mensagem de texto em vez de áudio corrompido

**Arquivo**: `src/components/ChatInterface.tsx`

4. Na função `sendAudioMessage`, adicionar um fallback: se o mime type for `audio/webm`, chamar o edge function `simulate-audio-webhook` para transcrever e enviar como texto, ao invés de enviar o webm para a fila de áudio

### Resumo dos arquivos editados
- `supabase/functions/whatsapp-sender/index.ts` — Validar OGG após remux, não fazer fallback de relabel com bytes corrompidos
- `src/components/ChatInterface.tsx` — Fallback para transcrição quando formato é webm

