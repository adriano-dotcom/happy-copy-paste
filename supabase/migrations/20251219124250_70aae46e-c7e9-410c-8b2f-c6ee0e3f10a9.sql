-- Criar índice único no whatsapp_id para prevenir duplicações futuras
CREATE UNIQUE INDEX IF NOT EXISTS contacts_whatsapp_id_unique 
ON contacts(whatsapp_id) 
WHERE whatsapp_id IS NOT NULL;