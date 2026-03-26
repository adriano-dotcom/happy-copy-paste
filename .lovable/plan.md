

# Resolver alerta de pagamento WhatsApp (131042)

Encontrei **1 alerta ativo** de pagamento (erro 131042), criado hoje às 14:41.

## Plano

### 1. Migration — Marcar alerta como resolvido

```sql
UPDATE whatsapp_alerts
SET is_resolved = true,
    resolved_at = NOW(),
    resolved_by = 'admin_confirmed_payment'
WHERE id = 'f0b226af-8a0d-40da-8f4d-e8ac4310aa80'
  AND error_code = 131042;
```

Isso remove o banner vermelho "Problema de Pagamento WhatsApp" da interface imediatamente (o componente `WhatsAppPaymentAlertBanner` escuta realtime e re-renderiza).

### 2. Nenhuma mudança de código

O banner já desaparece automaticamente quando `is_resolved = true`.

