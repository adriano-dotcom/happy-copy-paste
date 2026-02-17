

## Corrigir ativacao do agente ElevenLabs nas ligacoes outbound

### Problema identificado
O numero Twilio esta configurado no servidor **US** do ElevenLabs (`api.us.elevenlabs.io`), porem o codigo chama o servidor **global** (`api.elevenlabs.io`). Isso faz com que a ligacao complete pelo Twilio, mas o agente de IA nao seja ativado porque os servidores sao diferentes.

### Solucao
Alterar a URL da API no edge function `trigger-elevenlabs-call` de:
```
https://api.elevenlabs.io/v1/convai/twilio/outbound-call
```
Para:
```
https://api.us.elevenlabs.io/v1/convai/twilio/outbound-call
```

### Detalhes tecnicos

**Arquivo a alterar:** `supabase/functions/trigger-elevenlabs-call/index.ts`

**Mudanca:** Linha ~147, trocar a URL do fetch:
- De: `https://api.elevenlabs.io/v1/convai/twilio/outbound-call`
- Para: `https://api.us.elevenlabs.io/v1/convai/twilio/outbound-call`

### Teste apos a mudanca
Disparar uma nova ligacao de teste para confirmar que o agente Iris ativa e fala com o lead.

