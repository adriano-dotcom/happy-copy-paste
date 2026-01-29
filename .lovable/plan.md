

# Plano: Atualizar Mensagem e Botões da Íris

## Alterações Solicitadas

### 1. Nova Mensagem Inicial
**De:**
> "Oi! Sou a Íris, da Jacometo Seguros, especialista em seguros para transportadores. Que tipo de mercadoria você geralmente transporta?"

**Para:**
> "Olá! Sou a Íris, da Jacometo Seguros, especialista em seguros para transportadoras. Antes de começarmos me responda;"

### 2. Botões Interativos - Remover Texto
**De:**
> "Só pra eu entender melhor:"
> [Sou transportador] [Outros seguros] [Foi engano]

**Para:**
> [Sou transportador] [Outros seguros] [Foi engano]
> *(apenas os botões, sem texto acompanhando)*

---

## Implementação

### Passo 1: Atualização no Banco de Dados

```sql
UPDATE agents 
SET cargo_focused_greeting = 'Olá! Sou a Íris, da Jacometo Seguros, especialista em seguros para transportadoras. Antes de começarmos me responda;'
WHERE slug = 'iris';
```

### Passo 2: Alterar Código do Orchestrator

Arquivo: `supabase/functions/nina-orchestrator/index.ts` (linha 6567)

**Antes:**
```typescript
await queueInteractiveButtons(
  supabase,
  conversation,
  'Só pra eu entender melhor:',
  [
    { id: 'btn_transportador', title: 'Sou transportador' },
    ...
```

**Depois:**
```typescript
await queueInteractiveButtons(
  supabase,
  conversation,
  '', // Sem texto - apenas botões
  [
    { id: 'btn_transportador', title: 'Sou transportador' },
    ...
```

---

## Resumo de Arquivos

| Item | Ação | Descrição |
|------|------|-----------|
| Banco de dados (`agents`) | UPDATE | Alterar `cargo_focused_greeting` da Íris |
| `nina-orchestrator/index.ts` | Editar linha 6567 | Remover texto dos botões interativos |

---

## Fluxo Após Implementação

```
┌─────────────────────────────────────────────────────────────────┐
│ Lead: "Olá! Quero mais informações sobre seguro de cargas..."   │
└─────────────────────────────────────────────────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Íris (mensagem 1 - texto):                                      │
│ "Olá! Sou a Íris, da Jacometo Seguros, especialista em seguros  │
│  para transportadoras. Antes de começarmos me responda;"        │
└─────────────────────────────────────────────────────────────────┘
                              ▼ (2.5s depois)
┌─────────────────────────────────────────────────────────────────┐
│ Íris (mensagem 2 - apenas botões):                              │
│   [🔘 Sou transportador]                                        │
│   [🔘 Outros seguros]                                           │
│   [🔘 Foi engano]                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Seção Técnica

### Nota sobre Botões sem Texto
A API do WhatsApp permite enviar mensagens interativas com `body.text` vazio ou com texto mínimo. Será usado string vazia para não exibir texto antes dos botões.

