

# Fix: Eliminar accept que reseta a sessao de midia

## Diagnostico confirmado

Timeline da chamada de teste:

```text
23:55:33.260 — Remote audio track UNMUTED (audio comecou!)
23:55:35.163 — accept enviado com SDP completo → 200 OK
23:55:35.263 — Remote audio track ENDED (100ms depois!)
23:56:08    — Meta termina: erro 138021 "not receiving any media"
```

O problema e um deadlock:
- `accept` COM SDP completo → Meta reseta a sessao de midia (audio morre)
- `accept` SEM SDP (`sdp: ''`) → Meta rejeita com erro 100 "sdp is required"
- `accept` sem campo `sdp` → Meta rejeita com erro 131009 "Missing session parameter"

## Solucao: eliminar o accept, usar apenas pre_accept

O `pre_accept` ja estabelece a sessao de midia completa (ICE + DTLS + audio). O `accept` e o sinal que mata o audio. A solucao e **nao enviar accept** e apenas atualizar o status no banco.

Se Meta eventualmente exigir o accept para manter a chamada ativa, podemos adicionar como segunda tentativa um accept com SDP minimo (sem ICE candidates e sem DTLS fingerprint) para evitar re-negociacao.

### Mudanca 1: Edge function — flow `both` sem accept

No `supabase/functions/whatsapp-call-accept/index.ts`, no flow `both`:

1. Remover a chamada fetch para `accept` 
2. Apos `pre_accept` suceder, ir direto para atualizar o DB
3. Manter log indicando que accept foi omitido intencionalmente

```typescript
// ANTES: pre_accept → delay 1.5s → accept (mata audio)
// DEPOIS: pre_accept → update DB (audio continua)
```

### Mudanca 2: Edge function — accept standalone como fallback com SDP minimo

Manter a action `accept` standalone mas com um SDP minimo valido (sem ICE candidates, sem DTLS fingerprint) para casos onde o frontend precise enviar accept separadamente:

```typescript
const minimalSdp = 'v=0\r\no=- 0 0 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\n';
```

### Mudanca 3: Frontend — nao esperar resposta do accept

O frontend ja trata o flow como `both`, entao nao precisa de mudanca significativa. Apenas ajustar o log para refletir que so pre_accept e enviado.

## Resultado esperado

```text
pre_accept: session = { sdp_type: 'answer', sdp: '<SDP completo>' }  → setup midia
(sem accept) → DB atualizado para 'answered'

Audio continua fluindo porque nenhum sinal reseta a sessao.
```

## Risco e mitigacao

- **Risco**: Meta pode dropar a chamada apos X segundos se nao receber `accept`
- **Mitigacao**: Se isso acontecer na proxima teste, adicionamos accept com SDP minimo (sem candidates/fingerprint) como segunda iteracao
- A duracao da chamada de teste (33s) sugere que Meta tolerou o pre_accept por esse tempo antes do accept resetar tudo. Sem o accept, a chamada deve durar indefinidamente

## Secao tecnica

### Arquivo: `supabase/functions/whatsapp-call-accept/index.ts`

**Flow `both` (linhas ~85-145):**
- Remover linhas 106-131 (delay + accept fetch + error handling)
- Ir direto de pre_accept sucesso para update DB

**Flow `accept` standalone (linhas ~192-230):**
- Trocar SDP completo por SDP minimo: `v=0\r\no=- 0 0 IN IP4 0.0.0.0\r\ns=-\r\nt=0 0\r\n`
- Manter como non-fatal (warn em vez de error)

