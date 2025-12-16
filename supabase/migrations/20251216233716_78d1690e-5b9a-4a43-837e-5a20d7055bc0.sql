-- Adicionar coluna vertical para classificar segmento do contato (transporte ou frotas)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS vertical TEXT;

-- Comentário explicativo
COMMENT ON COLUMN contacts.vertical IS 'Segmento do contato: transporte (RCTR-C/carga) ou frotas (seguro de frota/automotores)';