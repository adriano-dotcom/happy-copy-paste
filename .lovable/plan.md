
# Investigação profunda — resultado

## O que foi confirmado (com evidência)

1. **A chamada não está duplicada no banco por `whatsapp_call_id` (neste incidente específico).**  
   - Consulta de duplicidade em `whatsapp_calls` (últimos 3 dias) retornou **0 duplicados**.

2. **O problema está no orquestrador concorrente (múltiplas instâncias processando a MESMA chamada).**  
   - Logs do backend de `whatsapp-call-accept` mostram, para a mesma call:
     - `already being processed by another request, skipping` (mais de uma vez)
     - **2x `Sending accept` no mesmo segundo**, com SDPs de tamanhos diferentes (1552 e 1557)
     - **2x `accept response: 200`**
   - Isso prova que **duas execuções paralelas** seguiram para `accept`.

3. **Falha lógica crítica atual:** quando `pre_accept` retorna `skipped`, o frontend **não aborta** e continua para `accept`.  
   - Resultado: mesmo com CAS no `pre_accept`, uma instância perdedora ainda tenta aceitar/bridgar a chamada.

4. **Outra falha de orquestração:** `ontrack` pode iniciar ElevenLabs antes de confirmar posse da chamada (`pre_accept` vencedor).  
   - Isso permite sessão “fantasma”/duplicada em disputa.

## Causa raiz consolidada

- O sistema já tem CAS no `pre_accept`, mas **falta CAS no `accept` + falta validação de `skipped` no frontend + falta gate de início do ElevenLabs**.
- Com isso, quando há competição (outra aba/dispositivo/usuário), a chamada entra em estado de corrida e cai.

---

# Plano de correção (implementação)

## 1) Corrigir handshake no frontend (bloquear instância perdedora)
**Arquivo:** `src/components/AutoAttendantEngine.tsx`

### Mudanças
- Tratar retorno de `whatsapp-call-accept` em `pre_accept`:
  - Se `data.skipped === true` (ou `success !== true`) => **abortar fluxo local imediatamente** (sem enviar `accept`).
- Tratar retorno de `accept`:
  - Só seguir para `bridged` se `accept` retornar sucesso real (não skipped).
- Adicionar guard de sessão de áudio:
  - `canStartElevenLabsRef` (só `true` após `pre_accept` vencedor).
  - `elevenLabsStartedRef` (garantia one-shot por call).
- `ontrack` deve:
  - armazenar stream remota, mas **não iniciar ElevenLabs** até `pre_accept` confirmado.
- Instância perdedora:
  - faz cleanup local + `resetForNext()`  
  - **não** chama `whatsapp-call-terminate` (para não derrubar a instância vencedora).

## 2) Tornar `accept` idempotente no backend (CAS real)
**Arquivo:** `supabase/functions/whatsapp-call-accept/index.ts`

### Mudanças
- Novo CAS na etapa `accept`:
  - Transição atômica: `pre_accepting -> accepting`
  - Se não conseguiu claim, retornar `{ success: true, step: 'accept', skipped: true }` sem chamar Meta.
- Apenas quem conseguiu CAS no `accept` chama Meta `action: 'accept'`.
- Após sucesso Meta:
  - atualizar para `answered`.
- Em falha Meta:
  - retornar estado consistente (ex.: voltar para `pre_accepting` ou marcar erro controlado), sem deixar fluxo ambíguo.

## 3) Fortalecer idempotência de ingestão de chamada (hardening)
**Arquivos:**
- `supabase/migrations/*` (nova migration)
- `supabase/functions/whatsapp-webhook/index.ts`

### Mudanças
- Adicionar unicidade para `whatsapp_call_id` (quando não nulo) em `whatsapp_calls`.
- No webhook:
  - tratar erro de duplicidade (23505) como evento idempotente (log + ignore), evitando segunda criação da mesma call em cenários de retry.

## 4) Melhorar observabilidade para fechar diagnóstico de concorrência
**Arquivos:**
- `src/components/AutoAttendantEngine.tsx`
- `supabase/functions/whatsapp-call-accept/index.ts`
- `supabase/functions/whatsapp-call-terminate/index.ts`

### Mudanças
- Incluir nos logs:
  - `call.id` (interno)
  - `whatsapp_call_id`
  - `step` (`pre_accept`, `accept`, `terminate`)
  - resultado (`claimed`, `skipped`, `error`)
- Isso permite confirmar rapidamente se houve corrida entre instâncias.

---

# Fluxo alvo após correção

```text
Meta connect webhook
  -> whatsapp_calls (ringing)

Engine A e Engine B recebem evento
  -> ambos montam WebRTC, mas:
     - só inicia ElevenLabs depois de pre_accept confirmado

pre_accept:
  A: claim OK (ringing -> pre_accepting)
  B: skipped

B aborta localmente (não envia accept, não termina call)

accept:
  A: claim OK (pre_accepting -> accepting) -> Meta accept -> answered
  B: se tentar, CAS falha -> skipped

Somente 1 agente permanece ativo
```

---

# Plano de validação (E2E obrigatório)

1. **Teste principal (fim a fim):** receber 1 ligação WhatsApp com duas sessões abertas (ex.: duas abas) e confirmar:
   - apenas 1 `accept` efetivo
   - apenas 1 sessão ElevenLabs conectada
   - chamada não cai por concorrência
2. **Teste de corrida:** disparar chamadas consecutivas e validar ausência de `accept` duplicado.
3. **Teste de retry webhook:** reenviar evento `connect` igual e confirmar que não cria nova linha.
4. **Teste de encerramento:** instância perdedora não derruba chamada da vencedora.
5. **Teste de regressão:** inbound normal continua conectando e encerrando corretamente.

---

# Detalhes técnicos (seu time dev)

- O CAS atual em `pre_accept` isolado é insuficiente porque:
  - frontend não interpreta `skipped`;
  - `accept` ainda é executado por concorrentes;
  - `ontrack` pode disparar AI antes da posse.
- A combinação necessária para resolver de vez:
  1) CAS + interpretação correta no frontend  
  2) CAS também no `accept`  
  3) gate de start do ElevenLabs pós-claim  
  4) idempotência de ingestão no webhook  
- Isso elimina o cenário “duas agentes atendendo” e a queda por corrida.
