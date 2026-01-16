-- Add needs_human_review column to conversations table
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS needs_human_review BOOLEAN DEFAULT true;

-- Update existing conversations based on current status
-- Conversations handled by nina need human review
UPDATE conversations 
SET needs_human_review = (status = 'nina');