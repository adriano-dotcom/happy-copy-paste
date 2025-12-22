-- Fix RLS policies for nina_processing_queue and message_processing_queue
-- to allow operators to send and receive messages

-- =============================================
-- nina_processing_queue
-- =============================================

-- Remove current restrictive policy
DROP POLICY IF EXISTS "Only admins can manage nina_processing_queue" ON nina_processing_queue;

-- Admins can do everything
CREATE POLICY "Admins can manage nina_processing_queue" 
ON nina_processing_queue FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Operators can insert into the queue
CREATE POLICY "Operators can insert into nina_processing_queue" 
ON nina_processing_queue FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'operator'::app_role)
);

-- Operators can view the queue
CREATE POLICY "Operators can view nina_processing_queue" 
ON nina_processing_queue FOR SELECT 
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'operator'::app_role)
);

-- =============================================
-- message_processing_queue
-- =============================================

-- Remove current restrictive policy
DROP POLICY IF EXISTS "Only admins can manage message_processing_queue" ON message_processing_queue;

-- Admins can do everything
CREATE POLICY "Admins can manage message_processing_queue" 
ON message_processing_queue FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Operators can insert into the queue
CREATE POLICY "Operators can insert into message_processing_queue" 
ON message_processing_queue FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'operator'::app_role)
);

-- Operators can view the queue
CREATE POLICY "Operators can view message_processing_queue" 
ON message_processing_queue FOR SELECT 
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'operator'::app_role)
);