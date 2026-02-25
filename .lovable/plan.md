

# Plano: Normalizar nome do contato em TODOS os pontos do Atlas

## Problema identificado

A screenshot mostra o Atlas enviando mensagens com "FELIPE LAZZARI" — nome completo em CAIXA ALTA. A melhor prática é usar apenas o **primeiro nome** com **inicial maiúscula** (ex: "Felipe").

A função `normalizeContactName()` já existe no `nina-orchestrator` (linha 238) e faz exatamente isso: extrai o primeiro nome e converte para Title Case. Porém, existem **3 pontos** onde o nome do contato é usado SEM passar por essa função.

## Locais a corrigir

Todos no arquivo `supabase/functions/nina-orchestrator/index.ts`:

### 1. Variável de template `cliente_nome` (linha 7566)
Este é o ponto mais crítico — é a variável `{{cliente_nome}}` substituída no prompt do agente. Quando o prompt do Atlas usa `{{cliente_nome}}`, o nome chega em caixa alta e completo.

**De:**
```typescript
'cliente_nome': contact?.name || contact?.call_name || 'Cliente',
```
**Para:**
```typescript
'cliente_nome': normalizeContactName(contact?.call_name || contact?.name),
```

### 2. Email de renovação (linha 2153)
**De:**
```typescript
const contactName = contact?.name || contact?.call_name || 'Cliente';
```
**Para:**
```typescript
const contactName = normalizeContactName(contact?.call_name || contact?.name);
```

### 3. Handoff de veículo (linha 5902)
**De:**
```typescript
const contactName = updatedContact?.call_name || updatedContact?.name || 'Cliente';
```
**Para:**
```typescript
const contactName = normalizeContactName(updatedContact?.call_name || updatedContact?.name);
```

## Resultado esperado

- Atlas envia: "Felipe, qual tipo de seguro você está buscando?"
- Em vez de: "FELIPE LAZZARI, qual tipo de seguro você está buscando?"
- Todas as mensagens, emails e handoffs usam primeiro nome com inicial maiúscula

## Escopo de alteração

- **1 arquivo**: `supabase/functions/nina-orchestrator/index.ts`
- **3 linhas** alteradas
- Sem risco de regressão — a função `normalizeContactName` já é usada em 40+ outros pontos do mesmo arquivo

