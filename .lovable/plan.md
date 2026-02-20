

# Corrigir audio do Auto-Attendant: Iris ouvir o caller, nao o operador

## Problema

Quando uma ligacao entra, o ElevenLabs SDK sempre captura o **microfone do navegador** (do operador) como entrada de audio. A Iris acaba conversando com quem esta usando o sistema, e nao com o caller da ligacao WhatsApp.

O stream de audio da Meta (caller) e criado pelo AudioBridge (`elevenLabsMicStream`) mas **nunca e conectado** ao ElevenLabs -- o parametro e ignorado (`_micStream`).

## Solucao

Interceptar temporariamente o `navigator.mediaDevices.getUserMedia` para que, quando o SDK do ElevenLabs pedir acesso ao microfone, ele receba o stream de audio do caller (Meta) em vez do microfone real do operador.

### Como funciona

1. Antes de chamar `elevenLabs.startSession()`, substituir `navigator.mediaDevices.getUserMedia` por uma funcao que retorna o `elevenLabsMicStream` do AudioBridge
2. Apos o `startSession` completar (ou falhar), restaurar o `getUserMedia` original
3. Assim o ElevenLabs "pensa" que esta ouvindo um microfone, mas na verdade esta ouvindo o audio remoto da chamada WhatsApp

### Mudancas

**`src/hooks/useElevenLabsBridge.ts`**
- Adicionar parametro opcional `micStream?: MediaStream` no `startSession`
- Antes de chamar `conversation.startSession`, salvar referencia original do `getUserMedia`
- Substituir por funcao que retorna o `micStream` fornecido
- Apos session iniciar, restaurar o `getUserMedia` original
- Se nao for passado `micStream`, manter comportamento padrao (microfone real)

**`src/components/AutoAttendantEngine.tsx`**
- No `startElevenLabsSession`, passar o `elevenLabsMicStream` para `elevenLabs.startSession()` como segundo argumento
- Remover o underscore do parametro `_micStream` -> `micStream`

## Detalhes Tecnicos

```text
ANTES (bugado):
  Meta caller audio -> AudioBridge -> elevenLabsMicStream (DESCARTADO)
  Microfone do operador -> ElevenLabs SDK (Iris ouve operador)

DEPOIS (correto):
  Meta caller audio -> AudioBridge -> elevenLabsMicStream
       |
       v
  getUserMedia interceptado -> ElevenLabs SDK (Iris ouve caller)
  Microfone do operador (IGNORADO)
```

### Codigo do patch no useElevenLabsBridge:

O `startSession` recebera um `micStream` opcional. Quando fornecido:
- `navigator.mediaDevices.getUserMedia` e temporariamente substituido
- A funcao substituta retorna `Promise.resolve(micStream)` em vez de acessar o microfone
- Apos `conversation.startSession()` resolver, o original e restaurado em um bloco `finally`

Isso garante que o patch e atomico e seguro -- mesmo se o startSession falhar, o getUserMedia original sera restaurado.

