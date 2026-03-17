

# Criar Lead + Contato no Pipedrive ao Enviar

## Situação Atual
A função `sync-pipedrive` cria apenas um **Person** (contato) e uma **Note** no Pipedrive. Não cria Lead nem Deal.

## Mudança Proposta

### `supabase/functions/sync-pipedrive/index.ts`

Após criar/atualizar o Person, adicionar dois passos:

1. **Criar Lead no Pipedrive** via `POST /leads` com:
   - `title`: nome do contato
   - `person_id`: ID do person criado
   - `label_ids`: tag selecionada (se houver)
   - `expected_close_date`: opcional

2. **Criar Organization** (se `contact.company` existir) via `POST /organizations` e vincular ao Person

### Fluxo final:
```text
Botão "Enviar para Pipedrive"
  → Cria/atualiza Person (já existe)
  → Cria Organization se tiver empresa (novo)
  → Cria Lead vinculado ao Person (novo)
  → Cria Note com resumo (já existe)
```

### Detalhes da API Pipedrive:
- `POST /leads`: `{ title, person_id, organization_id?, label_ids?, note? }`
- `POST /organizations`: `{ name, address? }`

O `pipedrive_default_pipeline_id` já existe nas settings e pode ser usado caso queira criar um Deal em vez de Lead. Como o Pipedrive diferencia Lead (pré-qualificado) de Deal (em negociação), vamos criar como **Lead** que é o fluxo natural.

### Armazenamento
- Salvar `pipedrive_lead_id` no deal local (campo `pipedrive_deal_id` já existe, pode reutilizar ou criar campo específico)

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/sync-pipedrive/index.ts` | Adicionar criação de Organization + Lead após criar Person |

