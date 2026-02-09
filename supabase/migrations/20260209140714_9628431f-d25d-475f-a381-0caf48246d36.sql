
-- Make nina-audio bucket public (like whatsapp-media)
UPDATE storage.buckets SET public = true WHERE id = 'nina-audio';

-- Add public read policy for nina-audio
CREATE POLICY "Public read access for nina-audio"
ON storage.objects FOR SELECT
USING (bucket_id = 'nina-audio');
