-- Add assigned_user_name column to conversations table
-- This stores the display name of the human operator when they take over
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS assigned_user_name TEXT DEFAULT NULL;