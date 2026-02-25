

# Corrigir IA usando nome completo em CAIXA ALTA nas mensagens

## Problema identificado
A screenshot mostra a IA (agente) enviando mensagens com o nome completo em CAIXA ALTA: "LEONARDO FELIPE RIBEIRO SANCHES, qual tipo de seguro você está buscando?". Apesar de já existir:
- Função `normalizeContactName()` que extrai primeiro nome em Title Case
- Regra no prompt proibindo nome completo e caixa alta

O problema persiste porque:
1. **O histórico de conversa (`conversationHistory`)** é enviado ao modelo AI com as mensagens anteriores que já contêm o nome completo em CAPS
2. O AI vê o padrão nos próprios exemplos anteriores e repete
3. A regra no prompt não é suficiente para sobrescrever o padrão visual do histórico

## Solução: Sanitizar histórico + reforçar prompt

### Arquivo: `supabase/functions/nina-orchestrator/index.ts`

**Alteração 1 — Sanitizar conversationHistory (linhas ~5613-5619)**
- Ao construir o `conversationHistory`, substituir ocorrências do nome completo (ex: "LEONARDO FELIPE RIBEIRO SANCHES") pelo primeiro nome normalizado (ex: "Leonardo") nas mensagens do tipo `assistant`
- Criar função `sanitizeNameInHistory(content, contact)` que:
  - Obtém o nome completo do contato (`contact.name`)
  - Calcula o primeiro nome normalizado via `normalizeContactName()`
  - Faz `content.replace(nomeCompleto, primeiroNome)` (case-insensitive)
  - Também substitui variações em CAIXA ALTA do primeiro nome (ex: "LEONARDO" → "Leonardo")

**Alteração 2 — Reforçar prompt (linhas ~7857-7861)**
- Adicionar ao bloco de regras do nome:
  - `- O nome do lead é: ${normalizeContactName(contact.name)}. Use EXATAMENTE este nome, sem variações.`
  - Mover a regra de nome para ANTES das outras regras (posição mais proeminente no prompt)

### Detalhes técnicos

```typescript
// Nova função helper
function sanitizeNameInHistory(content: string, contact: any): string {
  if (!content || !contact?.name) return content;
  const fullName = contact.name.trim();
  const normalized = normalizeContactName(contact.name);
  if (fullName === normalized) return content;
  
  // Replace full name (case-insensitive)
  let sanitized = content.replace(new RegExp(escapeRegex(fullName), 'gi'), normalized);
  
  // Replace CAPS first name (ex: "LEONARDO" → "Leonardo")
  const firstName = fullName.split(/\s+/)[0];
  if (firstName && firstName === firstName.toUpperCase() && firstName.length > 2) {
    sanitized = sanitized.replace(new RegExp(`\\b${escapeRegex(firstName)}\\b`, 'g'), normalized);
  }
  
  return sanitized;
}
```

Aplicada ao build do `conversationHistory`:
```typescript
const conversationHistory = (recentMessages || [])
  .reverse()
  .map((msg: any) => ({
    role: msg.from_type === 'user' ? 'user' : 'assistant',
    content: sanitizeNameInHistory(msg.content || '[media]', conversation.contact)
  }));
```

### Escopo
- 1 arquivo backend alterado: `nina-orchestrator/index.ts`
- Sem mudanças de schema ou frontend
- Risco: baixo — apenas sanitização textual no histórico enviado ao modelo

