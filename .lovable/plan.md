
# Corrigir mensagens nao sendo processadas pelo Atlas (early_drop)

## Problema identificado
As mensagens dos leads estao sendo recebidas e salvas no banco de dados, mas **nunca chegam na fila de processamento da IA** (`nina_processing_queue`). Isso faz com que o agente Atlas pare de responder.

### Causa raiz
O webhook do WhatsApp usa `EdgeRuntime.waitUntil()` para processar mensagens em background. O fluxo e:
1. Salva na `message_grouping_queue` (deduplicacao)
2. Retorna HTTP 200 para o WhatsApp imediatamente
3. Em background: cria o contato, cria a conversa, cria a mensagem no DB
4. **Em background: insere na `nina_processing_queue`** (passo critico)

O problema: Os logs mostram que a funcao esta sendo encerrada com **`early_drop`** antes que o passo 4 seja executado. A mensagem e criada no banco (passo 3), mas nunca e adicionada na fila de processamento da IA (passo 4).

Evidencia: A mensagem "Sim" da Vera Lucia foi criada no banco (`messages`) mas nao existe entrada correspondente em `nina_processing_queue`. Multiplas outras mensagens tambem estao com `processed: false` na `message_grouping_queue`.

## Solucao proposta
Mover a insercao na `nina_processing_queue` para **imediatamente apos** a criacao da mensagem no banco, **antes** do processamento de midia (que e a parte mais demorada e causa o `early_drop`).

### Alteracoes no `whatsapp-webhook/index.ts`

**Reordenar o fluxo de background** (funcao `processIncomingMessageWithBackground`):

Ordem atual:
1. Criar/buscar contato
2. Criar/buscar conversa
3. Parse do conteudo da mensagem
4. Criar mensagem no DB
5. Atualizar `last_message_at`
6. **Processar midia** (download, storage, OCR, transcricao) -- DEMORADO
7. **Inserir na `nina_processing_queue`** -- NUNCA EXECUTADO por causa do early_drop

Nova ordem:
1. Criar/buscar contato
2. Criar/buscar conversa
3. Parse do conteudo da mensagem
4. Criar mensagem no DB
5. Atualizar `last_message_at`
6. **Inserir na `nina_processing_queue`** -- MOVIDO PARA ANTES da midia
7. **Processar midia** (download, storage, OCR, transcricao)

Essa mudanca simples garante que a mensagem seja enfileirada para processamento da IA **antes** das operacoes demoradas de midia que causam o timeout.

### Detalhes tecnicos

No arquivo `supabase/functions/whatsapp-webhook/index.ts`, na funcao `processIncomingMessageWithBackground`:

- Mover o bloco das linhas 1076-1103 (insercao na nina_processing_queue) para **antes** do bloco das linhas 1064-1074 (processamento de midia)
- Manter a mesma logica condicional (`if (conversation.status === 'nina')`)
- O processamento de midia continuara funcionando normalmente, apenas executado depois

Essa e uma mudanca minima e segura que resolve o problema sem alterar a logica de negocio.
