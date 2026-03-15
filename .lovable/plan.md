

# Plano: Adicionar keywords "nao pertence" ao wrong_number

## Contexto
A lista de keywords do `wrong_number` no `nina-orchestrator/index.ts` (linhas 831-866) não cobre variações com "pertence". Mensagens como "esse número não pertence a ele" passariam para o LLM em vez de serem desqualificadas automaticamente.

## Alteração
**Arquivo:** `supabase/functions/nina-orchestrator/index.ts` (linha 866)

Adicionar 4 novas keywords ao final da lista `wrong_number`, antes do fechamento do array:

```
'nao pertence', 'não pertence',
'esse numero nao pertence', 'esse número não pertence'
```

Estas ficam após `'esse zap nao e'` e antes do `]` (linha 867).

## Validação pós-deploy
- Rodar teste com `"nao sei se esse numero ainda eh dele"` → **não** deve desqualificar (nenhum keyword match)
- Rodar teste com `"esse numero nao pertence a essa pessoa"` → **deve** desqualificar via `wrong_number`
- Rodar teste com `"sim, este telefone pertence a mim"` → **não** deve desqualificar (keyword é `nao pertence`, não `pertence` sozinho)

