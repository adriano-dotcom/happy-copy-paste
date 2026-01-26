

## Plano: Correção da Integração API4Com - Indicador de Chamada Travado + Testes

### Diagnóstico Final

Após investigação detalhada, identifiquei **4 problemas que precisam ser resolvidos**:

| # | Problema | Causa Raiz | Severidade |
|---|----------|------------|------------|
| 1 | UI não atualiza quando chamada encerra | Realtime não está entregando eventos de call_logs | **CRÍTICO** |
| 2 | Webhook API4Com bloqueado | API4Com não está enviando a chave de autenticação | Alto |
| 3 | Background sync falha | Já foi corrigido mas deploy ainda não ativou | Médio |
| 4 | Falta de testes automatizados | Nenhum teste para validar webhook | Médio |

---

### Problema 1: Realtime de call_logs Não Funciona

**Evidência:**
- Banco mostra `status: cancelled` para a chamada
- Console logs do frontend mostram eventos Realtime para `conversations`, `messages`, `contacts`
- Nenhum evento de `call_logs` no console

**Causa provável:** 
O Realtime do Supabase **não está entregando eventos de `call_logs`** mesmo que a tabela esteja na publication. Isso pode ser um problema de RLS ou configuração.

**Solução:**
1. Verificar se o canal Realtime está realmente subscrito
2. Adicionar logging mais detalhado no hook `useActiveCall`
3. Forçar refresh manual após o hangup (fallback imediato)

---

### Problema 2: Webhook API4Com Bloqueado

**Evidência dos logs:**
```
[api4com-webhook] ❌ Authentication failed from: 129.151.39.51
[api4com-webhook] 🔑 Auth check: { authMethod: "none", providedKeyFingerprint: "null" }
```

**Causa:**
A API4Com está enviando webhooks **SEM** a chave de autenticação configurada. O provedor precisa ser configurado do lado deles para enviar a chave.

**Solução:**
1. Documentar como configurar a chave no painel da API4Com
2. Adicionar fallback: aceitar IPs confiáveis (129.151.39.51) temporariamente enquanto configura

---

### Alterações Planejadas

#### 1. Corrigir UI - Forçar refresh após hangup (ActiveCallIndicator.tsx)

```typescript
// Após chamar api4com-hangup com sucesso, forçar atualização local imediata
const handleHangup = async () => {
  setIsCancelling(true);
  try {
    const { data, error } = await supabase.functions.invoke('api4com-hangup', {
      body: { call_log_id: call.id, api4com_call_id: call.api4com_call_id }
    });

    if (error) throw error;
    
    // NOVO: Forçar dismiss imediato - não esperar pelo Realtime
    toast.info('Chamada encerrada');
    onDismiss?.();
  } catch (error) {
    // ...
  }
};
```

**Nota:** O código atual JÁ faz isso (`onDismiss?.()`), então o problema é que `onDismiss` pode não estar sendo passado corretamente.

#### 2. Verificar chamada de onDismiss (ChatInterface.tsx ou onde o componente é usado)

Garantir que `onDismiss={dismissActiveCall}` está sendo passado para o componente.

#### 3. Criar Testes Automatizados para api4com-webhook

```typescript
// supabase/functions/api4com-webhook/index.test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import "https://deno.land/std@0.224.0/dotenv/load.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

const webhookUrl = `${SUPABASE_URL}/functions/v1/api4com-webhook`;

Deno.test("api4com-webhook - rejects request without API key (401)", async () => {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event: "test" }),
  });
  
  assertEquals(response.status, 401);
  const body = await response.json();
  assertEquals(body.error, "Unauthorized");
});

Deno.test("api4com-webhook - accepts request with valid API key", async () => {
  const webhookKey = Deno.env.get("API4COM_WEBHOOK_KEY");
  if (!webhookKey) {
    console.log("Skipping: API4COM_WEBHOOK_KEY not set");
    return;
  }
  
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "X-Api4com-Key": webhookKey,
    },
    body: JSON.stringify({ 
      event: "channel-hangup",
      id: "test-123",
      destination: "5511999999999",
    }),
  });
  
  // Should return 200 even if call not found (logged as ignored)
  assertEquals(response.status, 200);
  await response.text(); // Consume body
});

Deno.test("api4com-webhook - health check returns 200", async () => {
  const response = await fetch(webhookUrl, {
    method: "GET",
  });
  
  assertEquals(response.status, 200);
  const body = await response.json();
  assertEquals(body.status, "ok");
  await response.text();
});
```

#### 4. Adicionar Fallback Temporário para IPs Confiáveis

Enquanto o cliente não configura a chave no painel da API4Com, podemos aceitar requests de IPs conhecidos:

```typescript
// Em api4com-webhook/index.ts - TEMPORÁRIO até configuração do cliente

// Se não tem chave MAS vem de IP confiável, aceitar com warning
if (!trimmedProvidedKey && ipTrusted) {
  console.warn('[api4com-webhook] ⚠️ TEMPORARY: Accepting request from trusted IP without key:', clientIP);
  console.warn('[api4com-webhook] ⚠️ Please configure API4COM_WEBHOOK_KEY in the API4Com panel');
  // Continuar processamento...
}
```

---

### Fluxo Corrigido

```text
1. Usuário clica "Encerrar"
         ↓
2. api4com-hangup atualiza DB local (status = cancelled)
         ↓
3. API4Com é notificada (pode retornar 404 se já encerrou)
         ↓
4. onDismiss() é chamado → UI remove indicador imediatamente
         ↓
5. Realtime EVENTUALMENTE entrega o UPDATE (backup)
         ↓
6. API4Com envia webhook → atualiza com recording/duration (se disponível)
```

---

### Resumo das Alterações

| Arquivo | Alteração |
|---------|-----------|
| `src/components/ChatInterface.tsx` ou similar | Verificar se `onDismiss` está sendo passado |
| `src/hooks/useActiveCall.ts` | Adicionar logging para debug de Realtime |
| `supabase/functions/api4com-webhook/index.ts` | Adicionar fallback temporário para IPs confiáveis |
| `supabase/functions/api4com-webhook/index.test.ts` | Criar testes automatizados |

---

### Seção Técnica

**Por que o Realtime não está entregando eventos de call_logs?**

Possíveis causas:
1. **RLS com função** - A função `is_authenticated_user()` pode não estar sendo avaliada corretamente no contexto do Realtime
2. **Replica Identity** - A tabela pode precisar de `REPLICA IDENTITY FULL` para o Realtime funcionar com filtros
3. **Subscription não ativou** - O canal pode não ter sido subscrito corretamente

**Investigação adicional necessária:**
- Verificar `REPLICA IDENTITY` da tabela call_logs
- Adicionar logging quando o canal é subscrito
- Verificar se há erros na subscription

**Webhook não autenticado:**
A API4Com precisa ser configurada no painel deles para enviar o header `X-Api4com-Key` ou `X-Api-Key` com o valor do secret `API4COM_WEBHOOK_KEY`. Até que isso seja feito, os webhooks continuarão sendo rejeitados.

