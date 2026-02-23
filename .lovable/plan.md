
# Corrigir Exibicao de Cartoes de Contato Antigos no Chat

## Problema

A correcao no webhook foi aplicada corretamente e funcionara para **novas** mensagens de cartao de contato. Porem, a mensagem da CAMILA que aparece como `[contacts]` foi salva **antes** do deploy da correcao. Os dados do contato (Nego Firma, +55 43 9639-0014) estao preservados no campo `metadata.raw.contacts`, mas o `content` ficou salvo como `[contacts]`.

## Solucao

Adicionar um fallback no `renderMessageContent` (ChatInterface.tsx) para detectar mensagens com conteudo `[contacts]` e extrair as informacoes do `metadata.raw.contacts`, exibindo-as formatadas.

### Arquivo: `src/components/ChatInterface.tsx` (antes da linha 1717)

Inserir tratamento antes do return final de texto:

```typescript
// Fallback for old contact card messages saved before webhook fix
if (msg.content === '[contacts]' && msg.metadata?.raw?.contacts) {
  const contactCards = msg.metadata.raw.contacts as any[];
  const parts = contactCards.map((c: any) => {
    const name = c.name?.formatted_name || 'Sem nome';
    const phone = c.phones?.[0]?.phone || c.phones?.[0]?.wa_id || '';
    const email = c.emails?.[0]?.email || '';
    const org = c.org?.company || '';
    let lines = [`👤 ${name}`];
    if (phone) lines.push(`📞 ${phone}`);
    if (email) lines.push(`📧 ${email}`);
    if (org) lines.push(`🏢 ${org}`);
    return lines.join('\n');
  });
  return <p className="leading-relaxed whitespace-pre-wrap">{parts.join('\n\n')}</p>;
}
```

## Resultado Esperado

- Mensagens antigas com `[contacts]` serao renderizadas com os dados reais do contato (nome, telefone, email, empresa) extraidos do metadata
- Novas mensagens ja serao salvas corretamente pelo webhook
- Nenhuma mensagem aparecera mais como `[contacts]` no chat

| Arquivo | Mudanca |
|---------|---------|
| `src/components/ChatInterface.tsx` | Fallback de renderizacao para mensagens antigas de contato |
