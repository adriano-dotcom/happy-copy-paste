

# Fluxo Atlas: Prospecção Enviada → Em Qualificação (automático)

## Estado Atual

O fluxo já está **parcialmente implementado**:

| Etapa | Status | Onde |
|-------|--------|------|
| Template enviado → Deal move para "Template Enviado" | ✅ Funciona | `send-whatsapp-template/index.ts` (linha 304-363) |
| Template enviado → Contact status "prospecting" | ✅ Funciona | `send-whatsapp-template/index.ts` (linha 328-332) |
| Lead responde → Deal move para "Em Qualificação" | ✅ Funciona | `nina-orchestrator/index.ts` (linha 5313-5338) |
| Lead responde → Contact status "lead" (Em Qualificação) | ❌ Faltando | Não existe em nenhum lugar |

## O que falta

Quando o lead responde à prospecção, o `nina-orchestrator` já move o deal para o estágio "Em Qualificação" no pipeline, **mas não atualiza o `lead_status` do contato** de `prospecting` para `lead`.

Isso significa que na tela de Contatos, o lead continua aparecendo como "Em Prospecção" mesmo depois de responder.

## Alteração necessária

### `supabase/functions/nina-orchestrator/index.ts` (~linha 5336)

Após mover o deal para "Em Qualificação", adicionar update do `lead_status` do contato:

```typescript
// Depois do update do deal (linha 5336):
console.log(`[Nina] 📊 Prospecting deal moved to Em Qualificação`);

// UPDATE CONTACT STATUS: prospecting → lead (Em Qualificação)
await supabase
  .from('contacts')
  .update({ lead_status: 'lead' })
  .eq('id', conversation.contact_id)
  .eq('lead_status', 'prospecting');

console.log(`[Nina] 📊 Contact lead_status updated to 'lead' (Em Qualificação)`);
```

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/nina-orchestrator/index.ts` | Adicionar update de `lead_status` para `lead` quando lead responde prospecção |

