

# Adicionar texto pré-preenchido no link do WhatsApp

## Contexto
A screenshot mostra o drawer de detalhes do contato (DADOS DE CONTATO) com o botão do WhatsApp ao lado do telefone. Atualmente o link abre `wa.me/{telefone}` sem nenhuma mensagem. O pedido é incluir "Olá {primeiro nome}, tudo bem?" como texto pré-preenchido.

## Locais afetados

Existem 2 lugares onde links `wa.me` são gerados com base no contato:

1. **`src/components/ContactDetailsDrawer.tsx`** (linha 48-51) — função `getWhatsAppLink(phone)` usada no botão do drawer
2. **`src/components/ChatInterface.tsx`** (linha 2882) — link inline no painel de chat

## Alterações

### 1. `ContactDetailsDrawer.tsx`
- Alterar `getWhatsAppLink` para aceitar `phone` + `name`
- Extrair primeiro nome com inicial maiúscula (padrão `normalizeFirstName` já usado no projeto)
- Gerar URL: `https://wa.me/{phone}?text=Olá {primeiroNome}, tudo bem?` (com `encodeURIComponent`)
- Atualizar a chamada da função para passar o `contact.name`

### 2. `ChatInterface.tsx`
- Aplicar a mesma lógica no link do WhatsApp inline, usando `activeChat.contactName` para extrair o primeiro nome

### Detalhes técnicos
- Normalização do nome: `name.trim().split(/\s+/)[0]` → Title Case (primeira letra maiúscula, resto minúsculo)
- Fallback quando nome é vazio/null: usar apenas "Olá, tudo bem?" (sem nome)
- Encoding: `encodeURIComponent("Olá PrimeiroNome, tudo bem?")`

### Escopo
- 2 arquivos frontend alterados
- Sem mudanças de banco ou backend

