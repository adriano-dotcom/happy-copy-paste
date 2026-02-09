

# Revisao do Prompt do Atlas - Foco em Seguros Atuais

## Problema Atual

O fluxo atual do Atlas segue esta sequencia apos confirmar o responsavel:

1. Pergunta sobre tipo de operacao (transporte proprio vs frete)
2. Depois pergunta se tem seguro de frota
3. Depois pergunta se tem seguro de carga
4. Coleta detalhes (seguradora, vencimento, satisfacao)

Isso resulta em muitas perguntas antes de chegar ao ponto principal: os seguros. O lead pode perder interesse.

## Nova Abordagem

Ser mais direto e **perguntar sobre os seguros atuais da empresa logo apos a confirmacao do responsavel**, antes de entrar em detalhes operacionais.

### Novo Fluxo de Conversa

```text
1. Confirma responsavel
2. Apresenta Jacometo (breve)
3. PERGUNTA DIRETA: "Voces tem seguro dos veiculos e da carga hoje? Com qual seguradora?"
4. Baseado na resposta, aprofunda (vencimento, satisfacao, tipo)
5. Coleta dados operacionais apenas se necessario para cotacao
6. Handoff
```

### Versus Fluxo Atual

```text
1. Confirma responsavel
2. Apresenta Jacometo (breve)
3. Pergunta tipo de operacao (proprio/frete/ambos)
4. Pergunta se tem seguro de frota
5. Pergunta seguradora, tipo, satisfacao, vencimento
6. Pergunta se tem seguro de carga
7. Coleta dados de carga
8. Handoff
```

## Mudancas no System Prompt

### 1. Reestruturar o fluxo principal (secao ARVORE DE DECISAO)

Apos confirmar responsavel, ao inves de perguntar "tipo de operacao", ir direto para:

> "Para entender melhor a situacao de voces: a empresa tem seguro dos veiculos (frota) e seguro de carga (RCTR-C) hoje?"

Isso coleta informacao de ambos os seguros em uma unica pergunta.

### 2. Simplificar perguntas de follow-up

Dependendo da resposta:
- **Tem ambos**: Perguntar seguradora e vencimento de cada
- **Tem so frota**: Perguntar seguradora/vencimento da frota + se embarcadores exigem RCTR-C
- **Tem so carga**: Perguntar seguradora/vencimento + quantos veiculos tem sem seguro
- **Nao tem nenhum**: Perguntar quantos veiculos tem e tipo de mercadoria para cotacao

### 3. Mover perguntas operacionais para depois

Tipo de operacao, rotas, valor de carga passam a ser coletados apenas quando necessario para cotacao, nao como qualificacao inicial.

### 4. Manter regras criticas intactas

RC1 (tamanho minimo), RC2 (contato de terceiro), RC3 (proibicoes) permanecem inalterados.

## Implementacao Tecnica

- **Arquivo afetado**: Tabela `agents` no banco de dados, campo `system_prompt` do registro com slug `atlas`
- **Metodo**: SQL UPDATE para atualizar o prompt completo
- **Tamanho**: O prompt sera reduzido significativamente (de ~37k caracteres para ~25k) ao eliminar ramificacoes desnecessarias e tornar o fluxo mais linear

### Secoes do prompt que serao reescritas:
1. **OBJETIVO PRIMARIO** - adicionar foco em descobrir situacao atual de seguros
2. **ARVORE DE DECISAO** - reorganizar para seguros primeiro, operacao depois
3. **descoberta_seguro_frota() e descoberta_seguro_carga()** - unificar em descoberta_seguros_atuais()
4. **coletar_dados_frota() e coletar_dados_carga()** - simplificar
5. **CRITERIOS DE HANDOFF** - manter mas simplificar dados minimos
6. **EXEMPLOS DE DIALOGO** - atualizar para refletir novo fluxo

