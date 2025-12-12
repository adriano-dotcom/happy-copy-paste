-- Add columns for window expiring automation
ALTER TABLE public.followup_automations 
ADD COLUMN IF NOT EXISTS minutes_before_expiry integer DEFAULT 10,
ADD COLUMN IF NOT EXISTS only_if_no_client_response boolean DEFAULT true;

-- Add comment for clarity
COMMENT ON COLUMN public.followup_automations.minutes_before_expiry IS 'Minutes before 24h window expires to trigger automation (for window_expiring type)';
COMMENT ON COLUMN public.followup_automations.only_if_no_client_response IS 'Only trigger if client did not respond during the window period';