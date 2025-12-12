-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'operator', 'viewer');

-- Create user_roles table
CREATE TABLE public.user_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL DEFAULT 'operator',
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to check if user is authenticated team member
CREATE OR REPLACE FUNCTION public.is_authenticated_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
  )
$$;

-- RLS policy for user_roles: only admins can manage, users can read their own
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all roles"
ON public.user_roles FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Drop all existing permissive policies and create proper ones

-- nina_settings: only admins can access (contains API keys)
DROP POLICY IF EXISTS "Allow all operations on nina_settings" ON public.nina_settings;
CREATE POLICY "Admins can manage settings"
ON public.nina_settings FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- contacts: authenticated users can access
DROP POLICY IF EXISTS "Allow all operations on contacts" ON public.contacts;
CREATE POLICY "Authenticated users can manage contacts"
ON public.contacts FOR ALL TO authenticated
USING (public.is_authenticated_user())
WITH CHECK (public.is_authenticated_user());

-- conversations: authenticated users can access
DROP POLICY IF EXISTS "Allow all operations on conversations" ON public.conversations;
CREATE POLICY "Authenticated users can manage conversations"
ON public.conversations FOR ALL TO authenticated
USING (public.is_authenticated_user())
WITH CHECK (public.is_authenticated_user());

-- messages: authenticated users can access
DROP POLICY IF EXISTS "Allow all operations on messages" ON public.messages;
CREATE POLICY "Authenticated users can manage messages"
ON public.messages FOR ALL TO authenticated
USING (public.is_authenticated_user())
WITH CHECK (public.is_authenticated_user());

-- deals: authenticated users can access
DROP POLICY IF EXISTS "Allow all operations on deals" ON public.deals;
CREATE POLICY "Authenticated users can manage deals"
ON public.deals FOR ALL TO authenticated
USING (public.is_authenticated_user())
WITH CHECK (public.is_authenticated_user());

-- deal_activities: authenticated users can access
DROP POLICY IF EXISTS "Allow all operations on deal_activities" ON public.deal_activities;
CREATE POLICY "Authenticated users can manage deal_activities"
ON public.deal_activities FOR ALL TO authenticated
USING (public.is_authenticated_user())
WITH CHECK (public.is_authenticated_user());

-- call_logs: authenticated users can access
DROP POLICY IF EXISTS "Allow all operations on call_logs" ON public.call_logs;
CREATE POLICY "Authenticated users can manage call_logs"
ON public.call_logs FOR ALL TO authenticated
USING (public.is_authenticated_user())
WITH CHECK (public.is_authenticated_user());

-- agents: only admins can modify, authenticated can read
DROP POLICY IF EXISTS "Allow all operations on agents" ON public.agents;
CREATE POLICY "Authenticated users can view agents"
ON public.agents FOR SELECT TO authenticated
USING (public.is_authenticated_user());

CREATE POLICY "Admins can manage agents"
ON public.agents FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- appointments: authenticated users can access
DROP POLICY IF EXISTS "Allow all operations on appointments" ON public.appointments;
CREATE POLICY "Authenticated users can manage appointments"
ON public.appointments FOR ALL TO authenticated
USING (public.is_authenticated_user())
WITH CHECK (public.is_authenticated_user());

-- conversation_states: authenticated users can access
DROP POLICY IF EXISTS "Allow all operations on conversation_states" ON public.conversation_states;
CREATE POLICY "Authenticated users can manage conversation_states"
ON public.conversation_states FOR ALL TO authenticated
USING (public.is_authenticated_user())
WITH CHECK (public.is_authenticated_user());

-- email_templates: authenticated users can access
DROP POLICY IF EXISTS "Allow all operations on email_templates" ON public.email_templates;
CREATE POLICY "Authenticated users can manage email_templates"
ON public.email_templates FOR ALL TO authenticated
USING (public.is_authenticated_user())
WITH CHECK (public.is_authenticated_user());

-- followup_automations: only admins can manage
DROP POLICY IF EXISTS "Allow all operations on followup_automations" ON public.followup_automations;
CREATE POLICY "Authenticated users can view followup_automations"
ON public.followup_automations FOR SELECT TO authenticated
USING (public.is_authenticated_user());

CREATE POLICY "Admins can manage followup_automations"
ON public.followup_automations FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- followup_logs: authenticated users can access
DROP POLICY IF EXISTS "Allow all operations on followup_logs" ON public.followup_logs;
CREATE POLICY "Authenticated users can manage followup_logs"
ON public.followup_logs FOR ALL TO authenticated
USING (public.is_authenticated_user())
WITH CHECK (public.is_authenticated_user());

-- message_grouping_queue: service role only (internal processing)
DROP POLICY IF EXISTS "Allow all operations on message_grouping_queue" ON public.message_grouping_queue;

-- message_processing_queue: service role only (internal processing)
DROP POLICY IF EXISTS "Allow all operations on message_processing_queue" ON public.message_processing_queue;

-- nina_processing_queue: service role only (internal processing)
DROP POLICY IF EXISTS "Allow all operations on nina_processing_queue" ON public.nina_processing_queue;

-- send_queue: service role only (internal processing)
DROP POLICY IF EXISTS "Allow all operations on send_queue" ON public.send_queue;

-- pipeline_stages: authenticated users can access
DROP POLICY IF EXISTS "Allow all operations on pipeline_stages" ON public.pipeline_stages;
CREATE POLICY "Authenticated users can manage pipeline_stages"
ON public.pipeline_stages FOR ALL TO authenticated
USING (public.is_authenticated_user())
WITH CHECK (public.is_authenticated_user());

-- pipelines: authenticated users can access
DROP POLICY IF EXISTS "Allow all operations on pipelines" ON public.pipelines;
CREATE POLICY "Authenticated users can manage pipelines"
ON public.pipelines FOR ALL TO authenticated
USING (public.is_authenticated_user())
WITH CHECK (public.is_authenticated_user());

-- tag_definitions: authenticated users can access
DROP POLICY IF EXISTS "Allow all operations on tag_definitions" ON public.tag_definitions;
CREATE POLICY "Authenticated users can manage tag_definitions"
ON public.tag_definitions FOR ALL TO authenticated
USING (public.is_authenticated_user())
WITH CHECK (public.is_authenticated_user());

-- team_functions: authenticated users can access
DROP POLICY IF EXISTS "Allow all operations on team_functions" ON public.team_functions;
CREATE POLICY "Authenticated users can manage team_functions"
ON public.team_functions FOR ALL TO authenticated
USING (public.is_authenticated_user())
WITH CHECK (public.is_authenticated_user());

-- team_members: authenticated users can access
DROP POLICY IF EXISTS "Allow all operations on team_members" ON public.team_members;
CREATE POLICY "Authenticated users can manage team_members"
ON public.team_members FOR ALL TO authenticated
USING (public.is_authenticated_user())
WITH CHECK (public.is_authenticated_user());

-- teams: authenticated users can access
DROP POLICY IF EXISTS "Allow all operations on teams" ON public.teams;
CREATE POLICY "Authenticated users can manage teams"
ON public.teams FOR ALL TO authenticated
USING (public.is_authenticated_user())
WITH CHECK (public.is_authenticated_user());

-- whatsapp_templates: authenticated users can access
DROP POLICY IF EXISTS "Allow all operations on whatsapp_templates" ON public.whatsapp_templates;
CREATE POLICY "Authenticated users can manage whatsapp_templates"
ON public.whatsapp_templates FOR ALL TO authenticated
USING (public.is_authenticated_user())
WITH CHECK (public.is_authenticated_user());

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION public.has_role TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_authenticated_user TO authenticated;