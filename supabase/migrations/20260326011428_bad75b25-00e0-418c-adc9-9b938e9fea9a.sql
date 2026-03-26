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