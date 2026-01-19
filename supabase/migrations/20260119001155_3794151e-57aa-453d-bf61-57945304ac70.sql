-- =====================================================
-- CAMPAIGN INFRASTRUCTURE FOR HIGH-VOLUME WHATSAPP
-- =====================================================

-- 1. WHATSAPP RATE LIMITS TABLE
-- Controls per-number rate limiting based on WhatsApp tiers
CREATE TABLE IF NOT EXISTS public.whatsapp_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number_id text NOT NULL UNIQUE,
  tier int DEFAULT 1, -- 1=1K/day, 2=10K/day, 3=100K/day
  daily_limit int DEFAULT 1000,
  hourly_limit int DEFAULT 100,
  messages_today int DEFAULT 0,
  messages_this_hour int DEFAULT 0,
  last_reset_date date DEFAULT CURRENT_DATE,
  last_reset_hour int DEFAULT EXTRACT(HOUR FROM now())::int,
  quality_score text DEFAULT 'GREEN' CHECK (quality_score IN ('GREEN', 'YELLOW', 'RED')),
  paused_until timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. WHATSAPP CAMPAIGNS TABLE
-- Main campaign definition with targeting and scheduling
CREATE TABLE IF NOT EXISTS public.whatsapp_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  template_id uuid REFERENCES public.whatsapp_templates(id),
  template_variables jsonb DEFAULT '{}',
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled', 'failed')),
  
  -- Counters
  total_contacts int DEFAULT 0,
  sent_count int DEFAULT 0,
  delivered_count int DEFAULT 0,
  read_count int DEFAULT 0,
  replied_count int DEFAULT 0,
  failed_count int DEFAULT 0,
  skipped_count int DEFAULT 0,
  
  -- Rate control
  interval_seconds int DEFAULT 60 CHECK (interval_seconds >= 5),
  messages_per_batch int DEFAULT 1 CHECK (messages_per_batch >= 1 AND messages_per_batch <= 50),
  max_failures_before_pause int DEFAULT 10,
  current_failure_streak int DEFAULT 0,
  
  -- Targeting
  is_prospecting boolean DEFAULT true,
  target_pipeline_id uuid REFERENCES public.pipelines(id),
  target_stage_id uuid REFERENCES public.pipeline_stages(id),
  
  -- Scheduling
  scheduled_at timestamptz,
  started_at timestamptz,
  paused_at timestamptz,
  completed_at timestamptz,
  last_processed_at timestamptz,
  
  -- Metadata
  created_by uuid,
  owner_id uuid REFERENCES public.team_members(id),
  metadata jsonb DEFAULT '{}',
  error_message text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. CAMPAIGN CONTACTS TABLE
-- Individual contacts per campaign with status tracking
CREATE TABLE IF NOT EXISTS public.campaign_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.whatsapp_campaigns(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id),
  
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'sent', 'delivered', 'read', 'replied', 'failed', 'skipped')),
  position int, -- Order in queue
  
  -- Scheduling
  scheduled_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  replied_at timestamptz,
  
  -- Error tracking
  error_code text,
  error_message text,
  retry_count int DEFAULT 0,
  
  -- WhatsApp tracking
  whatsapp_message_id text,
  
  -- Deal created from this campaign contact
  deal_id uuid REFERENCES public.deals(id),
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(campaign_id, contact_id)
);

-- 4. WHATSAPP METRICS TABLE
-- Hourly metrics for monitoring and alerts
CREATE TABLE IF NOT EXISTS public.whatsapp_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number_id text,
  metric_date date DEFAULT CURRENT_DATE,
  metric_hour int DEFAULT EXTRACT(HOUR FROM now())::int,
  
  -- Message counts
  messages_sent int DEFAULT 0,
  messages_delivered int DEFAULT 0,
  messages_read int DEFAULT 0,
  messages_failed int DEFAULT 0,
  templates_sent int DEFAULT 0,
  
  -- Performance
  avg_delivery_time_ms int,
  avg_response_time_ms int,
  
  -- Error breakdown
  error_131026_count int DEFAULT 0, -- undeliverable
  error_131049_count int DEFAULT 0, -- spam/ecosystem
  error_other_count int DEFAULT 0,
  
  -- Quality
  quality_score text,
  delivery_rate numeric(5,2),
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(phone_number_id, metric_date, metric_hour)
);

