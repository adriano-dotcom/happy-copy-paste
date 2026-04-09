

# Capturar dados CTWA (Click-to-WhatsApp) do webhook Meta

## Contexto
A Meta envia um objeto `referral` junto com mensagens originadas de anúncios CTWA. Estrutura:
```text
message.referral = {
  source_url: "https://fb.me/...",
  source_type: "ad",        // "ad" | "post"
  source_id: "123456789",   // ad_id
  headline: "Texto do anúncio",
  body: "Corpo do anúncio",
  ctwa_clid: "ARA...",      // Click ID único
  media_type: "image"
}
```

Atualmente: **completamente ignorado** no `whatsapp-webhook/index.ts`.

## Plano de implementação

### 1. Atualizar `whatsapp-webhook/index.ts`
- Extrair `message.referral` do payload recebido
- Quando presente, popular os campos do contato:
  - `lead_source` = `'ctwa'` (em vez de `'inbound'`)
  - `utm_source` = `referral.source_type` (ex: `'ad'`, `'post'`)
  - `utm_campaign` = `referral.source_id` (ID do anúncio)
  - `utm_content` = `referral.headline`
- Salvar o objeto `referral` completo em `conversations.metadata.referral` para rastreabilidade

### 2. Atualizar `jarvis-stats` edge function
- Adicionar breakdown de leads por `lead_source = 'ctwa'` nas métricas
- Permitir filtro por origem CTWA nos relatórios

### 3. Atualizar `leads_jarvis_v` view (migration)
- Garantir que `lead_source` e `utm_source` já estão expostos (já estão na view atual)

## Arquivos modificados
- `supabase/functions/whatsapp-webhook/index.ts` — extrair e salvar referral
- `supabase/functions/jarvis-stats/index.ts` — adicionar métricas CTWA
- Migration SQL — atualizar view se necessário

## Mapeamento de campos
```text
Meta referral field    →  DB field
─────────────────────────────────────
source_type ("ad")     →  contacts.utm_source
source_id              →  contacts.utm_campaign
headline               →  contacts.utm_content
ctwa_clid              →  contacts.utm_term
(presença de referral) →  contacts.lead_source = 'ctwa'
(objeto completo)      →  conversations.metadata.referral
```

