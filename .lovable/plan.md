

# Corrigir falso positivo na detecção de "já tem seguro de carga"

## Problema

Na conversa do Jailson, o contato disse:
- "Tenho transportadora queria saber sobre o seguro de cargas"
- "Contrato direto"
- "Sim" (respondendo sobre CT-e)

A função `detectExistingInsurance` junta TODAS as mensagens do usuário em um texto único e testa regex. O padrão `/seguro de carga.*sim/i` faz match em "seguro de cargas...Contrato direto...Sim" — causando falso positivo. O sistema assume que o lead JÁ TEM seguro de carga, quando na verdade ele está BUSCANDO seguro.

Isso dispara o fluxo de renovação ("quando vence a apólice atual?") ao invés do fluxo correto de qualificação para novo cliente.

## Solução

### Arquivo: `supabase/functions/nina-orchestrator/index.ts`

**1. Tornar os padrões de detecção mais restritivos** (linha ~2841)

Remover padrões que geram falso positivo quando "seguro de carga" aparece no contexto de PERGUNTAR sobre seguro (não de CONFIRMAR que tem):

- Remover `/seguro de carga.*sim/i` e `/sim.*seguro de carga/i` — muito amplos
- Substituir por padrões que exijam confirmação explícita de posse:
  - `/ja tenho.*seguro de carga/i`
  - `/tenho.*seguro de carga.*sim/i`
  - `/sim.*tenho.*seguro de carga/i`
  - `/ja temos.*seguro de carga/i`
  - `/temos.*seguro de carga/i`

**2. Adicionar padrões de exclusão** (anti-patterns)

Antes de marcar `has_cargo_insurance = true`, verificar se o texto contém indicadores de que está BUSCANDO seguro (não que já tem):

- "queria saber sobre", "preciso de", "quero cotar", "quero fazer", "me interessa", "preciso contratar", "queria contratar", "busco", "procurando"

Se esses padrões aparecem junto com "seguro de carga", NÃO marcar como `has_cargo_insurance`.

**3. Analisar por mensagem individual** ao invés de texto concatenado

Para os padrões de seguro de carga, verificar cada mensagem do usuário individualmente em vez de juntar tudo. O "Sim" que respondeu sobre CT-e não deve combinar com "seguro de carga" de outra mensagem.

## Impacto

- Leads que estão BUSCANDO seguro de carga seguirão o fluxo correto de qualificação
- Leads que CONFIRMAM ter seguro de carga continuarão indo para o fluxo de renovação
- Nenhuma mudança no frontend

