

# Remover limite de 1000 deals no Kanban

## Problema
O Supabase tem um limite padrão de 1000 linhas por query. A função `fetchPipeline` em `src/services/api.ts` não define um `.limit()` explícito, então retorna no máximo 1000 deals.

## Solução
Implementar paginação na query para buscar **todos** os deals, independente da quantidade. Vamos usar um loop que busca em lotes de 1000 até não haver mais resultados.

## Alteração

### `src/services/api.ts` — função `fetchPipeline` (linha ~1183)
- Substituir a query única por um loop de paginação que busca 1000 registros por vez usando `.range(from, to)`
- Concatenar todos os resultados até que um lote retorne menos de 1000 registros
- Manter o mesmo mapeamento de dados e busca de conversations (também paginada se necessário, já que `contactIds` pode exceder 1000)

```text
Loop:
  fetch deals .range(offset, offset+999)
  append to allDeals
  if batch < 1000 → break
  offset += 1000

Then fetch conversations in batches of 300 IDs (pattern already used in Contacts)
```

| Arquivo | Mudança |
|---------|---------|
| `src/services/api.ts` | Paginar `fetchPipeline` para buscar todos os deals |

