-- Add sync_to_pipedrive column to pipeline_stages table
ALTER TABLE public.pipeline_stages 
ADD COLUMN sync_to_pipedrive boolean DEFAULT false;