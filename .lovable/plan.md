

# Validar conversation_id na Resposta do ElevenLabs

## Problema

Nas linhas 349-359 de `trigger-elevenlabs-call/index.ts`, apos receber resposta 200 da API do ElevenLabs, o codigo salva `data.conversation_id || null` e considera a chamada como iniciada — mesmo que `conversation_id` seja `undefined` ou vazio. Isso causa VQs travadas em `calling` sem forma de rastrear a chamada.

## Solucao

Adicionar validacao explicita: se a resposta nao contem `conversation_id`, tratar como erro e acionar o fluxo de retry.

### Arquivo: `supabase/functions/trigger-elevenlabs-call/index.ts`

**Substituir linhas 349-362** (bloco apos `response.ok` check):

```typescript
let data;
try { data = JSON.parse(responseText); } catch { data = {}; }

// Validate that ElevenLabs returned a conversation_id
if (!data.conversation_id) {
  console.error(`[ElevenLabs Call] ⚠️ API returned 200 but no conversation_id. Response:`, responseText);
  throw new Error('ElevenLabs API returned success but no conversation_id — call may not have been initiated');
}

await supabase
  .from('voice_qualifications')
  .update({
    elevenlabs_conversation_id: data.conversation_id,
    call_sid: data.callSid || data.call_sid || null,
    elevenlabs_agent_id: agentId,
  })
  .eq('id', vq.id);

console.log(`[ElevenLabs Call] ✅ Call initiated for ${leadName} (conv: ${data.conversation_id})`);
return { id: vq.id, status: 'calling', conversation_id: data.conversation_id };
```

A mudanca principal e o bloco `if (!data.conversation_id)` que faz `throw`, redirecionando para o `catch` existente que ja cuida de retry e max_attempts.

## Resultado Esperado

- Se ElevenLabs retornar 200 mas sem `conversation_id`, a VQ volta para `pending` com retry em 2h (ou `failed` se esgotou tentativas)
- O status `calling` so e mantido quando ha um `conversation_id` valido para rastrear
- Combinado com o cleanup automatico do `auto-voice-trigger`, elimina o risco de VQs travadas

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/trigger-elevenlabs-call/index.ts` | Validacao de `conversation_id` antes de confirmar chamada |

