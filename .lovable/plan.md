

# Corrigir Chamada Fantasma — processInbound Continua Após terminateCall

## Diagnóstico dos Logs (chamada 3a509bc9)

Timeline reconstruída:

```text
02:54:00  Chamada entra na fila, processInbound inicia
02:54:07  pre_accept #1 enviado → CAS claim → Meta rejeitou → status revertido para ringing
02:54:08  ontrack dispara → bridge conecta → startElevenLabsSession chamado
02:54:11  Meta connection: connecting
02:54:11  processInbound envia pre_accept #2
02:54:13  Edge function: "already being processed, skipping" (CAS bloqueou)
02:54:14  Meta connection: FAILED → terminateCall('meta_disconnected') executa
02:54:14  ElevenLabs sessão INICIA (callback do ontrack de 02:54:08 resolve agora)
02:54:16  ElevenLabs conecta, agente fala "Tudo bem? Aqui é Iris..."
02:54:18  DB status → ended → terminateCall executa novamente (já foi, ignorado)
02:54:24  processInbound CONTINUA e envia accept (!!!!)
02:54:26  "Inbound call accepted and bridged!" — estado FANTASMA
02:55+    ElevenLabs fica em loop falando sozinha, chamada travada
```

## Causa Raiz

Três bugs no `processInbound`:

1. **Não verifica `terminatingRef` entre steps assíncronos.** Após `terminateCall` limpar tudo, o `processInbound` continua executando e envia `accept`, recria estado `bridged`.

2. **`ontrack` não verifica `terminatingRef`.** O callback `ontrack` dispara ElevenLabs mesmo após a conexão Meta ter falhado.

3. **Após `terminateCall` encerrar a sessão ElevenLabs (que ainda não existia), o ElevenLabs conecta depois e nunca é encerrado.** A sessão ElevenLabs inicia APÓS o cleanup, então `endSession()` no terminateCall não tem efeito.

## Solução

### Arquivo: `src/components/AutoAttendantEngine.tsx`

**Mudança 1 — Guard no `ontrack`:**
Adicionar verificação de `terminatingRef.current` no handler de `ontrack` para não iniciar ElevenLabs se a chamada já está sendo encerrada.

**Mudança 2 — Guards no fluxo assíncrono do `processInbound`:**
Verificar `terminatingRef.current` antes de cada step assíncrono crítico:
- Antes de enviar `pre_accept`
- Antes de enviar `accept`
- Antes de chamar `setState('bridged')`

**Mudança 3 — Segundo `endSession` defensivo:**
Após o `terminateCall` executar, se o ElevenLabs ainda iniciar por causa de um callback pendente, a próxima mudança de `elevenLabs.status` para `'connected'` durante um estado de `terminatingRef.current === true` deve forçar um `endSession()` imediato.

```typescript
// No ontrack:
pc.ontrack = (event) => {
  if (event.track.kind === 'audio' && !cancelled && !terminatingRef.current) {
    // ... bridge + startElevenLabsSession
  }
};

// Antes do pre_accept:
if (cancelled || terminatingRef.current) return;
addLog('Sending pre_accept...');

// Antes do accept:
if (cancelled || terminatingRef.current) return;
addLog('Sending accept...');

// Antes do setState bridged:
if (cancelled || terminatingRef.current) return;
attendant.setState('bridged');
```

**Mudança 4 — Watch ElevenLabs status detecta conexão órfã:**
Se ElevenLabs conecta (`status === 'connected'`) mas `terminatingRef.current` é true ou `currentCallIdRef.current` é null, encerrar imediatamente.

### Resultado Esperado

- Se Meta connection falha, todo o fluxo para imediatamente
- ElevenLabs não inicia se a chamada já está em terminação
- Se ElevenLabs conectar "atrasado" após cleanup, é encerrado automaticamente
- Sem chamadas fantasma que travam o sistema

| Arquivo | Mudança |
|---------|---------|
| `src/components/AutoAttendantEngine.tsx` | Guards de `terminatingRef` em ontrack, pre_accept, accept e watch de status ElevenLabs |

