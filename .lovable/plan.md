

# Reenviar 12 templates que falharam com erro 131042

## Situação

12 mensagens de template falharam hoje por problema de pagamento (erro 131042). O pagamento já foi regularizado e a conta está com status GREEN.

| # | Contato | Template | Variáveis |
|---|---------|----------|-----------|
| 1 | MARCIO ALMEIDA DE LIMA | bom_dia_adriano | MA ALMEIDA TRANSPORTES LTDA |
| 2 | CLEIDE PCHEKA DA LUZ | bom_dia_adriano | KPI LOG LOGISTICA LTDA |
| 3 | PAULA MARIA | bom_dia_adriano | PAULA MARIA JOLY - TRANSPORTES... |
| 4 | RONE DA SILVEIRA | bom_dia_adriano | RDS - TRANSPORTES LTDA |
| 5 | ESLY BATISTA VIANA JUNIOR | bom_dia_adriano | E B VIANA JUNIOR TRANSPORTES LTDA |
| 6 | ROBSON SANTIAGO | bom_dia_adriano | 17.191.392 ROBSON SANTIAGO FRATTINO |
| 7 | JOAO MARCOS SHELIGA | 03_boa_tarde_adriano_ | TRANSHELIGA TRANSPORTE DE CARGAS LTDA |
| 8 | A SOUZA | 03_boa_tarde_adriano_ | A SOUZA TRANSPORTES |
| 9 | ALAN SANTOS | 03_boa_tarde_adriano_ | ALAN SANTOS - TRANSPORTES |
| 10 | NILSON CLAIR WEBER | 03_boa_tarde_adriano_ | NILSON CLAIR WEBER TRANSPORTES LTDA ME |
| 11 | NIVALDO FRANCO DA ROCHA | 03_boa_tarde_adriano_ | 3F TRANSPORTES LTDA |
| 12 | NATALY CRISTINA DOS SANTOS | 03_boa_tarde_adriano_ | NAVI TRANSPORTES LTDA |

## Plano

### 1. Criar Edge Function temporária `resend-failed-templates`

Uma função que:
- Recebe a lista dos 12 message IDs
- Para cada um, lê o `metadata` da mensagem original (template_name, variables, header_variables, template_language)
- Chama a Edge Function `send-whatsapp-template` existente com os mesmos parâmetros
- Marca a mensagem original como `status = 'sent'` se o reenvio for bem-sucedido
- Retorna um relatório com sucesso/falha de cada reenvio

### 2. Executar o reenvio

Chamar a função com os 12 IDs para disparar os templates novamente via Meta API.

### 3. Verificar resultados

Consultar o banco para confirmar que as 12 mensagens foram reenviadas com sucesso.

## Detalhes técnicos

- Usa a mesma `send-whatsapp-template` Edge Function que já funciona
- Cada reenvio usa os dados originais do `metadata` (template_name, variables, header_variables)
- Intervalo de 2s entre envios para respeitar rate limits
- Nenhuma mudança no código do frontend

