

# Plano: Resolver erro de ligacao WhatsApp (audio sem transmissao)

## Status atual

O erro `session['sdp'] is required` ja foi corrigido na versao anterior. Os logs mais recentes confirmam que todas as chamadas passam pelo `pre_accept` com sucesso (200 OK) e o `accept` e pulado intencionalmente.

O problema restante e que o audio nao flui porque o SDP era enviado ao Meta **sem ICE candidates** (o browser enviava antes do ICE gathering completar).

A correcao para aguardar ICE gathering (`iceGatheringState === 'complete'`) ja foi deployada no ultimo commit. **Nenhuma mudanca adicional de codigo e necessaria neste momento.**

## O que foi feito (ja implementado)

1. **Edge function** (`whatsapp-call-accept`): Apenas `pre_accept` e enviado. O `accept` foi removido do flow `both` porque resetava a sessao de midia.
2. **Frontend** (`IncomingCallModal.tsx`): Aguarda ate 3 segundos para o ICE gathering completar antes de capturar o SDP e enviar ao Meta.

## Proximo passo: Teste

Faca uma chamada WhatsApp de teste e observe no console do browser:

1. Deve aparecer `ICE gathering complete` (ou timeout apos 3s)
2. O log `ANSWER (with ICE candidates)` deve conter linhas `a=candidate`
3. `pre_accept response: 200` nos logs da edge function
4. Audio bidirecional deve funcionar

## Se o audio ainda nao funcionar

Ha dois cenarios possiveis e suas solucoes:

### Cenario A: ICE gathering nao completa (timeout 3s)
- **Sintoma**: Log mostra "ICE gathering timeout (3s)" e SDP ainda sem candidates
- **Causa**: STUN/TURN server inacessivel ou bloqueado
- **Solucao**: Adicionar TURN server na configuracao do RTCPeerConnection (atualmente usa apenas STUN do Google)

### Cenario B: ICE candidates presentes mas Meta ainda nao envia audio
- **Sintoma**: SDP tem `a=candidate` lines mas track continua `muted=true`
- **Causa**: Meta pode exigir o sinal `accept` para finalizar o handshake
- **Solucao**: Reintroduzir o `accept` mas com SDP minimo sem media section (evita re-negociacao):
  ```
  v=0
  o=- 0 0 IN IP4 0.0.0.0
  s=-
  t=0 0
  ```

## Secao tecnica

### Nenhuma mudanca de codigo nesta iteracao
Todo o codigo necessario ja foi deployado. O plano e testar e, com base nos resultados, decidir o proximo passo.

### Checklist de validacao durante o teste
- [ ] Console log: `ICE gathering complete` (nao timeout)
- [ ] Console log: `has inline ICE candidates: true`
- [ ] Edge function log: `pre_accept response: 200`
- [ ] Audio: track `unmuted` e permanece unmuted
- [ ] Duracao: chamada permanece conectada por mais de 60s

