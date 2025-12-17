-- Create learning_insights table for aggregated coaching insights
CREATE TABLE public.learning_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Categorization
  category TEXT NOT NULL DEFAULT 'prompt', -- 'prompt', 'process', 'training'
  agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  pipeline_id UUID REFERENCES pipelines(id) ON DELETE SET NULL,
  
  -- Content
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  suggestion TEXT,
  examples JSONB DEFAULT '[]'::jsonb,
  
  -- Priority and Impact
  priority INTEGER DEFAULT 2 CHECK (priority BETWEEN 1 AND 3), -- 1=critical, 2=high, 3=medium
  impact TEXT,
  occurrence_count INTEGER DEFAULT 1,
  
  -- Status workflow
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'applied', 'rejected')),
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  applied_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  review_notes TEXT,
  
  -- Tracking
  source_reports UUID[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.learning_insights ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view learning_insights" 
ON public.learning_insights 
FOR SELECT 
USING (is_authenticated_user());

CREATE POLICY "Admins can manage learning_insights" 
ON public.learning_insights 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Index for common queries
CREATE INDEX idx_learning_insights_status ON public.learning_insights(status);
CREATE INDEX idx_learning_insights_agent ON public.learning_insights(agent_id);
CREATE INDEX idx_learning_insights_priority ON public.learning_insights(priority);

-- Trigger for updated_at
CREATE TRIGGER update_learning_insights_updated_at
BEFORE UPDATE ON public.learning_insights
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();