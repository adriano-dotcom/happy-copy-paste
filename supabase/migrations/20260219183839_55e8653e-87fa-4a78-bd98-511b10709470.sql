
CREATE TABLE public.whatsapp_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp_call_id text,
  contact_id uuid,
  conversation_id uuid,
  direction text NOT NULL DEFAULT 'inbound',
  status text NOT NULL DEFAULT 'ringing',
  phone_number_id text,
  from_number text,
  to_number text,
  sdp_offer text,
  started_at timestamptz DEFAULT now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  hangup_cause text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view whatsapp_calls"
  ON public.whatsapp_calls FOR SELECT
  USING (is_authenticated_user());

CREATE POLICY "Authenticated users can manage whatsapp_calls"
  ON public.whatsapp_calls FOR ALL
  USING (is_authenticated_user())
  WITH CHECK (is_authenticated_user());

ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_calls;
