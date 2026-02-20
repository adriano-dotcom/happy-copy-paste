

# Adicionar logs periodicos de stats WebRTC (a cada 5s)

## O que sera feito

Adicionar um `setInterval` de 5 segundos que chama a funcao `logPeerStats` (ja existente nas linhas 53-73) enquanto a chamada estiver ativa. O intervalo sera armazenado em um novo ref e limpo no `cleanup`.

## Mudancas

### 1. Novo ref para o intervalo de stats

Em `src/components/IncomingCallModal.tsx`, apos a linha 120 (`acceptStartRef`), adicionar:

```typescript
const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
```

### 2. Iniciar o intervalo apos o accept completar

Apos a linha 495 (`setLocalStatus('answered')`), adicionar:

```typescript
// Start periodic WebRTC stats logging every 5s
if (peerConnectionRef.current) {
  const pc = peerConnectionRef.current;
  statsIntervalRef.current = setInterval(() => {
    if (pc.connectionState === 'closed') {
      clearInterval(statsIntervalRef.current!);
      statsIntervalRef.current = null;
      return;
    }
    logPeerStats(pc);
  }, 5000);
}
```

### 3. Limpar o intervalo no cleanup

Na funcao `cleanup` (linha 156), adicionar no inicio:

```typescript
if (statsIntervalRef.current) {
  clearInterval(statsIntervalRef.current);
  statsIntervalRef.current = null;
}
```

## Resultado

A cada 5 segundos durante uma chamada ativa, o console mostrara:
- **Active candidate pair**: bytesSent, bytesReceived
- **Inbound audio RTP**: packetsReceived, bytesReceived, packetsLost, jitter
- **Outbound audio RTP**: packetsSent, bytesSent

Isso permite diagnosticar rapidamente se o audio esta fluindo (bytes incrementando) ou parado (bytes estagnados).

## Secao tecnica

### Arquivo modificado
- `src/components/IncomingCallModal.tsx` — 3 insercoes pequenas (ref, setInterval apos accept, cleanup)

### Impacto
- Zero impacto em performance (getStats e leve e 5s e intervalo generoso)
- Automaticamente limpo quando a chamada termina ou o componente desmonta
