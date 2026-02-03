
# Diagnóstico: Mensagem de Encerramento da Íris Não Sendo Enviada

## Problema Identificado

A automação "Última Chance (Janela Expirando)" **NÃO está enviando mensagens de encerramento** para conversas cuja janela de 24h expira **fora do horário comercial** (antes das 07:00 ou depois das 19:00 - horário de Brasília).

---

## Caso do José Francisco

| Item | Valor |
|------|-------|
| Janela abriu | 02/02 às 04:34 BRT |
| Janela expirou | 03/02 às 04:34 BRT |
| Horário ativo da automação | 07:00 - 19:00 BRT |
| Resultado | ❌ Mensagem NÃO enviada |

A margem de 30 minutos para envio (03:04 - 04:34 BRT) estava **completamente fora** do horário ativo da automação.

---

## Causa Raiz

```text
┌─────────────────────────────────────────────────────────────┐
│                    Linha do Tempo (BRT)                      │
├─────────────────────────────────────────────────────────────┤
│  00:00    03:04    04:34    07:00         19:00      23:59  │
│    │        │        │        │             │          │    │
│    │   ┌────┴────┐   │   ┌────┴─────────────┴───┐      │    │
│    │   │ JANELA  │   │   │   AUTOMAÇÃO ATIVA   │      │    │
│    │   │EXPIRANDO│   │   │   (07:00-19:00)     │      │    │
│    │   └─────────┘   │   └─────────────────────┘      │    │
│    │        ↑        ↑        ↑                       │    │
│    │   Margem 30min  │   Já expirou há 2h30           │    │
│    │   (03:04-04:34) │                                │    │
└─────────────────────────────────────────────────────────────┘
```

---

## Solução Proposta

### Opção 1: Estender Horário Ativo (Recomendado)

Alterar a configuração da automação para cobrir mais horas:

```sql
UPDATE followup_automations 
SET 
  active_hours_start = '05:00:00',
  active_hours_end = '22:00:00'
WHERE id = '5e9d40a7-d1ac-4092-a26e-c529acdec4f8';
```

**Prós:** Simples, cobre a maioria dos casos
**Contras:** Não cobre 100% das situações (madrugada)

---

### Opção 2: Modo 24h para Automação de Janela (Mais Robusto)

Modificar a lógica no `process-followups/index.ts` para que automações do tipo `window_expiring` **ignorem a restrição de horário ativo** quando a janela está prestes a expirar:

```typescript
// Linha ~948 em process-followups/index.ts
// ANTES:
if (currentTimeStr < startTime || currentTimeStr > endTime) {
  console.log(`[process-followups] Outside active hours...`);
  continue;
}

// DEPOIS:
// Para automações window_expiring, permitir execução 24h
if (automation.automation_type !== 'window_expiring') {
  if (currentTimeStr < startTime || currentTimeStr > endTime) {
    console.log(`[process-followups] Outside active hours...`);
    continue;
  }
}
```

**Prós:** Garante que TODAS as janelas expirando recebam a mensagem
**Contras:** Pode enviar mensagens de madrugada (pode ser indesejado)

---

### Opção 3: Ajustar Margem de Segurança (Paliativo)

Aumentar `minutes_before_expiry` de 30 para 180 (3 horas):

```sql
UPDATE followup_automations 
SET minutes_before_expiry = 180
WHERE id = '5e9d40a7-d1ac-4092-a26e-c529acdec4f8';
```

**Prós:** Captura janelas que expiram até 3h depois do horário comercial
**Contras:** Mensagem chega muito antes do vencimento real

---

## Recomendação

**Implementar Opção 2** (bypass de horário para `window_expiring`) + **Opção 1** (estender para 05:00-22:00 como fallback).

Isso garante:
1. Mensagens críticas de janela são sempre enviadas
2. Respeita horário comercial para outros tipos de follow-up
3. Cobertura máxima sem mudança drástica de comportamento

---

## Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `supabase/functions/process-followups/index.ts` | Bypass de active_hours para `window_expiring` |
| Configuração via SQL | Ajustar horário ativo para 05:00-22:00 |

---

## Validação Pós-Implementação

1. Monitorar logs: `[process-followups] Window for ... expires in X min`
2. Verificar `followup_logs` para automação "Última Chance"
3. Testar com conversa que tenha janela expirando fora do horário comercial
