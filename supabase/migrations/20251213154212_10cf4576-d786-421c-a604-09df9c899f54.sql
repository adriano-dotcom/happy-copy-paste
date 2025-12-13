-- Create scheduled_emails table for storing AI-generated renewal emails
CREATE TABLE public.scheduled_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID REFERENCES public.deals(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  scheduled_for DATE NOT NULL,
  days_before_due INTEGER DEFAULT 15,
  status TEXT DEFAULT 'pending',
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  generated_by TEXT DEFAULT 'ai',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add index for cron job query
CREATE INDEX idx_scheduled_emails_pending ON public.scheduled_emails(status, scheduled_for) WHERE status = 'pending';

-- Enable RLS
ALTER TABLE public.scheduled_emails ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users
CREATE POLICY "Authenticated users can manage scheduled_emails"
ON public.scheduled_emails
FOR ALL
USING (is_authenticated_user())
WITH CHECK (is_authenticated_user());

-- Trigger for updated_at
CREATE TRIGGER update_scheduled_emails_updated_at
BEFORE UPDATE ON public.scheduled_emails
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Add to realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.scheduled_emails;