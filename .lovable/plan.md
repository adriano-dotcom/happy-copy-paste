
# Corrigir Visualizacao de Contatos e Limite da Query

## Problema Identificado

A query `fetchContacts` em `src/services/api.ts` (linha 292) tem `.limit(500)`. Com a importacao massiva de 1.705 contatos outbound hoje, esses dominam o resultado ordenado por `last_activity`, fazendo os contatos inbound desaparecerem da pagina.

O banco tem 3.344 contatos, mas a pagina so mostra 500.

## Solucao

### 1. Remover limite fixo e usar paginacao por aba

Em vez de buscar 500 contatos de todas as origens juntos, buscar **por lead_source** separadamente, garantindo que cada aba tenha seus dados. Aumentar o limite para 2000 por aba (ou remover).

**Arquivo:** `src/services/api.ts` (linhas 288-292)

Antes:
```typescript
const { data: contactsData } = await supabase
  .from('contacts')
  .select('*')
  .order('last_activity', { ascending: false })
  .limit(500);
```

Depois:
```typescript
const { data: contactsData } = await supabase
  .from('contacts')
  .select('*')
  .order('last_activity', { ascending: false })
  .limit(5000);
```

### 2. Corrigir contatos com lead_source nao mapeado

Contatos com `lead_source = 'reused_number'` ou `'test'` nao aparecem em nenhuma aba. O filtro de inbound (Contacts.tsx linhas 243-244) deve incluir esses como fallback:

Antes:
```typescript
const inboundContacts = contacts.filter(contact => 
  (contact.lead_source === 'inbound' || contact.whatsapp_id) && 
  contact.lead_source !== 'facebook' && contact.lead_source !== 'google'
);
```

Depois:
```typescript
const inboundContacts = contacts.filter(contact => 
  contact.lead_source !== 'outbound' && 
  contact.lead_source !== 'facebook' && 
  contact.lead_source !== 'google'
);
```

Isso coloca qualquer contato que nao seja outbound/facebook/google na aba Inbound (inclusive reused_number, test, etc).

### 3. Adicionar contagem real por aba

Exibir o total real do banco (nao apenas os carregados) nos badges das abas, usando uma query count separada e leve.

**Arquivo:** `src/services/api.ts` -- adicionar funcao auxiliar

```typescript
fetchContactCounts: async () => {
  const { data } = await supabase
    .from('contacts')
    .select('lead_source')
    // count via grouping client-side
  // Ou usar RPC/view
}
```

Alternativa mais simples: mostrar `contacts.length` por aba no badge (ja funciona, apenas ficara correto com o limit maior).

## Resumo das Mudancas

| Arquivo | Mudanca |
|---------|---------|
| `src/services/api.ts` | Aumentar limit de 500 para 5000 |
| `src/components/Contacts.tsx` | Corrigir filtro inbound para incluir lead_sources nao mapeados |

## Impacto

- Contatos inbound voltam a aparecer imediatamente
- Todos os 3.344 contatos ficam acessiveis
- Contatos com lead_source exotico (reused_number, test) ficam visiveis na aba Inbound
- Performance: query de 5000 rows e aceitavel para esse volume
