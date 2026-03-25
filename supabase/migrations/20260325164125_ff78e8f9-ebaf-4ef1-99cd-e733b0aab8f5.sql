
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS pipedrive_lead_id text,
  ADD COLUMN IF NOT EXISTS pipedrive_org_id text,
  ADD COLUMN IF NOT EXISTS sent_to_pipedrive_at timestamptz,
  ADD COLUMN IF NOT EXISTS pipedrive_sync_status text,
  ADD COLUMN IF NOT EXISTS pipedrive_sync_error text;

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
  c.pipedrive_sync_status
FROM public.contacts c
ORDER BY c.first_contact_date DESC;

GRANT SELECT ON public.leads_jarvis_v TO anon;
GRANT SELECT ON public.leads_jarvis_v TO authenticated;
