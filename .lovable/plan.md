

# Substituir setTimeout por Agendamento via scheduled_for

## Problema

No `nina-orchestrator` (linha 3302-3304), quando `auto_voice_delay_seconds > 0`, usa-se `setTimeout` para atrasar a chamada. Se o runtime Deno encerrar antes do timeout disparar, a ligacao e perdida silenciosamente.

## Solucao

Em vez de chamar `trigger-elevenlabs-call` diretamente (com ou sem delay), o orchestrator apenas cria um registro em `voice_qualifications` com:
- `status: 'scheduled'`
- `scheduled_for: now() + delay`
- `trigger_source: 'auto_window'`

O cron `auto-voice-trigger` (que ja roda periodicamente) sera atualizado para tambem processar VQs com `status = 'scheduled'` cujo `scheduled_for <= now()`.

## Mudancas

### 1. `nina-orchestrator/index.ts` (linhas 3286-3313)

Substituir todo o bloco de `triggerCall` + `setTimeout` por uma insercao simples:

```typescript
if (!recentVq) {
  const delaySeconds = settings?.auto_voice_delay_seconds || 0;
  const scheduledFor = new Date(Date.now() + delaySeconds * 1000).toISOString();

  const { error: insertErr } = await supabase
    .from('voice_qualifications')
    .insert({
      contact_id: conversation.contact_id,
      status: 'scheduled',
      scheduled_for: scheduledFor,
      attempt_number: 1,
      max_attempts: 3,
      trigger_source: 'auto_window',
    });

  if (insertErr) {
    console.error('[Nina] Auto-voice: failed to schedule VQ:', insertErr);
  } else {
    console.log(`[Nina] Auto-voice: scheduled VQ for contact ${conversation.contact_id} at ${scheduledFor}`);
  }
}
```

Remove-se: `fetch()`, `setTimeout()`, `triggerCall()`, e as referencias a `supabaseUrl`/`supabaseServiceKey` deste bloco.

### 2. `auto-voice-trigger/index.ts`

Adicionar um segundo fluxo no inicio (antes do fluxo existente de "leads inativos") que busca VQs agendados:

```typescript
// Process scheduled auto-window VQs
const { data: scheduledVqs } = await supabase
  .from('voice_qualifications')
  .select('id, contact_id')
  .eq('status', 'scheduled')
  .eq('trigger_source', 'auto_window')
  .lte('scheduled_for', new Date().toISOString())
  .limit(10);

if (scheduledVqs && scheduledVqs.length > 0) {
  for (const vq of scheduledVqs) {
    // Mark as pending to avoid re-processing
    await supabase
      .from('voice_qualifications')
      .update({ status: 'pending' })
      .eq('id', vq.id);

    // Trigger the call
    await supabase.functions.invoke('trigger-elevenlabs-call', {
      body: { contact_id: vq.contact_id, force: true, trigger_source: 'auto_window' },
    });
  }
}
```

### 3. `trigger-elevenlabs-call/index.ts`

No bloco `force` (linha 78-84), quando ja existe um VQ para o contato, reaproveitar esse VQ em vez de criar um novo -- evitando duplicatas. O VQ ja tera `trigger_source` correto pois foi criado pelo orchestrator.

## Fluxo Resultante

```text
Lead envia mensagem
  -> nina-orchestrator detecta janela aberta
  -> INSERT voice_qualifications (status='scheduled', scheduled_for=now+delay)
  -> Retorna imediatamente (sem setTimeout)

Cron auto-voice-trigger (a cada minuto)
  -> SELECT VQs com status='scheduled' AND scheduled_for <= now()
  -> UPDATE status='pending'
  -> Invoke trigger-elevenlabs-call
  -> Ligacao e feita
```

## Arquivos modificados

1. **`supabase/functions/nina-orchestrator/index.ts`** -- Remover fetch/setTimeout, inserir VQ agendado
2. **`supabase/functions/auto-voice-trigger/index.ts`** -- Processar VQs scheduled antes do fluxo existente
3. **`supabase/functions/trigger-elevenlabs-call/index.ts`** -- Ajuste menor para reaproveitar VQ existente

## Beneficios

- Ligacoes nunca se perdem por encerramento do runtime
- Delay e controlado pelo banco (scheduled_for), nao por timers em memoria
- Auto-voice-trigger ja roda como cron, sem necessidade de nova infraestrutura
- Registro de auditoria completo (VQ criado no momento da decisao, nao no momento da chamada)
