

# Corrigir variáveis de template: `{{1}}` = empresa, não nome

## Diagnóstico

O template diz: `_Pode confirmar se este WhatsApp é do responsável pela empresa {{1}}?_`

A variável `{{1}}` no **corpo** do template é o **nome da empresa** (`contact.company`), não o nome do contato. O nome do contato está no **header** do template.

Porém, o código atual em `process-campaign/index.ts` usa `contact.name` como fallback para **todas** as variáveis do body (linha 317 e 411):
```typescript
const rawValue = templateVars[`body_${i + 1}`] || contact.name || 'Cliente';
```

### Dados confirmados
- **130 mensagens** no banco com `{{1}}` no conteúdo
- Todas têm `contact.company` preenchido (ex: "VMB SOBCZAK TRANSPORTES LTDA", "PRADO - TRANSPORTES LTDA")
- O `{{1}}` deveria ser substituído pelo nome da empresa

## Plano

### 1. Corrigir fallback de variáveis no `process-campaign/index.ts`

Na seção de **envio à API** (linha 317) e na seção de **gravação da mensagem** (linha 411), mudar o fallback para usar campos diferentes por posição:

- `body_1` → fallback `contact.company || contact.name || 'Cliente'`

Isso resolve futuros envios.

### 2. Corrigir 130 mensagens antigas via UPDATE

Duas operações de dados (usando insert tool):

**Passo 1**: Substituir `{{1}}` pelo nome da empresa do contato:
```sql
UPDATE messages m
SET content = REPLACE(m.content, '{{1}}', c.company)
FROM conversations conv
JOIN contacts c ON c.id = conv.contact_id
WHERE m.conversation_id = conv.id
  AND m.content LIKE '%{{1}}%'
  AND c.company IS NOT NULL
  AND TRIM(c.company) != '';
```

**Passo 2**: Fallback para contatos sem empresa:
```sql
UPDATE messages
SET content = REPLACE(content, '{{1}}', 'sua empresa')
WHERE content LIKE '%{{1}}%';
```

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/process-campaign/index.ts` | Corrigir fallback: body_1 → `contact.company`, manter normalização para header |

## Sem migração de banco
Apenas update de dados + correção de código na edge function.

