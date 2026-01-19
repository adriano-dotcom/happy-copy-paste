-- =============================================
-- INDICES DE PERFORMANCE - ELIMINAR SEQ SCANS
-- =============================================

-- Indices para tabela deals (93.8M tuplas em seq scan)
CREATE INDEX IF NOT EXISTS idx_deals_contact_id ON deals(contact_id);
CREATE INDEX IF NOT EXISTS idx_deals_pipeline_id ON deals(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_deals_owner_id ON deals(owner_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage_id ON deals(stage_id);
CREATE INDEX IF NOT EXISTS idx_deals_won_at ON deals(won_at) WHERE won_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_lost_at ON deals(lost_at) WHERE lost_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deals_created_at ON deals(created_at);

-- Indices para pipeline_stages (10.1M tuplas em seq scan)
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline_id ON pipeline_stages(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_position ON pipeline_stages(pipeline_id, position);

-- Indice composto para messages (unread check - 670K chamadas)
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(conversation_id, from_type) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_messages_conversation_sent ON messages(conversation_id, sent_at DESC);

-- Indices para send_queue
CREATE INDEX IF NOT EXISTS idx_send_queue_status ON send_queue(status);
CREATE INDEX IF NOT EXISTS idx_send_queue_conversation_id ON send_queue(conversation_id);
CREATE INDEX IF NOT EXISTS idx_send_queue_scheduled ON send_queue(scheduled_at) WHERE status = 'pending';

-- Indices para nina_processing_queue (392K chamadas)
CREATE INDEX IF NOT EXISTS idx_nina_queue_conversation_status ON nina_processing_queue(conversation_id, status);
CREATE INDEX IF NOT EXISTS idx_nina_queue_scheduled ON nina_processing_queue(scheduled_for) WHERE status = 'pending';

-- Indices para contacts
CREATE INDEX IF NOT EXISTS idx_contacts_phone_number ON contacts(phone_number);
CREATE INDEX IF NOT EXISTS idx_contacts_last_activity ON contacts(last_activity DESC);

-- Indices para conversations
CREATE INDEX IF NOT EXISTS idx_conversations_contact_status ON conversations(contact_id, status);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at DESC) WHERE is_active = true;

-- Indice para call_logs
CREATE INDEX IF NOT EXISTS idx_call_logs_contact_id ON call_logs(contact_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_conversation_id ON call_logs(conversation_id);

-- =============================================
-- LIMPEZA DE DADOS ORFAOS
-- =============================================

-- Limpar message_grouping_queue antigos (2.271 registros orfaos)
DELETE FROM message_grouping_queue 
WHERE created_at < NOW() - INTERVAL '30 days';

-- Limpar cron.job_run_details antigos (58 MB acumulados)
DELETE FROM cron.job_run_details 
WHERE end_time < NOW() - INTERVAL '7 days';

-- =============================================
-- FUNCAO DE LIMPEZA AUTOMATICA
-- =============================================

CREATE OR REPLACE FUNCTION cleanup_old_queue_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Limpar message_grouping_queue (> 30 dias)
  DELETE FROM message_grouping_queue 
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  -- Limpar nina_processing_queue processados (> 7 dias)
  DELETE FROM nina_processing_queue 
  WHERE status IN ('completed', 'failed') 
  AND processed_at < NOW() - INTERVAL '7 days';
  
  -- Limpar send_queue enviados (> 7 dias)
  DELETE FROM send_queue 
  WHERE status = 'completed' 
  AND sent_at < NOW() - INTERVAL '7 days';
  
  -- Limpar followup_logs antigos (> 30 dias)
  DELETE FROM followup_logs 
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  RAISE LOG 'Queue cleanup completed at %', NOW();
END;
$$;