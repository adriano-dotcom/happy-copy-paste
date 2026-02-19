

# Fix: Chamada WhatsApp ficando muda ao atender

## Problema identificado

Analisando os logs do backend, encontrei **3 problemas** que causam o audio mudo:

### 1. `pre_accept` falhando (erro 400)
Os logs mostram:
```
pre_accept response: 400 - "Missing session parameter"
```
O `pre_accept` precisa incluir o SDP offer na sessao, mas estamos enviando sem ele.

### 2. ICE candidates nao estao sendo coletados
O SDP answer e enviado para a Meta **imediatamente**, antes do navegador terminar de coletar os ICE candidates (enderecos de rede). Sem eles, a conexao de midia nao se estabelece.

### 3. Elemento de audio sendo perdido
O `new Audio()` criado no evento `ontrack` nao e salvo em nenhuma referencia, entao o garbage collector pode destrui-lo, cortando o audio.

---

## Plano de correcao

### Passo 1: Corrigir o frontend (`IncomingCallModal.tsx`)

- Salvar o elemento Audio em um `useRef` para evitar garbage collection
- **Aguardar ICE gathering completo** antes de enviar o SDP answer
- Adicionar logs de debug para rastrear estado da conexao WebRTC

### Passo 2: Corrigir o edge function (`whatsapp-call-accept/index.ts`)

- Incluir o SDP offer no `pre_accept` com os parametros `session.sdp` e `session.sdp_type`
- Tratar erro do pre_accept como fatal (se falhar, nao tentar accept)

---

## Detalhes tecnicos

### Frontend - ICE gathering

```text
Fluxo atual (quebrado):
  getUserMedia -> createPeerConnection -> setRemoteDescription -> createAnswer -> setLocalDescription -> ENVIA IMEDIATAMENTE

Fluxo corrigido:
  getUserMedia -> createPeerConnection -> setRemoteDescription -> createAnswer -> setLocalDescription -> AGUARDA ICE COMPLETE -> ENVIA
```

A espera por ICE gathering sera feita com uma Promise que resolve quando `pc.iceGatheringState === 'complete'`.

### Backend - pre_accept com session

```text
Atual:  { messaging_product, call_id, action: 'pre_accept' }
Novo:   { messaging_product, call_id, action: 'pre_accept', session: { sdp_type: 'offer', sdp: sdp_offer } }
```

### Frontend - Audio ref

O elemento `<audio>` remoto sera armazenado em `remoteAudioRef` para evitar ser coletado pelo garbage collector.

