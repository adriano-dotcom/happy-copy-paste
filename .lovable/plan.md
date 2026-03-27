

# Limpar 10 registros órfãos do send_queue

## Registros identificados

10 registros em `processing` que nunca foram finalizados:

- 5 de janeiro (dias 20, 22, 23, 27)
- 4 de fevereiro (dias 2, 9)

## Ação

Atualizar os 10 registros de `processing` para `failed` com motivo `orphaned_stale_processing`, usando filtro por IDs específicos.

```sql
UPDATE send_queue 
SET status = 'failed', 
    error_message = 'orphaned_stale_processing',
    updated_at = now()
WHERE id IN (
  'b5fa0b53-8fc2-49e4-891c-b6a0fd8391e2',
  '225827b2-111a-4dc1-8be7-12ae3e15cdd1',
  '9d018e50-f04b-446c-a7be-ffbdaef49788',
  'de9beb29-6d72-405b-afb5-8b515c421143',
  '354fbe2a-a637-4210-835e-42f67b52614f',
  '23f36bec-341f-499a-8af3-7d6b194f0bca',
  '67540259-fcfb-4505-b253-a55f379253e3',
  '0d48dbe1-98e6-4e20-b92e-725fa7345034',
  '8006a253-b46c-4388-93d5-49803e97c27d',
  'faaa0702-4c47-41c9-9957-aa1272772ad8'
);
```

Nenhuma alteração de código ou schema necessária — apenas limpeza de dados.

