

# Corrigir `template_enviado_em` nulo — Dois caminhos de envio

## Diagnóstico

O `template_enviado_em` vem de `campaign_contacts.sent_at`. Mas existem **dois caminhos** de envio de templates:

| Caminho | Função | Cria `campaign_contacts`? | Contatos outbound |
|---|---|---|---|
| Campanha agendada | `process-campaign` | Sim → `sent_at` preenchido | 354 |
| Envio direto/manual | `send-whatsapp-template` | Não | ~1.568 |

**Resultado**: 1.568 contatos outbound receberam template mas não têm `campaign_contacts` row → view mostra NULL.

Porém, **ambos os caminhos** criam um `messages` com `metadata->>'is_template' = 'true'` e `sent_at`. Essa é a fonte confiável universal.

## Plano

### 1. Migration — Recriar VIEW com fallback via `messages`

Adicionar um LEFT JOIN LATERAL na tabela `messages` para pegar a primeira mensagem de template enviada, como fallback quando `campaign_contacts.sent_at` é nulo:

```sql
CREATE OR REPLACE VIEW public.leads_jarvis_v AS
SELECT DISTINCT ON (c.id)
  -- campos existentes mantidos...
  c.campaign AS campanha_nome,
  CASE 
    WHEN conv.id IS NULL THEN 'sem_conversa'
    WHEN conv.is_active = false THEN 'arquivado'
    ELSE conv.status::text
  END AS chat_status,
  cc.campaign_id AS campanha_id,
  wc.name AS campanha_whatsapp_nome,
  -- Template: prioriza campaign_contacts, fallback para messages
  COALESCE(wt.name, first_tpl.template_name) AS template_nome,
  COALESCE(cc.sent_at, first_tpl.sent_at) AS template_enviado_em,
  cc.replied_at AS respondido_em,
  COALESCE(cc.status, 
    CASE WHEN first_tpl.id IS NOT NULL THEN 'sent' END
  ) AS campanha_contato_status
FROM public.contacts c
LEFT JOIN public.deals d ON d.contact_id = c.id
LEFT JOIN public.team_members tm ON tm.id = d.owner_id
LEFT JOIN public.conversations conv ON conv.contact_id = c.id
LEFT JOIN public.campaign_contacts cc ON cc.contact_id = c.id
LEFT JOIN public.whatsapp_campaigns wc ON wc.id = cc.campaign_id
LEFT JOIN public.whatsapp_templates wt ON wt.id = wc.template_id
LEFT JOIN LATERAL (
  SELECT m.id, m.sent_at, m.metadata->>'template_name' AS template_name
  FROM messages m
  WHERE m.conversation_id = conv.id
    AND (m.metadata->>'is_template')::boolean = true
  ORDER BY m.sent_at ASC
  LIMIT 1
) first_tpl ON true
ORDER BY c.id, d.created_at DESC;
```

Isso resolve os 1.568 contatos sem `campaign_contacts`.

### 2. Criar view agregada `outbound_sends_daily_v`

```sql
CREATE OR REPLACE VIEW public.outbound_sends_daily_v AS
SELECT
  DATE(COALESCE(cc.sent_at, m.sent_at)) AS send_date,
  cc.campaign_id,
  wc.name AS campaign_name,
  tm.email AS responsavel_email,
  tm.name AS responsavel_nome,
  COUNT(DISTINCT c.id) AS sent_count,
  COUNT(DISTINCT CASE WHEN cc.read_at IS NOT NULL THEN c.id END) AS opened_count,
  COUNT(DISTINCT CASE WHEN cc.replied_at IS NOT NULL 
    OR EXISTS(SELECT 1 FROM messages mr 
              WHERE mr.conversation_id = conv.id 
              AND mr.from_type = 'user' 
              AND mr.sent_at > COALESCE(cc.sent_at, m.sent_at))
    THEN c.id END) AS replied_count
FROM public.contacts c
JOIN public.conversations conv ON conv.contact_id = c.id
LEFT JOIN public.deals d ON d.contact_id = c.id
LEFT JOIN public.team_members tm ON tm.id = d.owner_id
LEFT JOIN public.campaign_contacts cc ON cc.contact_id = c.id
LEFT JOIN public.whatsapp_campaigns wc ON wc.id = cc.campaign_id
LEFT JOIN LATERAL (
  SELECT m2.sent_at
  FROM messages m2
  WHERE m2.conversation_id = conv.id
    AND (m2.metadata->>'is_template')::boolean = true
  ORDER BY m2.sent_at ASC LIMIT 1
) m ON true
WHERE c.lead_source = 'outbound'
  AND COALESCE(cc.sent_at, m.sent_at) IS NOT NULL
GROUP BY 1, 2, 3, 4, 5;

GRANT SELECT ON public.outbound_sends_daily_v TO anon;
GRANT SELECT ON public.outbound_sends_daily_v TO authenticated;
```

### 3. Nenhuma mudança de código frontend

Ambas as views são consumidas via REST pelo Jarvis.

## Impacto esperado

| Antes | Depois |
|---|---|
| 354 contacts com `template_enviado_em` | ~1.922 contacts com `template_enviado_em` |
| Sem view de envios diários | `outbound_sends_daily_v` com métricas por dia/campanha/responsável |

## Colunas da nova view `outbound_sends_daily_v`

| Coluna | Tipo | Descrição |
|---|---|---|
| `send_date` | date | Data do envio |
| `campaign_id` | uuid | ID da campanha (null se envio direto) |
| `campaign_name` | text | Nome da campanha |
| `responsavel_email` | text | Email do vendedor |
| `responsavel_nome` | text | Nome do vendedor |
| `sent_count` | int | Templates enviados |
| `opened_count` | int | Lidos (read_at) |
| `replied_count` | int | Respondidos |

## Resumo

| Recurso | Ação |
|---|---|
| Migration | Atualizar `leads_jarvis_v` com LATERAL JOIN em messages como fallback |
| Migration | Criar `outbound_sends_daily_v` |
| RLS | GRANT SELECT anon/authenticated nas views |
| Código | Sem mudança |

