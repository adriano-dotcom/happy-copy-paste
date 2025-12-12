-- Add voice configuration columns to agents table
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS elevenlabs_model text DEFAULT 'eleven_turbo_v2_5';
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS elevenlabs_stability numeric DEFAULT 0.75;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS elevenlabs_similarity_boost numeric DEFAULT 0.80;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS elevenlabs_style numeric DEFAULT 0.30;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS elevenlabs_speed numeric DEFAULT 1.0;
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS elevenlabs_speaker_boost boolean DEFAULT true;