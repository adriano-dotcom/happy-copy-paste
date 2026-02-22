

# Corrigir Contatos Inbound - Limite Real do Supabase

## Problema Raiz

O `.limit(5000)` nao funciona como esperado porque o Supabase tem um limite padrao de **1000 linhas por request** (configurado no `supabase/config.toml`). Dos 1000 retornados, 996 sao outbound e apenas 4 sao inbound.

## Solucao

Fazer **duas queries separadas** em vez de uma unica: uma para inbound e outra para outbound. Isso garante que cada aba tenha seus proprios dados sem competir pelo mesmo limite.

### Arquivo: `src/services/api.ts`

Substituir a query unica por queries paralelas por `lead_source`:

```typescript
// Buscar contatos por grupo em paralelo para evitar limite de 1000 rows
const [inboundResult, outboundResult, facebookResult, googleResult] = await Promise.all([
  supabase
    .from('contacts')
    .select('*')
    .or('lead_source.eq.inbound,lead_source.eq.reused_number,lead_source.eq.test,lead_source.is.null')
    .order('last_activity', { ascending: false })
    .limit(1000),
  supabase
    .from('contacts')
    .select('*')
    .eq('lead_source', 'outbound')
    .order('last_activity', { ascending: false })
    .limit(1000),
  supabase
    .from('contacts')
    .select('*')
    .eq('lead_source', 'facebook')
    .order('last_activity', { ascending: false })
    .limit(100),
  supabase
    .from('contacts')
    .select('*')
    .eq('lead_source', 'google')
    .order('last_activity', { ascending: false })
    .limit(100),
]);

const contactsData = [
  ...(inboundResult.data || []),
  ...(outboundResult.data || []),
  ...(facebookResult.data || []),
  ...(googleResult.data || []),
];
```

Isso retorna ate **1000 inbound + 1000 outbound + 100 facebook + 100 google** = ate 2200 contatos, cobrindo todos os segmentos.

### Nenhuma mudanca em `Contacts.tsx`

O filtro por aba ja esta correto apos a ultima edicao.

## Resultado Esperado

| Aba | Antes | Depois |
|-----|-------|--------|
| Inbound | 4 | 886 (884 inbound + reused_number + test) |
| Outbound | 996 | 1000 (mais recentes) |
| Facebook | 0 | 12 |
| Google | 0 | 33 |

## Mudanca Unica

| Arquivo | Mudanca |
|---------|---------|
| `src/services/api.ts` | Substituir query unica por 4 queries paralelas por lead_source |
