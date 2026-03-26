

# Remover limite de 1000 nos contatos Inbound

## Problema

Na função `fetchContacts` em `src/services/api.ts` (linha 295), a query de contatos Inbound usa `.limit(1000)`, travando a contagem e exibição em no máximo 1000 registros. Outbound já usa paginação com `.range()` em 3 lotes, mas Inbound não.

## Solução

Aplicar a mesma estratégia de paginação recursiva usada no Outbound para o Inbound:

### Arquivo: `src/services/api.ts` (linhas 289-326)

Substituir a query única de Inbound com `.limit(1000)` por 3 lotes paginados usando `.range()`:

```text
inbound1: range(0, 999)
inbound2: range(1000, 1999)  
inbound3: range(2000, 2999)
```

Mesma lógica já aplicada para `outbound`. Depois combinar os 3 lotes no array `contactsData`.

Também aumentar o limite de Facebook e Google de 100 para 1000, caso cresçam.

### Nenhuma mudança no frontend

O componente `Contacts.tsx` já conta corretamente com `inboundContacts.length` — ao receber mais dados, o número atualiza automaticamente.

