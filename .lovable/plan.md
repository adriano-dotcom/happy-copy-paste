
# Plano: Adicionar Botão "Ir para WhatsApp" no Drawer de Contato

## Objetivo

Adicionar um botão ao lado do campo de telefone que abre o WhatsApp Web/App com uma mensagem pré-preenchida, permitindo disparo rápido direto do telefone do usuário.

---

## Implementação

### Arquivo: `src/components/ContactDetailsDrawer.tsx`

**Mudança 1**: Adicionar ícone do WhatsApp (usando Lucide `MessageCircle` estilizado ou SVG customizado)

**Mudança 2**: Criar função para gerar link do WhatsApp com texto pré-preenchido:

```typescript
const getWhatsAppLink = (phone: string) => {
  // Remove todos os caracteres não numéricos
  const cleanPhone = phone.replace(/\D/g, '');
  
  // Texto pré-preenchido
  const message = encodeURIComponent('Olá! Tudo bem?');
  
  return `https://wa.me/${cleanPhone}?text=${message}`;
};
```

**Mudança 3**: Modificar o `InfoRow` do Telefone (linha 250) para incluir botão:

```tsx
// Antes
<InfoRow icon={Phone} label="Telefone" value={displayPhoneInternational(contact.phone)} />

// Depois - Criar um componente customizado inline com botão WhatsApp
<div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.03] hover:border-cyan-500/20 transition-all duration-300 group">
  <div className="p-2 rounded-lg bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-white/5">
    <Phone className="w-4 h-4 text-slate-400 group-hover:text-cyan-400" />
  </div>
  <div className="flex-1 min-w-0">
    <span className="text-xs text-slate-500 block">Telefone</span>
    <p className="font-medium text-slate-200">{displayPhoneInternational(contact.phone)}</p>
  </div>
  {contact.phone && (
    <a
      href={getWhatsAppLink(contact.phone)}
      target="_blank"
      rel="noopener noreferrer"
      className="p-2 rounded-lg bg-gradient-to-br from-emerald-500/20 to-green-500/20 border border-emerald-500/30 hover:from-emerald-500/30 hover:to-green-500/30 hover:border-emerald-400/50 transition-all group/whatsapp"
      title="Abrir WhatsApp"
    >
      <MessageCircle className="w-4 h-4 text-emerald-400 group-hover/whatsapp:text-emerald-300" />
    </a>
  )}
</div>
```

---

## Visual

O botão terá:
- Ícone verde (estilo WhatsApp)
- Fundo com gradiente emerald/green
- Borda verde sutil
- Efeito hover com glow
- Posicionado à direita do valor do telefone

---

## Texto Pré-preenchido

A mensagem inicial será:
> "Olá! Tudo bem?"

Isso pode ser customizado posteriormente conforme necessidade.

---

## Arquivo a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/components/ContactDetailsDrawer.tsx` | Adicionar função `getWhatsAppLink` e botão no campo telefone |

---

## Resultado Esperado

1. Botão verde ao lado do telefone
2. Clique abre WhatsApp Web/App automaticamente
3. Mensagem já preenchida para o usuário apenas enviar
4. Funciona tanto no desktop (WhatsApp Web) quanto mobile (App)
