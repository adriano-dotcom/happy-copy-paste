

# Corrigir Duplo pre_accept no Auto-Attendant

## Problema

O `AutoAttendantEngine` está disparando `pre_accept` duas vezes para a mesma chamada. Os logs mostram 2 boots simultâneos do `whatsapp-call-accept` com `pre_accept`, sendo que o segundo falha com erro 138008 (SDP invalido). Isso corrompe a sessão e a Meta encerra a chamada em 2 segundos.

## Investigacao Necessaria

Preciso verificar o `AutoAttendantEngine.tsx` para entender por que está chamando `pre_accept` duas vezes. Provavelmente há:
1. Dois event listeners disparando para o mesmo evento
2. Falta de guard/lock para evitar chamadas duplicadas
3. O componente renderizando duas vezes (StrictMode do React)

## Solucao Proposta

### Arquivo: `src/components/AutoAttendantEngine.tsx`

Adicionar um **lock de processamento** (via ref) para garantir que apenas um `pre_accept` seja enviado por chamada:

```typescript
const processingCallRef = useRef<string | null>(null);

// Antes de processar uma chamada inbound:
if (processingCallRef.current === callId) {
  console.log('[AutoAttendantEngine] Already processing call, skipping duplicate');
  return;
}
processingCallRef.current = callId;
```

### Arquivo: `supabase/functions/whatsapp-call-accept/index.ts`

Adicionar **idempotência server-side** como segunda camada de proteção:
- Antes de enviar `pre_accept` à Meta, verificar o status atual da chamada no banco
- Se já está `answered` ou se já recebeu um `pre_accept`, retornar sucesso sem reenviar

```typescript
// No início do handler de pre_accept:
if (call.status !== 'ringing') {
  console.log(`Call ${call_id} already ${call.status}, skipping pre_accept`);
  return Response({ success: true, step: 'pre_accept', skipped: true });
}

// Marcar como "pre_accepting" no banco para evitar race condition
const { data: updated, error: lockError } = await supabase
  .from('whatsapp_calls')
  .update({ status: 'pre_accepting' })
  .eq('id', call_id)
  .eq('status', 'ringing')  // CAS: só atualiza se ainda está ringing
  .select('id')
  .single();

if (!updated) {
  console.log(`Call ${call_id} already being processed, skipping`);
  return Response({ success: true, step: 'pre_accept', skipped: true });
}
```

## Resultado Esperado

- Cada chamada inbound recebe exatamente 1 `pre_accept` + 1 `accept`
- Chamadas duplicadas são bloqueadas tanto no frontend (ref lock) quanto no backend (CAS no banco)
- A sessão WebRTC com a Meta não é corrompida por SDPs conflitantes

| Arquivo | Mudança |
|---------|---------|
| `src/components/AutoAttendantEngine.tsx` | Lock de processamento por callId |
| `supabase/functions/whatsapp-call-accept/index.ts` | Idempotência com CAS (compare-and-swap) no status |

