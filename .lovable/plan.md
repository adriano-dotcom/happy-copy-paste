

## Plano: Normalizar Nomes para Title Case e Usar Apenas Primeiro Nome

### Problema Identificado

Na conversa com o lead, a IA está usando o nome completo em CAPS LOCK:
- "FELIPE LEITE DANTAS, qual tipo de seguro você está buscando?"

O comportamento desejado:
- **"Felipe, qual tipo de seguro você está buscando?"** (apenas primeiro nome, Title Case)

---

### Solução

#### 1. Adicionar Função `normalizeContactName()` ao nina-orchestrator

**Arquivo:** `supabase/functions/nina-orchestrator/index.ts`

Adicionar após as constantes de detecção (~linha 200):

```typescript
// Normalizar nome: Title Case + apenas primeiro nome
function normalizeContactName(name: string | null): string {
  if (!name) return 'Cliente';
  
  // Pegar apenas o primeiro nome
  const firstName = name.trim().split(/\s+/)[0];
  
  // Se está todo em maiúsculas, converter para Title Case
  if (firstName === firstName.toUpperCase() && firstName.length > 2) {
    return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
  }
  
  // Garantir primeira letra maiúscula
  return firstName.charAt(0).toUpperCase() + firstName.slice(1);
}
```

#### 2. Aplicar Normalização no `buildEnhancedContext()`

**Arquivo:** `supabase/functions/nina-orchestrator/index.ts`

Alterar linhas 7326-7327:

**De:**
```typescript
if (contact.name) contextInfo += `\n- Nome: ${contact.name}`;
if (contact.call_name) contextInfo += ` (trate por: ${contact.call_name})`;
```

**Para:**
```typescript
if (contact.name) contextInfo += `\n- Nome: ${normalizeContactName(contact.name)}`;
if (contact.call_name) contextInfo += ` (trate por: ${normalizeContactName(contact.call_name)})`;
```

---

### Fluxo Após Correção

```text
1. Contato tem nome "FELIPE LEITE DANTAS" no banco
         ↓
2. buildEnhancedContext() processa:
   normalizeContactName("FELIPE LEITE DANTAS") → "Felipe"
         ↓
3. Contexto enviado à IA: "Nome: Felipe"
         ↓
4. IA responde: "Felipe, qual tipo de seguro você está buscando?"
```

---

### Casos Tratados pela Função

| Nome Original | Resultado |
|---------------|-----------|
| FELIPE LEITE DANTAS | Felipe |
| JOÃO SILVA | João |
| MARIA APARECIDA | Maria |
| Alessandro Souza | Alessandro |
| null | Cliente |
| "" | Cliente |

---

### Resumo das Alterações

| Arquivo | Linhas | Alteração |
|---------|--------|-----------|
| nina-orchestrator/index.ts | ~200 | Adicionar função `normalizeContactName()` |
| nina-orchestrator/index.ts | 7326-7327 | Usar `normalizeContactName()` para nome e call_name |

---

### Seção Técnica

**Por que extrair apenas o primeiro nome?**

- Comunicação mais pessoal e natural
- Evita repetição de nomes longos
- Padrão comum em vendas consultivas

**Tratamento de edge cases:**

- Nomes com acentos são preservados (João, José)
- Nomes curtos (2 letras ou menos) não são alterados
- call_name também é normalizado (para casos onde está definido)

