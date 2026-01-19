-- Create whatsapp_quality_history table for tracking quality score changes
CREATE TABLE public.whatsapp_quality_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number_id TEXT NOT NULL,
  display_phone_number TEXT,
  event_type TEXT NOT NULL, -- UPGRADE, DOWNGRADE, FLAGGED, UNFLAGGED
  current_limit TEXT, -- TIER_1K, TIER_10K, TIER_100K, TIER_UNLIMITED
  old_limit TEXT,
  quality_rating TEXT NOT NULL, -- GREEN, YELLOW, RED
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for fast queries
CREATE INDEX idx_quality_history_phone ON public.whatsapp_quality_history(phone_number_id);
CREATE INDEX idx_quality_history_date ON public.whatsapp_quality_history(recorded_at DESC);
CREATE INDEX idx_quality_history_rating ON public.whatsapp_quality_history(quality_rating);

-- Add column to nina_settings for current quality status
ALTER TABLE public.nina_settings 
ADD COLUMN IF NOT EXISTS whatsapp_quality_status JSONB 
DEFAULT '{"rating": "GREEN", "event": null, "tier": "TIER_1K", "last_check": null}'::jsonb;

-- Enable RLS
ALTER TABLE public.whatsapp_quality_history ENABLE ROW LEVEL SECURITY;

-- Policy for reading quality history (authenticated users can read)
CREATE POLICY "Authenticated users can view quality history"
ON public.whatsapp_quality_history
FOR SELECT
USING (true);

-- Policy for inserting (service role only - via edge functions)
CREATE POLICY "Service role can insert quality history"
ON public.whatsapp_quality_history
FOR INSERT
WITH CHECK (true);

-- Add comment for documentation
COMMENT ON TABLE public.whatsapp_quality_history IS 'Tracks WhatsApp Business API quality score changes and account events';
COMMENT ON COLUMN public.whatsapp_quality_history.event_type IS 'Type of account event: UPGRADE, DOWNGRADE, FLAGGED, UNFLAGGED';
COMMENT ON COLUMN public.whatsapp_quality_history.quality_rating IS 'Quality rating: GREEN (good), YELLOW (flagged), RED (restricted)';