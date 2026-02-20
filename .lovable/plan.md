

# Fix: Auto-Attendant - Chamada Automática, Navegação e Encerramento

## Problemas Identificados

### 1. Modal de chamada aparece para outros operadores
Quando o auto-attendant esta ativo na aba `/auto-attendant`, chamadas inbound ainda disparam o `IncomingCallModal` em todas as outras abas/usuarios. Nao existe comunicacao entre o auto-attendant e o hook `useIncomingWhatsAppCall` para suprimir o modal.

### 2. Navegar para fora de `/auto-attendant` derruba a conexao
O componente `AutoAttendant` e desmontado ao trocar de pagina, mas nao existe cleanup adequado que:
- Encerre a sessao ElevenLabs
- Termine a chamada no Meta (via `whatsapp-call-terminate`)
- Atualize o status no banco

### 3. Agente continua falando apos desligamento
Quando o telefone desliga, o `onconnectionstatechange` detecta `disconnected/failed`, mas:
- O `elevenLabs.endSession()` e chamado, porem o estado do hook nao reseta o attendant
- A funcao `resetForNext()` existe no hook mas **nunca e exposta nem chamada**
- `processingRef.current` fica `true` para sempre, travando a fila

---

## Plano de Implementacao

### Etapa 1: Suprimir modal quando auto-attendant esta ativo

Usar a coluna `status` da chamada no banco para sinalizar que o auto-attendant ja aceitou a chamada. Quando o auto-attendant faz o `pre_accept`, o status muda de `ringing` para algo diferente, e o `useIncomingWhatsAppCall` ja ignora. O problema e que entre o INSERT (ringing) e o pre_accept, o modal aparece por alguns segundos.

**Solucao**: Usar um flag no banco (`nina_settings.auto_attendant_active = true`) que o hook `useIncomingWhatsAppCall` consulta para suprimir o modal quando o auto-attendant esta ligado.

- No `useWhatsAppAutoAttendant.activate()`: setar `nina_settings.auto_attendant_active = true`
- No `useWhatsAppAutoAttendant.deactivate()`: setar `false`
- No `useIncomingWhatsAppCall`: antes de mostrar modal, checar esse flag; se true, ignorar

### Etapa 2: Expor `resetForNext` e corrigir ciclo de vida

No hook `useWhatsAppAutoAttendant`:
- Expor `resetForNext` e `setState` no retorno do hook
- A pagina `AutoAttendant` chama `resetForNext()` quando a chamada termina (seja por cleanup, desconexao, ou fim do ElevenLabs)

### Etapa 3: Cleanup robusto na navegacao

No componente `AutoAttendant`:
- Adicionar `useEffect` de unmount que chama:
  1. `elevenLabs.endSession()`
  2. `supabase.functions.invoke('whatsapp-call-terminate', { body: { call_id } })` 
  3. `cleanup()` (fecha WebRTC e Audio Bridge)
  4. `attendant.deactivate()`
- Adicionar listener `beforeunload` para capturar fechamento/refresh da aba
- Usar `useRef` para guardar o `currentCall.id` atual (evita stale closure)

### Etapa 4: Encerramento bidirecional confiavel

Quando o telefone desliga (Meta WebRTC `disconnected/failed`):
1. Chamar `elevenLabs.endSession()` (ja faz)
2. Chamar `whatsapp-call-terminate` para atualizar o banco (FALTA)
3. Chamar `attendant.resetForNext()` para liberar a fila (FALTA)

Quando o ElevenLabs encerra (agente termina conversa):
1. Detectar via `onDisconnect` do `useConversation`
2. Chamar `whatsapp-call-terminate` para desligar o Meta
3. Fechar WebRTC e Audio Bridge
4. Chamar `attendant.resetForNext()`

### Etapa 5: Registrar na timeline do contato

Ao final da chamada (em qualquer cenario), garantir que o `whatsapp-call-terminate` atualiza `ended_at` e `duration_seconds` corretamente (ja faz) para aparecer na timeline.

---

## Detalhes Tecnicos

### Arquivos modificados:

1. **`src/hooks/useWhatsAppAutoAttendant.ts`**
   - Expor `resetForNext` e `setState` no retorno
   - Adicionar `activate`/`deactivate` que seta flag no banco (`nina_settings`)

2. **`src/hooks/useIncomingWhatsAppCall.ts`**
   - Checar `nina_settings.auto_attendant_active` antes de mostrar modal
   - Se `true`, logar e ignorar chamada inbound

3. **`src/pages/AutoAttendant.tsx`**
   - Usar ref para `currentCall.id` (evitar stale closure)
   - Adicionar `useEffect` de unmount com cleanup completo
   - Adicionar `beforeunload` listener
   - No `onconnectionstatechange`: chamar terminate + resetForNext
   - Monitorar `elevenLabs.status` para detectar `ended` e encerrar Meta
   - Adicionar `useEffect` que observa `elevenLabs.status === 'ended'` para fechar o ciclo

4. **Migracao SQL**
   - Adicionar coluna `auto_attendant_active boolean default false` em `nina_settings`

