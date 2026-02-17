
# Integracao ElevenLabs Outbound Call - Agente Iris (Seguro de Carga)

## Visao Geral

Quando um lead entra pelo WhatsApp e e detectado como interessado em seguro de carga (agente Iris), o sistema dispara automaticamente uma ligacao de qualificacao via ElevenLabs Conversational AI + Twilio apos um delay configuravel. Apos a ligacao, um webhook recebe os resultados e atualiza o CRM.

## Arquitetura

```text
Lead WhatsApp --> nina-orchestrator detecta "Iris"
                       |
                       v
              Insere na voice_qualification_queue
              (scheduled_for = now() + 5min)
                       |
                       v
              pg_cron (a cada 2 min) --> trigger-elevenlabs-call
                       |
                       v
              POST ElevenLabs API (outbound-call)
                       |
                       v
              Lead recebe ligacao da Iris
                       |
                       v
              Pos-ligacao: ElevenLabs envia webhook
                       |
                       v
              elevenlabs-post-call-webhook
              (atualiza voice_qualifications + deal)
```

## Etapa 1: Banco de Dados - Nova tabela `voice_qualifications`

Criar tabela dedicada (em vez de poluir contacts/deals com 10+ colunas):

- **id** (uuid, PK)
- **contact_id** (uuid, FK contacts)
- **deal_id** (uuid, FK deals, nullable)
- **agent_id** (uuid, FK agents) - qual agente de voz (Iris)
- **elevenlabs_agent_id** (text) - ID do agente na ElevenLabs
- **elevenlabs_conversation_id** (text, nullable) - retornado pela API
- **call_sid** (text, nullable) - SID do Twilio
- **status** (text, default 'pending') - pending/scheduled/calling/completed/no_answer/busy/failed/not_contacted
- **qualification_result** (text, nullable) - qualificado/nao_qualificado/sem_interesse
- **interest_level** (text, nullable) - alto/medio/baixo
- **call_summary** (text, nullable)
- **full_transcript** (text, nullable)
- **next_step** (text, nullable)
- **best_contact_time** (text, nullable)
- **observations** (text, nullable)
- **attempt_number** (integer, default 1)
- **max_attempts** (integer, default 3)
- **scheduled_for** (timestamptz) - quando disparar
- **called_at** (timestamptz, nullable)
- **completed_at** (timestamptz, nullable)
- **created_at** / **updated_at** (timestamptz)

RLS: Apenas usuarios autenticados podem ver/gerenciar.

## Etapa 2: Secrets necessarios

Solicitar ao usuario 3 secrets:
- **ELEVENLABS_API_KEY** - chave da API ElevenLabs
- **ELEVENLABS_AGENT_ID_IRIS** - ID do agente Iris na ElevenLabs
- **ELEVENLABS_PHONE_NUMBER_ID** - ID do numero de telefone no ElevenLabs/Twilio

## Etapa 3: Edge Function `trigger-elevenlabs-call`

Funcao que:
1. Busca registros pendentes em `voice_qualifications` com `status = 'pending'` e `scheduled_for <= now()`
2. Verifica horario comercial (08:00-20:00 SP, seg-sab). Se fora, reagenda para proximo horario valido
3. Faz POST para `https://api.elevenlabs.io/v1/convai/twilio/outbound-call` com:
   - `agent_id`: do secret
   - `agent_phone_number_id`: do secret
   - `to_number`: telefone do lead com +55
   - `conversation_initiation_client_data.dynamic_variables`: lead_name, lead_id, produto_interesse, horario
4. Atualiza status para 'calling' e salva conversation_id/callSid
5. Em caso de erro, incrementa tentativa ou marca como 'failed'

Configuracao: `verify_jwt = false` (sera chamada via pg_cron)

## Etapa 4: Edge Function `elevenlabs-post-call-webhook`

