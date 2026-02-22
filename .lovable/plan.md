

# Mostrar Todos os Contatos (3.347)

## Problema

A query atual busca no maximo 1.000 outbound, mas existem 2.413 no banco. Resultado: 1.413 contatos outbound importados nao aparecem na pagina.

| lead_source | No banco | Carregados | Faltando |
|-------------|----------|------------|----------|
| outbound | 2.413 | 1.000 | 1.413 |
| inbound | 887 | 887 | 0 |
| facebook | 12 | 12 | 0 |
| google | 33 | 33 | 0 |
| outros | 2 | 2 | 0 |
| **Total** | **3.347** | **1.934** | **1.413** |

## Solucao

Fazer multiplas queries paginadas para outbound (que ultrapassa 1.000) e manter as demais como estao.

### Arquivo: `src/services/api.ts`

Substituir a query unica de outbound por 3 queries de 1.000 cada (cobrindo ate 3.000 outbound), e manter inbound/facebook/google iguais:

```typescript
const [inboundResult, outbound1, outbound2, outbound3, facebookResult, googleResult] = await Promise.all([
  supabase.from('contacts').select('*')
    .or('lead_source.eq.inbound,lead_source.eq.reused_number,lead_source.eq.test,lead_source.is.null')
    .order('last_activity', { ascending: false })
    .limit(1000),
  supabase.from('contacts').select('*')
    .eq('lead_source', 'outbound')
    .order('last_activity', { ascending: false })
    .range(0, 999),
  supabase.from('contacts').select('*')
    .eq('lead_source', 'outbound')
    .order('last_activity', { ascending: false })
    .range(1000, 1999),
  supabase.from('contacts').select('*')
    .eq('lead_source', 'outbound')
    .order('last_activity', { ascending: false })
    .range(2000, 2999),
  supabase.from('contacts').select('*')
    .eq('lead_source', 'facebook')
    .order('last_activity', { ascending: false })
    .limit(100),
  supabase.from('contacts').select('*')
    .eq('lead_source', 'google')
    .order('last_activity', { ascending: false })
    .limit(100),
]);

const contactsData = [
  ...(inboundResult.data || []),
  ...(outbound1.data || []),
  ...(outbound2.data || []),
  ...(outbound3.data || []),
  ...(facebookResult.data || []),
  ...(googleResult.data || []),
];
```

Isso garante ate **1.000 inbound + 3.000 outbound + 100 facebook + 100 google = 4.200 contatos**, cobrindo todos os 3.347 atuais com margem de crescimento.

### Nenhuma mudanca em `Contacts.tsx`

Os filtros por aba ja estao corretos.

## Resultado Esperado

Todos os 3.347 contatos visiveis na pagina, incluindo os importados e os que receberam templates.

## Arquivo modificado

| Arquivo | Mudanca |
|---------|---------|
| `src/services/api.ts` | Paginar query outbound em 3 blocos de 1.000 |
