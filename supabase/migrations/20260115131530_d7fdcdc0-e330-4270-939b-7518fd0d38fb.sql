-- Add whatsapp_app_secret column to nina_settings for webhook signature verification
ALTER TABLE public.nina_settings 
ADD COLUMN IF NOT EXISTS whatsapp_app_secret text;