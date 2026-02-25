

# Investigacao: Erro "Edge Function returned a non-2xx status code"

## Problema

A screenshot mostra o toast: **"Erro ao iniciar chamada: Edge Function returned a non-2xx status code"**. Isso acontece porque quando a Edge Function `whatsapp-call-initiate` retorna HTTP 400 (erro de permissao 138006), o `supabase.functions.invoke()` lanca uma **excecao** em vez de retornar os dados normalmente.

O fluxo atual:
1. `supabase.functions.invoke()` recebe HTTP 400
2. O SDK lanca um erro com mensagem generica "Edge Function returned a non-2xx status code"
3. O codigo cai no `catch` (linha 324), que mostra a mensagem generica
4. Nunca chega no `if (errorCode === 138006)` (linha 237) onde esta o tratamento correto

## Causa raiz

O `supabase.functions.invoke()` coloca o body da resposta no campo `error.context` quando o status nao e 2xx. O codigo atual nao extrai o `error_code` do contexto do erro no bloco `catch`.

## Correcao

**Arquivo**: `src/components/OutboundCallModal.tsx`

**Bloco catch** (linhas 324-328): Extrair o `error_code` do corpo da resposta de erro e aplicar a mesma logica de tratamento do erro 138006 (enviar mensagem pedindo permissao).

```typescript
} catch (err: any) {
  console.error(`[WebRTC][${ts()}] Outbound call error:`, err);
  
  // Try to extract Meta error code from the response context
  let errorCode: number | undefined;
  let errorMsg = err.message || 'Erro desconhecido';
  try {
    const ctx = err?.context;
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json();
      errorCode = body?.error_code;
      errorMsg = body?.error || errorMsg;
    }
  } catch {}

  if (errorCode === 138021 || errorCode === 138000 || errorCode === 138006) {
    toast.error('O lead não habilitou chamadas WhatsApp. Enviando mensagem...');
    try {
      await supabase.functions.invoke('whatsapp-sender', { body: { ... } });
      toast.success('Mensagem de solicitação de permissão enviada.');
    } catch {}
  } else {
    toast.error(`Erro ao iniciar chamada: ${errorMsg}`);
  }
  
  cleanup();
  onClose();
}
```

## Escopo
- **1 arquivo** alterado: `src/components/OutboundCallModal.tsx`
- **1 bloco** modificado: `catch` (linhas 324-328)
- Mantém a lógica existente do bloco `if` (linhas 231-255) intacta como fallback

