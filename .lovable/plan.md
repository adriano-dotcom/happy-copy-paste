
## Mostrar ligacoes da Iris (Voice Qualifications) na timeline do chat

### Objetivo
Trazer as ligacoes feitas pelo agente Iris (ElevenLabs) para dentro da timeline do chat, permitindo que o vendedor veja o resumo, resultado da qualificacao, transcricao e proximos passos diretamente no fluxo de mensagens.

### Mudancas

**1. Criar hook `useContactVoiceQualifications`**
- Arquivo: `src/hooks/useContactVoiceQualifications.ts`
- Busca todas as `voice_qualifications` do contato (nao apenas a mais recente)
- Inclui realtime subscription para atualizar quando uma ligacao terminar

**2. Criar componente `VoiceCallTimelineCard`**
- Arquivo: `src/components/VoiceCallTimelineCard.tsx`
- Card visual similar ao `CallTimelineCard` mas com visual diferenciado (icone de IA/Iris)
- Mostra: status da ligacao, resultado da qualificacao (qualificado/nao qualificado), nivel de interesse (estrelas), resumo, proximo passo, melhor horario de contato
- Botao expansivel para ver a transcricao completa
- Cores e estilo coerentes com o design existente (gradientes, backdrop-blur)

**3. Integrar na timeline do ChatInterface**
- Arquivo: `src/components/ChatInterface.tsx`
- Importar o novo hook e componente
- Adicionar tipo `voice_call` ao `TimelineItem`
- Mesclar os dados de `voice_qualifications` junto com mensagens e call_logs, ordenados por data (`called_at` ou `created_at`)
- Renderizar `VoiceCallTimelineCard` quando `item.type === 'voice_call'`

### Detalhes tecnicos

```text
Timeline (cronologico)
  |
  +-- Mensagem WhatsApp (tipo existente)
  +-- Ligacao Api4Com (tipo existente - CallTimelineCard)
  +-- Ligacao Iris/ElevenLabs (NOVO - VoiceCallTimelineCard)
  |     - Status: Concluida / Sem Resposta / etc
  |     - Resultado: Qualificado / Nao Qualificado
  |     - Interesse: Alto / Medio / Baixo (estrelas)
  |     - Resumo da conversa
  |     - Proximo passo
  |     - Transcricao (expansivel)
  +-- Mensagem WhatsApp
```

O hook buscara todas as voice_qualifications do contato (nao apenas a ultima) para que o historico completo apareca na timeline. A data de ordenacao sera `called_at` (quando disponivel) ou `created_at`.
