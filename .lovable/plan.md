
# Plano: Corrigir Resposta do Atlas para Leads que Demonstram Desinteresse

## Problema Identificado

Quando um lead de prospecção responde "não tenho interesse", o agente Atlas está enviando incorretamente:

> "Claro! Vou passar seus dados para um corretor. Em breve ele te chama."

Isso é **contraditório** e **inapropriado** - o lead disse que NAO quer, e o agente promete contato do corretor.

### Causa Raiz

No `nina-orchestrator/index.ts` (linha 3421), quando detecta rejeição de prospecção, o sistema usa o campo `handoff_message` do agente:

```typescript
const rejectionResponse = agent?.handoff_message || 'Obrigado pelo retorno! Desculpe o contato.';
```

O `handoff_message` do Atlas é destinado a leads **qualificados** que serão transferidos para atendimento humano, não para leads que **rejeitam** a prospecção.

---

## Solucao Proposta

### Opcao 1: Adicionar Campo `rejection_message` (Recomendado)

Adicionar um novo campo na tabela `agents` para armazenar a mensagem de encerramento quando o lead rejeita:

**Alteracao no Banco de Dados:**
```sql
ALTER TABLE agents ADD COLUMN rejection_message TEXT;

UPDATE agents 
SET rejection_message = 'Entendo perfeitamente. Agradeço muito pelo seu tempo e atenção. Qualquer dúvida sobre seguros de carga ou frota, estamos à disposição. Tenha um ótimo dia!'
WHERE slug = 'atlas';
```

**Alteracao no Codigo (`nina-orchestrator/index.ts`):**

Linha 3421 - Mudar de:
```typescript
const rejectionResponse = agent?.handoff_message || 'Obrigado pelo retorno! Desculpe o contato.';
```

Para:
```typescript
const rejectionResponse = agent?.rejection_message || 'Obrigado pelo retorno! Desculpe o contato.';
```

### Opcao 2: Mensagem Estatica para Prospeccao Atlas

Se preferir nao alterar o banco, podemos adicionar uma mensagem estatica especifica para o agente Atlas:

```typescript
// Linha 3417-3421
if (conversationMetadata.origin === 'prospeccao' && message.content && isProspectingRejection(message.content)) {
  console.log(`[Nina] 🚫 Prospecting rejection detected: "${message.content}"`);
  
  // Mensagem de encerramento cordial para rejeicao (NAO usar handoff_message)
  const PROSPECTING_REJECTION_RESPONSE = 'Sem problemas! Agradeço pela conversa e pelo seu tempo. Fico à disposição caso precise de informações sobre seguros no futuro. Qualquer coisa, é só entrar em contato. Tenha um excelente dia!';
  
  const rejectionResponse = PROSPECTING_REJECTION_RESPONSE;
```

---

## Implementacao Detalhada (Opcao 1 - Recomendada)

### Passo 1: Migracao do Banco de Dados

Adicionar coluna `rejection_message` na tabela `agents`:

```sql
-- Adicionar coluna para mensagem de rejeicao
ALTER TABLE agents ADD COLUMN IF NOT EXISTS rejection_message TEXT;

-- Configurar mensagem para Atlas (agente de prospeccao)
UPDATE agents 
SET rejection_message = 'Sem problemas! Agradeço pela conversa e pelo seu tempo. Fico à disposição caso precise de informações sobre seguros no futuro. Qualquer coisa, é só entrar em contato. Tenha um excelente dia!'
WHERE slug = 'atlas';

-- Configurar mensagem padrao para outros agentes (opcional)
UPDATE agents 
SET rejection_message = 'Entendi! Agradeço pelo seu tempo. Qualquer dúvida sobre seguros, estamos à disposição. Tenha um ótimo dia!'
WHERE slug != 'atlas' AND rejection_message IS NULL;
```

### Passo 2: Atualizar Interface Agent

Arquivo: `supabase/functions/nina-orchestrator/index.ts` (linhas 12-33)

