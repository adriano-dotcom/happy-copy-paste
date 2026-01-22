-- Add 'interactive' value to message_type enum
ALTER TYPE public.message_type ADD VALUE IF NOT EXISTS 'interactive';