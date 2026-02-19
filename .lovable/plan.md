

# Fix: Accept re-envia SDP completo e reseta a sessao de midia

## Diagnostico

A timeline dos logs mostra exatamente o problema:

```text
23:25:49.403 — Remote audio track UNMUTED (audio fluindo!)
23:25:50.970 — accept enviado com SDP completo → 200 OK
23:25:51.036 — Remote audio track ENDED (1 segundo depois!)
```

O `pre_accept` com SDP funciona perfeitamente: ICE conecta, DTLS completa, audio remoto comeca a fluir. Mas quando o `accept` envia o **mesmo SDP completo de novo**, Meta reseta a sessao de midia, matando a conexao ativa.

Tentativas anteriores:
- accept SEM `session` → erro 131009 "Missing session parameter"
- accept COM `session` completo (sdp_type + sdp) → funciona mas mata o audio

## Solucao: enviar accept com session minima (sem campo sdp)

O `accept` precisa do objeto `session` para satisfazer a validacao da Meta, mas NAO deve incluir o campo `sdp` para evitar re-setup da sessao de midia.

### Mudanca 1: Edge function — accept com session sem sdp

No `supabase/functions/whatsapp-call-accept/index.ts`, na action `both` (linhas 117-122), mudar o body do accept:

**Antes:**
```typescript
body: JSON.stringify({
  messaging_product: 'whatsapp',
  call_id: whatsappCallId,
  action: 'accept',
  session: { sdp_type: 'answer', sdp: sdp_answer },
})
```

**Depois:**
```typescript
body: JSON.stringify({
  messaging_product: 'whatsapp',
  call_id: whatsappCallId,
  action: 'accept',
  session: { sdp_type: 'answer' },
})
```

Mesma mudanca na action `accept` standalone (linhas ~200-220).

Tambem atualizar o log para refletir que nao enviamos SDP no accept:
`[both] Sending accept for call ${whatsappCallId} (without SDP)`

### Mudanca 2: Edge function — remover obrigatoriedade de sdp_answer para accept

Na action `accept` standalone, remover a validacao que exige `sdp_answer` (ja que nao e mais enviado).

### Mudanca 3: Frontend — nao enviar sdp_answer no accept standalone

No `IncomingCallModal.tsx`, se houver algum fallback para chamada `accept` separada, nao incluir `sdp_answer`.

## Resultado esperado

```text
pre_accept: session = { sdp_type: 'answer', sdp: '<SDP completo>' }  → setup midia
accept:     session = { sdp_type: 'answer' }                         → confirma sem resetar

Audio continua fluindo porque a sessao de midia NAO e re-criada.
```

## Risco

Se Meta rejeitar `session` sem `sdp` (erro 131009 novamente), a alternativa seria testar com API v22.0 ou enviar um SDP minimo (sem candidatos ICE e sem fingerprint DTLS) no accept.
