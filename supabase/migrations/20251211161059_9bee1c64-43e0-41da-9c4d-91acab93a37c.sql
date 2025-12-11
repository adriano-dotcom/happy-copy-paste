-- Tabela de configuração de automações de follow-up
CREATE TABLE public.followup_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  
  -- Configuração de tempo
  hours_without_response INTEGER NOT NULL DEFAULT 24,
  
  -- Template a disparar
  template_id UUID REFERENCES public.whatsapp_templates(id) ON DELETE SET NULL,
  template_variables JSONB DEFAULT '{}',
  
  -- Filtros de aplicação
  conversation_statuses TEXT[] DEFAULT '{nina,human}',
  pipeline_ids UUID[],
  tags TEXT[],
  
  -- Limites
  max_attempts INTEGER DEFAULT 1,
  cooldown_hours INTEGER DEFAULT 24,
  
  -- Horário permitido
  active_hours_start TIME DEFAULT '09:00',
  active_hours_end TIME DEFAULT '18:00',
  active_days INTEGER[] DEFAULT '{1,2,3,4,5}',
  
  -- Estado
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de logs de follow-ups enviados
CREATE TABLE public.followup_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID REFERENCES public.followup_automations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL,
  contact_id UUID NOT NULL,
  message_id UUID,
  template_name TEXT,
  status TEXT DEFAULT 'sent',
  error_message TEXT,
  hours_waited NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE public.followup_automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.followup_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on followup_automations" ON public.followup_automations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on followup_logs" ON public.followup_logs FOR ALL USING (true) WITH CHECK (true);

-- Trigger para updated_at
CREATE TRIGGER update_followup_automations_updated_at
  BEFORE UPDATE ON public.followup_automations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Índices
CREATE INDEX idx_followup_logs_automation_id ON public.followup_logs(automation_id);
CREATE INDEX idx_followup_logs_conversation_id ON public.followup_logs(conversation_id);
CREATE INDEX idx_followup_logs_created_at ON public.followup_logs(created_at);

-- Habilitar realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.followup_automations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.followup_logs;