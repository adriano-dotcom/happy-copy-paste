

## Plano: Corrigir Status de Chamadas Não Atendidas vs Canceladas

### Problema Identificado

O sistema está mostrando "Cancelada" para chamadas que deveriam mostrar "Não Atendeu". Isso acontece porque a API4Com envia `ORIGINATOR_CANCEL` para ambos os casos:

1. **Cancelamento manual**: operador clicou em desligar antes de atender
2. **Não atendeu**: lead não atendeu e a chamada expirou/foi encerrada

### Dados de Análise

| Tempo de Chamada | Quantidade | Cenário Provável |
|------------------|------------|------------------|
| 4-12 segundos | 5 | Cancelado pelo operador |
| 20-45 segundos | 5 | Não atendeu (timeout normal) |

### Solução

Usar o **tempo de chamada** para diferenciar:
- Se `call_time >= 25 segundos` → "Não Atendeu" (lead não atendeu)
- Se `call_time < 25 segundos` → "Cancelada" (operador desistiu)

O valor de 25 segundos é baseado no tempo típico de ring (5-6 toques = ~25-30s).

---

### Alterações no Arquivo

**Arquivo:** `supabase/functions/api4com-webhook/index.ts`

#### Alteração na linha ~446-449

**De:**
```typescript
if (hangupCauseLower.includes('originator_cancel') || hangupCauseLower === 'originator_cancel') {
  // Cancelled by the operator before answered
  status = duration > 0 ? 'completed' : 'cancelled';
  console.log('[api4com-webhook] 📱 Originator cancel detected, status:', status);
}
```

**Para:**
```typescript
if (hangupCauseLower.includes('originator_cancel') || hangupCauseLower === 'originator_cancel') {
  // ORIGINATOR_CANCEL can mean two things:
  // 1. Operator cancelled manually (quick cancel, < 25s)
  // 2. Lead didn't answer and call timed out (ring time >= 25s)
  
  // Calculate ring time from callLog if available, or use webhook timestamps
  const ringTimeThreshold = 25; // seconds - typical ring time before voicemail
  
  // We'll determine this later when we have the call log
  // For now, mark as 'pending_classification' and resolve below
  status = duration > 0 ? 'completed' : 'pending_originator_cancel';
  console.log('[api4com-webhook] 📱 Originator cancel detected, will classify based on ring time');
}
```

#### Adicionar classificação baseada no tempo de ring (após linha ~477)

Após encontrar o callLog, adicionar lógica para classificar corretamente:

```typescript
const callLog = await findCallLog();

if (callLog) {
  // Resolve pending_originator_cancel based on ring time
  if (status === 'pending_originator_cancel') {
    const startTime = new Date(callLog.started_at).getTime();
    const endTime = Date.now();
    const ringTimeSeconds = (endTime - startTime) / 1000;
    
    // If call rang for >= 25 seconds, it's likely the lead didn't answer
    // If < 25 seconds, the operator probably cancelled manually
    const ringTimeThreshold = 25;
    
    if (ringTimeSeconds >= ringTimeThreshold) {
      status = 'no_answer';
      console.log(`[api4com-webhook] 📱 ORIGINATOR_CANCEL classified as no_answer (ring time: ${ringTimeSeconds.toFixed(1)}s >= ${ringTimeThreshold}s)`);
    } else {
      status = 'cancelled';
      console.log(`[api4com-webhook] 📱 ORIGINATOR_CANCEL classified as cancelled (ring time: ${ringTimeSeconds.toFixed(1)}s < ${ringTimeThreshold}s)`);
    }
  }
  // ... resto do código existente
}
```

---

### Visual Após Correção

| Antes | Depois |
|-------|--------|
| Cancelada (45s) | Não Atendeu ✓ |
| Cancelada (40s) | Não Atendeu ✓ |
| Cancelada (7s) | Cancelada ✓ |
| Cancelada (4s) | Cancelada ✓ |

---

### Fluxo de Decisão

```text
channel-hangup recebido
         ↓
hangupCause = ORIGINATOR_CANCEL?
         ↓ SIM
Calcular tempo de ring (ended_at - started_at)
         ↓
Ring time >= 25s? ───────→ status = "no_answer" (Não Atendeu)
         ↓ NÃO
status = "cancelled" (Cancelada)
```

---

### Resumo das Alterações

| Linha | Alteração |
|-------|-----------|
| ~446-449 | Alterar classificação de ORIGINATOR_CANCEL para usar marcador temporário |
| ~477-490 | Adicionar lógica de classificação baseada no tempo de ring |

---

### Seção Técnica

**Por que 25 segundos?**

O tempo típico de ring antes de cair na caixa postal ou encerrar é:
- 5-6 toques × 5 segundos/toque = 25-30 segundos
- Chamadas canceladas manualmente geralmente são encerradas em menos de 15 segundos

**Parâmetro configurável:**

O threshold de 25 segundos pode ser ajustado se necessário. Valores alternativos:
- 20s: mais agressivo em classificar como "não atendeu"
- 30s: mais conservador, só classifica após ring completo

**Compatibilidade:**

Esta alteração não afeta outros hangup causes (NORMAL_CLEARING, NO_ANSWER, BUSY, etc.) que já funcionam corretamente.

