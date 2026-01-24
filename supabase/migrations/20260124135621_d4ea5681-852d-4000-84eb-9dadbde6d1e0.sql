-- Create table to store disqualification reports
CREATE TABLE public.disqualification_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_period_start TIMESTAMPTZ NOT NULL,
  report_period_end TIMESTAMPTZ NOT NULL,
  total_disqualified INTEGER DEFAULT 0,
  total_leads_period INTEGER DEFAULT 0,
  by_category JSONB DEFAULT '{}',
  comparison_previous_week JSONB DEFAULT '{}',
  top_ddds JSONB DEFAULT '[]',
  peak_hours JSONB DEFAULT '[]',
  insights TEXT[],
  sent_to TEXT[],
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.disqualification_reports ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to view reports
CREATE POLICY "Authenticated users can view disqualification reports"
ON public.disqualification_reports
FOR SELECT
USING (public.is_authenticated_user());

-- Policy for service role to insert/update reports
CREATE POLICY "Service role can manage disqualification reports"
ON public.disqualification_reports
FOR ALL
USING (true)
WITH CHECK (true);

-- Add index for faster queries
CREATE INDEX idx_disqualification_reports_period 
ON public.disqualification_reports (report_period_start, report_period_end);