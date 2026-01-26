
## Plano de Correção: Integração API4Com - Chamadas Não Encerram

### Resumo dos Problemas Identificados

Após análise dos logs, código e banco de dados, foram identificados **4 problemas críticos**:

| # | Problema | Impacto | Severidade |
|---|----------|---------|------------|
| 1 | Endpoint de hangup incorreto | Chamadas não encerram via API | **CRÍTICO** |
| 2 | Chamadas travadas no banco | UI mostra "Discando..." eternamente | Alto |
| 3 | Background sync com JWT inválido | Sync pós-hangup falha | Médio |
| 4 | Falta cron job de limpeza | Chamadas órfãs persistem | Médio |

---

### 1. Corrigir Endpoint de Hangup

**Arquivo:** `supabase/functions/api4com-hangup/index.ts`

O endpoint atual está errado:
```
POST /api/v1/dialer/{id}/hangup  ❌
```

Endpoint correto conforme documentação API4Com:
```
POST /api/v1/calls/{id}/hangup  ✅
```

**Alteração na linha 69:**
```typescript
// DE:
const api4comResponse = await fetch(`https://api.api4com.com/api/v1/dialer/${api4com_call_id}/hangup`, {

// PARA:
const api4comResponse = await fetch(`https://api.api4com.com/api/v1/calls/${api4com_call_id}/hangup`, {
```

---

### 2. Corrigir Background Sync com JWT Inválido

**Arquivo:** `supabase/functions/api4com-hangup/index.ts`

O background sync está falhando porque usa `Bearer ${supabaseKey}` (service role) para chamar outra edge function, mas isso não funciona corretamente.

**Solução:** Usar `apikey` header ao invés de Bearer token:

```typescript
// Linhas 115-121 - Alterar headers da chamada de sync
const syncResponse = await fetch(`${supabaseUrl}/functions/v1/api4com-sync-call`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': supabaseKey,               // Usar como apikey
    'Authorization': `Bearer ${supabaseKey}`,  // E também como Bearer
  },
  body: JSON.stringify({ call_log_id }),
});
```

---

### 3. Adicionar Fallback Local no Hangup

Mesmo que a chamada à API4Com falhe (por ex: chamada já encerrou no provedor), devemos garantir que o banco de dados seja atualizado localmente.

**Alteração:** Atualizar o banco ANTES de chamar a API4Com e adicionar tratamento para quando a API retorna 404 (chamada já encerrada).

```typescript
// Após a chamada à API4Com (linha 77-82):
// Se 404, significa que a chamada já foi encerrada no provedor - isso é OK
if (api4comResponse.status === 404) {
  console.log('[api4com-hangup] Chamada já encerrada no provedor (404) - atualizando banco local');
}

// O update do banco acontece independente do resultado da API4Com
```

---

### 4. Criar Cron Job para Limpar Chamadas Órfãs

**Arquivo:** `supabase/functions/api4com-sync-stuck-calls/index.ts`

Verificar se já existe e se está configurado no cron. Se não, adicionar um job que rode a cada 5 minutos para:
1. Buscar chamadas em status `dialing` ou `ringing` há mais de 5 minutos
2. Tentar sincronizar com o provedor
3. Se não conseguir, marcar como `timeout`

**Migração SQL para cron job:**
```sql
SELECT cron.schedule(
  'sync-stuck-calls',
  '*/5 * * * *',  -- A cada 5 minutos
  $$
  SELECT net.http_post(
    url := 'https://xaqepnvvoljtlsyofifu.supabase.co/functions/v1/api4com-sync-stuck-calls',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('app.settings.service_role_key', true) || '"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
```

---

### 5. Limpar Chamadas Travadas Imediatamente

**Migração SQL one-time:**
```sql
-- Marcar todas as chamadas travadas como timeout
UPDATE call_logs 
SET 
  status = 'timeout',
  ended_at = NOW(),
  hangup_cause = 'cleanup_orphan'
WHERE status IN ('dialing', 'ringing')
  AND started_at < NOW() - INTERVAL '10 minutes';
```

---

### 6. Melhorar Logs de Diagnóstico

Adicionar mais contexto nos logs para facilitar debugging futuro:
- Logar o formato exato do call_id recebido
- Logar se a chamada foi encontrada no provedor
- Logar resposta completa da API4Com em caso de erro

---

### Resumo das Alterações

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `api4com-hangup/index.ts` | Edge Function | Corrigir endpoint `/dialer/` para `/calls/` |
| `api4com-hangup/index.ts` | Edge Function | Corrigir headers do background sync |
| `api4com-hangup/index.ts` | Edge Function | Adicionar tratamento para 404 (já encerrada) |
| Migração SQL | Database | Limpar chamadas órfãs existentes |
| Migração SQL | Database | Criar cron job para limpeza automática |

---

### Fluxo Corrigido

```text
Usuário clica "Encerrar"
        ↓
api4com-hangup chamada
        ↓
1. Atualiza banco local → status = "cancelled"
        ↓
2. Chama API4Com: POST /calls/{id}/hangup
        ↓
    [200 OK] → Log sucesso
    [404] → Log "já encerrada" (OK)
    [Erro] → Log erro, mas banco já atualizado
        ↓
3. Background sync (3s delay) → Busca gravação/duração
        ↓
UI reflete status atualizado via Realtime
```

---

### Seção Técnica - Detalhes de Implementação

**Problema do Endpoint:**
A API4Com tem dois conjuntos de endpoints:
- `/api/v1/dialer` - Para INICIAR chamadas
- `/api/v1/calls` - Para GERENCIAR chamadas existentes (hangup, status, etc.)

O erro `Shared class "Dialer" has no method handling POST /{id}/hangup` confirma que o endpoint `/dialer/{id}/hangup` simplesmente não existe.

**Problema do JWT:**
Edge functions chamando outras edge functions precisam passar a key como `apikey` header, não apenas como Bearer token. A combinação de ambos garante compatibilidade.

**Chamadas Órfãs:**
Existem 20+ chamadas em status "dialing" desde janeiro sem atualização. Isso ocorre porque:
1. O webhook da API4Com pode não estar chegando (config no lado deles?)
2. Quando chega, pode não estar encontrando o call_log correspondente
3. O timeout do cliente (3 min) só funciona se a conversa estiver aberta
