-- Create table for API4Com webhook logs
CREATE TABLE public.api4com_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id TEXT,
  event_type TEXT NOT NULL,
  raw_payload JSONB NOT NULL,
  client_ip TEXT,
  headers JSONB,
  processing_result TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para busca rápida
CREATE INDEX idx_api4com_logs_call_id ON public.api4com_webhook_logs(call_id);
CREATE INDEX idx_api4com_logs_created_at ON public.api4com_webhook_logs(created_at DESC);
CREATE INDEX idx_api4com_logs_event_type ON public.api4com_webhook_logs(event_type);

-- RLS - admin only
ALTER TABLE public.api4com_webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin access to webhook logs" ON public.api4com_webhook_logs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );