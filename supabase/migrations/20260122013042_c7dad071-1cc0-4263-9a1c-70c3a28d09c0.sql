-- Adicionar campo para controlar frequência de alertas de taxa de engano
ALTER TABLE nina_settings 
ADD COLUMN IF NOT EXISTS button_engano_alert_date DATE;

COMMENT ON COLUMN nina_settings.button_engano_alert_date IS 
  'Data do último alerta de taxa de engano elevada (1 alerta por dia max)';