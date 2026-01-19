-- Fix function search_path for security
CREATE OR REPLACE FUNCTION public.claim_campaign_batch(
  p_campaign_id uuid,
  p_batch_size int DEFAULT 10
)
RETURNS SETOF public.campaign_contacts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
SECURITY DEFINER
SET search_path = public
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

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_phone_number_id text
)
RETURNS TABLE(can_send boolean, wait_seconds int, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit record;
  v_hourly_limit int;
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
  v_hourly_limit := v_limit.hourly_limit;
  IF v_limit.quality_score = 'YELLOW' THEN
    v_hourly_limit := v_hourly_limit / 2;
  END IF;
  
  IF v_limit.messages_this_hour >= v_hourly_limit THEN
    RETURN QUERY SELECT false, 60, 'Hourly limit reached';
    RETURN;
  END IF;
  
  -- Can send
  RETURN QUERY SELECT true, 0, null::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_rate_limit(
  p_phone_number_id text,
  p_count int DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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