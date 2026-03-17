

# Painel Outbound — Métricas por Vendedor na Prospecção

## Problema
Quando um vendedor como Alessandro Francisco atende uma conversa aberta por prospecção (origin=prospeccao), não há visibilidade das métricas de outbound por vendedor: quantos templates foram enviados, quantos responderam e quantos foram enviados ao Pipedrive.

## Solução
Criar uma nova seção no **ProspectingDashboard** (rota `/prospecting`) com um painel "Outbound por Vendedor" que mostra, para cada vendedor atribuído (`assigned_user_id`/`assigned_user_name` da conversa):

1. **Templates Enviados** — mensagens com `metadata.is_prospecting` ou `metadata.template_name` nas conversas atribuídas ao vendedor
2. **Respostas Recebidas** — conversas de prospecção desse vendedor que tiveram resposta do cliente (`from_type = 'user'`)  
3. **Enviados ao Pipedrive** — deals dessas conversas com `pipedrive_deal_id` preenchido

## Lógica de Dados

```text
conversations (metadata->origin = 'prospeccao')
  ├── assigned_user_id → identifica o vendedor
  ├── messages (from_type='nina', metadata.is_prospecting) → templates enviados
  ├── messages (from_type='user') → respostas  
  └── deals (via contact_id) com pipedrive_deal_id → enviados ao Pipedrive
```

## Implementação

### 1. Atualizar `src/components/ProspectingDashboard.tsx`
- Adicionar interface `OutboundSellerStats` com campos: `sellerName`, `sellerId`, `templatesSent`, `responsesReceived`, `responseRate`, `sentToPipedrive`
- Adicionar state `outboundBySellerStats`
- Na função `fetchData`, buscar conversas com `metadata->origin = prospeccao` incluindo `assigned_user_id` e `assigned_user_name`
- Cruzar com mensagens de template (enviadas) e respostas (recebidas) por vendedor
- Cruzar com deals que têm `pipedrive_deal_id` por `contact_id` dessas conversas
- Renderizar nova aba ou seção com tabela mostrando cada vendedor e suas métricas

### 2. Nova seção no layout
- Adicionar uma nova tab "Outbound por Vendedor" no `Tabs` existente
- Tabela com colunas: Vendedor | Enviados | Respostas | Taxa | Pipedrive
- Cards de resumo no topo com totais

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `src/components/ProspectingDashboard.tsx` | Adicionar fetch de métricas outbound por vendedor + nova tab com tabela |

