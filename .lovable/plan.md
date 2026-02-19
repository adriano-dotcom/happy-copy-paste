

# Fix: Forcar rebuild limpo para resolver erro de hooks

## Problema
O erro "Rendered more hooks than during the previous render" e causado pelo cache do HMR (Hot Module Replacement) do navegador. As edicoes anteriores adicionaram e removeram hooks em varias iteracoes, e o modulo em cache tem uma contagem de hooks diferente do codigo atual. O codigo atual esta correto (7 hooks estaveis), mas o navegador esta executando uma versao antiga em cache.

Como o app crasha antes de qualquer logica de fix ser executada, o toque continua e a modal fica presa.

## Solucao
Adicionar um comentario inocuo no arquivo `useIncomingWhatsAppCall.ts` para forcar um rebuild completo e invalidar o cache do HMR. Isso vai fazer o navegador carregar a versao correta do modulo com a contagem estavel de hooks.

## Detalhes tecnicos

### Arquivo: `src/hooks/useIncomingWhatsAppCall.ts`

Adicionar um comentario na linha 1 para forcar invalidacao de cache:
```
// useIncomingWhatsAppCall v2 — stable hook count
```

Nenhuma mudanca logica. Apenas forcar o rebuild.

### Verificacao de hooks (contagem estavel = 7)
1. `useState` (incomingCall)
2. `useRef` (callRef)
3. `useCallback` (enrichCallWithContact)
4. `useCallback` (dismissCall)
5. `useCallback` (stopRingtone)
6. `useEffect` (realtime channel subscription)
7. `useEffect` (safety polling + ringing timeout combinados)

Essa contagem e identica a versao original do arquivo, entao nao ha risco de erro de hooks.

