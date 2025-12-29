-- Make nina-audio bucket private for security
UPDATE storage.buckets 
SET public = false 
WHERE id = 'nina-audio';

-- Remove public access policy
DROP POLICY IF EXISTS "Public Access to nina-audio" ON storage.objects;

-- Drop existing policies to recreate them properly
DROP POLICY IF EXISTS "Service role can upload to nina-audio" ON storage.objects;
DROP POLICY IF EXISTS "Service role can delete from nina-audio" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read nina-audio" ON storage.objects;

-- Allow authenticated users to read nina-audio files
CREATE POLICY "Authenticated users can read nina-audio"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'nina-audio' 
  AND auth.role() = 'authenticated'
);

-- Service role can upload to nina-audio (for edge functions)
CREATE POLICY "Service role can upload to nina-audio" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'nina-audio');

-- Service role can delete from nina-audio
CREATE POLICY "Service role can delete from nina-audio" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'nina-audio');