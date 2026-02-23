

# Remover Mensagem Pre-preenchida do Link WhatsApp

## Problema

Quando o operador clica no link do WhatsApp para contatar um lead, o link inclui o parametro `?text=Olá RONALDO! Tudo bem?`. Isso faz com que o WhatsApp abra com essa mensagem ja digitada no campo, e o operador acaba enviando essa mensagem ALEM do template que ja foi enviado pelo sistema -- resultando em duas mensagens para o contato.

## Solucao

Remover o parametro `?text=...` dos links `wa.me`, para que o WhatsApp abra a conversa sem mensagem pre-preenchida.

### Arquivo 1: `src/components/ContactDetailsDrawer.tsx` (linha 49-52)

**Antes:**
```typescript
const cleanPhone = phone.replace(/\D/g, '');
const firstName = name?.split(' ')[0] || '';
const message = encodeURIComponent(`Olá ${firstName}! Tudo bem?`.trim());
return `https://wa.me/${cleanPhone}?text=${message}`;
```

**Depois:**
```typescript
const cleanPhone = phone.replace(/\D/g, '');
return `https://wa.me/${cleanPhone}`;
```

### Arquivo 2: `src/components/ChatInterface.tsx` (linha 2865)

**Antes:**
```typescript
href={`https://wa.me/${activeChat.contactPhone.replace(/\D/g, '')}?text=${encodeURIComponent(...)}`}
```

**Depois:**
```typescript
href={`https://wa.me/${activeChat.contactPhone.replace(/\D/g, '')}`}
```

## Resultado Esperado

- Ao clicar no link do WhatsApp, abre a conversa sem mensagem pre-preenchida
- O operador nao envia mais mensagem duplicada acidentalmente
- O template ja enviado pelo sistema continua sendo a unica mensagem recebida pelo lead

| Arquivo | Mudanca |
|---------|---------|
| `src/components/ContactDetailsDrawer.tsx` | Remover `?text=...` do link wa.me |
| `src/components/ChatInterface.tsx` | Remover `?text=...` do link wa.me |

