
# Adicionar Status "Em Prospecção" nos Contatos

## Mudanca

Adicionar a opcao **"Em Prospecção"** na lista de status do contato, entre "Novo Lead" e "Em Qualificação".

### Arquivo: `src/components/Contacts.tsx`

Na linha 26-31, adicionar o novo status ao array `statusOptions`:

```typescript
const statusOptions = [
  { value: 'new', label: 'Novo Lead', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  { value: 'prospecting', label: 'Em Prospecção', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  { value: 'lead', label: 'Em Qualificação', color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' },
  { value: 'qualified', label: 'Qualificado', color: 'bg-green-500/10 text-green-400 border-green-500/20' },
  { value: 'customer', label: 'Cliente Ativo', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  { value: 'churned', label: 'Perdido', color: 'bg-slate-800 text-slate-400 border-slate-700' }
];
```

Nenhuma outra alteracao necessaria -- o dropdown de status ja renderiza dinamicamente a partir do array `statusOptions`, e a funcao `getStatusLabel` tambem ja usa o array.

| Arquivo | Mudanca |
|---------|---------|
| `src/components/Contacts.tsx` | Adicionar `prospecting` / "Em Prospecção" ao array `statusOptions` |
