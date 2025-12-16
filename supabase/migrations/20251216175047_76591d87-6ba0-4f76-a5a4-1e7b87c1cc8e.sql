-- Adicionar campo de ramal por operador
ALTER TABLE team_members 
ADD COLUMN api4com_extension TEXT;

-- Comentário explicativo
COMMENT ON COLUMN team_members.api4com_extension IS 'Ramal API4Com individual do operador. Se vazio, usa o ramal global de nina_settings.';