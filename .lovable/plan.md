

# Corrigir owner dos deals Outbound/Atlas → Alessandro

## Diagnóstico

| Agente | Distribuição | Owner correto |
|--------|-------------|---------------|
| Atlas (prospecção) | fixed | Alessandro |
| Sofia (default) | round_robin | Adriana / Leonardo |

O backfill anterior tratou **todos** os deals sem owner como órfãos da Sofia e distribuiu 50/50 entre Adriana e Leonardo. Porém, **1.213 deals** são de contatos outbound atendidos pelo Atlas — esses deveriam ter Alessandro como responsável.

## Plano

### 1. Backfill — Corrigir owner dos deals outbound/Atlas

Usar o insert tool para executar:

```sql
UPDATE deals d
SET owner_id = '91ec229f-d63d-4dab-96e5-cc809f17c4e3'  -- Alessandro
FROM contacts c
JOIN conversations conv ON conv.contact_id = c.id
WHERE d.contact_id = c.id
  AND c.lead_source = 'outbound'
  AND conv.current_agent_id = '9a9aa2b3-6fce-4a02-b402-26850d6f0f20'  -- Atlas
  AND d.owner_id != '91ec229f-d63d-4dab-96e5-cc809f17c4e3';
```

Isso corrige 1.213 deals para ter Alessandro como responsável.

### 2. Nenhuma mudança de view/migration/código

A `leads_jarvis_v` e `outbound_sends_daily_v` já fazem JOIN em `deals.owner_id → team_members`. Após o backfill, automaticamente mostrarão Alessandro como responsável para todos os outbound.

## Resultado esperado

| Antes | Depois |
|-------|--------|
| Adriana: 709 envios outbound | Adriana: ~0 envios outbound |
| Leonardo: 716 envios outbound | Leonardo: ~0 envios outbound |
| Alessandro: 392 envios outbound | Alessandro: ~1.900 envios outbound |
| Sem responsável: 80 | Sem responsável: 80 (sem conversa/deal) |

