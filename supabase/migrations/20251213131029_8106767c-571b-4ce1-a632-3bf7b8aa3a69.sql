-- Adicionar coluna lead_status na tabela contacts
ALTER TABLE contacts 
ADD COLUMN IF NOT EXISTS lead_status text DEFAULT 'new';

COMMENT ON COLUMN contacts.lead_status IS 
  'Status do lead: new, lead, qualified, customer, churned';

-- Atualizar status baseado em evidências existentes
UPDATE contacts c
SET lead_status = CASE
  WHEN EXISTS (
    SELECT 1 FROM deals d 
    WHERE d.contact_id = c.id AND d.stage = 'won'
  ) THEN 'customer'
  WHEN EXISTS (
    SELECT 1 FROM deals d 
    JOIN pipeline_stages ps ON d.stage_id = ps.id
    WHERE d.contact_id = c.id AND ps.title ILIKE '%qualificado%'
  ) THEN 'qualified'
  WHEN c.whatsapp_id IS NOT NULL THEN 'lead'
  ELSE 'new'
END;