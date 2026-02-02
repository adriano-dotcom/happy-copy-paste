-- Criar tabela para relatórios de motivos de fechamento por agente
CREATE TABLE public.closure_reason_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID REFERENCES public.agents(id),
  agent_name TEXT NOT NULL,
  report_date DATE NOT NULL,
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  total_closures INTEGER NOT NULL DEFAULT 0,
  by_reason JSONB NOT NULL DEFAULT '{}'::jsonb,
  comparison_previous JSONB DEFAULT '{}'::jsonb,
  top_reasons JSONB DEFAULT '[]'::jsonb,
  avg_time_to_close INTEGER,
  insights TEXT[] DEFAULT '{}',
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_closure_reason_reports_agent_id ON public.closure_reason_reports(agent_id);
CREATE INDEX idx_closure_reason_reports_report_date ON public.closure_reason_reports(report_date);
CREATE INDEX idx_closure_reason_reports_created_at ON public.closure_reason_reports(created_at);

-- Enable RLS
ALTER TABLE public.closure_reason_reports ENABLE ROW LEVEL SECURITY;

-- Admins podem gerenciar tudo
CREATE POLICY "Admins can manage closure_reason_reports"
ON public.closure_reason_reports
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Usuários autenticados podem visualizar
CREATE POLICY "Authenticated users can view closure_reason_reports"
ON public.closure_reason_reports
FOR SELECT
USING (is_authenticated_user());