

# Dashboard MTD — Responsável por Lead

## Diagnóstico

O responsável do lead **já existe** no banco, mas não está na tabela `contacts`. O caminho é:

```text
contacts.id → deals.contact_id → deals.owner_id → team_members.id/name/email
```

- `deals.owner_id` (uuid) referencia `team_members.id`
- A atribuição acontece automaticamente via trigger `create_deal_for_new_contact` + função `get_next_deal_owner`
- O `team_members` tem `name` e `email` (via auth)

**Não é necessário criar colunas novas em `contacts`.** Basta fazer JOIN na view.

## Plano

### 1. Migration SQL — Atualizar VIEW `leads_jarvis_v`

Recriar a view com LEFT JOIN em `deals` e `team_members` para expor o responsável:

```sql
CREATE OR REPLACE VIEW public.leads_jarvis_v AS
SELECT
  c.id,
  c.first_contact_date AS created_at,
  c.name AS nome,
  c.phone_number AS telefone,
  c.email,
  c.lead_source AS origem,
  c.vertical AS produto,
  c.city AS cidade,
  c.state AS uf,
  c.notes AS mensagem,
  c.lead_status AS status,
  c.pipedrive_person_id,
  c.pipedrive_lead_id,
  c.pipedrive_org_id,
  c.sent_to_pipedrive_at,
  c.pipedrive_sync_status,
  -- Responsável (do deal vinculado)
  tm.id AS responsavel_id,
  tm.name AS responsavel_nome,
  tm.email AS responsavel_email,
  d.created_at AS responsavel_atribuido_em
FROM public.contacts c
LEFT JOIN public.deals d ON d.contact_id = c.id
LEFT JOIN public.team_members tm ON tm.id = d.owner_id
ORDER BY c.first_contact_date DESC;

GRANT SELECT ON public.leads_jarvis_v TO anon;
GRANT SELECT ON public.leads_jarvis_v TO authenticated;
```

Se um contato tiver mais de um deal, aparecerá mais de uma linha (um por deal). Se isso for indesejado, podemos usar `DISTINCT ON (c.id)` pegando o deal mais recente.

### 2. Nenhuma mudança de RLS

A view continua security definer com GRANT SELECT ao `anon`. Sem mudanças.

### 3. Nenhuma mudança de código

A view é consumida via REST pelo Jarvis. Nenhum arquivo do frontend precisa mudar.

## Exemplo de retorno JSON

```json
[
  {
    "id": "abc-123",
    "created_at": "2026-03-10T14:30:00Z",
    "nome": "João Silva",
    "telefone": "5511999887766",
    "email": "joao@empresa.com",
    "origem": "inbound",
    "produto": "carga",
    "cidade": "São Paulo",
    "uf": "SP",
    "mensagem": "Preciso de cotação...",
    "status": "qualified",
    "pipedrive_person_id": "12345",
    "pipedrive_lead_id": "67890",
    "pipedrive_org_id": "111",
    "sent_to_pipedrive_at": "2026-03-10T15:00:00Z",
    "pipedrive_sync_status": "sent",
    "responsavel_id": "9db32c89-...",
    "responsavel_nome": "Adriana Jacometo",
    "responsavel_email": "adriana@jacometo.com.br",
    "responsavel_atribuido_em": "2026-03-10T14:31:00Z"
  }
]
```

## Decisão: duplicatas por múltiplos deals

Se um contato pode ter mais de um deal (raro mas possível), recomendo usar `DISTINCT ON` para pegar apenas o deal mais recente. Se preferir ver todos os deals, mantenho sem DISTINCT. Vou usar `DISTINCT ON (c.id)` por padrão para evitar duplicatas no ranking.

## Resumo

| Recurso | Ação |
|---|---|
| Migration SQL | `CREATE OR REPLACE VIEW leads_jarvis_v` com JOIN em deals + team_members |
| Colunas novas em contacts | Nenhuma (dados já existem via deals.owner_id) |
| RLS | Sem mudança |
| Código frontend | Sem mudança |

