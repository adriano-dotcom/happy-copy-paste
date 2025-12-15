-- Add column for Facebook lead email template
ALTER TABLE nina_settings 
ADD COLUMN facebook_lead_email_template UUID REFERENCES email_templates(id);

COMMENT ON COLUMN nina_settings.facebook_lead_email_template IS 'Template de email para leads do Facebook';