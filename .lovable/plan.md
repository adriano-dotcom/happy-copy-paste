

# Agendar Campanha de Prospecção direto da aba Contatos

## Contexto
A infraestrutura de campanhas já existe e funciona:
- Tabela `whatsapp_campaigns` com campo `scheduled_at` e status `scheduled`
- Edge Function `process-campaign` roda a cada minuto via cron e auto-inicia campanhas agendadas
- Hook `useCampaigns` com `createCampaign` que aceita `scheduled_at`
- `CreateCampaignModal` existe mas é complexo (inclui seleção de contatos desnecessária aqui)

O que falta é conectar o fluxo: selecionar contatos → escolher template → agendar data/hora → criar campanha.

## Solução

### 1. Criar `ScheduleCampaignModal` (novo componente)
Modal simplificado que recebe os contatos já selecionados e permite:
- Escolher template (dropdown com templates aprovados)
- Preview do template selecionado
- Definir data e hora do disparo (DatePicker + input de hora)
- Intervalo entre mensagens (slider, padrão 60s)
- Nome automático da campanha (ex: "Prospecção 15/03 14:00 - 50 contatos")
- Botão "Agendar Campanha"

Ao confirmar, usa `useCampaigns().createCampaign()` com `scheduled_at` preenchido, criando a campanha com status `scheduled`. O cron existente cuida do resto.

### 2. Adicionar botão "Agendar Campanha" na barra de ações em massa (Contacts.tsx)
Ao lado do botão "Enviar Template" existente, adicionar um botão com ícone de calendário:
- `CalendarDays` icon + "Agendar Campanha"
- Abre o `ScheduleCampaignModal` com os contatos selecionados

### Arquivos editados
- `src/components/ScheduleCampaignModal.tsx` — novo componente
- `src/components/Contacts.tsx` — botão + import do modal

