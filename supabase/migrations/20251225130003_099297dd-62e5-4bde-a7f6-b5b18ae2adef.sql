-- Criar bucket para armazenar áudios gerados pela Nina
INSERT INTO storage.buckets (id, name, public)
VALUES ('nina-audio', 'nina-audio', true)
ON CONFLICT (id) DO NOTHING;

-- Política para permitir acesso público aos áudios
CREATE POLICY "Public Access to nina-audio" ON storage.objects
FOR SELECT USING (bucket_id = 'nina-audio');

-- Política para permitir upload via service role
CREATE POLICY "Service role can upload to nina-audio" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'nina-audio');