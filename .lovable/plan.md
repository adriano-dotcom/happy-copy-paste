
## Alinhar normalização de nome em `process-campaign`

### Problema

A edge function `process-campaign` já possui uma função `normalizeContactName` (linhas 19-26), mas ela tem dois problemas em relação ao padrão adotado nos outros arquivos:

**Problema 1 - Lógica incompleta:**
```typescript
// Função atual (process-campaign) - incompleta
function normalizeContactName(name: string | null): string {
  if (!name || !name.trim()) return 'Cliente';
  const firstName = name.trim().split(/\s+/)[0];
  // Só normaliza se TUDO MAIÚSCULO e comprimento > 2
  if (firstName === firstName.toUpperCase() && firstName.length > 2) {
    return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
  }
  // Para nomes mistos como "Eduardo Sales", retorna "Eduardo" — OK neste caso
  // Mas para "eduardo sales" (tudo minúsculo), retorna "eduardo" sem Title Case!
  return firstName.charAt(0).toUpperCase() + firstName.slice(1);
}
```

A lógica correta (adotada em `send-whatsapp-template`, `SendWhatsAppTemplateModal`, `BulkSendTemplateModal`):
```typescript
function normalizeFirstName(name: string | null): string {
  if (!name || !name.trim()) return 'Cliente';
  const firstName = name.trim().split(/\s+/)[0];
  if (firstName.length < 3) return firstName; // preserva nomes curtos
  return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
}
```
A diferença chave: sempre aplica `.toLowerCase()` no `slice(1)`, garantindo Title Case em todos os casos.

**Problema 2 - Normalização só no fallback:**
Nas linhas 248 e 261, `normalizeContactName` é chamado apenas quando `templateVars[header_1]` não existe:
```typescript
const varValue = templateVars[`header_${i + 1}`] || normalizeContactName(contact.name);
```
Se a campanha foi configurada com `header_1 = "EDUARDO SALES"` (nome completo), o valor passa diretamente sem normalização.

### Solução

**Duas mudanças em `supabase/functions/process-campaign/index.ts`:**

**1. Substituir `normalizeContactName` por `normalizeFirstName` com lógica correta (linhas 19-26):**
```typescript
// ANTES
function normalizeContactName(name: string | null): string {
  if (!name || !name.trim()) return 'Cliente';
  const firstName = name.trim().split(/\s+/)[0];
  if (firstName === firstName.toUpperCase() && firstName.length > 2) {
    return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
  }
  return firstName.charAt(0).toUpperCase() + firstName.slice(1);
}

// DEPOIS
function normalizeFirstName(name: string | null): string {
  if (!name || !name.trim()) return 'Cliente';
  const firstName = name.trim().split(/\s+/)[0];
  if (firstName.length < 3) return firstName;
  return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
}
```

**2. Aplicar normalização obrigatória em todas as variáveis (linhas 247-264):**

Para header:
```typescript
// ANTES
const varValue = templateVars[`header_${i + 1}`] || normalizeContactName(contact.name);

// DEPOIS - normaliza independente da origem do valor
const rawValue = templateVars[`header_${i + 1}`] || contact.name || 'Cliente';
const varValue = normalizeFirstName(rawValue);
```

Para body: a mesma lógica — mas **apenas quando o valor parece ser um nome** (para não quebrar variáveis de body que não são nomes, como empresa, produto, etc.). A abordagem segura é aplicar a normalização à variável se ela corresponder ao nome completo do contato (case-insensitive), igual ao que foi feito no `send-whatsapp-template`:

```typescript
// Normalização defensiva: se a variável é o nome completo do contato, normaliza
const fullName = (contact.name || '').trim();
const normalizeIfName = (v: string) => {
  if (fullName && v.trim().toLowerCase() === fullName.toLowerCase()) {
    return normalizeFirstName(contact.name);
  }
  return v;
};
```

Para o **header** especificamente (variável `{{1}}` é quase sempre o nome do contato), aplicar sempre:
```typescript
const varValue = normalizeFirstName(templateVars[`header_${i + 1}`] || contact.name || 'Cliente');
```

Para o **body**, aplicar a normalização defensiva (normaliza só se for o nome completo):
```typescript
const rawValue = templateVars[`body_${i + 1}`] || contact.name || 'Cliente';
const varValue = normalizeIfName(rawValue);
```

### Arquivo modificado

- `supabase/functions/process-campaign/index.ts` — renomear função, corrigir lógica e aplicar normalização em todas as variáveis, não só no fallback

### Resultado esperado

| Entrada | Resultado atual | Resultado novo |
|---|---|---|
| `templateVars.header_1 = "EDUARDO SALES"` | "EDUARDO SALES" (sem normalização) | "Eduardo" |
| `templateVars.header_1 = undefined`, `contact.name = "KAUAN FELIPE"` | "Kauan" (já correto) | "Kauan" |
| `templateVars.header_1 = undefined`, `contact.name = "maria jose"` | "Maria" (já correto, letras mistas) | "Maria" |
| `templateVars.body_1 = "Transportadora XYZ"` | "Transportadora XYZ" (preservado) | "Transportadora XYZ" (preservado — não é nome do contato) |
