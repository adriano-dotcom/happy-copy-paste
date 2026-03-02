

# Corrigir mensagens de prospecção cortadas (truncadas pelo modelo AI)

## Problema
A mensagem do Atlas foi cortada no meio da palavra: "...a empresa tem seguro dos veículos (fro" — armazenada no banco com apenas 80 caracteres. O modelo `google/gemini-3-pro-preview` retornou uma resposta truncada (total 181 chars, muito abaixo do `max_tokens=1000`). O `breakMessageIntoChunks` dividiu corretamente em 2 chunks, mas o chunk 2 já veio cortado do modelo.

## Causa raiz
O modelo `google/gemini-3-pro-preview` (preview) está retornando respostas incompletas esporadicamente — o `finish_reason` provavelmente é `stop` mas o conteúdo termina no meio de uma palavra.

## Solução

### Arquivo: `supabase/functions/nina-orchestrator/index.ts`

**Alteração 1 — Detectar resposta truncada e fazer retry**
- Após receber `aiContent` do modelo (linhas ~7090-7100), adicionar validação:
  - Se a resposta termina sem pontuação final (`.`, `!`, `?`, `)`, `"`) e tem menos de 200 chars → considerar truncada
  - Log warning e retry com modelo estável (`google/gemini-2.5-flash`)
  - Se retry também truncar, usar fallback hardcoded de prospecção

**Alteração 2 — Validar cada chunk antes de enfileirar**
- Na função `queueTextResponse`, antes de inserir cada chunk na `send_queue`:
  - Se o chunk termina no meio de uma palavra (sem pontuação, última palavra cortada), não enviar esse chunk isolado
  - Se o chunk está truncado E é o último chunk, concatenar com o anterior ou descartar

### Detalhes técnicos

```typescript
// Após receber aiContent (linha ~7091):
if (aiContent) {
  const trimmed = aiContent.trim();
  const lastChar = trimmed[trimmed.length - 1];
  const endsWithPunctuation = /[.!?)"'\]]$/.test(trimmed);
  const endsAbruptly = !endsWithPunctuation && trimmed.length > 20;
  
  if (endsAbruptly) {
    console.warn(`[Nina] ⚠️ AI response appears TRUNCATED: ends with "${trimmed.slice(-20)}" (no punctuation)`);
    // Retry with stable model
    const retryResponse = await fetch(LOVABLE_AI_URL, { ... model: 'google/gemini-2.5-flash' });
    // Use retry if valid, else fallback
  }
}
```

- 1 arquivo: `nina-orchestrator/index.ts`
- Sem alteração de schema
- Risco: baixo — apenas adiciona validação pós-resposta da IA

