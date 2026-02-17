

## Corrigir estrutura do payload no Post-Call Webhook

### Problema
O webhook da ElevenLabs envia o payload com os dados dentro de `payload.data`, mas o codigo atual busca em `payload` diretamente. Resultado: `conversation_id` e `vq_id` nao sao encontrados e o webhook retorna 400.

### Evidencia dos logs
```
Payload: {"type":"post_call_transcription","data":{"conversation_id":"conv_9101khp7rsgfeb4s27k6w2ccp6jf","transcript":[...],...}}
Erro: "No vq_id or conversation_id in payload"
```

### Mudancas

**Arquivo: `supabase/functions/elevenlabs-post-call-webhook/index.ts`**

1. **Extrair dados de `payload.data`** em vez de `payload` diretamente:
   - `conversation_id` → `payload.data.conversation_id`
   - `transcript` → `payload.data.transcript`
   - `analysis` → `payload.data.analysis || payload.data.data_collection_results`
   - `dynamic_variables` → `payload.data.conversation_initiation_client_data?.dynamic_variables`
   - `call_status` → `payload.data.call_status || payload.data.status`

2. **Ignorar payloads do tipo `post_call_audio`** — o webhook recebe 2 chamadas: uma com transcrição (`post_call_transcription`) e outra com audio (`post_call_audio`). Devemos processar apenas a transcrição.

3. **Manter fallback** para a estrutura antiga (campos no root do payload) por segurança.

### Codigo

```text
// Extrair tipo do evento
const eventType = payload.type;

// Ignorar eventos de audio — so processar transcricao
if (eventType === 'post_call_audio') {
  return new Response(JSON.stringify({ status: 'audio_ignored' }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

// Dados podem vir no root ou dentro de payload.data
const data = payload.data || payload;

const conversationId = data.conversation_id || payload.conversation_id;
const transcript = data.transcript || data.full_transcript || payload.transcript || '';
const analysis = data.analysis || data.data_collection_results || payload.analysis || {};
const dynamicVars = data.conversation_initiation_client_data?.dynamic_variables 
  || payload.conversation_initiation_client_data?.dynamic_variables 
  || payload.dynamic_variables || {};
const callStatus = data.call_status || data.status || payload.call_status || 'completed';

const vqId = dynamicVars.vq_id;
const leadId = dynamicVars.lead_id;
```

### Resultado esperado
- Webhook processa corretamente o payload da ElevenLabs
- Voice qualification e atualizada com transcript, resumo e resultado
- Timeline do chat mostra os dados da ligacao em tempo real
