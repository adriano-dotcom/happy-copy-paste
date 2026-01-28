-- ============================================
-- SCRIPT DE CRIAÇÃO DE ÍNDICES - CRM JACOMETO
-- 22 novos índices para otimização de performance
-- ============================================

-- ===========================================
-- TABELA: messages
-- ===========================================

-- Índice para métricas de tempo de resposta da Nina
CREATE INDEX IF NOT EXISTS idx_messages_nina_response_time
ON public.messages(sent_at)
WHERE nina_response_time IS NOT NULL AND nina_response_time > 0;

-- Índice para marcar mensagens como lidas (filtro composto)
CREATE INDEX IF NOT EXISTS idx_messages_unread_user
ON public.messages(conversation_id, from_type, status)
WHERE from_type = 'user' AND status IN ('sent', 'delivered');

-- ===========================================
-- TABELA: conversations
-- ===========================================

-- Índice para busca de conversa por contato
CREATE INDEX IF NOT EXISTS idx_conversations_contact_active
ON public.conversations(contact_id, is_active)
WHERE is_active = true;

-- Índice para conversas arquivadas
CREATE INDEX IF NOT EXISTS idx_conversations_archived_last_message
ON public.conversations(is_active, last_message_at DESC)
WHERE is_active = false;

-- Índice para filtro por status
CREATE INDEX IF NOT EXISTS idx_conversations_status
ON public.conversations(status, is_active);

-- ===========================================
-- TABELA: contacts
-- ===========================================

-- Índice para listagem ordenada por última atividade
CREATE INDEX IF NOT EXISTS idx_contacts_last_activity
ON public.contacts(last_activity DESC);

-- Índice para contagem de novos contatos por período
CREATE INDEX IF NOT EXISTS idx_contacts_created_at
ON public.contacts(created_at);

-- Índice para busca por telefone (importação CSV)
CREATE INDEX IF NOT EXISTS idx_contacts_phone_number
ON public.contacts(phone_number);

-- ===========================================
-- TABELA: deals
-- ===========================================

-- Índice para busca por pipeline
CREATE INDEX IF NOT EXISTS idx_deals_pipeline_created
ON public.deals(pipeline_id, created_at DESC);

-- Índice para deals ganhos (métricas)
CREATE INDEX IF NOT EXISTS idx_deals_won_at
ON public.deals(won_at)
WHERE won_at IS NOT NULL;

-- Índice para deals perdidos
CREATE INDEX IF NOT EXISTS idx_deals_lost_at
ON public.deals(lost_at)
WHERE lost_at IS NOT NULL;

-- Índice para busca por estágio
CREATE INDEX IF NOT EXISTS idx_deals_stage_id
ON public.deals(stage_id);

-- Índice para filtro por owner
CREATE INDEX IF NOT EXISTS idx_deals_owner_id
ON public.deals(owner_id)
WHERE owner_id IS NOT NULL;

-- ===========================================
-- TABELA: pipeline_stages
-- ===========================================

-- Índice para busca de estágios por pipeline
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline_position
ON public.pipeline_stages(pipeline_id, position)
WHERE is_active = true;

-- ===========================================
-- TABELA: appointments
-- ===========================================

-- Índice para listagem de agendamentos
CREATE INDEX IF NOT EXISTS idx_appointments_date_time
ON public.appointments(date, time);

-- Índice para contagem por período
CREATE INDEX IF NOT EXISTS idx_appointments_created_at
ON public.appointments(created_at);

-- ===========================================
-- TABELA: team_members
-- ===========================================

-- Índice para listagem de membros
CREATE INDEX IF NOT EXISTS idx_team_members_created_at
ON public.team_members(created_at DESC);

-- ===========================================
-- TABELA: deal_activities
-- ===========================================

-- Índice para atividades por deal
CREATE INDEX IF NOT EXISTS idx_deal_activities_deal_created
ON public.deal_activities(deal_id, created_at DESC);

-- ===========================================
-- TABELA: followup_automations
-- ===========================================

-- Índice para automações ativas
CREATE INDEX IF NOT EXISTS idx_followup_automations_active
ON public.followup_automations(is_active)
WHERE is_active = true;

-- ===========================================
-- TABELA: send_queue
-- ===========================================

-- Índice para processamento de fila de envio
CREATE INDEX IF NOT EXISTS idx_send_queue_pending
ON public.send_queue(status, scheduled_at, priority DESC)
WHERE status = 'pending';

-- ===========================================
-- TABELA: nina_processing_queue
-- ===========================================

-- Índice para processamento de fila Nina
CREATE INDEX IF NOT EXISTS idx_nina_processing_queue_pending
ON public.nina_processing_queue(status, scheduled_for, priority DESC)
WHERE status = 'pending';

-- ===========================================
-- TABELA: whatsapp_campaigns
-- ===========================================

-- Índice para campanhas ordenadas
CREATE INDEX IF NOT EXISTS idx_whatsapp_campaigns_created_at
ON public.whatsapp_campaigns(created_at DESC);

-- ===========================================
-- TABELA: campaign_contacts
-- ===========================================

-- Índice para contatos de campanha pendentes
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_pending
ON public.campaign_contacts(campaign_id, status, position)
WHERE status = 'pending';