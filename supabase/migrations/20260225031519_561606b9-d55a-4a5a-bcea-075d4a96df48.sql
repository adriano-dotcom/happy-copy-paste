-- Add unique constraint on whatsapp_call_id (when not null) to prevent duplicate call ingestion
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_calls_whatsapp_call_id_unique 
ON public.whatsapp_calls (whatsapp_call_id) 
WHERE whatsapp_call_id IS NOT NULL;