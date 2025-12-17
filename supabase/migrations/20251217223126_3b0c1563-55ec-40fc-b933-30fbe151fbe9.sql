-- Add granular channel control for Facebook and Google Lead automations
ALTER TABLE nina_settings 
ADD COLUMN IF NOT EXISTS facebook_whatsapp_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS facebook_email_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS google_whatsapp_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS google_email_enabled BOOLEAN DEFAULT true;