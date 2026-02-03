

# Plano: Adicionar Botão WhatsApp na Tela de Chat

## Problema Identificado

O botão WhatsApp foi adicionado no `ContactDetailsDrawer.tsx`, que é usado na página `/contacts`. Porém, você está na página `/chat` que usa um painel de informações diferente, implementado diretamente no `ChatInterface.tsx`.

## Localização do Código

O campo de telefone na tela de chat está em:
- **Arquivo**: `src/components/ChatInterface.tsx`
- **Linhas**: 2769-2778

Código atual:
```tsx
{/* Phone (always read-only) */}
<div className="flex items-center gap-3 text-sm">
  <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 text-slate-400">
    <Phone className="w-4 h-4" />
  </div>
  <div className="flex flex-col flex-1">
    <span className="text-xs text-slate-500">Telefone</span>
    <span className="text-slate-200 font-medium">{activeChat.contactPhone}</span>
  </div>
</div>
```

---

## Solução

Adicionar o mesmo botão WhatsApp que foi implementado no drawer de contatos.

### Mudanças Necessárias

**1. Adicionar import do ícone MessageCircle** (linha ~7):
```tsx
import { ..., MessageCircle } from 'lucide-react';
```

**2. Adicionar função helper** (próximo às outras funções helper):
```tsx
const getWhatsAppLink = (phone: string) => {
  const cleanPhone = phone.replace(/\D/g, '');
  const message = encodeURIComponent('Olá! Tudo bem?');
  return `https://wa.me/${cleanPhone}?text=${message}`;
};
```

**3. Modificar o campo de telefone** (linhas 2769-2778):
```tsx
{/* Phone (always read-only) */}
<div className="flex items-center gap-3 text-sm">
  <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 text-slate-400">
    <Phone className="w-4 h-4" />
  </div>
  <div className="flex flex-col flex-1">
    <span className="text-xs text-slate-500">Telefone</span>
    <span className="text-slate-200 font-medium">{activeChat.contactPhone}</span>
  </div>
  {activeChat.contactPhone && (
    <a
      href={getWhatsAppLink(activeChat.contactPhone)}
      target="_blank"
      rel="noopener noreferrer"
      className="w-8 h-8 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 hover:border-emerald-400/50 flex items-center justify-center transition-all"
      title="Abrir WhatsApp"
    >
      <MessageCircle className="w-4 h-4 text-emerald-400" />
    </a>
  )}
</div>
```

---

## Arquivo a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/components/ChatInterface.tsx` | Adicionar import, função helper e botão WhatsApp no campo telefone |

---

## Resultado Esperado

1. Botão verde WhatsApp ao lado do telefone no painel de informações do chat
2. Clique abre WhatsApp Web/App com mensagem pré-preenchida "Olá! Tudo bem?"
3. Consistência visual com o botão já implementado no drawer de contatos

