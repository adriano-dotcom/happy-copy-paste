

# Corrigir envio de audio: gravar como OGG direto no Chrome (nao relabeling)

## Diagnostico completo

Analisando os 3 erros nos logs:

| Horario | Formato gravado | Mapeamento backend | Resultado WhatsApp |
|---------|----------------|-------------------|-------------------|
| 15:30 | audio/mp4 | mp4 -> aac | "uploaded as audio/aac, but is application/octet-stream" |
| 15:35 | audio/webm | nenhum (codigo antigo) | "Unsupported audio/webm" |
| 15:39 | audio/webm | webm -> ogg | "uploaded as audio/ogg; codecs=opus, but is application/octet-stream" |

**Conclusao**: Relabeling nao funciona. O WhatsApp inspeciona os bytes reais do arquivo. Um WebM rotulado como OGG continua sendo WebM por dentro. O WhatsApp detecta isso e rejeita.

## Causa raiz

O log do console mostra:
```
[Audio] Using format: audio/webm; codecs=opus
```

Isso significa que o Chrome **nao selecionou** `audio/ogg; codecs=opus` como formato de gravacao, mesmo estando primeiro na lista. Porem, **Chrome suporta sim** `audio/ogg; codecs=opus` no MediaRecorder. O problema e que o audio foi gravado **antes do deploy** da mudanca de prioridade dos formatos, ou o navegador esta usando cache.

A correcao real e garantir que:
1. O Chrome grave diretamente como `audio/ogg; codecs=opus` (formato nativo do WhatsApp)
2. O arquivo enviado ao Storage ja esteja em OGG
3. O backend nao precise fazer nenhum mapeamento para Chrome/Firefox

## Solucao

### Arquivo: `src/components/ChatInterface.tsx`

A funcao `getPreferredAudioMimeType` ja esta correta com `audio/ogg; codecs=opus` em primeiro lugar. Mas precisamos garantir que o MediaRecorder realmente USE esse formato:

1. Verificar que `MediaRecorder.isTypeSupported('audio/ogg; codecs=opus')` retorna `true` no Chrome (deveria retornar)
2. Adicionar log mais detalhado mostrando quais formatos foram testados e seus resultados
3. Se `audio/ogg` nao for suportado, adicionar toast avisando o usuario

### Arquivo: `supabase/functions/whatsapp-sender/index.ts`

Manter os mapeamentos existentes como fallback, mas a mudanca principal e no frontend.

A unica acao necessaria agora e: **testar o envio de audio novamente** no Chrome, pois o codigo do frontend ja prioriza OGG. Se o Chrome selecionar OGG corretamente, o audio sera aceito pelo WhatsApp sem nenhum mapeamento.

Se o teste confirmar que Chrome agora grava como OGG, nenhuma mudanca de codigo adicional e necessaria - o fix ja esta deployado, so faltava testar apos o ultimo deploy.

## Acao: Verificar e adicionar log de diagnostico

Adicionar log detalhado na funcao `getPreferredAudioMimeType` para listar todos os formatos testados:

```typescript
const getPreferredAudioMimeType = () => {
  const formats = [
    { mimeType: 'audio/ogg; codecs=opus', extension: 'ogg' },
    // ... restante
  ];
  
  // Log diagnostico: quais formatos o browser suporta
  console.log('[Audio] Format support check:', 
    formats.map(f => `${f.mimeType}: ${MediaRecorder.isTypeSupported(f.mimeType)}`).join(', ')
  );
  
  for (const format of formats) {
    if (MediaRecorder.isTypeSupported(format.mimeType)) {
      console.log(`[Audio] Selected format: ${format.mimeType}`);
      return format;
    }
  }
  // ...
};
```

Isso vai mostrar no console exatamente o que o Chrome suporta e confirmar se o OGG esta sendo selecionado.

## Arquivos a editar

1. `src/components/ChatInterface.tsx` - Adicionar log diagnostico detalhado na deteccao de formato
