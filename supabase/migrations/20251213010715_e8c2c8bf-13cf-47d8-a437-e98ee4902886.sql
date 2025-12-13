-- Add prospecting_metrics column to sales_coaching_reports
ALTER TABLE sales_coaching_reports 
ADD COLUMN IF NOT EXISTS prospecting_metrics jsonb DEFAULT '{}';