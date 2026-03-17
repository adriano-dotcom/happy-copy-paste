

# Adicionar etiqueta "Leads Campanha Iris" ao criar Lead no Pipedrive

## Problema
Ao enviar um contato para o Pipedrive, o Lead é criado sem nenhuma etiqueta (label). O usuário quer que todo Lead criado receba automaticamente a etiqueta "Leads Campanha Iris".

## Solução

### `supabase/functions/sync-pipedrive/index.ts`

A API do Pipedrive suporta `label_ids` no endpoint de Leads. Precisamos:

1. **Buscar ou criar a label** "Leads Campanha Iris" via `GET /leadLabels` e, se não existir, `POST /leadLabels`
2. **Incluir `label_ids`** no payload de criação do Lead

Adicionar uma função auxiliar `getOrCreateLeadLabel` que:
- Faz `GET /leadLabels?api_token=...` para listar labels existentes
- Procura por nome "Leads Campanha Iris"
- Se não encontrar, cria via `POST /leadLabels` com `{ name: "Leads Campanha Iris", color: "blue" }`
- Retorna o `id` da label

Na função `createPipedriveLead`, antes de criar o lead:
- Chamar `getOrCreateLeadLabel`
- Adicionar `label_ids: [labelId]` ao `leadData`

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/sync-pipedrive/index.ts` | Adicionar função `getOrCreateLeadLabel` + incluir `label_ids` na criação do Lead |

