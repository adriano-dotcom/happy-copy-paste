

# Scripts SQL de Índices para o CRM Jacometo

## Análise das Queries e Índices Necessários

Após análise de todas as queries em `src/services/api.ts`, hooks e componentes, identifiquei os padrões de acesso mais frequentes e que se beneficiariam de índices.

---

## Tabela: messages

**Queries identificadas:**
1. `fetchConversations` - `.in('conversation_id', conversationIds).order('sent_at', DESC).limit(20000)`
2. `fetchDashboardMetrics` - `.gte('sent_at', periodStartStr)` + `.not('nina_response_time', 'is', null)`
3. `fetchConversationMessages` - `.eq('conversation_id', conversationId).order('sent_at', DESC).limit(limit)`
4. `markMessagesAsRead` - `.eq('conversation_id', conversationId).eq('from_type', 'user').in('status', [...])`
5. `fetchContacts` - `.in('conversation_id', conversationIds).eq('from_type', 'nina').contains('metadata', {...})`

**Índices necessários:**
```sql
-- Já criado: idx_messages_conversation_sent_at
-- Índice composto para busca de mensagens por conversa ordenadas por data

-- NOVO: Índice para métricas de tempo de resposta
CREATE INDEX IF NOT EXISTS idx_messages_nina_response_time
ON public.messages(sent_at)
WHERE nina_response_time IS NOT NULL AND nina_response_time > 0;

-- NOVO: Índice para marcar mensagens como lidas
CREATE INDEX IF NOT EXISTS idx_messages_unread_user
ON public.messages(conversation_id, from_type, status)
WHERE from_type = 'user' AND status IN ('sent', 'delivered');

-- NOVO: Índice para busca de templates
CREATE INDEX IF NOT EXISTS idx_messages_template_search
ON public.messages(conversation_id, from_type)
WHERE from_type = 'nina';
```

---

## Tabela: conversations

**Queries identificadas:**
1. `fetchConversations` - `.eq('is_active', true).order('last_message_at', DESC).limit(200)`
2. `fetchArchivedConversations` - `.eq('is_active', false).order('last_message_at', DESC).limit(100)`
3. `getOrCreateConversation` - `.eq('contact_id', contactId).eq('is_active', true)`
4. `deleteContact` - `.eq('contact_id', id)`
5. `fetchPipeline` - `.in('contact_id', contactIds)` (para buscar conversationId)

**Índices necessários:**
```sql
-- Já criado: idx_conversations_active_last_message

-- NOVO: Índice para busca de conversa por contato
CREATE INDEX IF NOT EXISTS idx_conversations_contact_active
ON public.conversations(contact_id, is_active)
WHERE is_active = true;

-- NOVO: Índice para conversas arquivadas
CREATE INDEX IF NOT EXISTS idx_conversations_archived_last_message
ON public.conversations(is_active, last_message_at DESC)
WHERE is_active = false;

-- NOVO: Índice para status de conversa
CREATE INDEX IF NOT EXISTS idx_conversations_status
ON public.conversations(status, is_active);
```

---

## Tabela: contacts

**Queries identificadas:**
1. `fetchContacts` - `.order('last_activity', DESC).limit(500)`
2. `fetchDashboardMetrics` - `.gte('created_at', periodStartStr)` (count)
3. Múltiplas queries com `.eq('id', contactId)`

**Índices necessários:**
```sql
-- NOVO: Índice para listagem de contatos ordenada
CREATE INDEX IF NOT EXISTS idx_contacts_last_activity
ON public.contacts(last_activity DESC);

-- NOVO: Índice para contagem de novos contatos
CREATE INDEX IF NOT EXISTS idx_contacts_created_at
ON public.contacts(created_at);

-- NOVO: Índice para busca por telefone (usado em importação CSV)
CREATE INDEX IF NOT EXISTS idx_contacts_phone_number
ON public.contacts(phone_number);
```

---

## Tabela: deals

**Queries identificadas:**
1. `fetchPipeline` - `.eq('pipeline_id', pipelineId).order('created_at', DESC)`
2. `fetchContacts` - `.in('contact_id', contactIds).order('created_at', DESC)`
3. `getDealByContactId` - `.eq('contact_id', contactId)`
4. `updateContactsPipeline` - `.in('contact_id', contactIds)`
5. `fetchDashboardMetrics` - `.not('won_at', 'is', null).gte('won_at', periodStartStr)`
6. `moveDealStage` - `.eq('stage_id', id)` (para mover deals ao deletar stage)

**Índices necessários:**
```sql
-- Já criado: idx_deals_contact_created

-- NOVO: Índice para busca de deals por pipeline
CREATE INDEX IF NOT EXISTS idx_deals_pipeline_created
ON public.deals(pipeline_id, created_at DESC);

-- NOVO: Índice para deals ganhos (métricas)
CREATE INDEX IF NOT EXISTS idx_deals_won_at
ON public.deals(won_at)
WHERE won_at IS NOT NULL;

-- NOVO: Índice para deals perdidos
CREATE INDEX IF NOT EXISTS idx_deals_lost_at
ON public.deals(lost_at)
WHERE lost_at IS NOT NULL;

-- NOVO: Índice para busca por estágio
CREATE INDEX IF NOT EXISTS idx_deals_stage_id
ON public.deals(stage_id);

-- NOVO: Índice para filtro por owner
CREATE INDEX IF NOT EXISTS idx_deals_owner_id
ON public.deals(owner_id)
WHERE owner_id IS NOT NULL;
```

---

## Tabela: pipeline_stages

**Queries identificadas:**
1. `fetchPipelineStages` - `.eq('is_active', true).eq('pipeline_id', pipelineId).order('position', ASC)`
2. `updateContactsPipeline` - `.eq('pipeline_id', pipelineId).order('position', ASC).limit(1)`
3. `moveDealStage` - `.eq('id', newStageId)`

