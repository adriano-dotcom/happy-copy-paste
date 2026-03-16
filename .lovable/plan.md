

# Métrica de Leads Enviados ao Pipedrive por Agente

## Situação Atual

A funcionalidade **já está implementada** no Dashboard. Na implementação anterior, foram adicionados:

1. **Interface `PipedriveByAgent`** (linha 122) com campos `agentId`, `agentName`, `total`, `periodCount`
2. **Função `fetchPipedriveMetrics`** (linha 642-709) que:
   - Busca deals com `pipedrive_deal_id` preenchido
   - Cruza `contact_id` do deal com `current_agent_id` da conversa para identificar qual agente atendeu
   - Agrupa por agente com contagem total e do período
3. **Seção visual** (linha 1140+) com cards por agente mostrando total enviados e quantidade no período, com barra de progresso proporcional
4. **Chamada no useEffect** junto com as demais métricas

## Conclusão

**Nenhuma alteração é necessária.** A métrica de leads enviados ao Pipedrive por agente já está no Dashboard e funcional. Se não está aparecendo na tela, pode ser porque ainda não há deals com `pipedrive_deal_id` preenchido no banco — a seção só aparece quando `pipedriveByAgent.length > 0`.

Para testar: envie pelo menos um contato ao Pipedrive pela interface de chat e recarregue o Dashboard.

