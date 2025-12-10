-- Adicionar campos de endereço completo na tabela contacts
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS cep text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS street text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS number text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS complement text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS neighborhood text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS state text;

-- Índices para busca por cidade/estado
CREATE INDEX IF NOT EXISTS idx_contacts_city ON public.contacts(city);
CREATE INDEX IF NOT EXISTS idx_contacts_state ON public.contacts(state);