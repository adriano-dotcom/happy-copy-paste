-- Adicionar campo cargo_focused_greeting para greeting contextual de campanhas
ALTER TABLE agents ADD COLUMN IF NOT EXISTS cargo_focused_greeting text;

-- Configurar greeting específico para Adri quando lead já menciona seguro de cargas
UPDATE agents 
SET cargo_focused_greeting = 'Oi! Sou a Adri, da Jacometo Seguros, especialista em seguros para transportadores. Que tipo de mercadoria você geralmente transporta?'
WHERE slug = 'adri';