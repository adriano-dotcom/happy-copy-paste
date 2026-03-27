

# Mitigação Automática para Erro 131049 (Healthy Ecosystem)

## Problema

O erro 131049 da Meta bloqueia mensagens de marketing para contatos que receberam muitas mensagens recentes. Atualmente:
- O sistema não diferencia 131049 de outros erros
- Campanhas pausam desnecessariamente após streak de falhas
- Não há retry automático com delay
- A métrica `error_131049_count` nunca é populada

## Solução em 3 frentes

### 1. `send-whatsapp-template` — Detectar e registrar 131049

Quando o erro 131049 ocorre:
- Registrar na tabela `whatsapp_metrics` o campo `error_131049_count`
- Adicionar campo `cooldown_until` no contato (ou na tabela `campaign_contacts`) para não tentar reenviar antes de 24h
- Retornar flag `is_rate_limited: true` na resposta para que o chamador saiba tratar

### 2. `process-campaign` — Tratamento inteligente de 131049

Quando o erro de um contato é 131049:
- **NÃO incrementar** `current_failure_streak` (não é falha do sistema)
- Marcar o `campaign_contact` como `skipped` com motivo `meta_marketing_limit_131049`
- Agendar retry automático: re-inserir o contato como `pending` com `scheduled_at = now() + 24h`
- Incrementar `skipped_count` ao invés de `failed_count` na campanha
- Registrar na `whatsapp_metrics`

### 3. `process-campaign` — Cadência adaptativa

Quando detectar 3+ erros 131049 consecutivos no mesmo lote:
- Aumentar automaticamente o `interval_seconds` da campanha em 50% (até máximo de 300s)
- Logar aviso de cadência reduzida
- Isso diminui a velocidade de disparo, reduzindo a probabilidade de novos bloqueios

## Arquivos alterados

1. **`supabase/functions/send-whatsapp-template/index.ts`** — Adicionar tracking de 131049 em `whatsapp_metrics` e flag na resposta
2. **`supabase/functions/process-campaign/index.ts`** — Lógica de skip + retry 24h + cadência adaptativa para 131049

## Impacto

- Campanhas não pausam mais por erros 131049
- Contatos bloqueados são automaticamente reagendados para 24h depois
- Cadência se auto-ajusta quando muitos bloqueios são detectados
- Dashboard de métricas passa a mostrar dados reais de 131049

