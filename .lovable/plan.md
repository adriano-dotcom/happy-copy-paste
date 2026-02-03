

# Plano: Incluir Nome do Contato na Mensagem do WhatsApp

## Objetivo

Personalizar a mensagem pré-preenchida do WhatsApp incluindo o nome do contato, transformando "Olá! Tudo bem?" em "Olá **João**! Tudo bem?" (exemplo).

---

## Mudanças Necessárias

### 1. `src/components/ChatInterface.tsx` (linha 2780)

**Antes:**
```tsx
href={`https://wa.me/${activeChat.contactPhone.replace(/\D/g, '')}?text=${encodeURIComponent('Olá! Tudo bem?')}`}
```

**Depois:**
```tsx
href={`https://wa.me/${activeChat.contactPhone.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá ${activeChat.contactName?.split(' ')[0] || ''}! Tudo bem?`.trim())}`}
```

---

### 2. `src/components/ContactDetailsDrawer.tsx` (linhas 45-49)

**Antes:**
```typescript
const getWhatsAppLink = (phone: string) => {
  const cleanPhone = phone.replace(/\D/g, '');
  const message = encodeURIComponent('Olá! Tudo bem?');
  return `https://wa.me/${cleanPhone}?text=${message}`;
};
```

**Depois:**
```typescript
const getWhatsAppLink = (phone: string, name?: string) => {
  const cleanPhone = phone.replace(/\D/g, '');
  const firstName = name?.split(' ')[0] || '';
  const message = encodeURIComponent(`Olá ${firstName}! Tudo bem?`.trim());
  return `https://wa.me/${cleanPhone}?text=${message}`;
};
```

**Também atualizar a chamada** (linha ~260):
```tsx
href={getWhatsAppLink(contact.phone, contact.name)}
```

---

## Detalhes Técnicos

| Lógica | Descrição |
|--------|-----------|
| `name?.split(' ')[0]` | Extrai apenas o primeiro nome (ex: "João Silva" → "João") |
| `\|\| ''` | Fallback para string vazia se nome não existir |
| `.trim()` | Remove espaços extras caso o nome não exista |

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/components/ChatInterface.tsx` | Incluir `activeChat.contactName` na mensagem |
| `src/components/ContactDetailsDrawer.tsx` | Adicionar parâmetro `name` na função e incluir na mensagem |

---

## Resultado Esperado

**Mensagem antes:** "Olá! Tudo bem?"

**Mensagem depois:** "Olá João! Tudo bem?" (usando primeiro nome do contato)

Isso torna a mensagem mais pessoal e aumenta a taxa de resposta!

