-- Adicionar coluna fleet_size (quantidade de veículos na frota)
ALTER TABLE public.contacts 
ADD COLUMN fleet_size INTEGER DEFAULT NULL;

COMMENT ON COLUMN public.contacts.fleet_size IS 'Quantidade de veículos na frota da empresa (automotor)';