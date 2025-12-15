
-- 1. Configurar default_owner_id para Adri (Adriana Jacometo como fallback)
UPDATE agents 
SET default_owner_id = '9db32c89-d623-4ecf-b43e-35c456cc2e49'
WHERE slug = 'adri' AND default_owner_id IS NULL;

-- 2. Atualizar deals existentes sem owner baseado no agente atual da conversa
-- Para Adri (round_robin): atribuir Adriana Jacometo ao primeiro batch (o round_robin real começa nos próximos)
UPDATE deals d
SET owner_id = CASE 
    WHEN a.owner_distribution_type = 'round_robin' THEN a.owner_rotation_ids[1]
    ELSE a.default_owner_id
END
FROM conversations c
JOIN agents a ON a.id = c.current_agent_id
WHERE d.contact_id = c.contact_id
AND d.owner_id IS NULL
AND c.current_agent_id IS NOT NULL
AND (a.default_owner_id IS NOT NULL OR array_length(a.owner_rotation_ids, 1) > 0);
