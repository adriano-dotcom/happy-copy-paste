-- Allow any authenticated user to update auto_attendant_active flag
CREATE POLICY "Authenticated users can update auto_attendant_active"
ON public.nina_settings
FOR UPDATE
USING (is_authenticated_user())
WITH CHECK (is_authenticated_user());

-- Also allow any authenticated user to read nina_settings (needed for the flag check)
CREATE POLICY "Authenticated users can read nina_settings"
ON public.nina_settings
FOR SELECT
USING (is_authenticated_user());