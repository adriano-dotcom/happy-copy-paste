-- Criar função para recuperar secrets do Vault de forma segura
-- Esta função só pode ser chamada por service_role ou postgres

CREATE OR REPLACE FUNCTION public.get_vault_secret(secret_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE 
  decrypted text;
BEGIN
  SELECT decrypted_secret INTO decrypted
  FROM vault.decrypted_secrets 
  WHERE name = secret_name;
  
  RETURN decrypted;
END;
$$;

-- Revogar acesso público e permitir apenas para service_role
REVOKE ALL ON FUNCTION public.get_vault_secret(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_vault_secret(text) FROM anon;
REVOKE ALL ON FUNCTION public.get_vault_secret(text) FROM authenticated;

-- Criar função para salvar secrets no Vault
CREATE OR REPLACE FUNCTION public.set_vault_secret(secret_name text, secret_value text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE 
  secret_id uuid;
  existing_id uuid;
BEGIN
  -- Verificar se já existe
  SELECT id INTO existing_id
  FROM vault.secrets 
  WHERE name = secret_name;
  
  IF existing_id IS NOT NULL THEN
    -- Atualizar secret existente
    UPDATE vault.secrets 
    SET secret = secret_value,
        updated_at = now()
    WHERE id = existing_id;
    RETURN existing_id;
  ELSE
    -- Criar novo secret
    INSERT INTO vault.secrets (name, secret)
    VALUES (secret_name, secret_value)
    RETURNING id INTO secret_id;
    RETURN secret_id;
  END IF;
END;
$$;

-- Revogar acesso público
REVOKE ALL ON FUNCTION public.set_vault_secret(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_vault_secret(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.set_vault_secret(text, text) FROM authenticated;

-- Criar função para verificar se um secret existe
CREATE OR REPLACE FUNCTION public.has_vault_secret(secret_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE 
  exists_flag boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM vault.secrets WHERE name = secret_name
  ) INTO exists_flag;
  
  RETURN exists_flag;
END;
$$;

-- Revogar acesso público
REVOKE ALL ON FUNCTION public.has_vault_secret(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_vault_secret(text) FROM anon;
REVOKE ALL ON FUNCTION public.has_vault_secret(text) FROM authenticated;

-- Criar função para deletar um secret
CREATE OR REPLACE FUNCTION public.delete_vault_secret(secret_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM vault.secrets WHERE name = secret_name;
  RETURN FOUND;
END;
$$;

-- Revogar acesso público
REVOKE ALL ON FUNCTION public.delete_vault_secret(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_vault_secret(text) FROM anon;
REVOKE ALL ON FUNCTION public.delete_vault_secret(text) FROM authenticated;

-- Adicionar colunas de configuração em nina_settings para indicar quais secrets estão no Vault
ALTER TABLE public.nina_settings 
ADD COLUMN IF NOT EXISTS whatsapp_token_in_vault boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS elevenlabs_key_in_vault boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS pipedrive_token_in_vault boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS api4com_token_in_vault boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS calcom_key_in_vault boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS openai_key_in_vault boolean DEFAULT false;