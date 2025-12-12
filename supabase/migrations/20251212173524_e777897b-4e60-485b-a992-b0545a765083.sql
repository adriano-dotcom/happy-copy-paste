-- Adicionar políticas RLS para tabelas de filas que não têm políticas definidas

-- message_grouping_queue - restringir a admins apenas
ALTER TABLE public.message_grouping_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can manage message_grouping_queue"
ON public.message_grouping_queue
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- message_processing_queue - restringir a admins apenas
ALTER TABLE public.message_processing_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can manage message_processing_queue"
ON public.message_processing_queue
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- nina_processing_queue - restringir a admins apenas
ALTER TABLE public.nina_processing_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can manage nina_processing_queue"
ON public.nina_processing_queue
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- send_queue - corrigir políticas existentes para restringir a authenticated_user ou admin
-- Primeiro, remover políticas existentes que são muito permissivas
DROP POLICY IF EXISTS "Authenticated users can view send_queue" ON public.send_queue;
DROP POLICY IF EXISTS "Authenticated users can insert into send_queue" ON public.send_queue;
DROP POLICY IF EXISTS "Authenticated users can update send_queue" ON public.send_queue;
DROP POLICY IF EXISTS "Authenticated users can delete from send_queue" ON public.send_queue;

-- Recriar com restrição apropriada
CREATE POLICY "Authenticated users can manage send_queue"
ON public.send_queue
FOR ALL
USING (public.is_authenticated_user())
WITH CHECK (public.is_authenticated_user());