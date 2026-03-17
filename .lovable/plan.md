

# Análise do envio do número 5543999000301 (MAXIMILIANO MAZARON)

## O que aconteceu

Pelos logs, o fluxo executou 4 etapas:

| Etapa | Resultado | Detalhe |
|-------|-----------|---------|
| Organization (FOUR TEXTIL LTDA) | ✅ Criada | ID: 59856 |
| Person (MAXIMILIANO MAZARON) | ✅ Criado (com retry) | ID: 90076. Primeira tentativa falhou por campo customizado inválido (`dc094ce47e758abfd2732eac5bfd5f32fea3e3d6` = CNPJ), retry com campos básicos funcionou |
| Lead | ❌ **Falhou** | Erro: `"Note field has been deprecated"` |
| Note (resumo) | ✅ Criada | ID: 58858 |

## Problema: Lead não foi criado

A API do Pipedrive **deprecou o campo `note`** no endpoint de Leads. Nossa função `createPipedriveLead` (linha 153-155) envia `leadData.note = noteContent`, o que causa rejeição do payload inteiro.

## Correção necessária

### `supabase/functions/sync-pipedrive/index.ts`

Remover o campo `note` do payload de criação do Lead (linhas 152-155). A note já é criada separadamente no Step 4 via `createPipedriveNote`, então não há perda de dados.

```typescript
// REMOVER estas linhas (152-155):
if (noteContent && noteContent.trim()) {
  leadData.note = noteContent;
}
```

Adicionalmente, após criar o Lead com sucesso, vincular a Note ao Lead (não apenas ao Person) adicionando `lead_id` no payload da Note.

### Problema secundário: nome do Person

O Person foi criado com `name: "FOUR TEXTIL LTDA"` (nome da empresa) em vez de `name: "MAXIMILIANO MAZARON"` (nome do contato). Isso acontece porque o `fieldMapping` de `company` está mapeado para o campo `name` do Person via `personData.name`. Verificar se o mapeamento `company -> name` está correto nas settings, pois sobrescreve o nome real do contato.

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/sync-pipedrive/index.ts` | Remover `note` do payload do Lead; opcionalmente vincular Note ao Lead via `lead_id` |

