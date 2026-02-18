
## Análise do Fluxo: Campanha → Atlas → IA responde (nunca humano no primeiro contato)

### O fluxo atual (como funciona hoje)

```text
1. process-campaign (cron)
   ├── Envia template WhatsApp via API Meta
   ├── Cria/Reutiliza conversa com status='nina'
   │   └── metadata: { origin: 'campaign', campaign_id: X }
   └── Cria deal no pipeline de prospecção (se is_prospecting=true)

2. Lead responde → whatsapp-webhook recebe
   ├── Encontra conversa existente (status='nina')
   ├── Salva mensagem
   └── Insere na nina_processing_queue (debounce 15s)

3. nina-orchestrator processa a fila
   ├── detectAgent() verifica metadata da conversa
   │   ├── SE metadata.origin === 'prospeccao' → Atlas ✅
   │   └── SE qualquer outro valor → cai no default ou keywords
   ├── SE agent='nina' (padrão inbound) → responde como inbound
   └── Envia resposta via whatsapp-sender
```

### Problemas críticos identificados

**Bug 1 — `origin: 'campaign'` vs `origin: 'prospeccao'` (linha 329 de process-campaign)**

O `process-campaign` grava o metadata como:
```typescript
metadata: { origin: 'campaign', campaign_id: campaign.id }
```

Mas o `nina-orchestrator` (linha 1481) verifica:
```typescript
if (conversationMetadata.origin === 'prospeccao') {
  // Roteia para Atlas
}
```

Resultado: **o Atlas nunca é ativado** para leads de campanha, mesmo em campanhas `is_prospecting=true`. A conversa cai no agente padrão (inbound).

**Bug 2 — Conversa existente não atualiza metadata nem status**

Quando o contato já tem uma conversa (linha 315-322):
```typescript
if (existingConv) {
  conversationId = existingConv.id;  // Reutiliza sem atualizar nada!
}
```

Não atualiza:
- `metadata` (fica com origem antiga ou vazia)
- `status` (pode estar 'paused', 'human', etc. — não ativa a IA)
- `is_active` (pode estar false)

Resultado: leads que já tiveram conversa anterior podem ter a IA desativada ou receber o agente errado.

**Bug 3 — Rejeição e "não responsável" verificam `origin === 'prospeccao'` (nunca dispara)**

Nas linhas 3456 e 3562 do orchestrator, as detecções especiais de prospecção (rejeição, "não sou o responsável") também verificam `origin === 'prospeccao'`. Com `origin: 'campaign'`, essas proteções nunca funcionam.

**Bug 4 — `follow-up automations` também verificam a origin**

O sistema de follow-up automático (`process-followups`) usa a origin para diferenciar comportamentos de prospecção. Mesmo problema.

### Solução

**Mudança única em `supabase/functions/process-campaign/index.ts`:**

Substituir `origin: 'campaign'` por `origin: 'prospeccao'` quando a campanha for `is_prospecting=true`:

```typescript
// ANTES (linha 329):
metadata: { origin: 'campaign', campaign_id: campaign.id }

// DEPOIS:
metadata: { 
  origin: campaign.is_prospecting ? 'prospeccao' : 'campaign', 
  campaign_id: campaign.id,
  is_prospecting: campaign.is_prospecting
}
```

**Para a conversa existente reutilizada (linhas 321-322):**
Atualizar a conversa existente para garantir que `status='nina'`, `is_active=true` e o `metadata` correto:

```typescript
if (existingConv) {
  conversationId = existingConv.id;
  // Garantir que a conversa está ativa e com metadata correto
  await supabase
    .from('conversations')
    .update({
      status: 'nina',
      is_active: true,
      metadata: {
        origin: campaign.is_prospecting ? 'prospeccao' : 'campaign',
        campaign_id: campaign.id
      }
    })
    .eq('id', conversationId);
}
```

### Resultado esperado após a correção

```text
1. process-campaign envia template
   └── Cria/Atualiza conversa:
       metadata: { origin: 'prospeccao', campaign_id: X }
       status: 'nina'
       is_active: true

2. Lead responde → nina-orchestrator processa
   ├── detectAgent() lê metadata.origin === 'prospeccao' ✅
   ├── Encontra agente Atlas (slug='atlas') ✅
   └── Atlas responde (nunca humano no primeiro contato)

3. Proteções especiais ativadas:
   ├── isProspectingRejection() detecta rejeições ✅
   ├── detectNotResponsible() para "não sou o responsável" ✅
   └── Soft rejections capturam data de vencimento ✅
```

### Arquivos a modificar

- `supabase/functions/process-campaign/index.ts`
  - Linha 329: alterar `origin: 'campaign'` → origem condicional baseada em `is_prospecting`
  - Linhas 321-334: ao reutilizar conversa existente, adicionar UPDATE para garantir `status='nina'`, `is_active=true` e `metadata` correto

### Impacto zero em outros fluxos

- Campanhas com `is_prospecting=false` continuam com `origin: 'campaign'` (sem mudança de comportamento)
- Fluxos inbound não são afetados
- O agente Atlas só é ativado se `origin === 'prospeccao'` E o agente com slug `'atlas'` estiver cadastrado e ativo
