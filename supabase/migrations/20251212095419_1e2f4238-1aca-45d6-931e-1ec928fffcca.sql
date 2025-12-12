-- Add RLS policies to send_queue table
-- Allow authenticated users to manage the send queue

-- Policy for SELECT (view queue items)
CREATE POLICY "Authenticated users can view send_queue"
ON public.send_queue
FOR SELECT
TO authenticated
USING (true);

-- Policy for INSERT (add to queue)
CREATE POLICY "Authenticated users can insert into send_queue"
ON public.send_queue
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Policy for UPDATE (update queue status)
CREATE POLICY "Authenticated users can update send_queue"
ON public.send_queue
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Policy for DELETE (remove from queue)
CREATE POLICY "Authenticated users can delete from send_queue"
ON public.send_queue
FOR DELETE
TO authenticated
USING (true);