
-- Tabela de qualificações por voz (ElevenLabs outbound calls)
CREATE TABLE public.voice_qualifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  elevenlabs_agent_id TEXT,
  elevenlabs_conversation_id TEXT,
  call_sid TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  qualification_result TEXT,
  interest_level TEXT,
  call_summary TEXT,
  full_transcript TEXT,
  next_step TEXT,
  best_contact_time TEXT,
  observations TEXT,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
  called_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_voice_qualifications_contact_id ON public.voice_qualifications(contact_id);
CREATE INDEX idx_voice_qualifications_status ON public.voice_qualifications(status);
CREATE INDEX idx_voice_qualifications_scheduled ON public.voice_qualifications(status, scheduled_for) WHERE status IN ('pending', 'scheduled');

-- RLS
ALTER TABLE public.voice_qualifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage voice_qualifications"
ON public.voice_qualifications
FOR ALL
USING (is_authenticated_user())
WITH CHECK (is_authenticated_user());

-- Trigger updated_at
CREATE TRIGGER update_voice_qualifications_updated_at
BEFORE UPDATE ON public.voice_qualifications
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
