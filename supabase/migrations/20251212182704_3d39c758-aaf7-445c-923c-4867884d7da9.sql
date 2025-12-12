-- Adicionar colunas para pipeline/departamento e rastreamento de alertas
ALTER TABLE public.sales_coaching_reports 
ADD COLUMN IF NOT EXISTS pipeline_id uuid REFERENCES public.pipelines(id),
ADD COLUMN IF NOT EXISTS pipeline_name text,
ADD COLUMN IF NOT EXISTS alert_sent boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS alert_sent_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS alert_recipients text[];