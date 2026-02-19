

# Fix: Modal presa no estado "ringing" apos chamada ser atendida

## Problema
O polling de seguranca so ativa quando `call.status === 'answered'`. Mas se a chamada for atendida no telefone (ou o evento Realtime for perdido), o status no frontend nunca muda de `ringing` para `answered`, e o polling nunca inicia. A modal fica presa indefinidamente mostrando "Chamada WhatsApp recebida...".

## Solucao
Expandir o polling para cobrir **todos os estados nao-terminais** (incluindo `ringing`), nao apenas `answered`. O polling vai verificar o status real no banco a cada 3 segundos e:
- Se o status no banco for terminal (`ended`, `rejected`, `missed`, `failed`), fechar a modal
- Se o status no banco for `answered` mas o frontend ainda mostrar `ringing`, tambem e um sinal de que o Realtime falhou — neste caso, fechar a modal (ja que a chamada foi atendida em outro lugar)

## Detalhes tecnicos

### Arquivo: `src/components/IncomingCallModal.tsx`

**Mudanca no useEffect de polling (linhas 174-202):**
- Remover a restricao `call?.status !== 'answered'`
- Ativar o polling sempre que existir um `call` com `id` valido
- Adicionar verificacao: se o status no banco for `answered` mas o frontend ainda estiver em `ringing`, fechar a modal (chamada atendida em outro dispositivo)
- Manter a verificacao existente para status terminais

**Logica atualizada:**
```
Se status_banco in [ended, rejected, missed, failed] -> fechar modal
Se status_banco == 'answered' E status_frontend == 'ringing' -> fechar modal (atendida em outro lugar)
```

### Arquivo: `src/hooks/useIncomingWhatsAppCall.ts`

**Adicionar polling de seguranca tambem no hook:**
- Quando existir um `incomingCall` com status `ringing`, iniciar polling a cada 5 segundos
- Se o status no banco nao for mais `ringing`, atualizar ou dismissar conforme o caso
- Isso garante que mesmo sem o modal, o hook limpa chamadas orfas

