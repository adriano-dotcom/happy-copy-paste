
-- Fix 1: Restrict scheduled_emails to admin-only access
DROP POLICY IF EXISTS "Authenticated users can manage scheduled_emails" ON public.scheduled_emails;

CREATE POLICY "Admins can manage scheduled_emails"
ON public.scheduled_emails
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Fix 2: Make whatsapp-media bucket private
UPDATE storage.buckets SET public = false WHERE id = 'whatsapp-media';
