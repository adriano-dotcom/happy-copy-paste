-- Add campaign field to contacts table
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS campaign TEXT;

-- Create campaigns table for managing campaign definitions
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT DEFAULT '#3b82f6',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

-- RLS policy for authenticated users
CREATE POLICY "Authenticated users can manage campaigns"
ON campaigns FOR ALL
USING (is_authenticated_user())
WITH CHECK (is_authenticated_user());

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_contacts_campaign ON contacts(campaign);

-- Add trigger for updated_at
CREATE TRIGGER update_campaigns_updated_at
BEFORE UPDATE ON campaigns
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();