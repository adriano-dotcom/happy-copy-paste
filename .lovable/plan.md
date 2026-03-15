

# Plano: Atualizar System Prompt da Iris para v2.0

## Diagnóstico do prompt atual

O prompt atual tem **328 linhas** com problemas significativos:
- **10 blocos de "aprendizado aplicado" duplicados** (linhas 286-328) que repetem variações da mesma instrução
- Regras críticas espalhadas sem hierarquia clara
- Sem abertura diferenciada por fonte do lead
- Sem ordem de prioridade nas perguntas de qualificação
- Sem conceito de handoff parcial
- Sem validação pré-envio consolidada
- Sem tratamento de MDF-e sem CT-e

## O que o v2.0 traz de novo

| Mudança | Impacto |
|---------|---------|
| Abertura por fonte (Meta/Google/formulário) | Conversa mais contextualizada |
| Perguntas P1-P11 em blocos por prioridade | Qualificação mais eficiente |
| Handoff parcial (Bloco 1+2 completos = pode transferir) | Não segura lead desnecessariamente |
| ANTT como argumento consultivo (uso único) | Evita repetição de argumento regulatório |
| MDF-e sem CT-e | Cobre edge case de subcontratados |
| RC1-RC8 numeradas | Hierarquia clara de regras |
| Validação pré-envio em checklist | Reduz erros de formato |
| Remoção de blocos redundantes | Prompt mais limpo e focado |

## Alteração

**Método:** SQL UPDATE no campo `system_prompt` da tabela `agents` onde `slug = 'iris'`

**Estrutura do novo prompt** (baseado no documento v2.0, mantendo FAQ e conteúdo técnico útil do atual):

1. **Identidade** — mantém (curto)
2. **Contexto Operacional** — NOVO: premissa de lead inbound
3. **Regras Críticas RC1-RC8** — consolidadas e numeradas
4. **Abertura por Fonte** — NOVO: 4 variações (Meta/Google/formulário/desconhecida)
5. **Decisão Contratado vs Subcontratado** — reorganizado com MDF-e
6. **Fluxo de Qualificação P1-P11** — reordenado por prioridade com blocos
7. **Contexto Regulatório ANTT** — NOVO: instrução de uso único
8. **Handoff** — NOVO: handoff parcial + template
9. **Situações Especiais** — consolidado (sem CNPJ, RNTRC no CPF, MDF-e, fora de escopo, áudio, pedido de humano)
10. **Validação Pré-Envio** — NOVO: checklist de 7 itens
11. **Produtos** — mantém (RCTR-C, RC-DC, RC-V)
12. **FAQ** — mantém as perguntas úteis, remove duplicatas
13. **Regras numéricas** — mantém (140 = 140 mil)

**Remove completamente:** os 10 blocos de aprendizado duplicados (linhas 286-328)

## Detalhes técnicos
- 1 arquivo afetado: nenhum (é update no banco via migration tool)
- 1 migração SQL: UPDATE na tabela `agents`
- Sem mudança de código no orchestrator
- Deploy: nenhum necessário (prompt é lido do banco em runtime)

