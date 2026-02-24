
# Encerrar Ligacoes Travadas e Prevenir Travamentos Futuros

## Situacao Atual

Encontrei 2 ligacoes travadas na Iris:

| Contato | Status | Desde | Conversation ID |
|---------|--------|-------|-----------------|
| Carla | `calling` | 21/Feb (3 dias) | Nenhum |
| Luiz Felipe | `ended` | 17/Feb (7 dias) | Nenhum |

Ambas nao possuem `elevenlabs_conversation_id`, indicando que a chamada nunca conectou ao ElevenLabs ou o webhook de retorno nunca foi recebido.

## Causa Raiz

O fluxo `trigger-elevenlabs-call` muda o status para `calling` na linha 283, mas se a API do ElevenLabs falhar silenciosamente (retorna 200 mas nao inicia a chamada) ou se o webhook `elevenlabs-post-call-webhook` nunca for chamado, o status fica travado indefinidamente.

## Plano de Acao

### Passo 1: Encerrar as Ligacoes Travadas (Imediato)

Criar uma edge function temporaria `cleanup-stuck-vqs` que:
- Busca VQs com status `calling` ou `ended` sem `completed_at`
- Atualiza para `cancelled` com observacao explicativa

### Passo 2: Adicionar Timeout Automatico no `auto-voice-trigger`

No `auto-voice-trigger/index.ts`, adicionar logica para detectar e cancelar VQs travadas:
- Se status = `calling` e `called_at` foi ha mais de 30 minutos, marcar como `failed` e agendar retry
- Se status = `calling` e `called_at` foi ha mais de 2 horas, marcar como `not_contacted`

Isso garante que nenhuma ligacao fique travada no futuro.

### Arquivo: `supabase/functions/auto-voice-trigger/index.ts`

Adicionar no inicio da funcao, antes do processamento normal:

```text
// Cleanup stuck VQs (calling for > 30 min without completion)
const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
const { data: stuckVqs } = await supabase
  .from('voice_qualifications')
  .select('id, attempt_number, max_attempts, called_at')
  .eq('status', 'calling')
  .lt('called_at', thirtyMinAgo);

for (const stuck of stuckVqs || []) {
  const newAttempt = (stuck.attempt_number || 1) + 1;
  if (newAttempt > (stuck.max_attempts || 3)) {
    await supabase.from('voice_qualifications').update({
      status: 'not_contacted',
      completed_at: new Date().toISOString(),
      observations: 'Ligacao travada - sem resposta do ElevenLabs apos 30min'
    }).eq('id', stuck.id);
  } else {
    const retryAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await supabase.from('voice_qualifications').update({
      status: 'pending',
      attempt_number: newAttempt,
      scheduled_for: retryAt.toISOString(),
      observations: `Tentativa ${stuck.attempt_number}: travada, reagendada`
    }).eq('id', stuck.id);
  }
  console.log(`[Auto Voice] Cleaned up stuck VQ ${stuck.id}`);
}
```

### Passo 3: Encerrar as 2 VQs Atuais

Dentro da mesma logica acima, as 2 VQs travadas (Carla e Luiz Felipe) serao automaticamente detectadas e encerradas no proximo ciclo do cron.

Adicionalmente, vou incluir limpeza de VQs com status `ended` sem `completed_at`:

```text
// Also clean up VQs stuck in 'ended' without completed_at
const { data: endedStuck } = await supabase
  .from('voice_qualifications')
  .select('id')
  .eq('status', 'ended')
  .is('completed_at', null);

for (const e of endedStuck || []) {
  await supabase.from('voice_qualifications').update({
    status: 'cancelled',
    completed_at: new Date().toISOString(),
    observations: 'Encerrada automaticamente - status ended sem finalizacao'
  }).eq('id', e.id);
  console.log(`[Auto Voice] Cleaned up ended VQ ${e.id}`);
}
```

## Resultado Esperado

- As 2 ligacoes travadas serao canceladas automaticamente no proximo ciclo
- Futuras ligacoes que travarem serao detectadas e tratadas em ate 30 minutos
- VQs em status `ended` sem finalizacao tambem serao limpas automaticamente
