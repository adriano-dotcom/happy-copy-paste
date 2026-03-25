

# Integração de Leitura para Jarvis (Clawdbot)

## Diagnóstico das tabelas

Os leads estão distribuídos em duas tabelas principais:
- **`contacts`** — dados do contato (nome, telefone, email, cidade, estado, origem, vertical, lead_status)
- **`deals`** — pipeline/negócio vinculado ao contato (stage, notas, created_at)

Não existe tabela `leads` dedicada. A `contacts` é a tabela primária de leads.

## Mapeamento de campos

| Campo solicitado | Coluna real | Tabela |
|---|---|---|
| id | `c.id` | contacts |
| created_at | `c.first_contact_date` | contacts |
| nome | `c.name` | contacts |
| telefone | `c.phone_number` | contacts |
| email | `c.email` | contacts |
| origem | `c.lead_source` | contacts |
| produto | `c.vertical` | contacts |
| cidade | `c.city` | contacts |
| uf | `c.state` | contacts |
| mensagem | `c.notes` | contacts |
| status | `c.lead_status` | contacts |

## Abordagem escolhida: Edge Function (opção 5)

Uma Edge Function é mais segura e controlável que expor via REST/anon key, pois:
- Permite token dedicado sem expor a anon key
- Garante somente leitura por design
- Aceita filtro `since` para cron incremental
- Não requer criação de usuário auth para o Jarvis

## Plano de implementação

### 1. Migration SQL — Criar VIEW `leads_jarvis_v`

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
  c.lead_status AS status
FROM public.contacts c
ORDER BY c.first_contact_date DESC;
```

### 2. Secret — `JARVIS_API_TOKEN`

Criar um token aleatório seguro via `secrets--add_secret`. O Jarvis usará esse token no header `Authorization: Bearer <token>`.

### 3. Edge Function `jarvis-leads`

- **Rota**: `GET /functions/v1/jarvis-leads`
- **Auth**: Valida `Authorization: Bearer <JARVIS_API_TOKEN>` (comparação contra secret)
- **Query params**: `since` (ISO date, opcional) para filtro incremental
- **Retorno**: JSON array dos leads da view
- **config.toml**: `verify_jwt = false` (auth via token próprio)

Lógica:
```
1. Validar header Authorization contra JARVIS_API_TOKEN
2. Ler param ?since=
3. Query: SELECT * FROM leads_jarvis_v WHERE created_at >= since (ou sem filtro)
4. Retornar JSON
```

### 4. Documentação final (no chat)

Após implementação, documentar:
- Tabela original: `contacts`
- View: `leads_jarvis_v`
- Endpoint: `GET https://xaqepnvvoljtlsyofifu.supabase.co/functions/v1/jarvis-leads`
- Header: `Authorization: Bearer <JARVIS_API_TOKEN>`
- Query: `?since=2026-03-01T00:00:00Z`

| Arquivo/Recurso | Ação |
|---|---|
| Migration SQL | Criar VIEW `leads_jarvis_v` |
| Secret `JARVIS_API_TOKEN` | Solicitar ao usuário |
| `supabase/functions/jarvis-leads/index.ts` | Criar edge function GET |
| `supabase/config.toml` | Adicionar `[functions.jarvis-leads]` com `verify_jwt = false` |

