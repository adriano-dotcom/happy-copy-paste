

## Corrigir webhook ElevenLabs para tratar `call_initiation_failure`

### Problema encontrado

Nos logs, a ElevenLabs enviou um evento do tipo `call_initiation_failure` com `failure_reason: "unknown"` e SIP code 403 (operadora rejeitou a chamada). O webhook NAO filtra esse tipo de evento, entao ele caiu no fluxo de "completed" e salvou o registro com `status: completed` mas sem nenhum dado (sem resumo, sem qualificacao, sem transcrição).

**Log real:**
```
type: "call_initiation_failure"
failure_reason: "unknown"
SipResponseCode: "403"
```

O card aparece na timeline como "Ligacao IA Concluida" mas sem nenhuma informacao util.

### Solucao

**Arquivo: `supabase/functions/elevenlabs-post-call-webhook/index.ts`**

Adicionar tratamento para o evento `call_initiation_failure` ANTES do processamento normal, na mesma area onde ja filtramos `post_call_audio`:

1. Detectar `payload.type === 'call_initiation_failure'`
2. Extrair o `conversation_id` e `vq_id` das dynamic_variables
3. Atualizar o voice_qualification com status `failed` (nao `completed`)
4. Aplicar a mesma logica de retentativa que ja existe para `no_answer` (reagendar em 2h se ainda tem tentativas)
5. Salvar a razao da falha nas observations

### Mudancas tecnicas

```typescript
// Novo bloco apos o filtro de post_call_audio:
if (payload.type === 'call_initiation_failure') {
  const failData = payload.data || payload;
  const convId = failData.conversation_id || payload.conversation_id;
  const dynVars = failData.metadata?.dynamic_variables 
    || payload.dynamic_variables || {};
  const vqId = dynVars.vq_id;
  const failReason = failData.failure_reason || 'unknown';
  
  // Buscar VQ por vq_id ou conversation_id
  // Tratar como no_answer (reagendar ou marcar not_contacted)
  // Salvar observations com o motivo da falha
}
```

Isso vai fazer com que:
- Chamadas que a operadora rejeita (SIP 403) sejam tratadas como falha
- O card na timeline mostre "Falha na Ligacao" em vez de "Concluida"
- A retentativa em 2h seja acionada corretamente
