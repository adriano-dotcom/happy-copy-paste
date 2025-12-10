-- 1. Vincular Barbara ao Pipeline Saúde
UPDATE pipelines 
SET agent_id = '9d989c66-f978-409d-93fe-887ba1c0f1c5'
WHERE slug = 'saude';

-- 2. Recriar trigger para criar deals no pipeline do agente default
CREATE OR REPLACE FUNCTION public.create_deal_for_new_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  first_stage_id UUID;
  default_pipeline_id UUID;
BEGIN
  -- Buscar pipeline do agente default (Adri)
  SELECT p.id INTO default_pipeline_id
  FROM public.pipelines p
  JOIN public.agents a ON p.agent_id = a.id
  WHERE a.is_default = true AND p.is_active = true
  LIMIT 1;
  
  -- Buscar primeiro estágio do pipeline
  SELECT id INTO first_stage_id 
  FROM public.pipeline_stages 
  WHERE pipeline_id = default_pipeline_id AND is_active = true 
  ORDER BY position 
  LIMIT 1;
  
  -- Fallback se não encontrar
  IF first_stage_id IS NULL THEN
    SELECT id INTO first_stage_id 
    FROM public.pipeline_stages 
    WHERE is_active = true 
    ORDER BY position 
    LIMIT 1;
  END IF;
  
  IF first_stage_id IS NULL THEN
    RAISE NOTICE 'No pipeline stages found, skipping deal creation for contact %', NEW.id;
    RETURN NEW;
  END IF;
  
  INSERT INTO deals (contact_id, title, stage, stage_id, pipeline_id, priority)
  VALUES (
    NEW.id,
    COALESCE(NEW.name, NEW.call_name, 'Novo Lead'),
    'new',
    first_stage_id,
    default_pipeline_id,
    'medium'
  );
  
  RETURN NEW;
END;
$function$;