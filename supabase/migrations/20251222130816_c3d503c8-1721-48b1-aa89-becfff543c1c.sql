-- Remove a política atual que só permite admins
DROP POLICY IF EXISTS "Only admins can manage send_queue" ON send_queue;

-- Criar políticas separadas para diferentes operações

-- 1. Admins podem fazer tudo
CREATE POLICY "Admins can manage send_queue" 
ON send_queue FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 2. Operadores podem inserir mensagens na fila
CREATE POLICY "Operators can insert into send_queue" 
ON send_queue FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'operator'::app_role)
);

-- 3. Operadores podem ver mensagens na fila
CREATE POLICY "Operators can view send_queue" 
ON send_queue FOR SELECT 
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'operator'::app_role)
);