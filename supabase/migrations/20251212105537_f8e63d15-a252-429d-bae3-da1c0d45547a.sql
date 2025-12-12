-- Criar bucket para armazenar áudios gerados pela Nina
INSERT INTO storage.buckets (id, name, public)
VALUES ('nina-audio', 'nina-audio', true)
ON CONFLICT (id) DO NOTHING;

-- Política de acesso público para leitura dos áudios
CREATE POLICY "Public can read nina audio files"
ON storage.objects FOR SELECT
USING (bucket_id = 'nina-audio');

-- Política para permitir upload via service role (edge functions)
CREATE POLICY "Service role can upload nina audio"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'nina-audio');

-- Política para permitir delete via service role
CREATE POLICY "Service role can delete nina audio"
ON storage.objects FOR DELETE
USING (bucket_id = 'nina-audio');