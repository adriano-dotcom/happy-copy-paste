

# Fix: Audio mudo nas chamadas WhatsApp - Plano revisado (sem TURN)

## O que muda em relacao ao plano anterior

Removemos a dependencia de servidores TURN (que exigem credenciais). O foco agora e nas correcoes que nao precisam de nenhuma configuracao externa.

## Correcoes a implementar

### 1. Corrigir SDP Answer (CRITICO)

O navegador gera `a=setup:actpass` no SDP answer, mas a Meta exige `a=setup:active`. Vamos adicionar uma funcao que corrige isso antes de enviar.

### 2. Adicionar mais STUN servers (sem credenciais)

Em vez de TURN (que precisa de credenciais), vamos adicionar STUN servers publicos adicionais para melhorar a chance de conectividade:
- Google STUN (ja existente)
- Cloudflare STUN (gratuito, sem credenciais)
- Mozilla STUN (gratuito, sem credenciais)

### 3. Logs de debug detalhados

Adicionar logs para facilitar diagnostico futuro:
- ICE candidates coletados
- SDP modificado
- Estado das tracks de audio remotas
- Confirmacao de audio tocando

## Detalhes tecnicos

### Arquivo: `src/components/IncomingCallModal.tsx`

**Funcao de correcao do SDP:**
- Substituir `a=setup:actpass` por `a=setup:active` no SDP answer
- Aplicar antes de enviar ao backend via edge function

**ICE servers atualizados (todos gratuitos, sem credenciais):**
- `stun:stun.l.google.com:19302`
- `stun:stun1.l.google.com:19302`
- `stun:stun.cloudflare.com:3478`
- `stun:stun.services.mozilla.com:3478`

**Logs adicionais:**
- `[WebRTC] ICE candidate:` tipo e protocolo de cada candidate
- `[WebRTC] Original SDP setup line:` linha original antes da correcao
- `[WebRTC] Modified SDP:` primeiras 5 linhas do SDP corrigido
- `[WebRTC] Remote track:` estado da track de audio remota
- `[WebRTC] Audio playing:` confirmacao de reproducao

