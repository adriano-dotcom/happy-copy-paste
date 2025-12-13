-- Tabela para controle de rodízio de callbacks
CREATE TABLE IF NOT EXISTS public.callback_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
  pipeline_id uuid REFERENCES public.pipelines(id) ON DELETE CASCADE,
  last_assigned_member_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  assignment_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(team_id, pipeline_id)
);

-- Enable RLS
ALTER TABLE public.callback_assignments ENABLE ROW LEVEL SECURITY;

-- RLS policy - authenticated users can manage
CREATE POLICY "Authenticated users can manage callback_assignments"
ON public.callback_assignments
FOR ALL
USING (is_authenticated_user())
WITH CHECK (is_authenticated_user());

-- Index for fast lookup
CREATE INDEX idx_callback_assignments_pipeline ON public.callback_assignments(pipeline_id);

-- Trigger for updated_at
CREATE TRIGGER update_callback_assignments_updated_at
BEFORE UPDATE ON public.callback_assignments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar realtime para deal_activities (para lembretes)
ALTER PUBLICATION supabase_realtime ADD TABLE public.deal_activities;