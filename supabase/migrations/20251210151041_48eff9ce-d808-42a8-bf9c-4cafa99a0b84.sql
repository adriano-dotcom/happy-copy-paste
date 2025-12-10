-- Create pipelines table
CREATE TABLE public.pipelines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  color TEXT DEFAULT '#3b82f6',
  icon TEXT DEFAULT '📋',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;

-- RLS policy
CREATE POLICY "Allow all operations on pipelines" ON public.pipelines
  FOR ALL USING (true) WITH CHECK (true);

-- Add pipeline_id to pipeline_stages
ALTER TABLE public.pipeline_stages ADD COLUMN pipeline_id UUID REFERENCES public.pipelines(id) ON DELETE CASCADE;

-- Add pipeline_id to deals
ALTER TABLE public.deals ADD COLUMN pipeline_id UUID REFERENCES public.pipelines(id) ON DELETE SET NULL;

-- Add pipeline_id to teams
ALTER TABLE public.teams ADD COLUMN pipeline_id UUID REFERENCES public.pipelines(id) ON DELETE SET NULL;

-- Trigger for updated_at
CREATE TRIGGER update_pipelines_updated_at
  BEFORE UPDATE ON public.pipelines
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert initial pipelines
INSERT INTO public.pipelines (name, slug, color, icon) VALUES
  ('Transporte', 'transporte', '#f59e0b', '🚚'),
  ('Saúde', 'saude', '#10b981', '🏥');

-- Link existing stages to Transporte pipeline (first pipeline)
UPDATE public.pipeline_stages 
SET pipeline_id = (SELECT id FROM public.pipelines WHERE slug = 'transporte' LIMIT 1)
WHERE pipeline_id IS NULL;

-- Link existing deals to Transporte pipeline
UPDATE public.deals 
SET pipeline_id = (SELECT id FROM public.pipelines WHERE slug = 'transporte' LIMIT 1)
WHERE pipeline_id IS NULL;

-- Create default stages for Saúde pipeline
INSERT INTO public.pipeline_stages (title, color, position, pipeline_id, is_active) 
SELECT 'Novo Lead', 'border-blue-500', 0, p.id, true FROM public.pipelines p WHERE p.slug = 'saude'
UNION ALL
SELECT 'Qualificação', 'border-cyan-500', 1, p.id, true FROM public.pipelines p WHERE p.slug = 'saude'
UNION ALL
SELECT 'Cotação Enviada', 'border-yellow-500', 2, p.id, true FROM public.pipelines p WHERE p.slug = 'saude'
UNION ALL
SELECT 'Aguardando Docs', 'border-purple-500', 3, p.id, true FROM public.pipelines p WHERE p.slug = 'saude'
UNION ALL
SELECT 'Fechado Ganho', 'border-green-500', 4, p.id, true FROM public.pipelines p WHERE p.slug = 'saude'
UNION ALL
SELECT 'Fechado Perdido', 'border-red-500', 5, p.id, true FROM public.pipelines p WHERE p.slug = 'saude';