```typescript
interface Agent {
  id: string;
  name: string;
  slug: string;
  specialty: string | null;
  system_prompt: string;
  is_default: boolean;
  is_active: boolean;
  detection_keywords: string[];
  greeting_message: string | null;
  handoff_message: string | null;
  rejection_message: string | null; // NOVO
  cargo_focused_greeting: string | null;
  qualification_questions: Array<{ order: number; question: string }>;
  // ... demais campos
}
```

### Passo 3: Atualizar Logica de Prospecting Rejection

Arquivo: `supabase/functions/nina-orchestrator/index.ts` (linhas 3415-3432)

**Antes:**
```typescript
if (conversationMetadata.origin === 'prospeccao' && message.content && isProspectingRejection(message.content)) {
  console.log(`[Nina] 🚫 Prospecting rejection detected: "${message.content}"`);
  
  // Use agent's handoff_message (graceful exit message)
  const rejectionResponse = agent?.handoff_message || 'Obrigado pelo retorno! Desculpe o contato.';
```

**Depois:**
```typescript
if (conversationMetadata.origin === 'prospeccao' && message.content && isProspectingRejection(message.content)) {
  console.log(`[Nina] 🚫 Prospecting rejection detected: "${message.content}"`);
  
  // Use agent's rejection_message for graceful closure (NOT handoff_message which is for qualified leads)
  const rejectionResponse = agent?.rejection_message 
    || 'Sem problemas! Agradeço pelo seu tempo. Qualquer dúvida sobre seguros, estamos à disposição. Tenha um ótimo dia!';
```

---

## Mensagens de Encerramento Sugeridas

Para o agente **Atlas** (prospeccao), configurar `rejection_message`:

**Opcao Curta:**
> "Entendo perfeitamente. Agradeço muito pelo seu tempo e atenção. Qualquer dúvida sobre seguros de carga ou frota, estamos à disposição. Tenha um ótimo dia!"

**Opcao Completa:**
> "Sem problemas! Agradeço pela conversa e pelo seu tempo. Fico à disposição caso precise de informações sobre seguros no futuro. Qualquer coisa, é só entrar em contato. Tenha um excelente dia!"

---

## Resumo de Arquivos

| Arquivo | Acao | Descricao |
|---------|------|-----------|
| Banco de dados | Migracao | Adicionar coluna `rejection_message` |
| `nina-orchestrator/index.ts` | Editar | Atualizar interface Agent e logica de rejeicao |

---

## Comportamento Esperado Apos Implementacao

**Cenario:** Lead responde "E não tenho interesse"

**Antes (comportamento incorreto):**
> "Claro! Vou passar seus dados para um corretor. Em breve ele te chama."

**Depois (comportamento correto):**
> "Sem problemas! Agradeço pela conversa e pelo seu tempo. Fico à disposição caso precise de informações sobre seguros no futuro. Qualquer coisa, é só entrar em contato. Tenha um excelente dia!"

O sistema tambem:
- Move o deal para estagio "Perdido"
- Pausa a conversa (status = 'paused')
- Nao envia mais follow-ups

---

## Secao Tecnica

### Principio de Design
O `handoff_message` deve ser usado **apenas** quando o lead e qualificado e sera transferido para atendimento humano. Para rejeicoes, uma mensagem separada (`rejection_message`) garante encerramento cordial sem prometer contato futuro.

### Impacto em Outros Agentes
A alteracao e compativel com os demais agentes (Iris, Clara, Sofia, Adri) pois:
1. O campo e opcional (`TEXT` nullable)
2. O fallback mantem uma mensagem generica adequada
3. Outros agentes podem ter `rejection_message` configurado posteriormente

### Testes Recomendados
1. Simular "não tenho interesse" em conversa de prospeccao
2. Verificar que a mensagem de encerramento e cordial (nao menciona corretor)
3. Confirmar que deal vai para "Perdido" e conversa e pausada
