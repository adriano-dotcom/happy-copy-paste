-- Add audio response settings per agent
ALTER TABLE public.agents 
ADD COLUMN audio_response_enabled BOOLEAN DEFAULT false,
ADD COLUMN elevenlabs_voice_id VARCHAR(255) DEFAULT NULL;

COMMENT ON COLUMN public.agents.audio_response_enabled IS 'Se true, agente responde em áudio quando cliente envia áudio';
COMMENT ON COLUMN public.agents.elevenlabs_voice_id IS 'Voice ID do ElevenLabs específico para este agente (opcional)';