-- Adicionar foreign keys na tabela deals para permitir JOINs automáticos do Supabase

-- FK de deals.owner_id → team_members.id
ALTER TABLE public.deals 
ADD CONSTRAINT fk_deals_owner_id 
FOREIGN KEY (owner_id) REFERENCES public.team_members(id) ON DELETE SET NULL;

-- FK de deals.pipeline_id → pipelines.id
ALTER TABLE public.deals 
ADD CONSTRAINT fk_deals_pipeline_id 
FOREIGN KEY (pipeline_id) REFERENCES public.pipelines(id) ON DELETE SET NULL;

-- FK de deals.stage_id → pipeline_stages.id
ALTER TABLE public.deals 
ADD CONSTRAINT fk_deals_stage_id 
FOREIGN KEY (stage_id) REFERENCES public.pipeline_stages(id) ON DELETE SET NULL;