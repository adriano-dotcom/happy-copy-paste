-- Tabela para armazenar alertas críticos de WhatsApp (131042, 131047, etc)
CREATE TABLE public.whatsapp_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL, -- 'payment_issue', 'rate_limit', 'quality_red', etc.
  error_code INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  details TEXT,
  phone_number_id TEXT,
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Índices para consulta rápida
CREATE INDEX idx_whatsapp_alerts_unresolved ON public.whatsapp_alerts (is_resolved, created_at DESC) WHERE is_resolved = false;
CREATE INDEX idx_whatsapp_alerts_type ON public.whatsapp_alerts (alert_type, created_at DESC);

-- Trigger para updated_at
CREATE TRIGGER update_whatsapp_alerts_updated_at
BEFORE UPDATE ON public.whatsapp_alerts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: somente usuários autenticados podem ler e admin pode gerenciar
ALTER TABLE public.whatsapp_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view whatsapp_alerts"
ON public.whatsapp_alerts FOR SELECT
USING (is_authenticated_user());

CREATE POLICY "Admins can manage whatsapp_alerts"
ON public.whatsapp_alerts FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- Habilitar realtime para alertas
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_alerts;

-- Adicionar coluna para armazenar quando campanhas foram pausadas
ALTER TABLE public.whatsapp_campaigns ADD COLUMN IF NOT EXISTS paused_reason TEXT;