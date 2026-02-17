

## Adicionar botao de disparo manual de chamada Iris no painel lateral

### Objetivo
Colocar um botao visivel na lateral (ContactDetailsDrawer) para que o vendedor possa disparar uma ligacao da Iris manualmente a qualquer momento, mesmo quando o lead nao caiu na automacao.

### Mudancas

**1. Adicionar botao "Ligar com Iris" na secao de acoes do ContactDetailsDrawer**
- Arquivo: `src/components/ContactDetailsDrawer.tsx`
- Adicionar um terceiro botao ao lado de "Editar" e "Conversar", ou logo abaixo deles
- Botao com icone de telefone/microfone e texto "Ligar com Iris"
- Ao clicar, invoca `trigger-elevenlabs-call` com `{ contact_id, force: true }`
- Mostra loading enquanto dispara e toast de sucesso/erro
- Invalida a query de voice-qualification para atualizar o status na tela

### Visual
- Botao com gradiente violeta/roxo para diferenciar das acoes existentes (cyan = editar, outline = conversar)
- Icone `Mic` (microfone) para indicar agente de voz
- Estado de loading com spinner enquanto a chamada esta sendo disparada

### Detalhes tecnicos
- Importar `supabase` de `@/integrations/supabase/client`
- Importar `useQueryClient` de `@tanstack/react-query`
- Adicionar estado local `isCallingIris` para controlar loading
- Funcao `handleCallIris` que:
  1. Seta loading
  2. Invoca `supabase.functions.invoke('trigger-elevenlabs-call', { body: { contact_id: contact.id, force: true } })`
  3. Toast de sucesso ou erro
  4. Invalida queries `['voice-qualification', contact.id]` e `['contact-voice-qualifications', contact.id]`
- Botao posicionado na area de acoes (linha ~231), abaixo dos botoes Editar/Conversar

