-- Adicionar coluna para template padrão de leads do Facebook
ALTER TABLE public.nina_settings 
ADD COLUMN facebook_lead_template TEXT DEFAULT 'lead_facebook_meta';

COMMENT ON COLUMN public.nina_settings.facebook_lead_template IS 'Template WhatsApp padrão para leads do Facebook';