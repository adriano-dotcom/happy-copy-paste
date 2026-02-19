

# Fix: Modal presa em "ringing" apos usuario clicar em Atender

## Problema identificado

Ao analisar os logs da edge function e do console do navegador, ficou claro que:

1. O usuario clica em "Atender" (botao verde)
2. `pre_accept` e enviado com sucesso para a Meta (resposta 200)
3. O frontend fica esperando a conexao WebRTC por ate 10 segundos
4. **Durante essa espera, a modal continua mostrando "Chamada WhatsApp recebida..." com animacao de toque** porque o `handleAccept` nao atualiza a UI
5. Se o WebRTC nao conecta (timeout), o `accept` pode nao ser enviado, ou o chamador desliga antes

O `handleAccept` depende de: WebRTC conectar -> chamar accept -> DB atualizar -> Realtime propagar -> hook atualizar status -> modal re-renderizar. Sao 6 etapas que podem falhar em qualquer ponto.

## Solucao

### 1. Atualizacao otimista da UI (IncomingCallModal.tsx)

Adicionar um estado local `localStatus` no componente. Quando o usuario clicar em "Atender":
- Imediatamente setar `localStatus = 'answered'` **antes** de iniciar o fluxo WebRTC
- Usar `localStatus` para determinar qual UI mostrar (em vez de `call.status`)
- Isso garante que o usuario ve imediatamente a tela de "em chamada" com cronometro e botao de desligar

### 2. Atualizar DB para 'answered' mais cedo (IncomingCallModal.tsx)

Mover a atualizacao do status no banco para logo apos o `pre_accept` ter sucesso (em vez de esperar o WebRTC conectar + accept). Isso garante que:
- O polling detecta `answered` no banco
- O Realtime propaga a mudanca
- Outros dispositivos veem que a chamada foi atendida

### 3. Enviar accept mesmo sem WebRTC conectado (IncomingCallModal.tsx)

Se o WebRTC connection timeout de 10s expirar, enviar o `accept` de qualquer forma (ja acontece, mas garantir que nao seja bloqueado por erros). Adicionar tambem um timeout maximo total de 20s para todo o fluxo de handleAccept com limpeza automatica.

### 4. Fallback de timeout para fechar modal (IncomingCallModal.tsx)

Adicionar um timeout absoluto: se a modal estiver visivel por mais de 60 segundos (independente do status), fechar automaticamente. Isso e a ultima rede de seguranca.

## Detalhes tecnicos

### Arquivo: `src/components/IncomingCallModal.tsx`

**Novo estado local:**
```
const [localStatus, setLocalStatus] = useState<string | null>(null);
```

Sincronizar com `call.status` quando ele muda, mas permitir override local quando o usuario clica Accept.

**handleAccept modificado:**
1. Setar `localStatus = 'answered'` imediatamente
2. Apos `pre_accept` com sucesso, atualizar DB via supabase.from('whatsapp_calls').update({ status: 'answered' })
3. Manter o resto do fluxo WebRTC normalmente
4. Se qualquer erro ocorrer, reverter `localStatus` e chamar cleanup/onDismiss

**Logica de renderizacao:**
- `isRinging = (localStatus || call?.status) === 'ringing'`
- `isAnswered = (localStatus || call?.status) === 'answered'`

**Timeout absoluto (novo useEffect):**
- Quando `call` aparece, iniciar timer de 60s
- Ao expirar, fechar modal automaticamente com log de aviso

### Arquivo: `src/hooks/useIncomingWhatsAppCall.ts`

Sem mudancas adicionais — o hook ja tem polling de seguranca para chamadas ringing.

