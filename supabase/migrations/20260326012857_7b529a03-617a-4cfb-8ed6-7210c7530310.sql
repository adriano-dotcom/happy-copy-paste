-- 1. Recriar leads_jarvis_v com fallback via messages para template_enviado_em
CREATE OR REPLACE VIEW public.leads_jarvis_v AS
SELECT DISTINCT ON (c.id)
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
  c.campaign AS campanha_nome,
  CASE 
    WHEN conv.id IS NULL THEN 'sem_conversa'
    WHEN conv.is_active = false THEN 'arquivado'
    ELSE conv.status::text
  END AS chat_status,
  cc.campaign_id AS campanha_id,
  wc.name AS campanha_whatsapp_nome,
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
  FROM public.messages m
  WHERE m.conversation_id = conv.id
    AND (m.metadata->>'is_template')::boolean = true
  ORDER BY m.sent_at ASC
  LIMIT 1
) first_tpl ON true
ORDER BY c.id, d.created_at DESC;

GRANT SELECT ON public.leads_jarvis_v TO anon;
GRANT SELECT ON public.leads_jarvis_v TO authenticated;

-- 2. Criar view agregada outbound_sends_daily_v
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
    OR EXISTS(SELECT 1 FROM public.messages mr 
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
  FROM public.messages m2
  WHERE m2.conversation_id = conv.id
    AND (m2.metadata->>'is_template')::boolean = true
  ORDER BY m2.sent_at ASC LIMIT 1
) m ON true
WHERE c.lead_source = 'outbound'
  AND COALESCE(cc.sent_at, m.sent_at) IS NOT NULL
GROUP BY 1, 2, 3, 4, 5;

GRANT SELECT ON public.outbound_sends_daily_v TO anon;
GRANT SELECT ON public.outbound_sends_daily_v TO authenticated;