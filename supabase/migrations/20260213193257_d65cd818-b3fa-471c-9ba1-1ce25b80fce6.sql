
-- Revert: whatsapp-media must remain public because WhatsApp Cloud API 
-- needs publicly accessible URLs to download media for sending
UPDATE storage.buckets SET public = true WHERE id = 'whatsapp-media';
