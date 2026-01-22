-- Adicionar coluna para rastrear consolidação
ALTER TABLE learning_insights 
ADD COLUMN IF NOT EXISTS consolidated_into UUID REFERENCES learning_insights(id);

-- Criar tabela de resumos diários por agente
CREATE TABLE IF NOT EXISTS agent_daily_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL,
  pipeline_id UUID,
  summary_date DATE NOT NULL,
  insights_before INTEGER NOT NULL DEFAULT 0,
  insights_after INTEGER NOT NULL DEFAULT 0,
  consolidation_ratio DECIMAL(5,2),
  executive_summary TEXT,
  top_priorities JSONB DEFAULT '[]'::jsonb,
  discarded_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, summary_date)
);

-- Habilitar RLS
ALTER TABLE agent_daily_summaries ENABLE ROW LEVEL SECURITY;

-- Política para usuários autenticados
CREATE POLICY "Authenticated users can manage agent_daily_summaries"
ON agent_daily_summaries
FOR ALL
USING (is_authenticated_user())
WITH CHECK (is_authenticated_user());

-- Trigger para updated_at
CREATE TRIGGER update_agent_daily_summaries_updated_at
BEFORE UPDATE ON agent_daily_summaries
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_learning_insights_consolidated_into 
ON learning_insights(consolidated_into) WHERE consolidated_into IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_daily_summaries_agent_date 
ON agent_daily_summaries(agent_id, summary_date DESC);