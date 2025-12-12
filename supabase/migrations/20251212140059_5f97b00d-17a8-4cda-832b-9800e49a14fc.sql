-- Add columns for free text follow-up automation within 24h window
ALTER TABLE public.followup_automations
ADD COLUMN automation_type text NOT NULL DEFAULT 'template',
ADD COLUMN free_text_message text,
ADD COLUMN within_window_only boolean NOT NULL DEFAULT false,
ADD COLUMN time_unit text NOT NULL DEFAULT 'hours';

-- Add constraint for automation_type
ALTER TABLE public.followup_automations
ADD CONSTRAINT followup_automations_automation_type_check 
CHECK (automation_type IN ('template', 'free_text'));

-- Add constraint for time_unit
ALTER TABLE public.followup_automations
ADD CONSTRAINT followup_automations_time_unit_check 
CHECK (time_unit IN ('hours', 'minutes'));

-- Add comment for documentation
COMMENT ON COLUMN public.followup_automations.automation_type IS 'Type of follow-up: template (WhatsApp template) or free_text (direct message within 24h window)';
COMMENT ON COLUMN public.followup_automations.free_text_message IS 'Message content for free_text automations. Supports variables like {nome}, {empresa}';
COMMENT ON COLUMN public.followup_automations.within_window_only IS 'If true, only triggers when WhatsApp 24h window is still open';
COMMENT ON COLUMN public.followup_automations.time_unit IS 'Unit for hours_without_response: hours or minutes';