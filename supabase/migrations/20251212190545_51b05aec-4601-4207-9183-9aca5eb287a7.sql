-- Remover constraint antiga
ALTER TABLE public.followup_automations 
DROP CONSTRAINT IF EXISTS followup_automations_automation_type_check;

-- Adicionar constraint atualizada com novo tipo
ALTER TABLE public.followup_automations 
ADD CONSTRAINT followup_automations_automation_type_check 
CHECK (automation_type = ANY (ARRAY['template'::text, 'free_text'::text, 'window_expiring'::text]));