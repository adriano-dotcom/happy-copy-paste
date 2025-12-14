-- Adicionar colunas para distribuição de responsáveis na tabela agents
ALTER TABLE agents ADD COLUMN IF NOT EXISTS owner_distribution_type TEXT DEFAULT 'fixed';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS default_owner_id UUID REFERENCES team_members(id);
ALTER TABLE agents ADD COLUMN IF NOT EXISTS owner_rotation_ids UUID[] DEFAULT '{}';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_assigned_owner_id UUID REFERENCES team_members(id);

-- Configurar Adri: Rotatividade entre Adriana Jacometo e Leonardo Sanches
UPDATE agents SET 
  owner_distribution_type = 'round_robin',
  owner_rotation_ids = ARRAY['9db32c89-d623-4ecf-b43e-35c456cc2e49', 'ffe0eaca-335f-4ba4-9797-e52ba529ae8a']::uuid[],
  last_assigned_owner_id = NULL
WHERE slug = 'adri';

-- Configurar Leonardo (Prospecção): Fixo para Alessandro Francisco
UPDATE agents SET 
  owner_distribution_type = 'fixed',
  default_owner_id = '91ec229f-d63d-4dab-96e5-cc809f17c4e3'
WHERE slug = 'leonardo';

-- Configurar Barbara (Saúde): Fixo para Barbara Francisconi
UPDATE agents SET 
  owner_distribution_type = 'fixed',
  default_owner_id = '232d50ff-4a8b-416e-a71c-086f52f12c64'
WHERE slug = 'barbara-saude';

-- Associar Alessandro ao Team Prospecção
UPDATE team_members 
SET team_id = '60cba822-7e56-434c-a94b-a493bfbf139c'
WHERE id = '91ec229f-d63d-4dab-96e5-cc809f17c4e3';

-- Criar função para obter próximo responsável com rotatividade
CREATE OR REPLACE FUNCTION public.get_next_deal_owner(p_agent_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  agent_record RECORD;
  next_owner_id UUID;
  current_index INT;
BEGIN
  SELECT * INTO agent_record FROM agents WHERE id = p_agent_id;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Tipo fixo: retorna default_owner_id
  IF agent_record.owner_distribution_type = 'fixed' THEN
    RETURN agent_record.default_owner_id;
  END IF;
  
  -- Tipo round_robin: encontra próximo na lista
  IF agent_record.owner_distribution_type = 'round_robin' THEN
    IF array_length(agent_record.owner_rotation_ids, 1) IS NULL OR array_length(agent_record.owner_rotation_ids, 1) = 0 THEN
      RETURN agent_record.default_owner_id;
    END IF;
    
    IF agent_record.last_assigned_owner_id IS NULL THEN
      -- Primeiro da lista
      next_owner_id := agent_record.owner_rotation_ids[1];
    ELSE
      -- Encontrar índice atual e pegar próximo
      SELECT array_position(agent_record.owner_rotation_ids, agent_record.last_assigned_owner_id) INTO current_index;
      IF current_index IS NULL OR current_index >= array_length(agent_record.owner_rotation_ids, 1) THEN
        next_owner_id := agent_record.owner_rotation_ids[1];
      ELSE
        next_owner_id := agent_record.owner_rotation_ids[current_index + 1];
      END IF;
    END IF;
    
    -- Atualizar último atribuído
    UPDATE agents SET last_assigned_owner_id = next_owner_id WHERE id = p_agent_id;
    RETURN next_owner_id;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Atualizar trigger create_deal_for_new_contact para usar a nova função
CREATE OR REPLACE FUNCTION public.create_deal_for_new_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  first_stage_id UUID;
  default_pipeline_id UUID;
  default_agent_id UUID;
  default_owner_id UUID;
BEGIN
  -- Buscar agente default e seu pipeline
  SELECT a.id, p.id INTO default_agent_id, default_pipeline_id
  FROM public.agents a
  LEFT JOIN public.pipelines p ON p.agent_id = a.id AND p.is_active = true
  WHERE a.is_default = true AND a.is_active = true
  LIMIT 1;
  
  -- Buscar primeiro estágio do pipeline
  SELECT id INTO first_stage_id 
  FROM public.pipeline_stages 
  WHERE pipeline_id = default_pipeline_id AND is_active = true 
  ORDER BY position 
  LIMIT 1;
  
  -- Fallback se não encontrar estágio
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
  
  -- Obter próximo responsável usando a função de distribuição
  IF default_agent_id IS NOT NULL THEN
    SELECT get_next_deal_owner(default_agent_id) INTO default_owner_id;
  END IF;
  
  INSERT INTO deals (contact_id, title, stage, stage_id, pipeline_id, priority, owner_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.name, NEW.call_name, 'Novo Lead'),
    'new',
    first_stage_id,
    default_pipeline_id,
    'medium',
    default_owner_id
  );
  
  RETURN NEW;
END;
$function$;