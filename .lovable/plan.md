
# Plano: Normalizar Nome do Lead para Atlas (Primeiro Nome + Title Case)

## Problema Identificado

Conforme mostrado na screenshot, o Atlas está usando o nome completo em CAPS LOCK:
- **Atual:** "Oi, KAUAN FELIPE DE SALES PAIVA!"
- **Esperado:** "Oi, Kauan!"

A funcao `normalizeContactName` ja existe no codigo e funciona corretamente (extrai primeiro nome e converte CAPS para Title Case), porem ela nao esta sendo aplicada em todos os lugares onde o nome do contato e usado.

---

## Funcao Existente

```typescript
// Linha 238-251 do nina-orchestrator
function normalizeContactName(name: string | null): string {
  if (!name || !name.trim()) return 'Cliente';
  
  // Pegar apenas o primeiro nome
  const firstName = name.trim().split(/\s+/)[0];
  
  // Se esta todo em maiusculas, converter para Title Case
  if (firstName === firstName.toUpperCase() && firstName.length > 2) {
    return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
  }
  
  // Garantir primeira letra maiuscula
  return firstName.charAt(0).toUpperCase() + firstName.slice(1);
}
```

---

## Locais que Precisam de Correcao

### 1. nina-orchestrator/index.ts (8 ocorrencias)

| Linha | Contexto | Uso Atual | Correcao |
|-------|----------|-----------|----------|
| 3353 | generate-summary body | `conversation.contact?.name` | `normalizeContactName(...)` |
| 5021 | Callback confirmation | `conversation.contact?.call_name \|\| ...name` | `normalizeContactName(...)` |
| 5131-5133 | Prospecting intro message | `conversation.contact?.call_name \|\| ...name` | `normalizeContactName(...)` |
| 6192 | Email extraction context | `conversation.contact?.call_name \|\| ...name` | `normalizeContactName(...)` |
| 6375 | Email HTML content | `contactName \|\| conversation.contact?.name` | Usar variavel ja normalizada |
| 6409 | Email subject | `contactName \|\| conversation.contact?.name` | Usar variavel ja normalizada |
| 6462 | Qualificacao completa | `conversation.contact?.call_name \|\| ...name` | `normalizeContactName(...)` |
| 6903-6912 | Fallback prospecting | `conversation.contact?.call_name \|\| ...name` | `normalizeContactName(...)` |

### 2. process-campaign/index.ts (2 ocorrencias)

| Linha | Contexto | Uso Atual | Correcao |
|-------|----------|-----------|----------|
| 238 | Header variables | `contact.name \|\| 'Cliente'` | `normalizeContactName(contact.name)` |
| 251 | Body variables | `contact.name \|\| 'Cliente'` | `normalizeContactName(contact.name)` |

**Nota:** Precisa adicionar a funcao `normalizeContactName` neste arquivo, pois ela nao existe la.

---

## Implementacao

### Passo 1: Atualizar process-campaign/index.ts

Adicionar a funcao `normalizeContactName` ao inicio do arquivo (apos imports) e usa-la nas linhas 238 e 251:

```typescript
// Adicionar funcao
function normalizeContactName(name: string | null): string {
  if (!name || !name.trim()) return 'Cliente';
  const firstName = name.trim().split(/\s+/)[0];
  if (firstName === firstName.toUpperCase() && firstName.length > 2) {
    return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
  }
  return firstName.charAt(0).toUpperCase() + firstName.slice(1);
}

// Atualizar uso
const varValue = templateVars[`header_${i + 1}`] || normalizeContactName(contact.name);
const varValue = templateVars[`body_${i + 1}`] || normalizeContactName(contact.name);
```

### Passo 2: Atualizar nina-orchestrator/index.ts

Substituir todas as ocorrencias listadas acima para usar `normalizeContactName()`.

**Exemplo de correcao na linha 5131:**

Antes:
```typescript
const contactName = conversation.contact?.call_name || conversation.contact?.name || '';
const prospectingIntroMessage = contactName 
  ? `Oi, ${contactName}! Somos da Jacometo Seguros...`
```

Depois:
```typescript
const contactName = normalizeContactName(conversation.contact?.call_name || conversation.contact?.name);
const prospectingIntroMessage = contactName !== 'Cliente'
  ? `Oi, ${contactName}! Somos da Jacometo Seguros...`
```

---

## Resultado Esperado

Apos as correcoes:

| Situacao | Antes | Depois |
|----------|-------|--------|
| Nome em CAPS | "KAUAN FELIPE DE SALES PAIVA" | "Kauan" |
| Nome normal | "João Silva Santos" | "João" |
| Nome vazio | "" | "Cliente" |
| Nome curto | "Lu" | "Lu" (preservado) |

A mensagem do Atlas ficara:
> "Oi, Kauan! Somos da Jacometo Seguros, uma corretora especializada em seguros para transportadoras."

---

## Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/process-campaign/index.ts` | Adicionar funcao + atualizar 2 linhas |
| `supabase/functions/nina-orchestrator/index.ts` | Atualizar 8 ocorrencias para usar normalizeContactName |

---

## Secao Tecnica

### Regex de normalizacao

A funcao utiliza:
- `name.trim().split(/\s+/)[0]` - Extrai primeiro nome (split por espacos)
- `firstName.toUpperCase()` - Verifica se esta em CAPS
- `charAt(0).toUpperCase() + slice(1).toLowerCase()` - Converte para Title Case

### Preservacao de nomes curtos

Nomes com 2 caracteres ou menos (ex: "Lu", "Jo") sao preservados como estao para evitar problemas com iniciais ou apelidos.
