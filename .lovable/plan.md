
# Integração Jarvis via Supabase REST + Anon Key

## Tabela real de leads: `contacts`
## View exposta: `leads_jarvis_v`

## Endpoint

```
GET https://xaqepnvvoljtlsyofifu.supabase.co/rest/v1/leads_jarvis_v?select=*&order=created_at.desc
```

Headers:
```
apikey: <SUPABASE_ANON_KEY>
Authorization: Bearer <SUPABASE_ANON_KEY>
```

Filtro incremental:
```
&created_at=gte.2026-03-01T00:00:00Z
```

## Mapeamento de campos

| Campo | Coluna original (contacts) |
|-------|---------------------------|
| id | id |
| created_at | first_contact_date |
| nome | name |
| telefone | phone_number |
| email | email |
| origem | lead_source |
| produto | vertical |
| cidade | city |
| uf | state |
| mensagem | notes |
| status | lead_status |

## Segurança

- View criada como `security definer` (padrão) — bypassa RLS da tabela `contacts`
- `GRANT SELECT ON leads_jarvis_v TO anon` — somente leitura
- Sem Edge Function — acesso nativo via REST API do Supabase
