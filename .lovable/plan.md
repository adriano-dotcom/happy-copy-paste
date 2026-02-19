

# Fix: Audio mudo nas chamadas WhatsApp - Correcoes WebRTC no frontend

## Problema raiz identificado

Apos investigar o codigo e pesquisar a documentacao da Meta e relatos de desenvolvedores, encontrei **2 problemas criticos** no frontend que explicam o audio mudo mesmo com backend retornando 200:

### 1. SDP Answer com `a=setup:actpass` em vez de `a=setup:active`
A documentacao da Meta e multiplos relatos de desenvolvedores confirmam: o SDP answer enviado para a Meta **precisa** ter `a=setup:active`, mas o navegador gera automaticamente `a=setup:actpass`. Sem essa correcao, a negociacao de midia falha silenciosamente.

### 2. Falta de TURN servers
O codigo atual usa apenas STUN servers (Google). Em redes com NAT restritivo (muito comum em escritorios e redes 4G), STUN nao e suficiente para estabelecer conexao de midia. Sem TURN servers, os ICE candidates nao conseguem atravessar o NAT e o audio nao flui.

---

## Plano de correcao

### Passo 1: Corrigir SDP Answer antes de enviar (`IncomingCallModal.tsx`)

Adicionar funcao que modifica o SDP answer gerado pelo navegador:
- Trocar `a=setup:actpass` por `a=setup:active`
- Aplicar antes de enviar para o backend

### Passo 2: Adicionar TURN servers

Adicionar servidores TURN gratuitos do Metered.ca como fallback, alem dos STUN existentes. Isso garante conectividade em redes restritivas.

### Passo 3: Adicionar logs de debug detalhados

- Log de ICE candidates sendo coletados
- Log do SDP final (modificado) antes de enviar
- Log do estado das tracks de audio remotas
- Log quando audio comeca a tocar

---

## Detalhes tecnicos

### Modificacao do SDP

```text
Antes (gerado pelo navegador):
  a=setup:actpass

Depois (corrigido para Meta):
  a=setup:active
```

Esta e uma exigencia documentada da Meta API para chamadas WhatsApp WebRTC.

### ICE Servers atualizados

```text
Atual:
  - stun:stun.l.google.com:19302
  - stun:stun1.l.google.com:19302

Novo:
  - stun:stun.l.google.com:19302
  - stun:stun1.l.google.com:19302
  - turn:a.relay.metered.ca:80 (TCP fallback)
  - turn:a.relay.metered.ca:443 (TLS fallback)
```

### Debug logs adicionais

- `[WebRTC] ICE candidate:` para cada candidate coletado
- `[WebRTC] Modified SDP answer:` com as primeiras linhas do SDP corrigido
- `[WebRTC] Remote track state:` para verificar se a track remota esta ativa
- `[WebRTC] Audio element playing:` para confirmar que o elemento de audio esta reproduzindo

