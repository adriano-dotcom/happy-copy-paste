-- Add whatsapp_window_start field to conversations table
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS whatsapp_window_start timestamp with time zone;

-- Create function to check if WhatsApp window is open
CREATE OR REPLACE FUNCTION public.is_whatsapp_window_open(p_conversation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  window_start timestamp with time zone;
BEGIN
  SELECT whatsapp_window_start INTO window_start
  FROM public.conversations
  WHERE id = p_conversation_id;
  
  -- Window is open if window_start exists AND less than 24h have passed
  IF window_start IS NULL THEN
    RETURN FALSE;
  END IF;
  
  RETURN (now() < window_start + interval '24 hours');
END;
$$;

-- Create function to update whatsapp window on client message
CREATE OR REPLACE FUNCTION public.update_whatsapp_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  current_window_start timestamp with time zone;
BEGIN
  -- Only process if message is from client (user)
  IF NEW.from_type != 'user' THEN
    RETURN NEW;
  END IF;
  
  -- Get current window start
  SELECT whatsapp_window_start INTO current_window_start
  FROM public.conversations
  WHERE id = NEW.conversation_id;
  
  -- Only update window if:
  -- 1. Window never existed (NULL), OR
  -- 2. Window has expired (more than 24h passed)
  IF current_window_start IS NULL OR now() >= current_window_start + interval '24 hours' THEN
    UPDATE public.conversations
    SET whatsapp_window_start = now()
    WHERE id = NEW.conversation_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger to update whatsapp window on new messages
DROP TRIGGER IF EXISTS update_whatsapp_window_trigger ON public.messages;
CREATE TRIGGER update_whatsapp_window_trigger
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.update_whatsapp_window();

-- Backfill: For each conversation, find the most recent message from user 
-- that would have started the current window (considering 24h logic)
WITH latest_user_messages AS (
  SELECT DISTINCT ON (m.conversation_id)
    m.conversation_id,
    m.sent_at
  FROM public.messages m
  WHERE m.from_type = 'user'
  ORDER BY m.conversation_id, m.sent_at DESC
)
UPDATE public.conversations c
SET whatsapp_window_start = lum.sent_at
FROM latest_user_messages lum
WHERE c.id = lum.conversation_id
  AND c.whatsapp_window_start IS NULL;