

# Fix: Enviar accept imediatamente apos pre_accept (sem delay)

## Problema identificado

O audio remoto aparece por ~300ms e depois encerra porque o `accept` demora demais para chegar na Meta. A timeline mostra:

- pre_accept enviado -> 2.6s de rede -> resposta
- +500ms delay desnecessario
- accept enviado -> 7s de rede -> resposta
- Total: ~11.5s -- Meta ja desistiu

O track de audio remoto encerra em 21:28:05.501, mas o accept so e enviado em 21:28:06.003.

## Solucao

Remover o delay de 500ms e enviar o `accept` **imediatamente** apos o `pre_accept` retornar com sucesso. O pre_accept ja leva ~2.6s de rede, entao a Meta ja teve tempo de processar.

## Detalhes tecnicos

### Arquivo: `src/components/IncomingCallModal.tsx`

Remover as 3 linhas do delay de 500ms (aproximadamente linhas 452-454):

```typescript
// REMOVER estas linhas:
console.log(`[WebRTC][${ts()}] Waiting 500ms for Meta to process pre_accept...`);
await new Promise(r => setTimeout(r, 500));
```

Manter o log e o envio do accept logo em seguida, sem nenhum delay. O fluxo ficara:

```
pre_accept enviado -> aguarda resposta -> accept enviado imediatamente
```

Isso reduz o tempo total em ~500ms, fazendo o accept chegar antes da Meta encerrar o track de audio.

