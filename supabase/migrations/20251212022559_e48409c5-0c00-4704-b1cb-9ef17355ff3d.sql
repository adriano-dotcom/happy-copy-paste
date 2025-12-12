-- Create function to assign admin role to first user, operator to others
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  user_count INTEGER;
  assigned_role app_role;
BEGIN
  -- Count existing users to determine if this is the first one
  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  
  -- First user gets admin, others get operator
  IF user_count = 0 THEN
    assigned_role := 'admin';
  ELSE
    assigned_role := 'operator';
  END IF;
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, assigned_role);
  
  RETURN new;
END;
$$;

-- Create trigger to execute on new user creation
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();