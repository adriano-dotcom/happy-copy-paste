

## Plano: Corrigir Exibição do Agente Atlas em Conversas de Prospecção

### Problema Identificado

O agente Atlas está sendo **atribuído corretamente** no banco de dados (`current_agent_id` = ID do Atlas), mas a interface mostra "Sem agente" porque:

1. **Não existe foreign key constraint** entre `conversations.current_agent_id` e `agents.id`
2. O Supabase não consegue fazer o join implícito `agent:agents(id, name, slug)` sem FK

**Evidência:**
- Conversa da FABIANA tem `current_agent_id` = `9a9aa2b3-6fce-4a02-b402-26850d6f0f20` (Atlas)
- JOIN manual funciona: query SQL retorna `agent_name: "Atlas"` corretamente
- Console logs mostram: `"current_agent_id": "9a9aa2b3-6fce-4a02-b402-26850d6f0f20"` sendo definido

---

### Solução

Duas correções necessárias:

#### Correção 1: Adicionar Foreign Key Constraint (Migração SQL)

```sql
-- Adicionar FK entre conversations.current_agent_id e agents.id
ALTER TABLE conversations 
ADD CONSTRAINT conversations_current_agent_id_fkey 
FOREIGN KEY (current_agent_id) 
REFERENCES agents(id) 
ON DELETE SET NULL;
```

#### Correção 2: Atualizar Query no Frontend (api.ts)

**Arquivo:** `src/services/api.ts`

**De (linha ~1657):**
```javascript
agent:agents(id, name, slug),
```

**Para:**
```javascript
agent:agents!conversations_current_agent_id_fkey(id, name, slug),
```

Essa sintaxe explícita diz ao Supabase qual FK usar para o join.

---

### Fluxo Após Correção

```text
1. Template de prospecção enviado
        ↓
2. send-whatsapp-template atribui current_agent_id = Atlas
        ↓
3. Frontend busca conversas via api.fetchConversations()
        ↓
4. Query inclui join: agent:agents!conversations_current_agent_id_fkey(...)
        ↓
5. Supabase retorna agent: { id, name: "Atlas", slug: "atlas" }
        ↓
6. Interface exibe "Atlas" no dropdown ao invés de "Sem agente"
```

---

### Resumo das Alterações

| Local | Alteração |
|-------|-----------|
| Nova migração SQL | Adicionar FK constraint `conversations_current_agent_id_fkey` |
| `src/services/api.ts` linhas 1657 e 1675 | Usar sintaxe explícita de FK no join |

---

### Seção Técnica

**Por que não funcionava antes?**

O Supabase Client usa [PostgREST](https://postgrest.org/) que permite fazer joins via foreign keys automaticamente. A sintaxe `agent:agents(id, name, slug)` só funciona quando:
1. Existe uma FK constraint definida, OU
2. Você usa sintaxe explícita: `agent:agents!column_name(...)`

Sem FK, o PostgREST não sabe qual coluna usar para o join e simplesmente ignora a relação, retornando `agent: null`.

**Verificação:**
```sql
-- Antes (sem FK): retorna vazio
SELECT * FROM information_schema.table_constraints 
WHERE constraint_type = 'FOREIGN KEY' AND table_name = 'conversations';

-- Depois (com FK): retorna a constraint
```

**Impacto:**
- Todas as conversas que já têm `current_agent_id` definido passarão a exibir o agente corretamente
- Nenhuma alteração necessária no código de atribuição (já funciona)

