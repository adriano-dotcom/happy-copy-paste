

# Painel de Monitoramento: Auto-Voice on Window

## Objetivo

Adicionar um painel no dashboard de Voice (Iris) que mostra metricas especificas do fluxo "ligacao automatica ao abrir janela":
- Quantos leads dispararam o auto-voice
- Quantos foram efetivamente ligados
- Taxa de conversao do fluxo

## Problema atual

Nao existe como diferenciar ligacoes disparadas automaticamente (via auto-voice-on-window) das ligacoes manuais na tabela `voice_qualifications`. Todos os registros sao iguais.

## Implementacao

### 1. Migration: Adicionar coluna `trigger_source` em `voice_qualifications`

```sql
ALTER TABLE voice_qualifications 
ADD COLUMN trigger_source text NOT NULL DEFAULT 'manual';
```

Valores possiveis:
- `manual` — ligacao disparada manualmente
- `auto_window` — ligacao disparada pelo fluxo auto-voice-on-window

### 2. Atualizar `nina-orchestrator`

No trecho do auto-voice (~linha 3298), passar `trigger_source: 'auto_window'` no body da chamada ao `trigger-elevenlabs-call`:

```typescript
body: JSON.stringify({ 
  contact_id: conversation.contact_id, 
  force: true, 
  trigger_source: 'auto_window' 
})
```

### 3. Atualizar `trigger-elevenlabs-call`

Quando cria ou atualiza um `voice_qualification` no modo force, incluir o `trigger_source` recebido no body:

```typescript
// Na insercao de novo VQ (~linha 106)
trigger_source: body.trigger_source || 'manual',

// No update de VQ existente (~linha 128)
trigger_source: body.trigger_source || 'manual',
```

### 4. Atualizar `useVoiceDashboardMetrics`

Adicionar ao select da query o campo `trigger_source` e calcular metricas novas:
- `autoWindowTotal` — total de VQs com `trigger_source = 'auto_window'`
- `autoWindowCalled` — VQs auto_window que passaram de pending (status != pending/scheduled)
- `autoWindowCompleted` — VQs auto_window com status `completed`
- `autoWindowRate` — taxa de atendimento das ligacoes auto

### 5. Adicionar painel no `VoiceDashboard.tsx`

Novo bloco visual entre os KPIs e os graficos, com 4 mini-KPIs:

| Metrica | Descricao |
|---------|-----------|
| Disparos Auto | Total de ligacoes auto-window |
| Ligacoes Realizadas | Quantas foram efetivamente tentadas |
| Atendidas | Quantas foram completadas |
| Taxa Atendimento | % de atendimento das auto-calls |

Visual: card com fundo diferenciado (borda cyan) e icone de telefone + relogio.

## Arquivos modificados

1. **Migration SQL** — Adicionar `trigger_source` em `voice_qualifications`
2. **`supabase/functions/nina-orchestrator/index.ts`** — Enviar `trigger_source: 'auto_window'` na chamada
3. **`supabase/functions/trigger-elevenlabs-call/index.ts`** — Salvar `trigger_source` no VQ
4. **`src/hooks/useVoiceDashboardMetrics.ts`** — Incluir `trigger_source` na query e calcular metricas auto-window
5. **`src/components/VoiceDashboard.tsx`** — Renderizar painel de monitoramento auto-voice

## Nota

Registros criados antes desta mudanca terao `trigger_source = 'manual'` por default, entao o painel comecara zerado e ira acumular dados conforme novas ligacoes auto forem disparadas.

