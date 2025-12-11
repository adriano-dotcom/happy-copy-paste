-- Create call_logs table for tracking phone calls
CREATE TABLE public.call_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  extension TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'dialing',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  answered_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  hangup_cause TEXT,
  record_url TEXT,
  api4com_call_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add API4Com columns to nina_settings
ALTER TABLE public.nina_settings 
ADD COLUMN IF NOT EXISTS api4com_api_token TEXT,
ADD COLUMN IF NOT EXISTS api4com_default_extension TEXT DEFAULT '1000',
ADD COLUMN IF NOT EXISTS api4com_enabled BOOLEAN DEFAULT false;

-- Enable RLS on call_logs
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

-- Create permissive policy for call_logs
CREATE POLICY "Allow all operations on call_logs" 
ON public.call_logs 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_call_logs_updated_at
BEFORE UPDATE ON public.call_logs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_call_logs_contact_id ON public.call_logs(contact_id);
CREATE INDEX idx_call_logs_conversation_id ON public.call_logs(conversation_id);
CREATE INDEX idx_call_logs_api4com_call_id ON public.call_logs(api4com_call_id);