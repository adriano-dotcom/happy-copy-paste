

# Corrigir envio de arquivos no chat

## Problema
O upload de arquivos falha com erro **"Invalid key"** do Storage porque o nome do arquivo contém caracteres especiais que o Supabase Storage nao aceita (colchetes `[]`, espacos multiplos, etc).

**Exemplo do erro real:**
```
Invalid key: b666ac88-.../1770989305394_[ RCTR-C RCF-DC ] TRANSPORTADORA ESTELAI LTDA -  RCTRC _ RCFDC.pdf
```

## Causa raiz
Na linha 1135 do `ChatInterface.tsx`, o nome original do arquivo e usado diretamente no path do Storage:
```typescript
const fileName = `${activeChat.contactId}/${Date.now()}_${file.name}`;
```

O Supabase Storage nao aceita caracteres como `[`, `]`, espacos duplos e outros caracteres especiais nas chaves de objetos.

## Solucao
Sanitizar o nome do arquivo antes de fazer o upload, removendo/substituindo caracteres invalidos:

1. Remover acentos e caracteres especiais
2. Substituir espacos e caracteres nao-alfanumericos por underscores
3. Remover underscores duplicados
4. Preservar a extensao do arquivo

## Detalhes tecnicos

**Arquivo:** `src/components/ChatInterface.tsx`

Adicionar funcao `sanitizeFileName` antes do uso na linha 1135:

```typescript
const sanitizeFileName = (name: string): string => {
  const ext = name.lastIndexOf('.') > 0 ? name.substring(name.lastIndexOf('.')) : '';
  const base = name.substring(0, name.length - ext.length);
  const sanitized = base
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // remove acentos
    .replace(/[^a-zA-Z0-9._-]/g, '_')                  // troca especiais por _
    .replace(/_+/g, '_')                                // remove _ duplicados
    .replace(/^_|_$/g, '');                             // remove _ no inicio/fim
  return (sanitized || 'file') + ext.toLowerCase();
};
```

Aplicar na construcao do `fileName`:
```typescript
const fileName = `${activeChat.contactId}/${Date.now()}_${sanitizeFileName(file.name)}`;
```

O nome original do arquivo ja e preservado no campo `metadata.original_filename` (linha 1163), entao o usuario continua vendo o nome correto na interface.

**Tambem aplicar a mesma correcao** na funcao de upload de audio (linha ~1065) que usa logica similar.

