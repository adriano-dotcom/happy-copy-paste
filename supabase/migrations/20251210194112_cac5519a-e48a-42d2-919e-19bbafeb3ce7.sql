-- Habilitar realtime para tabelas importantes do sistema
ALTER PUBLICATION supabase_realtime ADD TABLE public.pipeline_stages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.deals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;