

# Exibir Cartão de Contato (vCard) Enviado pelo WhatsApp

## Problema

Quando um lead envia um cartão de contato pelo WhatsApp, o webhook recebe o payload com tipo `contacts`, mas nao existe um `case 'contacts'` no `switch (message.type)`. O codigo cai no `default`, salvando apenas `[contacts]` como texto e **descartando todas as informacoes do contato** (nome, telefone, email, empresa).

## Estrutura do Payload WhatsApp (tipo contacts)

```text
message.contacts = [
  {
    name: { formatted_name: "João Silva", first_name: "João", last_name: "Silva" },
    phones: [{ phone: "+5511999999999", type: "CELL" }],
    emails: [{ email: "joao@empresa.com", type: "WORK" }],
    org: { company: "Empresa X" }
  }
]
```

## Solucao

### 1. Backend: `supabase/functions/whatsapp-webhook/index.ts`

Adicionar `case 'contacts':` no switch (entre `interactive` e `default`):

```typescript
case 'contacts': {
  messageType = 'text';
  const contactCards = message.contacts || [];
  if (contactCards.length > 0) {
    const parts = contactCards.map((c: any) => {
      const name = c.name?.formatted_name || 'Sem nome';
      const phone = c.phones?.[0]?.phone || '';
      const email = c.emails?.[0]?.email || '';
      const org = c.org?.company || '';
      let line = `👤 ${name}`;
      if (phone) line += `\n📞 ${phone}`;
      if (email) line += `\n📧 ${email}`;
      if (org) line += `\n🏢 ${org}`;
      return line;
    });
    content = parts.join('\n\n');
  } else {
    content = '[cartão de contato]';
  }
  break;
}
```

Isso extrai nome, telefone, email e empresa do vCard e salva como texto formatado legivel, que sera exibido normalmente no chat. Tambem inclui os dados brutos no `metadata.raw` (ja feito pelo codigo existente).

### 2. Tambem tratar no hot path (linha ~482)

Adicionar `contacts` ao mapeamento de tipo:

```typescript
message_type: message.type === 'interactive' ? 'text' : 
              message.type === 'contacts' ? 'text' : message.type,
```

## Resultado Esperado

- Ao receber um cartao de contato, o chat exibira:
  ```
  👤 João Silva
  📞 +5511999999999
  📧 joao@empresa.com
  🏢 Empresa X
  ```
- Os dados ficam visiveis e legíveis para o operador
- A Nina tambem consegue processar o conteudo se a conversa estiver em modo automatico

## Arquivos Alterados

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/whatsapp-webhook/index.ts` | Adicionar `case 'contacts'` no switch + ajustar hot path type mapping |

