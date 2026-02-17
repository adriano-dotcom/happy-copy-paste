

## Corrigir carregamento excessivo na pagina de Contatos

### Problema identificado

A pagina `/contacts` usa `useState` + `useEffect` puro para buscar dados (sem cache). Toda vez que o usuario navega para a pagina, o `loadContacts()` executa com `setLoading(true)`, mostrando o spinner "Carregando base de dados..." mesmo que os dados ja tenham sido buscados anteriormente. O mesmo acontece com `loadCampaigns()` e `loadFiltersData()`.

Alem disso, o `fetchContacts` no `api.ts` faz 3-4 queries sequenciais ao banco (contacts, deals+conversations, template messages), tornando o carregamento lento.

### Causa raiz

- `Contacts.tsx` linha 220-224: `useEffect(() => { loadContacts(); loadCampaigns(); loadFiltersData(); }, [])` - executa TODA VEZ que o componente monta (toda navegacao)
- Nao usa React Query, entao nao ha cache entre navegacoes
- `CompanySettingsProvider` tambem usa useEffect puro (mas afeta menos)

### Solucao

**1. Converter `Contacts.tsx` para usar React Query (cache entre navegacoes)**

Substituir o pattern `useState/useEffect/setLoading` por `useQuery` com `staleTime: 5 * 60 * 1000` (5 min), alinhado com a configuracao global do QueryClient. Isso significa que ao navegar de volta para `/contacts`, os dados aparecem instantaneamente do cache.

Mudancas em `src/components/Contacts.tsx`:
- Remover `const [loading, setLoading] = useState(true)` e `const [contacts, setContacts] = useState([])`
- Criar 3 queries com useQuery:
  - `useQuery({ queryKey: ['contacts-list'], queryFn: api.fetchContacts })` 
  - `useQuery({ queryKey: ['campaigns-active'], queryFn: ... })`
  - `useQuery({ queryKey: ['contacts-filters-data'], queryFn: ... })`
- O `loading` passa a ser `isLoading` do useQuery (so `true` no primeiro fetch, nao nas navegacoes seguintes)
- Manter `loadContacts()` como `refetch()` para os callbacks de create/delete/update

**2. Converter `CompanySettingsProvider` para usar React Query**

Substituir o `useState/useEffect` por `useQuery` com `staleTime: Infinity` (settings raramente mudam). Isso evita refetch desnecessario na inicializacao.

Mudancas em `src/hooks/useCompanySettings.tsx`:
- Usar `useQuery({ queryKey: ['company-settings'], queryFn: ..., staleTime: Infinity })`
- Manter o `refetch` para quando o usuario alterar configuracoes

**3. Melhorar o loading state visual**

Usar `isLoading` (primeiro carregamento) vs `isFetching` (refetch em background) do React Query:
- Primeiro carregamento: mostra o spinner (inevitavel)
- Navegacoes subsequentes: mostra dados do cache imediatamente, refetch silencioso em background

### Secao tecnica

**Contacts.tsx - substituir o bloco de state e useEffect:**

```typescript
// ANTES (linhas 92-224):
const [contacts, setContacts] = useState<ExtendedContact[]>([]);
const [loading, setLoading] = useState(true);
// ... loadContacts/loadCampaigns/loadFiltersData
useEffect(() => { loadContacts(); loadCampaigns(); loadFiltersData(); }, []);

// DEPOIS:
const { data: contacts = [], isLoading: loading, refetch: refetchContacts } = useQuery({
  queryKey: ['contacts-list'],
  queryFn: () => api.fetchContacts(),
  staleTime: 5 * 60 * 1000,
});

const { data: availableCampaigns = [] } = useQuery({
  queryKey: ['campaigns-active'],
  queryFn: async () => {
    const { data } = await supabase
      .from('campaigns').select('id, name, color')
      .eq('is_active', true).order('name');
    return data || [];
  },
  staleTime: 5 * 60 * 1000,
});

const { data: filtersData } = useQuery({
  queryKey: ['contacts-filters-data'],
  queryFn: async () => {
    const [owners, pipelines] = await Promise.all([
      supabase.from('team_members').select('id, name').eq('status', 'active').order('name'),
      supabase.from('pipelines').select('id, name, slug, icon, color').eq('is_active', true).order('name')
    ]);
    return { owners: owners.data || [], pipelines: pipelines.data || [] };
  },
  staleTime: 5 * 60 * 1000,
});

const availableOwners = filtersData?.owners || [];
const availablePipelines = filtersData?.pipelines || [];
```

Substituir todas as chamadas `loadContacts()` por `refetchContacts()`.

**CompanySettingsProvider - converter para React Query:**

```typescript
const { data, isLoading: loading, refetch } = useQuery({
  queryKey: ['company-settings'],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('nina_settings')
      .select('company_name, sdr_name')
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      // criar default...
    }
    return data;
  },
  staleTime: Infinity,
});
```

### Resultado esperado
- Primeiro acesso: carrega normalmente (spinner aparece 1x)
- Navegacoes seguintes: dados aparecem instantaneamente do cache
- Refetch silencioso em background quando staleTime expira
- Sem re-renders desnecessarios ou loops de useEffect

