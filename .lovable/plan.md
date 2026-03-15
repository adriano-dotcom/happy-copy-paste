

# Plano: Rodar teste completo da Iris Inbound com prompt v2.0

## Objetivo
Executar os testes existentes e novos cenarios para validar que o prompt v2.0 da Iris funciona corretamente com o nina-orchestrator.

## Testes a executar

### Grupo 1: Qualification Protection (existente)
Chamar `test-prospecting-flow` com `{ "test_type": "qualification_protection" }` para validar que as 15 respostas de qualificacao nao disparam desqualificacao.

### Grupo 2: Fluxo conversacional Iris (via test-prospecting-flow)

**Teste 2a - Primeiro contato inbound:**
- `{ "agent_slug": "iris", "messages": ["Boa tarde, vi que voces trabalham com seguro de carga, queria saber mais"] }`
- Validar: status `nina`, resposta sem emojis, tom profissional do v2.0

**Teste 2b - Extracao de dados (tipo_carga + estados):**
- `{ "agent_slug": "iris", "messages": ["Boa tarde, preciso de seguro", "Graos e fertilizantes, rodo por SP, PR e MT"] }`
- Validar: `qualification_answers` com `tipo_carga` e `estados`

**Teste 2c - Dados numericos (viagens + valor):**
- `{ "agent_slug": "iris", "messages": ["Boa tarde, preciso de cotacao", "Umas 15 viagens, valor medio de 120 mil"] }`
- Validar: `viagens_mes` e `valor_medio` extraidos

**Teste 2d - Desqualificacao legitima:**
- `{ "agent_slug": "iris", "messages": ["Nao, errou de numero, nao conheco nenhuma jacometo"] }`
- Validar: status `paused`, desqualificacao aplicada

### Grupo 3: Verificacao de formato RC3
- Apos cada teste, verificar que a resposta da Iris nao contem emojis (regex `[\u{1F600}-\u{1F64F}]`)

## Implementacao
Todos os testes serao executados via `curl_edge_functions` chamando `test-prospecting-flow`. Entre cada teste, chamar cleanup. Ao final, consolidar um relatorio pass/fail.

## Resultado esperado
Relatorio com status de cada cenario, identificando regressoes ou melhorias do prompt v2.0 vs comportamento anterior.

