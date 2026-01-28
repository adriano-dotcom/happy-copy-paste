-- ÍNDICES DE PERFORMANCE PARA O CRM

-- ÍNDICE 1: Otimizar busca de mensagens por conversa (resolve N+1)
CREATE INDEX IF NOT EXISTS idx_messages_conversation_sent_at 
ON public.messages(conversation_id, sent_at DESC);

-- ÍNDICE 2: Otimizar filtro de conversas ativas ordenadas
CREATE INDEX IF NOT EXISTS idx_conversations_active_last_message
ON public.conversations(is_active, last_message_at DESC)
WHERE is_active = true;

-- ÍNDICE 3: Otimizar busca de templates/mensagens da Nina
CREATE INDEX IF NOT EXISTS idx_messages_from_type
ON public.messages(conversation_id, from_type);

-- ÍNDICE 4: Otimizar busca de deals por contato
CREATE INDEX IF NOT EXISTS idx_deals_contact_created
ON public.deals(contact_id, created_at DESC);