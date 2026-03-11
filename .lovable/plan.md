

# Coletar CNPJ no fluxo de qualificação da Clara (plano empresarial/MEI)

## Problema
Quando o cliente responde na pergunta 1 que é "pra empresa com CNPJ" (ou menciona MEI/CNPJ), a Clara segue direto para "quantas pessoas?" sem coletar o número do CNPJ. Essa informação é essencial para cotação de planos empresariais.

## Solução

Atualizar o `system_prompt` da Clara na tabela `agents` via migration SQL, adicionando uma etapa condicional no fluxo de qualificação:

### Alteração no prompt
No bloco "Fluxo de Qualificação", após a pergunta 1, inserir uma etapa condicional:

```
1. "É pra você/família ou pra empresa com CNPJ?"
   → Se empresarial/MEI/CNPJ: "Pode me passar o CNPJ da empresa?"
2. "Quantas pessoas seriam incluídas?"
3. "Quais as idades?"
...
```

Também adicionar instrução explícita:
```
## Regra: Coleta de CNPJ
- Se o cliente indicar plano EMPRESARIAL, MEI ou mencionar CNPJ, OBRIGATÓRIO coletar o número do CNPJ antes de avançar para a próxima pergunta.
- Perguntar de forma natural: "Pode me passar o CNPJ da empresa?"
- Armazenar como qualification_answer campo "cnpj"
```

### Implementação
- **1 migration SQL** para fazer `UPDATE agents SET system_prompt = ... WHERE slug = 'clara'`
- O prompt existente será preservado integralmente, apenas adicionando a etapa condicional e a regra de coleta de CNPJ.

### Arquivo afetado
- Nenhum arquivo de código -- apenas atualização do campo `system_prompt` na tabela `agents` via SQL.

