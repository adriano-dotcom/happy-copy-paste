-- Criar pipeline "Outros Seguros" para a Sofia
INSERT INTO pipelines (name, slug, icon, color, is_active)
VALUES ('Outros Seguros', 'outros-seguros', '📦', '#8b5cf6', true);

-- Criar os estágios do pipeline
INSERT INTO pipeline_stages (pipeline_id, title, position, color, is_active, is_ai_managed)
SELECT 
  p.id,
  stage.title,
  stage.position,
  stage.color,
  true,
  stage.is_ai_managed
FROM pipelines p
CROSS JOIN (
  VALUES 
    ('Qualificação IA', 0, 'border-purple-500', true),
    ('Qualificado pela IA', 1, 'border-violet-500', true),
    ('Ligação', 2, 'border-blue-500', false),
    ('Enviado Pipedrive', 3, 'border-green-500', false),
    ('Perdido', 99, 'border-red-500', false)
) AS stage(title, position, color, is_ai_managed)
WHERE p.slug = 'outros-seguros';