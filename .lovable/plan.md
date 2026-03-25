

# Rastrear IDs do Pipedrive no CRM

## Resposta às perguntas

**1. Sim**, a edge function `sync-pipedrive` já recebe os IDs de Person, Organization e Lead nas respostas da API do Pipedrive. Todos os `createResult.data.id` são capturados.

**2. Parcialmente.** Hoje ela já salva `pipedrive_person_id` em `contacts` e `pipedrive_deal_id` (que é o lead ID) em `deals`. Faltam: `pipedrive_lead_id`, `pipedrive_org_id`, timestamps e status de erro em `contacts`.

## O que já existe vs. o que falta

| Campo | Já existe? | Onde |
|---|---|---|
| `pipedrive_person_id` | Sim | `contacts` (já salvo na linha 589) |
| `pipedrive_lead_id` | Não | — |
| `pipedrive_org_id` | Não | — |
| `sent_to_pipedrive_at` | Não | — |
| `pipedrive_sync_status` | Não | — |
| `pipedrive_sync_error` | Não | — |

## Plano

### 1. Migration SQL — Adicionar colunas em `contacts`

```sql
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS pipedrive_lead_id text,
  ADD COLUMN IF NOT EXISTS pipedrive_org_id text,
  ADD COLUMN IF NOT EXISTS sent_to_pipedrive_at timestamptz,
  ADD COLUMN IF NOT EXISTS pipedrive_sync_status text,
  ADD COLUMN IF NOT EXISTS pipedrive_sync_error text;
```

(`pipedrive_person_id` já existe.)

### 2. Atualizar Edge Function `sync-pipedrive`

No bloco de sucesso (após criar Person, Org e Lead), salvar todos os IDs em `contacts`:

```typescript
// Após Step 3 (Lead criado com sucesso)
await supabase.from('contacts').update({
  pipedrive_person_id: String(personId),
  pipedrive_org_id: organizationId ? String(organizationId) : null,
  pipedrive_lead_id: leadId || null,
  sent_to_pipedrive_at: new Date().toISOString(),
  pipedrive_sync_status: 'sent',
  pipedrive_sync_error: null,
}).eq('id', contactId);
```

No bloco de erro (catch), salvar o status de falha:

```typescript
// No catch geral
await supabase.from('contacts').update({
  pipedrive_sync_status: 'failed',
  pipedrive_sync_error: errorMessage,
  sent_to_pipedrive_at: new Date().toISOString(),
}).eq('id', contactId);
```

### 3. Atualizar view `leads_jarvis_v`

Recriar a view adicionando os novos campos:

```sql
CREATE OR REPLACE VIEW public.leads_jarvis_v AS
SELECT
  c.id, c.first_contact_date AS created_at,
  c.name AS nome, c.phone_number AS telefone, c.email,
  c.lead_source AS origem, c.vertical AS produto,
  c.city AS cidade, c.state AS uf,
  c.notes AS mensagem, c.lead_status AS status,
  c.pipedrive_person_id, c.pipedrive_lead_id, c.pipedrive_org_id,
  c.sent_to_pipedrive_at, c.pipedrive_sync_status
FROM public.contacts c
ORDER BY c.first_contact_date DESC;
```

O `GRANT SELECT TO anon` já está aplicado e se mantém automaticamente.

### 4. Nenhuma mudança de RLS necessária

A view é security definer e o GRANT já existe. Os novos campos ficam expostos na mesma view read-only.

## Resumo de arquivos

| Recurso | Ação |
|---|---|
| Migration SQL | `ALTER TABLE contacts` + `CREATE OR REPLACE VIEW` |
| `supabase/functions/sync-pipedrive/index.ts` | Persistir IDs + status no sucesso e erro |

