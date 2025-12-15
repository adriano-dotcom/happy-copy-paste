import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mapeamento de nomes de secrets para nomes no Vault
const SECRET_NAMES = {
  whatsapp_access_token: 'vault_whatsapp_token',
  elevenlabs_api_key: 'vault_elevenlabs_key',
  pipedrive_api_token: 'vault_pipedrive_token',
  api4com_api_token: 'vault_api4com_token',
  calcom_api_key: 'vault_calcom_key',
  openai_api_key: 'vault_openai_key',
} as const;

const VAULT_FLAG_COLUMNS = {
  whatsapp_access_token: 'whatsapp_token_in_vault',
  elevenlabs_api_key: 'elevenlabs_key_in_vault',
  pipedrive_api_token: 'pipedrive_token_in_vault',
  api4com_api_token: 'api4com_token_in_vault',
  calcom_api_key: 'calcom_key_in_vault',
  openai_api_key: 'openai_key_in_vault',
} as const;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Step 1: Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('Missing Authorization header');
      return new Response(
        JSON.stringify({ success: false, error: 'Não autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 2: Create user client to verify identity
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      console.error('Invalid auth token:', authError?.message);
      return new Response(
        JSON.stringify({ success: false, error: 'Token inválido' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 3: Verify user is admin
    const { data: userRole, error: roleError } = await userClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleError || userRole?.role !== 'admin') {
      console.error('Admin access denied for user:', user.id, 'role:', userRole?.role);
      return new Response(
        JSON.stringify({ success: false, error: 'Acesso negado - Apenas administradores' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Admin access granted for user:', user.id);

    // Step 4: Now proceed with service role for vault operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, secret_name, secret_value } = await req.json();

    switch (action) {
      case 'set': {
        // Salvar secret no Vault
        if (!secret_name || !secret_value) {
          throw new Error('secret_name e secret_value são obrigatórios');
        }

        const vaultName = SECRET_NAMES[secret_name as keyof typeof SECRET_NAMES];
        if (!vaultName) {
          throw new Error(`Secret desconhecido: ${secret_name}`);
        }

        // Chamar função para salvar no Vault
        const { data: secretId, error: vaultError } = await supabase.rpc('set_vault_secret', {
          secret_name: vaultName,
          secret_value: secret_value,
        });

        if (vaultError) {
          console.error('Erro ao salvar no Vault:', vaultError);
          throw new Error(`Erro ao salvar no Vault: ${vaultError.message}`);
        }

        // Atualizar flag na tabela nina_settings
        const flagColumn = VAULT_FLAG_COLUMNS[secret_name as keyof typeof VAULT_FLAG_COLUMNS];
        const { error: updateError } = await supabase
          .from('nina_settings')
          .update({ 
            [flagColumn]: true,
            [secret_name]: null, // Limpar valor em texto plano
          })
          .eq('id', (await supabase.from('nina_settings').select('id').single()).data?.id);

        if (updateError) {
          console.error('Erro ao atualizar nina_settings:', updateError);
        }

        console.log(`Secret ${secret_name} salvo no Vault com sucesso por admin ${user.id}`);

        return new Response(
          JSON.stringify({ 
            success: true, 
            message: `Secret ${secret_name} salvo no Vault`,
            secret_id: secretId,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'check': {
        // Verificar quais secrets estão configurados
        const results: Record<string, { in_vault: boolean; in_table: boolean }> = {};

        for (const [settingsName, vaultName] of Object.entries(SECRET_NAMES)) {
          // Verificar no Vault
          const { data: hasVault } = await supabase.rpc('has_vault_secret', {
            secret_name: vaultName,
          });

          // Verificar na tabela
          const { data: settings } = await supabase
            .from('nina_settings')
            .select(settingsName)
            .single();

          const settingsRecord = settings as Record<string, unknown> | null;
          results[settingsName] = {
            in_vault: hasVault || false,
            in_table: settingsRecord?.[settingsName] ? true : false,
          };
        }

        return new Response(
          JSON.stringify({ success: true, secrets: results }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'migrate': {
        // Migrar secrets existentes da tabela para o Vault
        const { data: settings, error: settingsError } = await supabase
          .from('nina_settings')
          .select('*')
          .single();

        if (settingsError || !settings) {
          throw new Error('Não foi possível ler nina_settings');
        }

        const migrated: string[] = [];
        const errors: string[] = [];

        for (const [settingsName, vaultName] of Object.entries(SECRET_NAMES)) {
          const value = settings[settingsName as keyof typeof settings];
          
          if (value && typeof value === 'string' && value.trim() !== '') {
            try {
              // Salvar no Vault
              const { error: vaultError } = await supabase.rpc('set_vault_secret', {
                secret_name: vaultName,
                secret_value: value,
              });

              if (vaultError) {
                throw vaultError;
              }

              // Atualizar flag e limpar valor
              const flagColumn = VAULT_FLAG_COLUMNS[settingsName as keyof typeof VAULT_FLAG_COLUMNS];
              await supabase
                .from('nina_settings')
                .update({ 
                  [flagColumn]: true,
                  [settingsName]: null,
                })
                .eq('id', settings.id);

              migrated.push(settingsName);
              console.log(`Migrado ${settingsName} para Vault por admin ${user.id}`);
            } catch (err) {
              errors.push(`${settingsName}: ${err instanceof Error ? err.message : 'Erro desconhecido'}`);
              console.error(`Erro ao migrar ${settingsName}:`, err);
            }
          }
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            migrated,
            errors,
            message: `${migrated.length} secrets migrados, ${errors.length} erros`,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'delete': {
        // Deletar um secret do Vault
        if (!secret_name) {
          throw new Error('secret_name é obrigatório');
        }

        const vaultName = SECRET_NAMES[secret_name as keyof typeof SECRET_NAMES];
        if (!vaultName) {
          throw new Error(`Secret desconhecido: ${secret_name}`);
        }

        const { data: deleted } = await supabase.rpc('delete_vault_secret', {
          secret_name: vaultName,
        });

        // Atualizar flag na tabela
        const flagColumn = VAULT_FLAG_COLUMNS[secret_name as keyof typeof VAULT_FLAG_COLUMNS];
        await supabase
          .from('nina_settings')
          .update({ [flagColumn]: false })
          .eq('id', (await supabase.from('nina_settings').select('id').single()).data?.id);

        console.log(`Secret ${secret_name} deletado por admin ${user.id}`);

        return new Response(
          JSON.stringify({ 
            success: true, 
            deleted,
            message: deleted ? `Secret ${secret_name} deletado` : 'Secret não encontrado',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        throw new Error(`Ação desconhecida: ${action}. Use: set, check, migrate, delete`);
    }

  } catch (error) {
    console.error('Erro em manage-secrets:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
