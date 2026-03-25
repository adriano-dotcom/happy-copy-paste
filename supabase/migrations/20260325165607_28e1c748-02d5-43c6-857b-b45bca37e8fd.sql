
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
  d.created_at AS responsavel_atribuido_em
FROM public.contacts c
LEFT JOIN public.deals d ON d.contact_id = c.id
LEFT JOIN public.team_members tm ON tm.id = d.owner_id
ORDER BY c.id, d.created_at DESC;

GRANT SELECT ON public.leads_jarvis_v TO anon;
GRANT SELECT ON public.leads_jarvis_v TO authenticated;
