-- Adicionar campos empresa e CNPJ na tabela contacts
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS company text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS cnpj text;

-- Índice para busca por CNPJ
CREATE INDEX IF NOT EXISTS idx_contacts_cnpj ON public.contacts(cnpj) WHERE cnpj IS NOT NULL;

-- Índice para busca por empresa
CREATE INDEX IF NOT EXISTS idx_contacts_company ON public.contacts(company) WHERE company IS NOT NULL;