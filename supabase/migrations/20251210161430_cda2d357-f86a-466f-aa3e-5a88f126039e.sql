-- Expandir keywords de detecção da Barbara (agente de saúde)
UPDATE agents 
SET detection_keywords = ARRAY[
  -- Termos gerais
  'plano de saude', 'plano saude', 'saúde', 'saude',
  -- Convênio
  'convênio', 'convenio', 'convenio médico', 'convênio médico',
  -- Médico/Hospital
  'médico', 'medico', 'hospital', 'consulta', 'consulta medica', 'consulta médica',
  'atendimento médico', 'atendimento medico', 'assistência médica', 'assistencia medica',
  -- Operadoras
  'unimed', 'bradesco saude', 'bradesco saúde', 'sulamerica saude', 'sulamerica saúde',
  'amil', 'hapvida', 'notredame', 'intermédica', 'intermedica', 
  'porto saude', 'porto saúde', 'golden cross',
  -- Dental/Odonto
  'plano dental', 'plano odontologico', 'plano odontológico', 
  'odonto', 'dental', 'dentista', 'odontológico', 'odontologico',
  -- Seguro
  'seguro saúde', 'seguro saude', 'cobertura médica', 'cobertura medica'
],
updated_at = now()
WHERE slug = 'paula-saude';