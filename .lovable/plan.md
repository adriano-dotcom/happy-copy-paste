
## Normalizar nome do contato para apenas o primeiro nome nos templates WhatsApp

### Problema identificado

O nome completo do contato (ex: "EDUARDO SALES DE OLIVEIRA") está sendo passado como variável `{{1}}` do HEADER nos templates WhatsApp. Isso causa:
- Erro `(#132005) Translated text too long` quando o nome completo ultrapassa o limite do WhatsApp
- Experiência estranha para o destinatário receber o nome completo em maiúsculas

O problema existe em **três camadas**:

1. **`SendWhatsAppTemplateModal.tsx` (linha 89)**: auto-preenche `contactName` inteiro como variável do header
2. **`BulkSendTemplateModal.tsx` (linhas 264-265)**: usa `contact.name || contact.call_name` inteiro como variável do header
3. **`send-whatsapp-template/index.ts`**: recebe as variáveis sem normalizar o nome

### Estratégia

Aplicar a normalização em **duas camadas** para máxima robustez:

**Camada 1 - Edge function (defesa definitiva):** Adicionar função `normalizeFirstName()` que:
- Pega apenas o primeiro token do nome
- Converte para Title Case (primeira letra maiúscula, restante minúscula)
- Aplica em QUALQUER variável que pareça um nome de contato quando o campo `contact_id` é fornecido
- Ou melhor: sempre normalizar as variáveis substituindo o nome do contato pelo nome normalizado

**Camada 2 - Frontend (pré-preenchimento correto):** Nos dois modais, ao auto-preencher a variável com o nome do contato, já usar o primeiro nome normalizado.

### Solucao tecnica detalhada

#### 1. Edge function `send-whatsapp-template/index.ts`

Adicionar uma função utilitária de normalização logo após buscar o contato:

```typescript
function normalizeFirstName(fullName: string | null | undefined): string {
  if (!fullName) return '';
  const firstName = fullName.trim().split(/\s+/)[0];
  if (firstName.length < 3) return firstName; // nomes curtos preservados
  return firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
}
```

Após buscar o contato (linha 72-80), calcular `contactFirstName`:
```typescript
const contactFirstName = normalizeFirstName(contact.name || contact.call_name);
```

Na edge function, substituir automaticamente qualquer ocorrência do nome completo do contato nas variáveis pelo primeiro nome normalizado. A abordagem mais segura: **após montar `effectiveHeaderVars` e `effectiveBodyVars`**, percorrer cada variável e se ela corresponder ao nome completo do contato (case-insensitive), substituir pelo primeiro nome normalizado:

```typescript
const fullContactName = (contact.name || contact.call_name || '').trim();

const normalizeIfContactName = (v: string): string => {
  if (fullContactName && v.trim().toLowerCase() === fullContactName.toLowerCase()) {
    return contactFirstName;
  }
  return v;
};

effectiveHeaderVars = effectiveHeaderVars.map(normalizeIfContactName);
effectiveBodyVars = effectiveBodyVars.map(normalizeIfContactName);
```

Isso garante que mesmo se o frontend enviar o nome completo, a edge function corrija antes de enviar ao WhatsApp.

#### 2. `SendWhatsAppTemplateModal.tsx`

No useEffect que auto-preenche variáveis (linha 82-109), aplicar `normalizeFirstName()` localmente:

```typescript
// Antes (linha 89):
initialHeaderVars[0] = contactName;

// Depois:
initialHeaderVars[0] = normalizeFirstName(contactName);
```

Adicionar a função `normalizeFirstName` no topo do componente:
```typescript
const normalizeFirstName = (name?: string): string => {
  if (!name) return '';
  const first = name.trim().split(/\s+/)[0];
  if (first.length < 3) return first;
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
};
```

#### 3. `BulkSendTemplateModal.tsx`

No `handleStartSending` (linha 263-265), trocar:

```typescript
// Antes (linha 265):
headerVariables.push(contact.name || contact.call_name || 'Cliente');

// Depois:
headerVariables.push(normalizeFirstName(contact.name || contact.call_name) || 'Cliente');
```

E nas variáveis de body (linhas 271-275) onde nome também é usado:
```typescript
// Antes (linha 274):
bodyVariables.push(contact.name || contact.call_name || 'Cliente');

// Depois:
bodyVariables.push(normalizeFirstName(contact.name || contact.call_name) || 'Cliente');
```

Adicionar a mesma função `normalizeFirstName` no topo do componente.

### Resultado esperado

- "EDUARDO SALES DE OLIVEIRA" → "Eduardo" no header do template
- "KAUAN FELIPE" → "Kauan" 
- "maria jose santos" → "Maria"
- Nomes curtos como "Ed" → preservados sem alteração
- O truncamento de 60 chars ainda funciona como fallback, mas raramente será necessário pois primeiros nomes raramente ultrapassam o limite

### Arquivos modificados

1. `supabase/functions/send-whatsapp-template/index.ts` — adicionar `normalizeFirstName` + normalização automática nas variáveis
2. `src/components/SendWhatsAppTemplateModal.tsx` — normalizar no auto-preenchimento
3. `src/components/BulkSendTemplateModal.tsx` — normalizar no auto-preenchimento em massa
