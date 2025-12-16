-- Adicionar colunas de configuração para Google Leads
ALTER TABLE nina_settings 
ADD COLUMN IF NOT EXISTS google_lead_template TEXT DEFAULT 'lead_google_ads',
ADD COLUMN IF NOT EXISTS google_lead_email_template UUID REFERENCES email_templates(id);