

## Botao Pausar/Retomar Automacao de Ligacoes no Voice Dashboard

### O que sera feito

Adicionar um botao toggle no header do Voice Dashboard (`/voice-dashboard`) que permite pausar e retomar a automacao `auto-voice-trigger` sem precisar acessar o console. Quando pausada, a edge function verifica o flag no banco e aborta silenciosamente.

### Mudancas

**1. Migração de banco - adicionar coluna `auto_voice_paused` na tabela `nina_settings`**

```sql
ALTER TABLE nina_settings ADD COLUMN auto_voice_paused boolean NOT NULL DEFAULT false;
ALTER TABLE nina_settings ADD COLUMN auto_voice_paused_at timestamptz;
ALTER TABLE nina_settings ADD COLUMN auto_voice_paused_by text;
```

**2. Edge function `supabase/functions/auto-voice-trigger/index.ts`**

Adicionar verificacao logo apos o check de horario comercial:

```typescript
// Check if automation is paused
const { data: settings } = await supabase
  .from('nina_settings')
  .select('auto_voice_paused')
  .limit(1)
  .single();

if (settings?.auto_voice_paused) {
  console.log('[Auto Voice] Automation is PAUSED. Skipping.');
  return new Response(JSON.stringify({ status: 'paused' }), { ... });
}
```

**3. `src/components/VoiceDashboard.tsx` - botao no header**

Adicionar ao lado do titulo um botao com icone `Pause`/`Play` que:
- Busca o estado atual de `auto_voice_paused` da tabela `nina_settings` via useQuery
- Ao clicar, faz update direto na tabela `nina_settings` 
- Mostra estado visual claro: verde "Automacao Ativa" / vermelho "Automacao Pausada"
- Inclui confirmacao antes de pausar (toast de confirmacao)

Visual do botao no header:

```
Ligacoes IA -- Iris        [⏸ Pausar Automacao]   (quando ativa)
Ligacoes IA -- Iris        [▶ Retomar Automacao]   (quando pausada)
```

Quando pausada, exibe um banner amarelo abaixo do header:
```
⚠ Automacao de ligacoes PAUSADA desde 17/02 18:30. Nenhuma ligacao automatica sera feita.
```

### Secao tecnica

**Arquivos modificados:**
1. `supabase/functions/auto-voice-trigger/index.ts` - adicionar check de `auto_voice_paused` no inicio
2. `src/components/VoiceDashboard.tsx` - adicionar botao toggle + banner de status + query/mutation

**Logica do toggle no VoiceDashboard:**
```typescript
const { data: voiceSettings, refetch } = useQuery({
  queryKey: ['voice-automation-status'],
  queryFn: async () => {
    const { data } = await supabase
      .from('nina_settings')
      .select('id, auto_voice_paused, auto_voice_paused_at')
      .limit(1).single();
    return data;
  },
});

const togglePause = async () => {
  const newState = !voiceSettings?.auto_voice_paused;
  await supabase.from('nina_settings').update({
    auto_voice_paused: newState,
    auto_voice_paused_at: newState ? new Date().toISOString() : null,
  }).eq('id', voiceSettings.id);
  refetch();
  toast.success(newState ? 'Automacao pausada' : 'Automacao retomada');
};
```

**Migracao SQL:**
```sql
ALTER TABLE nina_settings 
  ADD COLUMN IF NOT EXISTS auto_voice_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_voice_paused_at timestamptz;
```

