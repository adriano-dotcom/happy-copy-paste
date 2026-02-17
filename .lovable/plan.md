## Cancelar ligacoes ElevenLabs quando lead clicar "Foi engano"

### Problema

Quando o lead clica "Foi engano" no botao de triagem, a conversa e pausada e a tag "engano" e adicionada, mas qualquer qualificacao por voz (voice_qualification) pendente ou agendada e cancelada. Isso significa que a Iris nao pode ligar para o lead mesmo apos ele indicar que foi engano.

### Solucao

**Arquivo: `supabase/functions/nina-orchestrator/index.ts**`

No bloco que trata `btn_engano` (linha ~3982-4038), adicionar um passo para cancelar todas as voice_qualifications pendentes do contato:

```text
Apos pausar a conversa e antes de marcar a mensagem como processada:

1. Buscar voice_qualifications com status 'pending', 'scheduled' ou 'calling'
   para o contact_id da conversa
2. Atualizar todas para status = 'cancelled' com observations indicando
   "Cancelado: lead clicou Foi engano"
```

### Secao tecnica

Inserir o seguinte bloco apos a linha que pausa a conversa (apos linha 4005) e antes de adicionar a tag:

```typescript
// Cancel any pending/scheduled voice qualifications
const { data: pendingVqs } = await supabase
  .from('voice_qualifications')
  .select('id')
  .eq('contact_id', conversation.contact_id)
  .in('status', ['pending', 'scheduled', 'calling']);

if (pendingVqs && pendingVqs.length > 0) {
  await supabase
    .from('voice_qualifications')
    .update({
      status: 'cancelled',
      completed_at: new Date().toISOString(),
      observations: 'Cancelado automaticamente: lead clicou "Foi engano"',
    })
    .in('id', pendingVqs.map(v => v.id));
  console.log(`[Nina] Cancelled ${pendingVqs.length} pending voice qualifications (engano)`);
}
```

Tambem precisa garantir que o `VoiceCallTimelineCard` exiba o status `cancelled` corretamente:

**Arquivo: `src/components/VoiceCallTimelineCard.tsx**`

- Adicionar `cancelled` ao mapeamento de status: `cancelled → "Cancelada"`
- Usar cor cinza/slate para o badge de cancelado
- Adicionar ao `getStatusConfig` se necessario

### Resultado esperado

- Lead clica "Foi engano" → conversa pausada + tag adicionada + todas as VQs pendentes canceladas
- Timeline mostra "Cancelada" em vez de continuar mostrando "Agendada"
- Nenhuma ligacao sera feita para esse lead