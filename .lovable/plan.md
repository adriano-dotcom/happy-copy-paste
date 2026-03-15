

# Corrigir emoji hardcoded na resposta de desqualificação

## Diagnóstico
O emoji 🙏 **não vem do Atlas/LLM**. A resposta é hardcoded na linha 872 do `nina-orchestrator/index.ts`:

```typescript
response: 'Entendo! Peço desculpas pelo engano. Obrigado por avisar. 🙏',
```

Quando o orchestrator detecta um padrão de desqualificação (como "não solicitei contato"), ele **não passa pela IA** — envia diretamente essa string estática. O reforço no system_prompt do Atlas não tem efeito nesse fluxo.

## Correção
Editar `supabase/functions/nina-orchestrator/index.ts`, linha 872:

```typescript
// Antes
response: 'Entendo! Peço desculpas pelo engano. Obrigado por avisar. 🙏',

// Depois
response: 'Entendo, peco desculpas pelo engano. Obrigado por avisar!',
```

Também auditar todas as outras `response` nos `DISQUALIFICATION_CATEGORIES` para remover emojis hardcoded (se houver).

## Escopo
- **1 arquivo**: `supabase/functions/nina-orchestrator/index.ts`
- Apenas trocar strings estáticas — sem mudança de lógica

