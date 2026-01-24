-- Fix RLS for whatsapp_campaigns table
-- Drop overly permissive policy
DROP POLICY IF EXISTS "whatsapp_campaigns_policy" ON public.whatsapp_campaigns;
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON public.whatsapp_campaigns;
DROP POLICY IF EXISTS "authenticated_access" ON public.whatsapp_campaigns;

-- Create proper RLS policies for whatsapp_campaigns
-- Allow admins full access
CREATE POLICY "admin_full_access_campaigns" ON public.whatsapp_campaigns
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Allow team members to view campaigns
CREATE POLICY "team_view_campaigns" ON public.whatsapp_campaigns
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
  );

-- Fix RLS for campaign_contacts table as well (related table)
DROP POLICY IF EXISTS "campaign_contacts_policy" ON public.campaign_contacts;
DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON public.campaign_contacts;
DROP POLICY IF EXISTS "authenticated_access" ON public.campaign_contacts;

-- Create proper RLS policies for campaign_contacts
CREATE POLICY "admin_full_access_campaign_contacts" ON public.campaign_contacts
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'admin'
    )
  );

-- Allow team members to view campaign contacts
CREATE POLICY "team_view_campaign_contacts" ON public.campaign_contacts
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
  );