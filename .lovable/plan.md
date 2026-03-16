

# Melhorar Dashboard + Role de Gerente + Métricas Pipedrive

## Diagnóstico

### Acesso atual
- O Dashboard (`/dashboard`) **já é acessível** a todos os usuários autenticados (sem `AdminRoute`).
- Porém, as demais páginas gerenciais (Campanhas, Prospecção, Ligações IA, Equipe, Configurações) são restritas a `admin` via `AdminRoute`.
- O enum `app_role` tem apenas: `admin`, `operator`, `viewer`. **Não existe role "gerente"**.

### Métricas existentes no Dashboard
1. KPIs: Atendimentos, Conversões, Tempo Médio, Novos Leads
2. Custo de Templates Meta
3. Evolução de Leads por Pipeline
4. Leads por Agente IA
5. Distribuição pela IA (deals por vendedor)
6. Atendimentos por Vendedor (distribuídos vs atendidos)
7. Ligações dos Vendedores (call_logs)
8. Métricas do Sistema (comunicação, operações, infraestrutura, integrações)

### Métricas faltantes identificadas
- **Leads enviados ao Pipedrive por agente** -- campo `pipedrive_deal_id` nos deals indica sync. Pode cruzar com `current_agent_id` da conversa ou `owner_id` do deal.
- **Taxa de conversão por pipeline** (deals won vs total) -- não existe.
- **Mensagens humanas vs IA no período** -- existem no sistema mas não filtrados por período nos KPIs.

## Plano

### 1. Adicionar role "gerente" ao banco (migração SQL)
```sql
ALTER TYPE public.app_role ADD VALUE 'gerente';
```
- Atualizar a função `has_role` para que `gerente` funcione como role intermediária.

### 2. Atualizar `useUserRole` hook
- Adicionar `isManager: role === 'gerente'` ao retorno.
- Tipo: `'admin' | 'operator' | 'viewer' | 'gerente'`.

### 3. Criar `ManagerRoute` (ou atualizar `AdminRoute`)
- Alterar `AdminRoute` para aceitar `admin` **ou** `gerente`.
- Isso libera automaticamente: Dashboard, Campanhas, Prospecção, Ligações IA, etc. para gerentes.
- Manter Equipe, Funções e Configurações como **admin-only** (criar check separado).

### 4. Atualizar Sidebar
- Mudar a lógica de filtro: itens `adminOnly` visíveis para `isAdmin || isManager`.
- Itens sensíveis (team, functions, settings) ficam com flag `superAdminOnly`.

### 5. Adicionar seção "Leads enviados ao Pipedrive" no Dashboard
- Nova query: buscar deals com `pipedrive_deal_id IS NOT NULL`, cruzando com `conversations.current_agent_id` para identificar qual agente atendeu.
- Agrupar por agente e por período.
- Exibir como cards com: nome do agente, total enviados ao Pipedrive, enviados no período.
- Incluir taxa de sync (deals com pipedrive_deal_id / total deals).

### 6. Adicionar taxa de conversão por pipeline
- Contar deals com `won_at IS NOT NULL` vs total por pipeline no período.
- Exibir como mini-cards na seção de Evolução de Leads.

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| Migração SQL | `ALTER TYPE app_role ADD VALUE 'gerente'` |
| `src/hooks/useUserRole.ts` | Adicionar `isManager` |
| `src/components/AdminRoute.tsx` | Aceitar admin ou gerente (exceto rotas sensíveis) |
| `src/components/Sidebar.tsx` | Lógica de menu para gerente |
| `src/components/Dashboard.tsx` | Nova seção Pipedrive + taxa conversão por pipeline |

