-- Add messages_sequence column to followup_automations
-- This column stores an array of message configurations for follow-up sequences
-- Each message can be manual or AI-generated

ALTER TABLE public.followup_automations 
ADD COLUMN IF NOT EXISTS messages_sequence jsonb DEFAULT '[]'::jsonb;

-- Add comment to document the structure
COMMENT ON COLUMN public.followup_automations.messages_sequence IS 'Array of message configurations: [{attempt: 1, type: "manual"|"ai_generated", content: "...", ai_prompt_type: "qualification"|"urgency"|"last_chance", delay_hours: 3}]';