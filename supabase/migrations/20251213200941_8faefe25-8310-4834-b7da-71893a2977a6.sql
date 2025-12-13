-- Remover política atual que permite acesso a todos autenticados
DROP POLICY IF EXISTS "Authenticated users can manage send_queue" ON public.send_queue;

-- Criar nova política apenas para admins (consistente com outras tabelas de fila)
CREATE POLICY "Only admins can manage send_queue" 
ON public.send_queue FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role)) 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));