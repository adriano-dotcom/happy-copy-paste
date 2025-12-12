-- Fix the Security Definer View issue by recreating the view with SECURITY INVOKER
-- First drop the existing view
DROP VIEW IF EXISTS public.contacts_with_stats;

-- Recreate the view with SECURITY INVOKER (default, explicit for clarity)
CREATE VIEW public.contacts_with_stats 
WITH (security_invoker = true)
AS
SELECT 
    c.id,
    c.whatsapp_id,
    c.phone_number,
    c.name,
    c.call_name,
    c.email,
    c.profile_picture_url,
    c.is_business,
    c.is_blocked,
    c.blocked_at,
    c.blocked_reason,
    c.tags,
    c.notes,
    c.client_memory,
    c.first_contact_date,
    c.last_activity,
    c.created_at,
    c.updated_at,
    COALESCE(msg_stats.total_messages, 0) AS total_messages,
    COALESCE(msg_stats.nina_messages, 0) AS nina_messages,
    COALESCE(msg_stats.user_messages, 0) AS user_messages,
    COALESCE(msg_stats.human_messages, 0) AS human_messages
FROM public.contacts c
LEFT JOIN (
    SELECT 
        conv.contact_id,
        COUNT(m.id) AS total_messages,
        COUNT(CASE WHEN m.from_type = 'nina' THEN 1 END) AS nina_messages,
        COUNT(CASE WHEN m.from_type = 'user' THEN 1 END) AS user_messages,
        COUNT(CASE WHEN m.from_type = 'human' THEN 1 END) AS human_messages
    FROM public.conversations conv
    JOIN public.messages m ON m.conversation_id = conv.id
    GROUP BY conv.contact_id
) msg_stats ON msg_stats.contact_id = c.id;