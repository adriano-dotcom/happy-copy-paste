

# Plano: Campanha agendada visivel na agenda + prevencao de duplicidade

## Problema
1. Quando uma campanha e agendada via ScheduleCampaignModal, nao aparece na view de Agendamentos (Scheduling) — a equipe nao tem visibilidade do disparo.
2. Nao ha verificacao se um contato ja esta em outra campanha ativa/agendada antes de ser incluido em uma nova.

## Solucao

### 1. Criar appointment automaticamente ao agendar campanha

No `ScheduleCampaignModal.handleSubmit`, apos criar a campanha com sucesso, inserir um registro na tabela `appointments` com:
- `title`: nome da campanha (ex: "Campanha: Prospeccao 16/03 11:00 - 50 contatos")
- `date`: data do agendamento
- `time`: horario do agendamento
- `type`: "campaign" (novo tipo)
- `description`: template usado + quantidade de contatos
- `duration`: tempo estimado baseado no intervalo medio x quantidade

Tambem adicionar o tipo "campaign" ao `getEventTypeColor` no Scheduling.tsx com uma cor distinta (ex: amarelo/amber).

### 2. Prevencao de duplicidade no ScheduleCampaignModal

Antes de criar a campanha, consultar `campaign_contacts` para verificar quais dos `contactIds` selecionados ja estao em campanhas com status `pending`, `queued`, `scheduled` ou `running`. Mostrar alerta ao usuario com a contagem de duplicados e opcao de:
- Prosseguir sem os duplicados (remover da lista)
- Prosseguir mesmo assim (incluir todos)

### 3. Prevencao de duplicidade no process-campaign (backend)

No Edge Function `process-campaign`, antes de enviar para cada contato, verificar se o mesmo `phone_number` ja recebeu o mesmo `template` nas ultimas 24h (via tabela `messages` ou `campaign_contacts`). Se sim, marcar como `skipped`.

## Arquivos a alterar

| Arquivo | Mudanca |
|---------|---------|
| `src/components/ScheduleCampaignModal.tsx` | Criar appointment + verificar duplicados |
| `src/components/Scheduling.tsx` | Adicionar cor para tipo "campaign" |
| `supabase/functions/process-campaign/index.ts` | Skip de contatos duplicados no envio |

## Migracao SQL
Nenhuma necessaria — a tabela `appointments` ja aceita `type` como text, e a logica de duplicidade usa tabelas existentes.

