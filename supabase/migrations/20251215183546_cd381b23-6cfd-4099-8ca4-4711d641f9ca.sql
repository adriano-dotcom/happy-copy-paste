-- Remover foreign keys duplicadas na tabela deals
-- (criadas erroneamente quando já existiam deals_owner_id_fkey, deals_pipeline_id_fkey, deals_stage_id_fkey)

ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS fk_deals_owner_id;
ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS fk_deals_pipeline_id;
ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS fk_deals_stage_id;