-- Adicionar campos do Pipedrive na tabela nina_settings
ALTER TABLE public.nina_settings
ADD COLUMN IF NOT EXISTS pipedrive_api_token TEXT,
ADD COLUMN IF NOT EXISTS pipedrive_domain TEXT,
ADD COLUMN IF NOT EXISTS pipedrive_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS pipedrive_min_score INTEGER DEFAULT 70,
ADD COLUMN IF NOT EXISTS pipedrive_default_pipeline_id TEXT,
ADD COLUMN IF NOT EXISTS pipedrive_field_mappings JSONB DEFAULT '{
  "person_fields": {
    "name": "name",
    "phone_number": "phone",
    "email": "email",
    "company": "org_name"
  },
  "deal_fields": {
    "title": "title",
    "value": "value",
    "notes": "notes"
  },
  "custom_fields": []
}'::jsonb;

-- Adicionar campo de rastreamento na tabela contacts
ALTER TABLE public.contacts
ADD COLUMN IF NOT EXISTS pipedrive_person_id TEXT;

-- Adicionar campo de rastreamento na tabela deals
ALTER TABLE public.deals
ADD COLUMN IF NOT EXISTS pipedrive_deal_id TEXT;