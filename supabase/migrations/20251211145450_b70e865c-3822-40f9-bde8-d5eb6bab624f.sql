-- Adicionar campos de transcrição na tabela call_logs
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS transcription TEXT DEFAULT NULL;
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS transcription_status TEXT DEFAULT NULL;