-- Create whatsapp_templates table for storing synchronized Meta templates
CREATE TABLE public.whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_template_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  language TEXT DEFAULT 'pt_BR',
  category TEXT, -- MARKETING, UTILITY, AUTHENTICATION
  status TEXT DEFAULT 'PENDING', -- APPROVED, PENDING, REJECTED, DISABLED
  components JSONB DEFAULT '[]'::jsonb, -- header, body, footer, buttons
  example_values JSONB DEFAULT '{}'::jsonb, -- example variable values
  variables_count INTEGER DEFAULT 0,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

-- Create policy for all operations
CREATE POLICY "Allow all operations on whatsapp_templates" 
ON public.whatsapp_templates 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Create trigger for updated_at
CREATE TRIGGER update_whatsapp_templates_updated_at
BEFORE UPDATE ON public.whatsapp_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_templates;