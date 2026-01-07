-- Add message_content column to followup_logs to track sent messages for anti-repetition
ALTER TABLE public.followup_logs 
ADD COLUMN IF NOT EXISTS message_content TEXT;