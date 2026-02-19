
# Fix: ICE nunca conecta - precisa enviar accept sem esperar ICE

## Investigacao concluida

**A chamada NAO esta sendo enviada ao ElevenLabs.** Sao sistemas separados:
- WhatsApp Calls: Meta Cloud API + WebRTC (navegador)
- ElevenLabs (Iris): Twilio + chamada telefonica

## Problema real identificado

Os logs mostram que o ICE **nunca** atinge estado `connected` antes do timeout de 10s:
- `pre_accept` enviado: 20:59:52
- `accept` enviado: 21:00:03 (11s depois = timeout)

O ICE nao conecta por dois motivos possiveis:
1. O protocolo da Meta **nao funciona como WebRTC padrao** -- o ICE so se completa apos o `accept`, nao antes
2. A rede pode ter NAT simetrico (apenas STUN, sem TURN)

Na pratica, estamos de volta ao **mesmo deadlock** de antes: esperamos o ICE conectar para enviar `accept`, mas o ICE precisa do `accept` para conectar.

## Solucao

Voltar a enviar `accept` **imediatamente** apos `pre_accept` (sem esperar ICE), mas com um pequeno delay fixo de 500ms para dar tempo a Meta processar o `pre_accept`.

### Arquivo: `src/components/IncomingCallModal.tsx`

Substituir o bloco de espera por ICE (linhas 452-478) por:

```typescript
// 7. Small delay for Meta to process pre_accept, then send accept
console.log(`[WebRTC][${ts()}] Waiting 500ms for Meta to process pre_accept...`);
await new Promise(r => setTimeout(r, 500));
```

Manter o resto do codigo identico (envio do accept na sequencia).

Isso:
- Da 500ms para a Meta processar o SDP do `pre_accept`
- Envia o `accept` logo em seguida, sem esperar ICE
- Permite que o ICE se complete naturalmente apos ambos os sinais
- Elimina o timeout de 10s que esta atrasando tudo
