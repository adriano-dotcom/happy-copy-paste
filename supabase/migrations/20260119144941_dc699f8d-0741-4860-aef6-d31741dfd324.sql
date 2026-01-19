-- Update whatsapp-media bucket to include audio MIME types
UPDATE storage.buckets 
SET allowed_mime_types = ARRAY[
  -- Images
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  -- Documents  
  'application/pdf', 
  'application/msword', 
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
  -- Audio (WhatsApp supported formats)
  'audio/ogg', 'audio/opus', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 
  'audio/aac', 'audio/amr', 'audio/wav', 'audio/webm', 'audio/x-wav'
]
WHERE id = 'whatsapp-media';