
# Renomear "Telefone" → "WhatsApp" e remover máscara na importação

## Mudanças

### 1. Renomear label "Telefone" → "WhatsApp" em todos os formulários
- `CreateContactModal.tsx` — label do campo phone (linha 420)
- `EditContactModal.tsx` — label do campo phone (linha 307)
- `ContactDetailsDrawer.tsx` — label de exibição (linha 302)
- `Functions.tsx` — label do campo (linha 426)
- `ImportContactsModal.tsx` — FIELD_LABELS, headers de tabela, mensagens de erro

### 2. Importação: salvar número exatamente como está no arquivo
- `ImportContactsModal.tsx` (linhas 409-413): remover `replace(/\D/g, '')` e a lógica de prefixar `55`. Salvar o valor raw do CSV direto no campo `phone_number`
- Manter a validação básica de comprimento mínimo mas sem reformatar

### Detalhes técnicos
- ~5 arquivos editados (somente frontend + modal de importação)
- Sem migração de banco
- Formulários de criação/edição manual mantêm a máscara (PhoneInput) — só a importação perde a formatação forçada
