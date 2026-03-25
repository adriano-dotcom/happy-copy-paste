

# Integração Jarvis via Supabase REST + Anon Key

## Abordagem

Substituir a Edge Function `jarvis-leads` pela abordagem nativa do Supabase REST API. A view `leads_jarvis_v` já existe. Basta conceder acesso de leitura ao role `anon` para que o endpoint REST funcione com a anon key.

## O que já existe

- View `public.leads_jarvis_v` (criada na migration anterior) mapeando campos de `contacts`
- Edge Function `jarvis-leads` (será removida)

## Mudanças necessárias

### 1. Migration SQL — Conceder SELECT ao role `anon`

```sql
GRANT SELECT ON public.leads_jarvis_v TO anon;
GRANT SELECT ON public.leads_jarvis_v TO authenticated;
```

Como a view foi criada sem `security_invoker` (padrão = definer), ela executa com permissões do owner e bypassa RLS da tabela `contacts`. Isso significa que o `GRANT SELECT` ao `anon` é suficiente para liberar leitura via REST.

### 2. Remover Edge Function `jarvis-leads`

- Deletar `supabase/functions/jarvis-leads/index.ts`
- Remover bloco `[functions.jarvis-leads]` do `supabase/config.toml`

### 3. Atualizar plano (.lovable/plan.md)

Documentar a abordagem final.

## Endpoint final para o Jarvis

```
GET https://xaqepnvvoljtlsyofifu.supabase.co/rest/v1/leads_jarvis_v?select=*&order=created_at.desc
```

Headers:
```
apikey: <SUPABASE_ANON_KEY>
Authorization: Bearer <SUPABASE_ANON_KEY>
```

Filtro incremental:
```
&created_at=gte.2026-03-01T00:00:00Z
```

## Resumo

| Recurso | Ação |
|---------|------|
| Migration SQL | `GRANT SELECT ON leads_jarvis_v TO anon` |
| `supabase/functions/jarvis-leads/` | Deletar |
| `supabase/config.toml` | Remover bloco `jarvis-leads` |
| `.lovable/plan.md` | Atualizar documentação |

## Dados para configurar o Jarvis

- **Tabela real de leads**: `contacts`
- **View exposta**: `leads_jarvis_v`
- **Project URL**: `https://xaqepnvvoljtlsyofifu.supabase.co`
- **Anon key**: já disponível no `.env` do projeto

