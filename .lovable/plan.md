

# Corrigir atribuição de responsável — Agente Sofia sem owner

## Causa raiz

O agente **Sofia** (default, `is_default = true`) está configurado com `owner_distribution_type = 'fixed'` mas `default_owner_id = NULL`. Todo lead que passa por Sofia gera deal sem responsável.

Isso afeta **2.012 deals** (1.502 só em março).

## Plano

### 1. Decisão necessária: quem deve ser o owner padrão de Sofia?

Opções:
- Configurar Sofia com um `default_owner_id` fixo (ex: Adriana, Leonardo, etc.)
- Mudar Sofia para `round_robin` com lista de vendedores (como a Íris faz)
- Ou outra distribuição

**Isso pode ser feito via UI** (Settings → Agentes → Sofia → Distribuição de leads), ou via migration.

### 2. Migration — Corrigir Sofia (após decisão do owner)

```sql
-- Exemplo: mudar Sofia para round_robin com Adriana + Leonardo
UPDATE agents 
SET owner_distribution_type = 'round_robin',
    owner_rotation_ids = ARRAY[
      '9db32c89-d623-4ecf-b43e-35c456cc2e49'::uuid,  -- Adriana
      'ffe0eaca-335f-4ba4-9797-e52ba529ae8a'::uuid    -- Leonardo
    ],
    default_owner_id = '9db32c89-d623-4ecf-b43e-35c456cc2e49'
WHERE id = 'dd87cbe4-def9-4e6d-965c-8906551bfdc2';
```

### 3. Backfill — Atribuir owner aos 2.012 deals sem responsável

Distribuir os deals órfãos entre os vendedores (round_robin retroativo), ou atribuir todos a um vendedor específico. Exemplo de distribuição proporcional:

```sql
-- Atribuir deals sem owner usando round_robin retroativo
WITH numbered AS (
  SELECT d.id,
    ROW_NUMBER() OVER (ORDER BY d.created_at) as rn
  FROM deals d WHERE d.owner_id IS NULL
)
UPDATE deals SET owner_id = CASE 
  WHEN (SELECT rn FROM numbered WHERE numbered.id = deals.id) % 2 = 1 
    THEN '9db32c89-d623-4ecf-b43e-35c456cc2e49'  -- Adriana
  ELSE 'ffe0eaca-335f-4ba4-9797-e52ba529ae8a'     -- Leonardo
END
WHERE owner_id IS NULL;
```

### 4. Nenhuma mudança na view ou RLS

A view `leads_jarvis_v` já faz o JOIN correto. Após o backfill, os 688 "sem responsável" passarão a ter nome.

## Resumo

| Item | Ação |
|---|---|
| Causa raiz | Sofia com `default_owner_id = NULL` |
| Correção | Configurar owner/distribuição em Sofia |
| Backfill | Atribuir owner aos ~2.012 deals órfãos |
| View/RLS | Sem mudança |

## Decisão necessária antes de implementar

1. Quem deve ser o owner padrão de Sofia? (ou qual lista de round_robin?)
2. Para o backfill dos deals antigos: distribuir entre quais vendedores?

