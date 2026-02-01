-- Adicionar coluna para contar erros 131042 (payment issue)
ALTER TABLE public.whatsapp_metrics ADD COLUMN IF NOT EXISTS error_131042_count INTEGER DEFAULT 0;