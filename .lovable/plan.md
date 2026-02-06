

# Corrigir Erros de Build (TypeScript)

## O que esta acontecendo

Esses erros de build sao incompatibilidades de tipo no TypeScript. Quando o sistema busca dados do banco de dados, alguns campos podem vir como `null` (vazio), mas os tipos definidos no codigo esperam valores obrigatorios (`string`, `boolean`, `number`). Isso faz o TypeScript reclamar.

**Em resumo**: o codigo funciona na pratica, mas o compilador do TypeScript bloqueia o build porque os tipos nao batem.

---

## Arquivos que precisam ser corrigidos

| Arquivo | Problema |
|---------|----------|
| `src/components/ChatInterface.tsx` | `pipeline_id` pode ser `null`, `contactCompany` e `name`/`email` sao `null` vs `string` |
| `src/components/EmailComposeModal.tsx` | Interface `EmailTemplate` exige `category: string` mas banco retorna `string | null` |
| `src/components/ImportContactsModal.tsx` | Interface `Campaign` exige `color: string` mas banco retorna `string | null` |
| `src/components/Team.tsx` | Interfaces `Team` e `TeamFunction` nao aceitam `null` em `color` e `is_active` |
| `src/components/TeamConfigModal.tsx` | Mesmo problema do Team.tsx |
| `src/components/campaigns/CampaignManagement.tsx` | Interface `Campaign` com `color: string` vs `string | null` |
| `src/components/campaigns/CreateCampaignModal.tsx` | Interface `PipelineStage` com `pipeline_id: string` vs `string | null` |
| `src/components/chat/ScheduleCallbackModal.tsx` | Interface `TeamMember` com `weight: number` vs `number | null` |
| `src/components/settings/AgentSettings.tsx` | `settings.id` pode ser `undefined` ao chamar `.eq('id', ...)` |
| `src/components/OnboardingWizard.tsx` | Falta declaracao de tipo para `canvas-confetti` |

---

## Estrategia de Correcao

A solucao mais segura e simples: ajustar as interfaces locais para aceitar `null`, adicionando valores padrao (fallback) onde necessario.

---

## Detalhes Tecnicos

### 1. EmailComposeModal.tsx (linha 15)
Mudar `category: string` para `category: string | null` na interface `EmailTemplate`.

### 2. ImportContactsModal.tsx (linhas 49-54)
Mudar `color: string` para `color: string | null` na interface `Campaign`.

### 3. Team.tsx e TeamConfigModal.tsx
Os dados vem de `api.fetchTeams()` e `api.fetchTeamFunctions()` que retornam tipos do Supabase. O tipo `Team` em `src/types.ts` define `color: string` e `is_active: boolean` sem aceitar `null`. Corrigir na interface `Team` para `color: string` mantendo o padrao, mas aplicar `as Team[]` com mapeamento de defaults na API, ou ajustar as interfaces locais.

Solucao: Mapear os dados retornados do banco com valores padrao na `api.ts`:
- `fetchTeams`: mapear `color: item.color || '#3b82f6'` e `is_active: item.is_active ?? true`
- `fetchTeamFunctions`: mapear `is_active: item.is_active ?? true`

### 4. CampaignManagement.tsx (linha 34)
Mudar `color: string` para `color: string | null` na interface `Campaign`, ou adicionar fallback `color: c.color || '#6b7280'`.

### 5. CreateCampaignModal.tsx (linha 47)
Mudar `pipeline_id: string` para `pipeline_id: string | null` na interface `PipelineStage`.

### 6. ScheduleCallbackModal.tsx (linha 37)
Mudar `weight: number` para `weight: number | null` na interface `TeamMember`.

### 7. ChatInterface.tsx
- Linha 764: Adicionar fallback `deal.pipeline_id!` ou verificacao `if (deal.pipeline_id)` antes do `.eq()`
- Linha 1242: Mudar `name: editName.trim() || null` -- o `updateContact` ja aceita `string | null`, entao o problema e na tipagem do parametro. Ajustar para `undefined` ao inves de `null`.
- Linha 3228: `contactCompany` e `string | null` mas prop espera `string | undefined`. Adicionar `contactCompany={activeChat.contactCompany ?? undefined}`.

### 8. AgentSettings.tsx (linha 158)
`settings.id` e `string | undefined`. Adicionar guard: `if (!settings.id) return;` antes do `.eq()`.

### 9. OnboardingWizard.tsx
Criar arquivo `src/types/canvas-confetti.d.ts` com `declare module 'canvas-confetti';`.

---

## Sequencia de Implementacao

1. Criar declaracao de tipo para `canvas-confetti`
2. Corrigir interfaces locais nos componentes (aceitar `null`)
3. Adicionar guards e fallbacks no ChatInterface e AgentSettings
4. Adicionar mapeamento de defaults no `api.ts` para fetchTeams/fetchTeamFunctions

Todas as correcoes sao pequenas e pontuais -- nenhuma muda comportamento funcional, apenas alinha os tipos com o que o banco de dados realmente retorna.

