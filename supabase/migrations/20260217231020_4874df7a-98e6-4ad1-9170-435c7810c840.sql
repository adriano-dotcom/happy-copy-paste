ALTER TABLE nina_settings 
  ADD COLUMN IF NOT EXISTS auto_voice_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_voice_paused_at timestamptz;