-- Adicionar coluna para data base das estatísticas de vendedores
ALTER TABLE public.nina_settings 
ADD COLUMN IF NOT EXISTS seller_stats_baseline_date TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Comentário explicativo
COMMENT ON COLUMN public.nina_settings.seller_stats_baseline_date IS 'Data a partir da qual as estatísticas de atendimento de vendedores são contabilizadas';