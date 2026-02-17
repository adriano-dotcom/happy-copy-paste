
## Ligacao Automatica ElevenLabs: Lead sem interacao em 5 minutos

### Como funciona hoje
- Ligacoes ElevenLabs sao disparadas **manualmente** via botao "Ligar com Iris"
- A funcao `trigger-elevenlabs-call` ja tem logica de horario comercial (08-20h, Seg-Sab) e retentativa em 2h
- O `process-followups` roda a cada hora (cron) e processa automacoes de WhatsApp

### Proposta: Novo fluxo automatico

```text
Lead envia mensagem no WhatsApp
        |
        v
   Nina responde (normal)
        |
        v
   5 min sem interacao do lead
        |
        v
   Cria voice_qualification (status: pending, scheduled_for: agora)
        |
        v
   trigger-elevenlabs-call processa (cron a cada 5 min)
        |
        v
   Nao atendeu? → Reagenda para +2h
        |
        v
   Fora do horario (20h-07h)? → Reagenda para 08:00 prox dia util
```

### Implementacao

**1. Nova Edge Function: `auto-voice-trigger` (~120 linhas)**

Funcao que roda a cada 5 minutos (via cron) e:
- Busca conversas onde a ultima mensagem foi do tipo `nina` (IA respondeu)
- A ultima mensagem tem entre 5 e 15 minutos (janela de ativacao)
- O contato NAO tem voice_qualification pendente/calling/completed recente (ultimas 24h)
- O contato NAO esta bloqueado
- Esta dentro do horario comercial (07:00-20:00 SP, Seg-Sab)
- Cria um registro em `voice_qualifications` com status `pending` e chama `trigger-elevenlabs-call` com force=true

**2. Novo Cron Job**

Agendar `auto-voice-trigger` para rodar a cada 5 minutos:
```sql
SELECT cron.schedule(
  'auto-voice-trigger',
  '*/5 * * * *',
  $$ SELECT net.http_post(...) $$
);
```

**3. Regras de negocio na Edge Function**

- **Horario comercial**: So dispara entre 07:00 e 20:00 (horario de SP), Seg-Sab
- **Anti-duplicacao**: Verifica se ja existe VQ nas ultimas 24h para o contato
- **Janela de 5-15 min**: So processa conversas com ultima mensagem da Nina entre 5 e 15 min atras (evita reprocessar)
- **Retentativa**: Se nao atendeu, a logica existente do `trigger-elevenlabs-call` ja reagenda em +2h
- **Max tentativas**: Usa o padrao existente de 3 tentativas

### Secao tecnica

**Consulta SQL principal da Edge Function:**
```sql
SELECT c.id as conversation_id, c.contact_id, c.last_message_at
FROM conversations c
JOIN contacts ct ON ct.id = c.contact_id
WHERE c.last_message_at < NOW() - INTERVAL '5 minutes'
  AND c.last_message_at > NOW() - INTERVAL '15 minutes'
  AND ct.is_blocked = false
  AND NOT EXISTS (
    SELECT 1 FROM voice_qualifications vq
    WHERE vq.contact_id = c.contact_id
      AND vq.created_at > NOW() - INTERVAL '24 hours'
  )
```

Depois filtra por: ultima mensagem da conversa ser do tipo `nina` (IA respondeu e lead nao interagiu).

**Nenhuma mudanca em tabelas existentes** - usa a infraestrutura de `voice_qualifications` e `trigger-elevenlabs-call` que ja existe.
