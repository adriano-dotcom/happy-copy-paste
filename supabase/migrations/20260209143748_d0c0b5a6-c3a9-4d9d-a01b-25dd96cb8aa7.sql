
-- Fix disqualification_reports: remove overly permissive SELECT policy, keep authenticated-only access
DROP POLICY IF EXISTS "Authenticated users can view disqualification reports" ON public.disqualification_reports;
DROP POLICY IF EXISTS "Service role can manage disqualification reports" ON public.disqualification_reports;

-- Re-create with proper restrictions
CREATE POLICY "Authenticated users can view disqualification reports"
ON public.disqualification_reports
FOR SELECT
USING (is_authenticated_user());

-- Fix whatsapp_quality_history: remove public SELECT, restrict to authenticated users
DROP POLICY IF EXISTS "Authenticated users can view metrics" ON public.whatsapp_quality_history;
DROP POLICY IF EXISTS "Service role full access" ON public.whatsapp_quality_history;
DROP POLICY IF EXISTS "Public read access" ON public.whatsapp_quality_history;
DROP POLICY IF EXISTS "Anyone can view quality history" ON public.whatsapp_quality_history;

-- Check what policies exist and recreate properly
DO $$
DECLARE
  pol RECORD;
BEGIN
  -- Drop ALL existing policies on whatsapp_quality_history
  FOR pol IN 
    SELECT policyname FROM pg_policies WHERE tablename = 'whatsapp_quality_history' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.whatsapp_quality_history', pol.policyname);
  END LOOP;
END $$;

-- Create proper policies for whatsapp_quality_history
CREATE POLICY "Authenticated users can view quality history"
ON public.whatsapp_quality_history
FOR SELECT
USING (is_authenticated_user());

CREATE POLICY "Admins can manage quality history"
ON public.whatsapp_quality_history
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
