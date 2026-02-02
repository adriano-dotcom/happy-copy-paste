-- Limpar duplicatas existentes (manter apenas o mais recente por agent+date)
DELETE FROM closure_reason_reports a
USING closure_reason_reports b
WHERE a.id < b.id 
  AND a.agent_id = b.agent_id 
  AND a.report_date = b.report_date;

-- Adicionar constraint unique para evitar duplicatas futuras
ALTER TABLE closure_reason_reports 
ADD CONSTRAINT unique_agent_report_date UNIQUE (agent_id, report_date);