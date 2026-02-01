-- Fix RLS policy for sales_coaching_reports
-- Current policy allows all authenticated users to view, but this contains sensitive performance data
-- Should be restricted to admins only

-- Drop the existing overly permissive SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view sales_coaching_reports" ON public.sales_coaching_reports;

-- The existing admin policy already handles full access for admins:
-- "Admins can manage sales_coaching_reports" - ALL for admin role
-- So we don't need any additional policies, admins already have full access