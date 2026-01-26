
## Plano: Regra Automática de Tag "Plano de Saúde" para Leads do Clara/Barbara

### Objetivo

Criar uma regra automática que adicione a tag "Plano de Saúde" em todos os contatos atendidos pelo agente Clara e/ou responsável Barbara Francisconi.

---

### Dados Identificados

| Entidade | ID | Observação |
|----------|---|------------|
| Agente Clara | `9d989c66-f978-409d-93fe-887ba1c0f1c5` | slug: `clara` |
| Barbara Francisconi | `232d50ff-4a8b-416e-a71c-086f52f12c64` | Team member |
| Tag "Plano de Saúde" | `d820c2f7-e551-44c6-9d3f-47e9c3c2ed58` | key: `plano_de_saude` |
| Pipeline Saúde | `8b35779b-0ebc-4e4d-bf84-981e4f685991` | Vinculado ao Clara |

---

### Arquitetura da Solução

A tag será adicionada automaticamente em **dois pontos** do fluxo:

#### Ponto 1: Quando conversa é roteada para Clara (linhas ~4918-4963)
Quando `detectAgent()` detecta Clara como agente responsável e faz handoff para o pipeline de Saúde, adicionar a tag ao contato.

#### Ponto 2: Quando deal é atribuído (linhas ~4945-4960)
Quando o deal é movido para o pipeline de Saúde via `get_next_deal_owner`, garantir que a tag seja adicionada.

---

### Alterações no Arquivo

**Arquivo:** `supabase/functions/nina-orchestrator/index.ts`

#### 1. Criar função auxiliar para adicionar tag (após linha ~2800)

```typescript
// ===== AUTO-TAG FOR HEALTH PIPELINE =====
async function addHealthPlanTagIfClara(
  supabase: any,
  contactId: string,
  agentSlug: string | null,
  currentTags: string[] | null
): Promise<void> {
  // Only add tag for Clara agent (health insurance specialist)
  if (agentSlug !== 'clara') return;
  
  const healthTag = 'plano_de_saude';
  const tags = currentTags || [];
  
  // Skip if already has tag
  if (tags.includes(healthTag)) {
    console.log(`[Nina] 🏥 Contact already has ${healthTag} tag`);
    return;
  }
  
  // Add tag
  await supabase
    .from('contacts')
    .update({ tags: [...tags, healthTag] })
    .eq('id', contactId);
  
  console.log(`[Nina] 🏥 Added ${healthTag} tag for Clara/Health pipeline contact`);
}
// ===== END AUTO-TAG FOR HEALTH PIPELINE =====
```

#### 2. Chamar a função quando agente é atribuído (linha ~4924)

Após atualizar o `current_agent_id`:

```typescript
// Update conversation with current agent if changed
if (agent && conversation.current_agent_id !== agent.id) {
  await supabase
    .from('conversations')
    .update({ current_agent_id: agent.id })
    .eq('id', conversation.id);
  console.log(`[Nina] Updated conversation agent to: ${agent.name}`);

  // NOVO: Adicionar tag "Plano de Saúde" se for agente Clara
  await addHealthPlanTagIfClara(
    supabase, 
    conversation.contact_id, 
    agent.slug, 
    conversation.contact?.tags
  );

  // Move deal to agent's pipeline if this is a handoff
  if (isHandoff) {
    // ... código existente ...
  }
}
```

#### 3. Também adicionar tag no fluxo de handoff do pipeline Saúde (linhas ~4960)

Após mover o deal para o pipeline de Saúde, garantir que a tag foi adicionada:

```typescript
// Get current contact tags for update
const { data: currentContact } = await supabase
  .from('contacts')
  .select('tags')
  .eq('id', conversation.contact_id)
  .single();

await addHealthPlanTagIfClara(
  supabase, 
  conversation.contact_id, 
  agent.slug, 
  currentContact?.tags
);
```

---

### Fluxo Resultante

```text
1. Lead entra em contato mencionando "plano de saúde"
         ↓
2. detectAgent() detecta keywords de Clara
         ↓
3. Conversation recebe current_agent_id = Clara
         ↓
4. addHealthPlanTagIfClara() adiciona tag "plano_de_saude"
         ↓
5. Deal movido para pipeline Saúde
         ↓
6. get_next_deal_owner() retorna Barbara (fixed owner)
         ↓
7. Deal atribuído à Barbara com tag visível
```

---

### Verificação de Idempotência

A função verifica se a tag já existe antes de adicionar:
- `if (tags.includes(healthTag)) return;`

Isso previne duplicatas e permite que a função seja chamada múltiplas vezes sem problemas.

---

### Resumo das Alterações

| Linha Aproximada | Alteração |
|------------------|-----------|
| ~2800 | Nova função `addHealthPlanTagIfClara()` |
| ~4924 | Chamada após atualização de agente |
| ~4960 | Chamada após handoff para pipeline Saúde |

---

### Seção Técnica

**Por que adicionar em múltiplos pontos?**

1. **Primeira atribuição**: Quando o lead menciona saúde pela primeira vez e Clara é detectado
2. **Handoff de pipeline**: Quando lead vem de outro agente (ex: Íris) e é redirecionado para Clara
3. **Reativação**: Quando conversa antiga é reativada e roteada para Clara

**Verificação da tag existente:**

A função sempre verifica `tags.includes(healthTag)` antes de adicionar, garantindo que:
- Não haja duplicatas no array
- O update só ocorra quando necessário (economia de queries)

**Persistência:**

A tag é adicionada diretamente na tabela `contacts.tags`, sendo visível em:
- Sidebar do chat
- Dashboard de prospecção (TagDistributionCard)
- Filtros de contatos
