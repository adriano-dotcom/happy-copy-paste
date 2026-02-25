

# Plano: Adicionar regra explícita de uso do primeiro nome no prompt do Atlas

## Problema
Mesmo com `normalizeContactName()` tratando a variável `{{cliente_nome}}`, o modelo de IA pode decidir usar o nome completo do lead se ele aparecer em outros contextos (histórico, qualificação, etc). Uma instrução explícita no prompt reforça o comportamento correto.

## Alteração

**Arquivo**: `supabase/functions/nina-orchestrator/index.ts`

**Local**: Bloco "REGRAS CRÍTICAS DE COMUNICAÇÃO" (linha ~7847), logo após a regra ANTI-ECO.

**Adicionar nova regra** entre a regra ANTI-ECO e a regra VERIFICAR ANTES DE PERGUNTAR:

```text
### REGRA DE USO DO NOME (OBRIGATÓRIO):
- SEMPRE use APENAS o PRIMEIRO NOME do lead, com inicial maiúscula
- NUNCA use o nome completo (ex: "Felipe Lazzari") — use apenas "Felipe"
- NUNCA use nome em CAIXA ALTA (ex: "FELIPE") — use "Felipe"
- A variável {{cliente_nome}} já contém o primeiro nome formatado — use-a diretamente
```

## Escopo
- **1 arquivo** alterado
- **4 linhas** inseridas
- Zero risco de regressão

