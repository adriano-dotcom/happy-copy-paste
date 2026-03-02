

# Analise do envio WhatsApp

## Status: Envio funcionando corretamente

O mecanismo de envio está operacional. As mensagens que passam pelo pipeline (send_queue → whatsapp-sender → API WhatsApp) são entregues com sucesso. Exemplo: conversa do Athos recebeu texto + botões interativos, ambos com status "delivered".

## Problema real: Erro 131026 em massa

Todas as falhas são erro **131026 (Message undeliverable)** — o número do destinatário não tem WhatsApp. Isso é um problema de **qualidade da base de contatos**, não de código.

Contatos afetados nas últimas horas: ROCHA TRANSPORTES, CHOFER TRANSPORTES, FOFAO TRANSPORTES, REFRIGERACAO VALENTE, entre outros.

## Melhoria sugerida: Validação pré-envio e skip automático

### Arquivo: `supabase/functions/send-whatsapp-template/index.ts`

1. **Registrar erro 131026 no contato** — Quando o template falha com 131026, marcar o contato com `is_blocked: true` e `blocked_reason: 'whatsapp_not_found_131026'` para evitar reenvios futuros
2. **Skip de contatos bloqueados** — Antes de enviar template de prospecção, verificar se `is_blocked = true` e pular

### Arquivo: `supabase/functions/process-campaign/index.ts` (se aplicável ao fluxo de prospecção em lote)

3. **Filtrar contatos sem WhatsApp** — Na query de seleção de contatos para campanha, excluir `is_blocked = true`

### Arquivo: `supabase/functions/whatsapp-webhook/index.ts`

4. **Capturar 131026 no webhook de status** — Ao receber status "failed" com código 131026, marcar automaticamente o contato como bloqueado

### Detalhes técnicos
- 2-3 arquivos backend
- Sem migração de banco (campo `is_blocked` já existe na tabela contacts)
- Risco: baixo — apenas adiciona validação e marcação automática

