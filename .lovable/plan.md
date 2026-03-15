

# Avaliacao Completa: Agente Iris - Qualificacao Inbound

## Objetivo
Rodar uma bateria de testes end-to-end que simulam o fluxo completo de qualificacao inbound da Iris, validando cada etapa critica do pipeline.

## Testes a executar (7 cenarios)

### Grupo 1: Protecao contra falsos positivos (qualification_protection)
Ja existe a funcao `runQualificationProtectionTests` no `test-prospecting-flow`. Rodar ela para validar que respostas de qualificacao (subcontratado, agregado, CNPJ, tipo de carga, etc.) **nao** disparam desqualificacao.

**Execucao:** `{ "run_qualification_tests": true }`

### Grupo 2: Fluxo conversacional Iris (4 testes sequenciais)
Simular uma conversa completa com o agente Iris no pipeline Transporte:

**Teste 2a - Primeiro contato inbound:**
- Mensagem: `"Boa tarde, vi que voces trabalham com seguro de carga, queria saber mais"`
- Validar: Status `nina`, agente Iris atribuido, deal criado, resposta sem emojis

**Teste 2b - Resposta de qualificacao (tipo de carga):**
- Inserir pergunta da Iris antes: `"Que tipo de mercadoria voce geralmente transporta?"`
- Resposta: `"Graos e fertilizantes, rodo por SP, PR e MT"`
- Validar: `qualification_answers` extraiu `tipo_carga` e `estados`, sem desqualificacao

**Teste 2c - Resposta com dados numericos:**
- Inserir pergunta da Iris: `"Quantas viagens faz por mes em media?"`
- Resposta: `"Umas 15 viagens, valor medio de 120 mil"`
- Validar: `viagens_mes` e `valor_medio` extraidos corretamente

**Teste 2d - Desqualificacao legitima durante Iris:**
- Cleanup e novo contato
- Mensagem: `"Nao, errou de numero, nao conheco nenhuma jacometo"`
- Validar: Status `paused`, tag de desqualificacao aplicada, `identity_mismatch: true`

### Grupo 3: Completude da qualificacao
**Teste 3 - isQualificationComplete:**
- Simular conversa com todos os campos obrigatorios preenchidos (CNPJ no contato, tipo_carga, estados, viagens_mes, tipo_frota)
- Validar: Iris pede email, `awaiting_qualification_email: true`

### Grupo 4: Voice qualification trigger
**Teste 4 - Trigger da ligacao Iris pos-handoff:**
- Verificar via query se `voice_qualifications` tem registros para contatos com handoff do agente Iris
- Validar logica de agendamento (5 min delay)

## Implementacao tecnica

Todos os testes serao executados via `test-prospecting-flow` edge function com diferentes payloads. Para testes sequenciais (Grupo 2), usar cleanup entre cada cenario.

Os testes do Grupo 1 ja existem nativamente na funcao. Os demais serao executados como testes manuais via `curl_edge_functions`.

## O que validaremos em cada teste
1. **Status da conversa** (nina/paused/human)
2. **Tags do contato** (sem tags indevidas)
3. **nina_context** (qualification_answers, identity_mismatch, awaiting_qualification_email)
4. **Resposta do agente** (RC3 - sem emojis, coerente)
5. **Extracao de dados** (campos corretos no qualification_answers)

## Resultado esperado
Relatorio consolidado com pass/fail para cada cenario, identificando eventuais gaps na logica de qualificacao inbound.

