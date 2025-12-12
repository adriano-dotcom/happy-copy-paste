-- 1. Criar tabela de convites pendentes
CREATE TABLE public.pending_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  invited_by uuid,
  app_role app_role NOT NULL DEFAULT 'operator',
  team_member_id uuid REFERENCES team_members(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '7 days'),
  CONSTRAINT pending_invites_email_unique UNIQUE (email)
);

-- 2. Enable RLS
ALTER TABLE pending_invites ENABLE ROW LEVEL SECURITY;

-- 3. Policy: Apenas admins podem gerenciar convites
CREATE POLICY "Admins can manage pending_invites"
  ON pending_invites FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- 4. Atualizar trigger handle_new_user para respeitar convites
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  user_count INTEGER;
  assigned_role app_role;
  invite_record RECORD;
BEGIN
  -- Verificar se existe convite pendente para este email
  SELECT * INTO invite_record 
  FROM pending_invites 
  WHERE email = new.email 
    AND expires_at > now();
  
  IF FOUND THEN
    -- Usar role do convite
    assigned_role := invite_record.app_role;
    
    -- Atualizar team_member para ativo
    IF invite_record.team_member_id IS NOT NULL THEN
      UPDATE team_members 
      SET status = 'active' 
      WHERE id = invite_record.team_member_id;
    END IF;
    
    -- Remover convite usado
    DELETE FROM pending_invites WHERE id = invite_record.id;
  ELSE
    -- Comportamento padrão: primeiro=admin, demais=operator
    SELECT COUNT(*) INTO user_count FROM user_roles;
    IF user_count = 0 THEN
      assigned_role := 'admin';
    ELSE
      assigned_role := 'operator';
    END IF;
  END IF;
  
  INSERT INTO user_roles (user_id, role)
  VALUES (new.id, assigned_role);
  
  RETURN new;
END;
$$;