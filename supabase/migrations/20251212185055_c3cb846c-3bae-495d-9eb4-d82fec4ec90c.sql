-- Add agent_messages column to store per-agent messages
ALTER TABLE public.followup_automations 
ADD COLUMN agent_messages jsonb DEFAULT '{}'::jsonb;

-- Add comment for documentation
COMMENT ON COLUMN public.followup_automations.agent_messages IS 'Stores agent-specific messages as {agent_id: message_text}. Falls back to free_text_message if agent not found.';