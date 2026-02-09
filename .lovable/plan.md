

# Corrigir Erros de Audio no Chat

## Problema Identificado

A analise revelou **duas causas raiz** para os erros de audio mostrados nas capturas de tela:

### Causa 1: "Erro ao carregar audio" (mensagens da Nina/IA)
O bucket `nina-audio` e **privado** e as URLs de audio sao assinadas com validade de **24 horas**. Apos esse periodo, a URL expira e o player mostra "Erro ao carregar audio - Nao foi possivel reproduzir".

### Causa 2: "Audio indisponivel" (mensagens do usuario)
Quando o download do audio do WhatsApp falha (timeout, erro de rede), a mensagem e salva com `media_url = null`. A transcricao e preservada no campo `content`, mas o arquivo de audio fica inacessivel.

---

## Plano de Correcao

### 1. Tornar o bucket `nina-audio` publico (corrige Causa 1)

Assim como o bucket `whatsapp-media` ja e publico, tornar `nina-audio` publico elimina a necessidade de URLs assinadas que expiram.

- Migracaco SQL: `UPDATE storage.buckets SET public = true WHERE id = 'nina-audio'`
- Adicionar politica de leitura publica para o bucket

### 2. Atualizar o nina-orchestrator para usar URLs publicas

Modificar a funcao `uploadAudioToStorage` no `nina-orchestrator/index.ts` para gerar URLs publicas em vez de signed URLs:

```text
Antes:  createSignedUrl(fileName, 3600 * 24)  // expira em 24h
Depois: getPublicUrl(fileName)                  // permanente
```

### 3. Corrigir URLs expiradas ja existentes no banco

Criar uma migracao ou script para atualizar mensagens com URLs assinadas expiradas do bucket `nina-audio`, convertendo-as para o formato de URL publica:

```text
Antes:  .../object/sign/nina-audio/...?token=xxx
Depois: .../object/public/nina-audio/...
```

### 4. Melhorar o AudioPlayer para fallback inteligente (Causa 2)

Quando `media_url` e null mas existe transcricao, o player ja mostra a transcricao. Porem, para mensagens da Nina com URL expirada, adicionar logica de **re-geracao automatica de URL** no frontend:

- Detectar erro de carregamento (`onError`)
- Se a URL contem `/object/sign/nina-audio/`, tentar converter para URL publica automaticamente
- Se falhar, mostrar a transcricao como fallback (ja implementado)

---

## Detalhes Tecnicos

### Arquivos a modificar:

| Arquivo | Alteracao |
|---|---|
| Migracao SQL | Tornar bucket `nina-audio` publico + politica RLS |
| `supabase/functions/nina-orchestrator/index.ts` | Trocar `createSignedUrl` por `getPublicUrl` |
| `src/components/AudioPlayer.tsx` | Adicionar fallback de URL signed -> public |
| Migracao SQL (dados) | Atualizar URLs existentes no banco |

### Migracao SQL para o bucket:
```sql
UPDATE storage.buckets SET public = true WHERE id = 'nina-audio';

CREATE POLICY "Public read access for nina-audio"
ON storage.objects FOR SELECT
USING (bucket_id = 'nina-audio');
```

### Migracao SQL para URLs existentes:
```sql
UPDATE messages
SET media_url = regexp_replace(
  split_part(media_url, '?', 1),
  '/object/sign/',
  '/object/public/'
)
WHERE media_url LIKE '%/object/sign/nina-audio/%'
  AND type = 'audio';
```

### Alteracao no nina-orchestrator (linhas ~2926-2937):
```typescript
// Trocar signed URL por public URL
const { data: publicUrlData } = supabase.storage
  .from('nina-audio')
  .getPublicUrl(fileName);

return publicUrlData?.publicUrl || null;
```

### Fallback no AudioPlayer:
Adicionar tentativa de conversao automatica quando o audio falha ao carregar, transformando URLs assinadas expiradas em URLs publicas antes de mostrar o erro.

---

## Resultado Esperado

- Audios da Nina/IA funcionarao permanentemente (sem expiracao)
- Audios antigos com URLs expiradas serao corrigidos no banco
- O player tera fallback inteligente para URLs problematicas
- Audios do usuario sem `media_url` continuarao mostrando a transcricao (comportamento ja correto)

