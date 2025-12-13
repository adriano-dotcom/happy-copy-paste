-- Adicionar coluna lead_source na tabela contacts
ALTER TABLE contacts 
ADD COLUMN IF NOT EXISTS lead_source text DEFAULT 'inbound';

-- Comentário explicativo
COMMENT ON COLUMN contacts.lead_source IS 
  'Origem do lead: inbound (chegou via WhatsApp) ou outbound (importado para prospecção)';

-- Atualizar leads existentes baseado no whatsapp_id
UPDATE contacts 
SET lead_source = CASE 
  WHEN whatsapp_id IS NOT NULL THEN 'inbound'
  ELSE 'outbound'
END;