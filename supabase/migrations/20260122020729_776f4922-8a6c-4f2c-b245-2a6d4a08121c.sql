-- Drop existing check constraint
ALTER TABLE public.learning_insights DROP CONSTRAINT IF EXISTS learning_insights_status_check;

-- Add updated check constraint with ALL status values
ALTER TABLE public.learning_insights ADD CONSTRAINT learning_insights_status_check 
  CHECK (status IN ('pending', 'applied', 'dismissed', 'consolidated', 'discarded', 'reviewing', 'rejected'));