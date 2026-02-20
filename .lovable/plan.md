
# Auto-Attendant sem precisar da pagina /auto-attendant aberta

## Contexto Tecnico

O Audio Bridge atual precisa de um navegador porque usa WebRTC para conectar a chamada WhatsApp (Meta) com o agente ElevenLabs (Iris). Isso e uma limitacao do protocolo — nao e possivel fazer server-side puro.

## Solucao

Mover toda a logica do Auto-Attendant (WebRTC + AudioBridge + ElevenLabs) para dentro do layout principal do app. Assim, quando o usuario ativa o auto-attendant (de qualquer pagina), o bridge roda em background independente da rota.

O usuario pode estar no `/chat`, `/kanban`, `/settings` — nao importa. O bridge funciona silenciosamente em segundo plano.

### O que muda para o usuario
- Ativar/desativar o Auto-Attendant direto pela Sidebar ou por qualquer pagina
- Nao precisa mais abrir `/auto-attendant`
- Um pequeno indicador na Sidebar mostra que esta ativo
- As chamadas sao atendidas automaticamente pela Iris enquanto qualquer aba do sistema estiver aberta

### Etapa 1: Criar componente `AutoAttendantEngine`

Extrair toda a logica de processamento de chamadas do `AutoAttendant.tsx` (WebRTC, AudioBridge, ElevenLabs, terminacao) para um componente invisivel `AutoAttendantEngine.tsx` que:
- Nao renderiza nada visivel (apenas logica)
- Usa os mesmos hooks: `useWhatsAppAutoAttendant` + `useElevenLabsBridge`
- Gerencia todo o ciclo: detectar chamada -> WebRTC -> AudioBridge -> ElevenLabs -> terminacao
- Faz o AudioContext unlock automaticamente na primeira interacao do usuario com a pagina

### Etapa 2: Montar o Engine no AppLayout

No `App.tsx`, dentro do `AppLayout`, renderizar `AutoAttendantEngine` condicionalmente quando `auto_attendant_active === true` no banco. Usar um hook simples para checar esse flag via Realtime.

### Etapa 3: Toggle na Sidebar

Adicionar um botao de toggle na Sidebar para ativar/desativar o Auto-Attendant. Quando clicado:
- Seta `auto_attendant_active = true/false` no banco
- Mostra indicador visual (icone pulsando) quando ativo

### Etapa 4: Manter /auto-attendant como painel de monitoramento (opcional)

A pagina `/auto-attendant` continua existindo, mas apenas como dashboard de monitoramento (logs, niveis de audio, status). A logica real roda no Engine.

## Detalhes Tecnicos

### Arquivos novos:
1. **`src/components/AutoAttendantEngine.tsx`** — Componente headless com toda logica extraida do `AutoAttendant.tsx` (WebRTC, SDP exchange, AudioBridge, ElevenLabs session, terminacao, beforeunload)
2. **`src/hooks/useAutoAttendantFlag.ts`** — Hook que monitora `nina_settings.auto_attendant_active` via Realtime e expoe toggle

### Arquivos modificados:
3. **`src/App.tsx`** — Importar e renderizar `AutoAttendantEngine` dentro do `AppLayout` quando flag ativo
4. **`src/components/Sidebar.tsx`** — Adicionar botao toggle do Auto-Attendant com indicador visual
5. **`src/pages/AutoAttendant.tsx`** — Simplificar para apenas monitoramento (logs/UI), sem logica de processamento

### Fluxo:

```text
  Usuario clica toggle na Sidebar
         |
         v
  nina_settings.auto_attendant_active = true
         |
         v
  AutoAttendantEngine monta no AppLayout
         |
         v
  Escuta chamadas via Realtime (whatsapp_calls INSERT)
         |
         v
  Chamada inbound detectada
         |
         v
  WebRTC + SDP exchange + AudioBridge + ElevenLabs
         |
         v
  Iris atende automaticamente (em background)
         |
         v
  Banner discreto mostra "Iris atendendo..." (ja implementado)
```

### Restricao mantida:
- O usuario ainda precisa ter pelo menos uma aba do sistema aberta (qualquer pagina)
- Isso e necessario porque o WebRTC precisa de um navegador para funcionar
- Mas NAO precisa mais ser a pagina `/auto-attendant` especificamente
