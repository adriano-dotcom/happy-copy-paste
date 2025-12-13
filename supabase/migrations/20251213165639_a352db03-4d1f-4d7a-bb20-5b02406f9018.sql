-- Add 'closed' status to conversation_status enum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'closed' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'conversation_status')) THEN
        ALTER TYPE conversation_status ADD VALUE 'closed';
    END IF;
END $$;

-- Add "Perdido" stage to all active pipelines that don't have one
INSERT INTO pipeline_stages (pipeline_id, title, color, position, is_active, is_system)
SELECT p.id, 'Perdido', 'border-red-500', 99, true, true
FROM pipelines p
WHERE p.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM pipeline_stages ps 
    WHERE ps.pipeline_id = p.id AND ps.title = 'Perdido'
  );