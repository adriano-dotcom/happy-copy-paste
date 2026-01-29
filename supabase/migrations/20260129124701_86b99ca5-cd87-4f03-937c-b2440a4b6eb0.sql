-- Adicionar coluna para mensagem de rejeição
ALTER TABLE agents ADD COLUMN IF NOT EXISTS rejection_message TEXT;

-- Configurar mensagem para Atlas (agente de prospecção)
UPDATE agents 
SET rejection_message = 'Sem problemas! Agradeço pela conversa e pelo seu tempo. Fico à disposição caso precise de informações sobre seguros no futuro. Qualquer coisa, é só entrar em contato. Tenha um excelente dia!'
WHERE slug = 'atlas';

-- Configurar mensagem padrão para outros agentes
UPDATE agents 
SET rejection_message = 'Entendi! Agradeço pelo seu tempo. Qualquer dúvida sobre seguros, estamos à disposição. Tenha um ótimo dia!'
WHERE slug != 'atlas' AND rejection_message IS NULL;