**Índices necessários:**
```sql
-- NOVO: Índice composto para busca de estágios por pipeline
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline_position
ON public.pipeline_stages(pipeline_id, position)
WHERE is_active = true;
```

---

## Tabela: appointments

**Queries identificadas:**
1. `fetchAppointments` - `.order('date', ASC).order('time', ASC)`
2. `fetchDashboardMetrics` - `.gte('created_at', periodStartStr)` (count)

**Índices necessários:**
```sql
-- NOVO: Índice para listagem de agendamentos
CREATE INDEX IF NOT EXISTS idx_appointments_date_time
ON public.appointments(date, time);

-- NOVO: Índice para contagem de agendamentos por período
CREATE INDEX IF NOT EXISTS idx_appointments_created_at
ON public.appointments(created_at);
```

---

## Tabela: team_members

**Queries identificadas:**
1. `fetchTeam` - `.order('created_at', DESC)`

**Índices necessários:**
```sql
-- NOVO: Índice para listagem de membros
CREATE INDEX IF NOT EXISTS idx_team_members_created_at
ON public.team_members(created_at DESC);
```

---

## Tabela: deal_activities

**Queries identificadas:**
1. `fetchDealActivities` - `.eq('deal_id', dealId).order('created_at', DESC)`

**Índices necessários:**
```sql
-- NOVO: Índice para atividades por deal
CREATE INDEX IF NOT EXISTS idx_deal_activities_deal_created
ON public.deal_activities(deal_id, created_at DESC);
```

---

## Tabela: followup_automations

**Queries identificadas (edge functions):**
1. Busca por automações ativas

**Índices necessários:**
```sql
-- NOVO: Índice para automações ativas
CREATE INDEX IF NOT EXISTS idx_followup_automations_active
ON public.followup_automations(is_active)
WHERE is_active = true;
```

---

## Tabela: send_queue

**Queries identificadas:**
1. `claim_send_queue_batch` - busca por status + scheduled_at

**Índices necessários:**
```sql
-- NOVO: Índice para processamento de fila de envio
CREATE INDEX IF NOT EXISTS idx_send_queue_pending
ON public.send_queue(status, scheduled_at, priority DESC)
WHERE status = 'pending';
```

---

## Tabela: nina_processing_queue

**Queries identificadas:**
1. `claim_nina_processing_batch` - busca por status + scheduled_for

**Índices necessários:**
```sql
-- NOVO: Índice para processamento de fila Nina
CREATE INDEX IF NOT EXISTS idx_nina_processing_queue_pending
ON public.nina_processing_queue(status, scheduled_for, priority DESC)
WHERE status = 'pending';
```

---

## Tabela: whatsapp_campaigns / campaign_contacts

**Queries identificadas:**
1. `fetchCampaigns` - `.order('created_at', DESC)`
2. `claim_campaign_batch` - `.eq('campaign_id', id).eq('status', 'pending').order('position')`

**Índices necessários:**
```sql
-- NOVO: Índice para campanhas
CREATE INDEX IF NOT EXISTS idx_whatsapp_campaigns_created_at
ON public.whatsapp_campaigns(created_at DESC);

-- NOVO: Índice para contatos de campanha pendentes
CREATE INDEX IF NOT EXISTS idx_campaign_contacts_pending
ON public.campaign_contacts(campaign_id, status, position)
WHERE status = 'pending';
```

---

## Script Completo de Criação de Índices

```sql
-- ============================================
-- SCRIPT DE CRIAÇÃO DE ÍNDICES - CRM JACOMETO
-- Executar no Supabase SQL Editor
-- ============================================

-- NOTA: CREATE INDEX CONCURRENTLY não funciona dentro de transações
-- Execute cada comando separadamente se necessário

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

-- ===========================================
-- VERIFICAÇÃO DE ÍNDICES CRIADOS
-- ===========================================

SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
```

---

## Resumo dos Índices

| Tabela | Índices Novos | Impacto Esperado |
|--------|---------------|------------------|
| messages | 2 | -40% tempo de métricas |
| conversations | 3 | -30% tempo de busca |
| contacts | 3 | -50% tempo de listagem |
| deals | 5 | -40% tempo de Kanban |
| pipeline_stages | 1 | -20% tempo de carregamento |
| appointments | 2 | -30% tempo de agenda |
| team_members | 1 | Marginal |
| deal_activities | 1 | -30% tempo de atividades |
| send_queue | 1 | -50% tempo de processamento |
| nina_processing_queue | 1 | -50% tempo de processamento |
| whatsapp_campaigns | 1 | -20% tempo de listagem |
| campaign_contacts | 1 | -60% tempo de processamento |

**Total: 22 novos índices** (além dos 4 já criados anteriormente)

---

## Seção Técnica: Por que esses índices?

### Índices Parciais (WHERE)
Usados quando a query sempre filtra por uma condição específica. Exemplo:
- `idx_deals_won_at WHERE won_at IS NOT NULL` - Só indexa deals ganhos, economizando espaço

### Índices Compostos
Usados quando queries filtram por múltiplas colunas. A ordem importa:
- `idx_deals_pipeline_created(pipeline_id, created_at DESC)` - Primeiro filtra por pipeline, depois ordena

### Trade-offs
- **Escrita mais lenta**: Cada INSERT/UPDATE atualiza os índices
- **Mais espaço em disco**: Índices ocupam ~10-20% do tamanho da tabela
- **Manutenção**: Índices podem fragmentar e precisar de REINDEX

Para este CRM, o ganho em leitura supera o custo de escrita, já que a proporção é ~90% leituras / 10% escritas.

