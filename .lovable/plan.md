
# Fix: Tela de chamada continua tocando após a ligação terminar

## Problema
Após atender e completar a chamada, a modal continua exibida na tela. O banco de dados mostra corretamente o status `ended`, mas o frontend não fecha a modal.

## Causa raiz
O hook `useIncomingWhatsAppCall` depende **exclusivamente** do Supabase Realtime para detectar que a chamada terminou. Se o evento UPDATE do realtime for perdido (reconexão, latência, etc.), a modal fica presa indefinidamente. Não existe nenhum mecanismo de fallback.

## Correções propostas

### 1. Adicionar polling de segurança no IncomingCallModal
Quando a chamada está no estado `answered`, iniciar um polling a cada 3 segundos que consulta o status da chamada diretamente no banco. Se o status for `ended`, `rejected`, `missed` ou `failed`, fechar a modal automaticamente.

### 2. Detectar desconexão WebRTC como sinal de fim
No `IncomingCallModal`, quando o `connectionState` do PeerConnection mudar para `disconnected`, `failed` ou `closed`, fechar a modal automaticamente (após um pequeno delay para evitar falsos positivos em reconexões breves).

### 3. Adicionar log no hook de realtime
Adicionar logs no handler de UPDATE do hook para confirmar se o evento está chegando ou não.

## Detalhes técnicos

### Arquivo: `src/components/IncomingCallModal.tsx`

**Polling de segurança (novo useEffect):**
- Ativo apenas quando `call?.status === 'answered'`
- A cada 3 segundos, consulta `whatsapp_calls` pelo `call.id`
- Se status no banco for terminal (`ended`, `rejected`, `missed`, `failed`), chama `cleanup()` e `onDismiss()`

**Detecção de desconexão WebRTC:**
- No handler `onconnectionstatechange`, adicionar lógica para estados `disconnected`/`failed`/`closed`
- Ao detectar, aguardar 2 segundos e verificar se reconectou; se não, fechar modal

### Arquivo: `src/hooks/useIncomingWhatsAppCall.ts`

**Logs adicionais:**
- Log em cada UPDATE recebido (antes do filtro de ID) para confirmar que eventos chegam
- Log quando o status muda para terminal
