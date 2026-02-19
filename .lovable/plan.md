
# Fix: Chamada muda - Deadlock na sinalizacao WebRTC

## Problema identificado
O codigo atual cria um **deadlock** na sinalizacao com a Meta:

1. Envia `pre_accept` com SDP answer
2. **Aguarda** o WebRTC atingir estado `connected` (timeout de 15s)
3. So entao envia `accept`

O problema e que a Meta precisa receber **ambos** os sinais (`pre_accept` + `accept`) para completar a conexao WebRTC. O WebRTC nunca atinge `connected` porque a Meta esta esperando o `accept`, e o codigo esta esperando o `connected` para enviar o `accept`. Resultado: timeout de 15s e chamada muda.

## Solucao
Remover a espera por `connected` entre `pre_accept` e `accept`. Enviar ambos os sinais em sequencia imediata. O WebRTC vai se conectar naturalmente apos ambos os sinais serem processados pela Meta.

## Detalhes tecnicos

### Arquivo: `src/components/IncomingCallModal.tsx`

**Remover o bloco de espera por conexao (linhas 452-490)** que aguarda `webrtcConnected` e substitui-lo por envio imediato do `accept` apos `pre_accept`:

```typescript
// Apos pre_accept enviado com sucesso:
// Enviar accept imediatamente (sem esperar connected)
console.log(`Sending accept immediately after pre_accept...`);
```

**Manter** o monitoramento de conexao existente no `onconnectionstatechange` (linhas 318-338) que ja faz cleanup automatico se a conexao falhar apos 2s de grace period.

**Remover** o estado `connectionHint` ja que nao havera mais fase intermediaria de espera visivel.

Isso elimina o deadlock e permite que a Meta complete a conexao WebRTC normalmente apos receber ambos os sinais.
