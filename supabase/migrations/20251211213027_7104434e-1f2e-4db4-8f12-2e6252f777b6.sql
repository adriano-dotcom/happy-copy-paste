-- Add WABA ID column to nina_settings
ALTER TABLE public.nina_settings
ADD COLUMN IF NOT EXISTS whatsapp_waba_id text;