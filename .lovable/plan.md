

# Eliminar Leads Órfãos e Prevenir Novos

## Situação atual
- **249 conversas órfãs** atribuídas a 4 IDs de vendedores que não existem mais na tabela `team_members`
- **0 deals órfãos** (tabela `deals` está limpa)
- Não existe proteção contra exclusão de vendedores que têm leads atribuídos

## Plano

### 1. Limpar os 249 leads órfãos existentes (SQL data update)
Reatribuir todas as conversas com `assigned_user_id` que não existe em `team_members` para `NULL` (voltam ao pool geral, sem proprietário inválido):

```sql
UPDATE conversations 
SET assigned_user_id = NULL, assigned_user_name = NULL 
WHERE assigned_user_id NOT IN (SELECT id FROM team_members);
```

### 2. Criar trigger para prevenir futuros órfãos (migração SQL)
Quando um `team_member` for deletado, automaticamente limpar as referências:

```sql
CREATE OR REPLACE FUNCTION public.reassign_on_member_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Limpar assigned_user_id nas conversas do membro removido
  UPDATE conversations 
  SET assigned_user_id = NULL, assigned_user_name = NULL 
  WHERE assigned_user_id = OLD.id;
  
  -- Limpar owner_id nos deals do membro removido
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
```

### 3. Remover card "Vendedores Removidos" do Dashboard
Como não haverá mais leads órfãos, remover o bloco de código do card vermelho (linhas 1068-1080 em `Dashboard.tsx`) e a lógica de cálculo de `unknownConversations` (linhas 407-431).

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| Migração SQL | Trigger `reassign_on_member_delete` |
| SQL (data update) | `UPDATE conversations SET assigned_user_id = NULL` para os 249 órfãos |
| `src/components/Dashboard.tsx` | Remover card e lógica de leads órfãos |

