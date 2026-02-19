

# Analise Profunda: Audio Mudo nas Chamadas WhatsApp

## Diagnostico

Analisei os logs, o codigo-fonte, a edge function, e a documentacao oficial da Meta (incluindo o tutorial de referencia do webrtc.ventures). Identifiquei **3 problemas criticos** que, combinados, causam o audio mudo.

### Problema 1: Fluxo de sinalizacao fora de ordem

A documentacao oficial da Meta define este fluxo:

```text
1. Enviar pre_accept (com SDP)
2. Aguardar connectionState === 'connected' (DTLS completa)
3. SO ENTAO enviar accept
```

Nosso codigo envia `accept` imediatamente apos `pre_accept`, sem aguardar a conexao WebRTC se estabelecer. O `connectionState` (que inclui DTLS) nunca e verificado -- nos so verificamos `iceConnectionState` no passado, que e uma camada diferente.

Nos logs, vemos `ICE connection state: connected` mas **nunca** vemos `Connection state: connected`. A Meta precisa processar o `pre_accept` para completar o DTLS, e so depois disso o `connectionState` muda para `connected`.

### Problema 2: Duas chamadas de rede separadas (latencia duplicada)

Cada chamada a edge function leva ~2s de rede. Fazendo duas chamadas separadas:
- Browser -> Edge Function (pre_accept) -> Meta -> resposta -> Browser: ~2s
- Browser -> Edge Function (accept) -> Meta -> resposta -> Browser: ~2s
- Total: ~4s+ so de rede

Se combinarmos ambos os sinais em uma unica chamada de edge function:
- Browser -> Edge Function (pre_accept -> accept) -> Browser: ~2-3s total
- Economiza um round-trip completo

### Problema 3: DB update bloqueando o accept

Entre o pre_accept e o accept, o codigo faz um `await` no update do banco:
```text
21:35:21.182 - pre_accept OK
21:35:21.182 - Atualizando DB... (await)
21:35:21.484 - DB atualizado (300ms depois)
21:35:21.484 - Enviando accept...
21:35:21.526 - Track de audio encerrou!
```
Esses 300ms extras contribuem para o accept chegar tarde demais.

### Timeline do problema

```text
Track de audio remoto aparece
  |
  v
pre_accept enviado.......[2s rede]......pre_accept OK
                                          |
                                    DB update [300ms]
                                          |
                                     accept enviado
                                          |
                            [42ms] Track de audio ENCERRA
                                          |
                                   ...[2s rede]...
                                          |
                                     accept OK (tarde demais)
```

## Solucao: 3 mudancas combinadas

### Mudanca 1: Edge function unificada (action = 'both')

Criar uma nova action `both` na edge function `whatsapp-call-accept` que:
1. Envia `pre_accept` para a Meta
2. Aguarda 200ms (tempo para Meta processar)
3. Envia `accept` para a Meta
4. Atualiza o banco
5. Retorna tudo em uma unica resposta

Isso elimina um round-trip completo de rede (~2s).

### Mudanca 2: Frontend usa action='both' em vez de duas chamadas

No `IncomingCallModal.tsx`, substituir as duas chamadas separadas por uma unica:
- Remover a chamada de pre_accept separada
- Remover o DB update intermediario
- Remover a chamada de accept separada
- Fazer uma unica chamada com `action: 'both'`

### Mudanca 3: Accept acionado por connectionState (fallback)

Manter o fluxo unificado como principal, mas adicionar um fallback que monitora `connectionState === 'connected'` para logar quando a conexao realmente se estabelece, para diagnostico futuro.

## Detalhes tecnicos

### Arquivo 1: `supabase/functions/whatsapp-call-accept/index.ts`

Adicionar uma nova action `both` que executa pre_accept e accept sequencialmente no servidor:

```typescript
if (requestedAction === 'both') {
  if (!sdp_answer) {
    return new Response(JSON.stringify({ error: 'sdp_answer required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Step 1: pre_accept
  console.log(`Sending pre_accept for call ${whatsappCallId}`);
  const preAcceptRes = await fetch(metaUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      call_id: whatsappCallId,
      action: 'pre_accept',
      session: { sdp_type: 'answer', sdp: sdp_answer },
    }),
  });

  const preAcceptBody = await preAcceptRes.text();
  console.log(`pre_accept response: ${preAcceptRes.status} ${preAcceptBody}`);

  if (!preAcceptRes.ok) {
    return new Response(JSON.stringify({ error: 'pre_accept failed', details: preAcceptBody }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Step 2: Small delay for Meta to process
  await new Promise(r => setTimeout(r, 200));

  // Step 3: accept
  console.log(`Sending accept for call ${whatsappCallId}`);
  const acceptRes = await fetch(metaUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      call_id: whatsappCallId,
      action: 'accept',
      session: { sdp_type: 'answer', sdp: sdp_answer },
    }),
  });

  const acceptBody = await acceptRes.text();
  console.log(`accept response: ${acceptRes.status} ${acceptBody}`);

  if (!acceptRes.ok) {
    return new Response(JSON.stringify({ error: 'accept failed', details: acceptBody }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Step 4: Update DB
  await supabase
    .from('whatsapp_calls')
    .update({ status: 'answered', answered_at: new Date().toISOString() })
    .eq('id', call_id);

  return new Response(JSON.stringify({
    success: true,
    step: 'both',
    pre_accept_status: preAcceptRes.status,
    accept_status: acceptRes.status,
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
```

### Arquivo 2: `src/components/IncomingCallModal.tsx`

Substituir as linhas 430-470 (pre_accept separado + DB update + accept separado) por uma unica chamada:

```typescript
// 6. Send pre_accept + accept in a single edge function call (eliminates one network round-trip)
console.log(`[WebRTC][${ts()}] Sending pre_accept + accept in single call...`);
const { data: acceptData, error: acceptError } = await supabase.functions.invoke('whatsapp-call-accept', {
  body: {
    call_id: call.id,
    sdp_answer: finalSdp,
    action: 'both',
  },
});

if (acceptError) {
  throw new Error(acceptError.message || 'Failed to accept call');
}

console.log(`[WebRTC][${ts()}] pre_accept + accept completed:`, acceptData);

// Update local state
setLocalStatus('answered');
```

Remover:
- O DB update intermediario (agora feito na edge function)
- A chamada separada de pre_accept
- A chamada separada de accept
- Os logs de "Sending accept immediately after pre_accept"

### Beneficio esperado

```text
ANTES (atual):
Browser -[2s]-> Edge(pre_accept) -[2s]-> Browser
  DB update [300ms]
Browser -[2s]-> Edge(accept) -[2s]-> Browser
Total: ~6-7s

DEPOIS:
Browser -[2s]-> Edge(pre_accept -> 200ms -> accept) -[2s]-> Browser
Total: ~4s (DB update nao bloqueia o accept)
```

O `accept` chega na Meta apenas ~200ms apos o `pre_accept`, em vez de ~2.3s. Isso esta dentro da janela de tempo que a Meta espera antes de encerrar o track de audio.