-- 5. WEBHOOK DEAD LETTER QUEUE
-- Failed webhook payloads for retry
CREATE TABLE IF NOT EXISTS public.webhook_dead_letter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_type text DEFAULT 'whatsapp', -- whatsapp, api4com, etc
  payload jsonb NOT NULL,
  headers jsonb,
  error_message text,
  error_stack text,
  
  retry_count int DEFAULT 0,
  max_retries int DEFAULT 5,
  next_retry_at timestamptz,
  last_retry_at timestamptz,
  
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'retrying', 'failed', 'resolved')),
  resolved_at timestamptz,
  
  created_at timestamptz DEFAULT now()
);

-- =====================================================
-- INDICES FOR HIGH-PERFORMANCE QUERIES
-- =====================================================

-- Rate limits
CREATE INDEX IF NOT EXISTS idx_rate_limits_phone ON public.whatsapp_rate_limits(phone_number_id);

-- Campaigns
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON public.whatsapp_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled ON public.whatsapp_campaigns(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_campaigns_running ON public.whatsapp_campaigns(last_processed_at) WHERE status = 'running';

-- Campaign contacts - critical for processing
CREATE INDEX IF NOT EXISTS idx_cc_campaign_status ON public.campaign_contacts(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_cc_pending ON public.campaign_contacts(campaign_id, position) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_cc_scheduled ON public.campaign_contacts(scheduled_at) WHERE status IN ('pending', 'queued');
CREATE INDEX IF NOT EXISTS idx_cc_whatsapp_id ON public.campaign_contacts(whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL;

-- Metrics
CREATE INDEX IF NOT EXISTS idx_metrics_date_hour ON public.whatsapp_metrics(metric_date, metric_hour);
CREATE INDEX IF NOT EXISTS idx_metrics_phone_date ON public.whatsapp_metrics(phone_number_id, metric_date);

-- Dead letter queue
CREATE INDEX IF NOT EXISTS idx_dlq_status_retry ON public.webhook_dead_letter(status, next_retry_at) WHERE status IN ('pending', 'retrying');

-- =====================================================
-- FUNCTIONS FOR CAMPAIGN PROCESSING
-- =====================================================

-- Function to get next batch of contacts to process
CREATE OR REPLACE FUNCTION public.claim_campaign_batch(
  p_campaign_id uuid,
  p_batch_size int DEFAULT 10
)
RETURNS SETOF public.campaign_contacts
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH batch AS (
    SELECT cc.id
    FROM public.campaign_contacts cc
    WHERE cc.campaign_id = p_campaign_id
      AND cc.status = 'pending'
      AND (cc.scheduled_at IS NULL OR cc.scheduled_at <= now())
    ORDER BY cc.position NULLS LAST, cc.created_at
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.campaign_contacts
  SET status = 'queued', updated_at = now()
  WHERE id IN (SELECT id FROM batch)
  RETURNING *;
END;
$$;

-- Function to update campaign counters atomically
CREATE OR REPLACE FUNCTION public.update_campaign_counters(
  p_campaign_id uuid,
  p_sent int DEFAULT 0,
  p_delivered int DEFAULT 0,
  p_read int DEFAULT 0,
  p_replied int DEFAULT 0,
  p_failed int DEFAULT 0,
  p_skipped int DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.whatsapp_campaigns
  SET 
    sent_count = sent_count + p_sent,
    delivered_count = delivered_count + p_delivered,
    read_count = read_count + p_read,
    replied_count = replied_count + p_replied,
    failed_count = failed_count + p_failed,
    skipped_count = skipped_count + p_skipped,
    current_failure_streak = CASE 
      WHEN p_failed > 0 THEN current_failure_streak + p_failed
      WHEN p_sent > 0 OR p_delivered > 0 THEN 0
      ELSE current_failure_streak
    END,
    last_processed_at = now(),
    updated_at = now()
  WHERE id = p_campaign_id;
END;
$$;

-- Function to check if rate limit allows sending
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_phone_number_id text
)
RETURNS TABLE(can_send boolean, wait_seconds int, reason text)
LANGUAGE plpgsql
AS $$
DECLARE
  v_limit record;
BEGIN
  -- Get or create rate limit record
  INSERT INTO public.whatsapp_rate_limits (phone_number_id)
  VALUES (p_phone_number_id)
  ON CONFLICT (phone_number_id) DO NOTHING;
  
  SELECT * INTO v_limit
  FROM public.whatsapp_rate_limits
  WHERE phone_number_id = p_phone_number_id;
  
  -- Reset daily counter if new day
  IF v_limit.last_reset_date < CURRENT_DATE THEN
    UPDATE public.whatsapp_rate_limits
    SET messages_today = 0, last_reset_date = CURRENT_DATE
    WHERE phone_number_id = p_phone_number_id;
    v_limit.messages_today := 0;
  END IF;
  
  -- Reset hourly counter if new hour
  IF v_limit.last_reset_hour != EXTRACT(HOUR FROM now())::int THEN
    UPDATE public.whatsapp_rate_limits
    SET messages_this_hour = 0, last_reset_hour = EXTRACT(HOUR FROM now())::int
    WHERE phone_number_id = p_phone_number_id;
    v_limit.messages_this_hour := 0;
  END IF;
  
  -- Check if paused
  IF v_limit.paused_until IS NOT NULL AND v_limit.paused_until > now() THEN
    RETURN QUERY SELECT false, EXTRACT(EPOCH FROM (v_limit.paused_until - now()))::int, 'Rate limit paused';
    RETURN;
  END IF;
  
  -- Check quality score
  IF v_limit.quality_score = 'RED' THEN
    RETURN QUERY SELECT false, 3600, 'Quality score RED - campaigns paused';
    RETURN;
  END IF;
  
  -- Check daily limit
  IF v_limit.messages_today >= v_limit.daily_limit THEN
    RETURN QUERY SELECT false, 3600, 'Daily limit reached';
    RETURN;
  END IF;
  
  -- Check hourly limit (reduced if quality is YELLOW)
  DECLARE
    v_hourly_limit int := v_limit.hourly_limit;
  BEGIN
    IF v_limit.quality_score = 'YELLOW' THEN
      v_hourly_limit := v_hourly_limit / 2;
    END IF;
    
    IF v_limit.messages_this_hour >= v_hourly_limit THEN
      RETURN QUERY SELECT false, 60, 'Hourly limit reached';
      RETURN;
    END IF;
  END;
  
  -- Can send
  RETURN QUERY SELECT true, 0, null::text;
END;
$$;

-- Function to increment rate limit counter
CREATE OR REPLACE FUNCTION public.increment_rate_limit(
  p_phone_number_id text,
  p_count int DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.whatsapp_rate_limits
  SET 
    messages_today = messages_today + p_count,
    messages_this_hour = messages_this_hour + p_count,
    updated_at = now()
  WHERE phone_number_id = p_phone_number_id;
END;
$$;

-- =====================================================
-- RLS POLICIES
-- =====================================================

ALTER TABLE public.whatsapp_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_dead_letter ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read/write campaigns
CREATE POLICY "Authenticated users can manage campaigns"
  ON public.whatsapp_campaigns FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can manage campaign contacts"
  ON public.campaign_contacts FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view rate limits"
  ON public.whatsapp_rate_limits FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view metrics"
  ON public.whatsapp_metrics FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view dead letter queue"
  ON public.webhook_dead_letter FOR SELECT
  TO authenticated
  USING (true);

-- Service role can do everything
CREATE POLICY "Service role full access to rate limits"
  ON public.whatsapp_rate_limits FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to metrics"
  ON public.whatsapp_metrics FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access to dead letter"
  ON public.webhook_dead_letter FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- REALTIME SUBSCRIPTIONS
-- =====================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_campaigns;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_contacts;