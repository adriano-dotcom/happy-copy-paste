-- Create storage bucket for WhatsApp media (audio, images, documents)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'whatsapp-media', 
  'whatsapp-media', 
  true,
  52428800, -- 50MB limit
  ARRAY['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/webm', 'audio/aac', 'image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'application/pdf']
);

-- Policy: Anyone can view files (public bucket)
CREATE POLICY "Public can view whatsapp media"
ON storage.objects FOR SELECT
USING (bucket_id = 'whatsapp-media');

-- Policy: Only service role can upload (via edge functions)
CREATE POLICY "Service role can upload whatsapp media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'whatsapp-media');

-- Policy: Only service role can delete
CREATE POLICY "Service role can delete whatsapp media"
ON storage.objects FOR DELETE
USING (bucket_id = 'whatsapp-media');