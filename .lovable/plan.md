

# Atualizar view leads_jarvis_v — Campos de funil Outbound

## Diagnóstico dos dados

Os dados já existem no banco, distribuídos assim:

```text
contacts.campaign           → nome da campanha (ex: "leads geral")
contacts.lead_source        → "inbound" / "outbound" (já exposto como "origem")
conversations.status        → nina / human / paused / closed
conversations.is_active     → true (aberto) / false (arquivado)
campaign_contacts           → vínculo contato↔campanha WhatsApp
  ├─ campaign_id            → whatsapp_campaigns.id
  ├─ sent_at                → quando template foi enviado
  ├─ replied_at             → quando lead respondeu
  └─ status                 → pending/sent/delivered/read/replied/failed
whatsapp_campaigns          → name, template_id
whatsapp_templates          → name (nome do template)
```

## Plano

### 1. Migration SQL — Recriar VIEW com novos campos

```sql
CREATE OR REPLACE VIEW public.leads_jarvis_v AS
SELECT DISTINCT ON (c.id)
  -- Campos existentes
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
  tm.id AS responsavel_id,
  tm.name AS responsavel_nome,
  tm.email AS responsavel_email,
  d.created_at AS responsavel_atribuido_em,
  -- Novos campos
  c.campaign AS campanha_nome,
  CASE 
    WHEN conv.id IS NULL THEN 'sem_conversa'
    WHEN conv.is_active = false THEN 'arquivado'
    ELSE conv.status::text
  END AS chat_status,
  cc.campaign_id AS campanha_id,
  wc.name AS campanha_whatsapp_nome,
  wt.name AS template_nome,
  cc.sent_at AS template_enviado_em,
  cc.replied_at AS respondido_em,
  cc.status AS campanha_contato_status
FROM public.contacts c
LEFT JOIN public.deals d ON d.contact_id = c.id
LEFT JOIN public.team_members tm ON tm.id = d.owner_id
LEFT JOIN public.conversations conv ON conv.contact_id = c.id
LEFT JOIN public.campaign_contacts cc ON cc.contact_id = c.id
LEFT JOIN public.whatsapp_campaigns wc ON wc.id = cc.campaign_id
LEFT JOIN public.whatsapp_templates wt ON wt.id = wc.template_id
ORDER BY c.id, d.created_at DESC;

GRANT SELECT ON public.leads_jarvis_v TO anon;
GRANT SELECT ON public.leads_jarvis_v TO authenticated;
```

**Nota sobre DISTINCT ON**: com múltiplos JOINs (deals + campaigns), um contato com 2 deals e 2 campanhas geraria 4 linhas. O `DISTINCT ON (c.id)` pega apenas a combinação do deal mais recente. Se um contato participou de múltiplas campanhas, apenas a primeira (por deal date) aparecerá. Se isso for problemático, posso usar subqueries laterais. Para o caso Outbound (1977) onde tipicamente há 1 campanha por contato, isso deve funcionar bem.

### 2. Nenhuma mudança de RLS

View com GRANT SELECT ao `anon` — mantém o padrão.

### 3. Nenhuma mudança de código frontend

View consumida pelo Jarvis via REST.

## Colunas adicionadas na view

| Coluna | Tipo | Origem | Descrição |
|--------|------|--------|-----------|
| `campanha_nome` | text | `contacts.campaign` | Nome da campanha (ex: "leads geral") |
| `chat_status` | text | `conversations.status` + `is_active` | sem_conversa / arquivado / nina / human / paused / closed |
| `campanha_id` | uuid | `campaign_contacts.campaign_id` | ID da campanha WhatsApp (ex: o UUID da "1977") |
| `campanha_whatsapp_nome` | text | `whatsapp_campaigns.name` | Nome da campanha WhatsApp |
| `template_nome` | text | `whatsapp_templates.name` | Nome do template usado |
| `template_enviado_em` | timestamptz | `campaign_contacts.sent_at` | Quando o template foi disparado |
| `respondido_em` | timestamptz | `campaign_contacts.replied_at` | Quando o lead respondeu |
| `campanha_contato_status` | text | `campaign_contacts.status` | pending/sent/delivered/read/replied/failed |

## Exemplo de retorno JSON com novos campos

```json
{
  "id": "abc-123",
  "nome": "João Silva",
  "origem": "outbound",
  "status": "qualified",
  "responsavel_nome": "Alessandro",
  "campanha_nome": "leads geral",
  "chat_status": "human",
  "campanha_whatsapp_nome": "Outbound Março",
  "template_nome": "prospeccao_carga_v2",
  "template_enviado_em": "2026-03-10T14:30:00Z",
  "respondido_em": "2026-03-10T15:45:00Z",
  "campanha_contato_status": "replied",
  "pipedrive_sync_status": "sent",
  "sent_to_pipedrive_at": "2026-03-11T10:00:00Z"
}
```

## Resumo

| Recurso | Ação |
|---------|------|
| Migration SQL | `CREATE OR REPLACE VIEW leads_jarvis_v` com JOINs em conversations, campaign_contacts, whatsapp_campaigns, whatsapp_templates |
| Colunas novas | 8 campos de funil (listados acima) |
| RLS | Sem mudança |
| Código frontend | Sem mudança |

