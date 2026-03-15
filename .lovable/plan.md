

# Remover emojis hardcoded das categorias de desqualificação

## Diagnóstico
O `nina-orchestrator/index.ts` ainda contém emojis em dois lugares:
1. **Propriedade `emoji`** em 6 categorias (linhas 760, 777, 829, 876, 892, 961) -- metadata não usada na resposta mas viola o padrão
2. **Dentro das strings `response`** em 2 categorias:
   - Linha 823: `"...atualizar nosso cadastro. 📝\n\nPosso saber..."` (number_owner_changed)
   - Linha 958: `"...Você já tem uma transportadora? 🚛"` (freight_seeker)

## Correções

### 1. nina-orchestrator/index.ts -- Remover todos os emojis

| Linha | Antes | Depois |
|-------|-------|--------|
| 760 | `emoji: '💼'` | remover linha |
| 777 | `emoji: '🏭'` | remover linha |
| 823 | `...cadastro. 📝\n\n...` | `...cadastro.\n\n...` |
| 829 | `emoji: '🔄'` | remover linha |
| 876 | `emoji: '❓'` | remover linha |
| 892 | `emoji: '🚫'` | remover linha |
| 958 | `...transportadora? 🚛` | `...transportadora?` |
| 961 | `emoji: '🚛'` | remover linha |

Total: 6 propriedades `emoji` removidas + 2 emojis em strings de resposta limpos.

### 2. test-prospecting-flow/index.ts -- Sem mudança necessária
O cleanup já foi corrigido na iteração anterior. Se quiser, posso rodar o teste após o deploy.

## Escopo
- **1 arquivo**: `supabase/functions/nina-orchestrator/index.ts`
- Apenas remoção de emojis -- zero mudança de lógica

