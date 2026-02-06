

# Atualizar System Prompt do Atlas para v2.0

## Resumo

Substituir o system prompt atual do agente Atlas (armazenado na tabela `agents`) pelo novo prompt v2.0 fornecido no arquivo anexo.

---

## O que muda do v1 para o v2

| Aspecto | v1 (atual) | v2 (novo) |
|---------|-----------|-----------|
| Tamanho | ~300 linhas | ~1295 linhas |
| Estrutura | Regras + fluxos básicos | Arvore de decisão completa com pseudocódigo |
| Regras Críticas | RC0 (Regra Zero) + RC referral | RC1 (tamanho mínimo) + RC2 (detecção contato) + RC3 (proibições) |
| Variáveis de estado | Não definidas | 20+ variáveis estruturadas em JSON |
| Classificação de leads | Básica (quente/morno/frio) | Sistema de pontuação detalhado com score |
| Objeções | 3-4 cenários | 8+ cenários com scripts específicos |
| Coleta de dados | Genérica | Separada: frota (quantidade+tipo) e carga (mercadoria+rotas) |
| Handoff | Critérios simples | Função de verificação com critérios mínimos obrigatórios |
| Exemplos | Poucos | 5 diálogos completos de ponta a ponta |
| Follow-up | Não definido | Sistema com 24h + 48h |
| Validação pré-envio | Não existia | Checklist automatizado antes de cada mensagem |
| Contexto do template | Mencionado | Detalhado com o texto exato do template |

---

## Mudança Necessária

Atualizar o campo `system_prompt` na tabela `agents` para o agente Atlas (ID: `9a9aa2b3-6fce-4a02-b402-26850d6f0f20`).

Esta é uma operação de banco de dados apenas -- nenhum arquivo de código precisa ser alterado.

---

## Detalhes Técnicos

- **Tabela**: `agents`
- **ID do registro**: `9a9aa2b3-6fce-4a02-b402-26850d6f0f20`
- **Slug**: `atlas`
- **Campo atualizado**: `system_prompt`
- **Conteúdo**: O texto completo do arquivo `atlas_system_prompt_v2.md` (1295 linhas)
- **Impacto**: Imediato -- a próxima mensagem processada pelo nina-orchestrator usará o novo prompt

---

## Riscos e Considerações

1. **Tamanho do prompt**: O novo prompt é ~4x maior que o atual, o que pode impactar tokens usados por chamada de IA (custo maior por interação)
2. **Retrocompatibilidade**: As funcionalidades existentes no código (detecção de referral, handoff de veículos no nina-orchestrator) continuam compatíveis com o novo prompt
3. **Rollback**: Se necessário, o prompt anterior pode ser restaurado a partir do banco de dados

---

## Erros de build existentes

Existem erros de TypeScript pré-existentes no projeto (incompatibilidades `string | null` vs `string` em vários componentes). Esses erros **não são relacionados** a esta tarefa e podem ser corrigidos separadamente se desejado.

