CREATE OR REPLACE FUNCTION public.reassign_on_member_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE conversations 
  SET assigned_user_id = NULL, assigned_user_name = NULL 
  WHERE assigned_user_id = OLD.id;
  
  UPDATE deals 
  SET owner_id = NULL 
  WHERE owner_id = OLD.id;
  
  RETURN OLD;
END;
$$;

CREATE TRIGGER trigger_reassign_on_member_delete
  BEFORE DELETE ON team_members
  FOR EACH ROW
  EXECUTE FUNCTION reassign_on_member_delete();