Funcao que:
1. Recebe POST do webhook da ElevenLabs pos-ligacao
2. Extrai: transcricao, analysis (qualificado, nivel_interesse, resumo, proximo_passo, melhor_horario, observacoes), dynamic_variables (lead_id)
3. Atualiza `voice_qualifications` com resultados
4. Se "sem resposta": agenda retry em 2h (max 3 tentativas)
5. Atualiza o deal stage se qualificado (move para estagio "Qualificado pela IA")
6. Retorna HTTP 200

Configuracao: `verify_jwt = false` (webhook externo)

## Etapa 5: Trigger automatico no nina-orchestrator

Modificar o `nina-orchestrator` para, quando detectar agente Iris em uma nova conversa:
1. Verificar se o contato ja tem voice_qualification pendente/ativa
2. Se nao, inserir registro em `voice_qualifications` com `scheduled_for = now() + 5 min`
3. O pg_cron cuida do disparo

## Etapa 6: pg_cron para processar fila

Criar cron job (a cada 2 minutos) que chama `trigger-elevenlabs-call` via pg_net:
- Busca voice_qualifications pendentes cujo scheduled_for ja passou
- Processa em lote (max 3 por execucao para nao sobrecarregar)

## Etapa 7: Interface no CRM - Secao "Qualificacao por Voz"

No `ContactDetailsDrawer.tsx`, adicionar nova secao apos "Historico de Ligacoes":

- Badge colorido de status (verde=qualificado, amarelo=pendente, vermelho=sem interesse, cinza=nao contactado)
- Nivel de interesse
- Resumo da conversa
- Proximo passo recomendado
- Melhor horario para contato
- Numero de tentativas (ex: "2/3 tentativas")
- Botao colapsavel para transcricao completa
- Botao "Religar" para disparo manual

## Detalhes Tecnicos

### Arquivo: SQL Migration
- Criar tabela `voice_qualifications` com indices em `contact_id`, `status`, `scheduled_for`
- RLS policy para usuarios autenticados

### Arquivo: `supabase/functions/trigger-elevenlabs-call/index.ts`
- Buscar pendentes com `SELECT ... FROM voice_qualifications WHERE status = 'pending' AND scheduled_for <= now() FOR UPDATE SKIP LOCKED LIMIT 3`
- Logica de horario comercial com `Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' })`
- POST para ElevenLabs API
- Tratamento de erro com retry

### Arquivo: `supabase/functions/elevenlabs-post-call-webhook/index.ts`
- Receber payload do webhook
- Extrair dados de qualificacao
- Atualizar voice_qualifications
- Logica de retry (sem resposta -> agendar +2h, max 3)

### Arquivo: `supabase/functions/nina-orchestrator/index.ts`
- Apos deteccao do agente Iris em nova conversa, inserir em voice_qualifications
- Verificar duplicatas (nao criar se ja existe pendente para o mesmo contato)

### Arquivo: `supabase/config.toml`
- Adicionar `[functions.trigger-elevenlabs-call]` com `verify_jwt = false`
- Adicionar `[functions.elevenlabs-post-call-webhook]` com `verify_jwt = false`

### Arquivo: `src/components/ContactDetailsDrawer.tsx`
- Novo componente `VoiceQualificationSection` embutido
- Hook para buscar dados de `voice_qualifications` filtrado por contact_id
- Botao "Religar" chama edge function via `supabase.functions.invoke('trigger-elevenlabs-call', { body: { contact_id, force: true } })`

### Arquivo: `src/hooks/useVoiceQualification.ts`
- Hook com React Query para buscar/cachear dados de qualificacao por voz
- `queryKey: ['voice-qualification', contactId]`
- `staleTime: 30000` (30s)

## Ordem de Implementacao

1. Solicitar secrets (ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID_IRIS, ELEVENLABS_PHONE_NUMBER_ID)
2. Migration: criar tabela voice_qualifications
3. Edge Function: trigger-elevenlabs-call
4. Edge Function: elevenlabs-post-call-webhook
5. Config.toml: registrar as 2 funcoes
6. pg_cron: agendar processamento a cada 2 min
7. nina-orchestrator: adicionar trigger automatico para Iris
8. Frontend: VoiceQualificationSection + hook
