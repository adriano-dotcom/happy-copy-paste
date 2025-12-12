-- Create sales_coaching_reports table for Sales Manager Agent
CREATE TABLE public.sales_coaching_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES public.agents(id),
  report_type TEXT NOT NULL DEFAULT 'daily', -- 'daily', 'weekly', 'conversation', 'call'
  analysis_period_start TIMESTAMPTZ,
  analysis_period_end TIMESTAMPTZ,
  
  -- Metrics analyzed
  conversations_analyzed INTEGER DEFAULT 0,
  calls_analyzed INTEGER DEFAULT 0,
  human_interactions_analyzed INTEGER DEFAULT 0,
  
  -- Structured insights
  strengths JSONB DEFAULT '[]'::jsonb,
  improvement_areas JSONB DEFAULT '[]'::jsonb,
  recommended_actions JSONB DEFAULT '[]'::jsonb,
  prompt_suggestions TEXT,
  
  -- Specific examples
  good_examples JSONB DEFAULT '[]'::jsonb,
  bad_examples JSONB DEFAULT '[]'::jsonb,
  
  -- Scores (0-100)
  overall_score INTEGER,
  qualification_effectiveness INTEGER,
  objection_handling_score INTEGER,
  closing_skills_score INTEGER,
  
  -- Metadata
  generated_by TEXT DEFAULT 'sales_manager_agent',
  reviewed_by UUID,
  review_notes TEXT,
  is_applied BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sales_coaching_reports ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can manage sales_coaching_reports"
ON public.sales_coaching_reports
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view sales_coaching_reports"
ON public.sales_coaching_reports
FOR SELECT
USING (is_authenticated_user());

-- Trigger for updated_at
CREATE TRIGGER update_sales_coaching_reports_updated_at
BEFORE UPDATE ON public.sales_coaching_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_coaching_reports;