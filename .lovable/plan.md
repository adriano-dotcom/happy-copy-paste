
# Fix: Atlas nao respondeu ao "Sim" - mensagem nao foi enfileirada

## Diagnostico

A mensagem "Sim" do contato Vera Lucia (5544999060048) foi salva no banco de dados (`messages` tabela, ID `ee404837`), mas **nunca foi inserida na `nina_processing_queue`**. Por isso, o nina-orchestrator nunca processou essa mensagem e o Atlas nunca respondeu.

### Por que isso aconteceu?

O webhook usa `EdgeRuntime.waitUntil()` para processar mensagens em background apos retornar HTTP 200. A sequencia e:

```text
1. Webhook recebe "Sim" do WhatsApp
2. Insere na message_grouping_queue (deduplicacao)
3. Retorna HTTP 200 imediatamente
4. Background: cria contato, conversa, salva mensagem no DB  <-- completou
5. Background: insere na nina_processing_queue              <-- NAO completou (early_drop)
6. Background: processa media (se houver)
```

Os logs mostram multiplos `early_drop` shutdowns no periodo. A funcao foi encerrada entre os passos 4 e 5, salvando a mensagem mas sem enfileira-la para a IA.

### Problema estrutural

A insercao na `nina_processing_queue` (linha 1069 do webhook) esta dentro do bloco de background (`EdgeRuntime.waitUntil`). Isso significa que o insert nao e garantido - se o runtime encerrar por `early_drop`, a mensagem fica orfao.

## Solucao em duas partes

### Parte 1: Acao imediata - Reprocessar a mensagem "Sim"

Inserir manualmente a mensagem "Sim" na `nina_processing_queue` para que o Atlas responda agora:

```sql
INSERT INTO nina_processing_queue (message_id, conversation_id, contact_id, priority, status, context_data)
VALUES (
  'ee404837-b2e1-4e1b-ab8f-58497a086dc7',
  '6975d61f-cc25-40e2-81e3-4aceec23667c',
  'c9efeb61-df22-440f-aade-3f5a4c5c29a1',
  1,
  'pending',
  '{"message_type": "text", "original_type": "text", "recovery": true}'
);
```

Depois, disparar o `nina-orchestrator` para processar.

### Parte 2: Prevencao - Mover queue insert para ANTES do response

Alterar o `whatsapp-webhook/index.ts` para fazer o insert na `nina_processing_queue` **sincronamente**, antes de retornar HTTP 200. A leitura da conversa e do contato precisam acontecer no hot path, mas como sao operacoes rapidas (SELECT simples), o impacto no tempo de resposta e minimo.

**Abordagem**: Apos inserir na `message_grouping_queue`, fazer uma busca rapida pelo contato e conversa e inserir na `nina_processing_queue` diretamente no handler principal. O processamento pesado (media, OCR) continua no background.

### Parte 3: Safety net - Sweep de mensagens orfaos

Adicionar ao `cleanup-queues/index.ts` uma verificacao que detecta mensagens de usuario (`from_type = 'user'`) nos ultimos 30 minutos que nao tem entrada correspondente na `nina_processing_queue`, e cujas conversas estao com `status = 'nina'`. Essas mensagens orfaos serao automaticamente enfileiradas.

## Arquivos a editar

1. **SQL**: Insert manual para reprocessar o "Sim" agora
2. **`supabase/functions/whatsapp-webhook/index.ts`**: Mover o insert na `nina_processing_queue` para o hot path (antes do return HTTP 200)
3. **`supabase/functions/cleanup-queues/index.ts`**: Adicionar funcao `recoverOrphanedMessages` como safety net

## Detalhe tecnico da mudanca no webhook

No handler principal (linhas 326-373), apos inserir na `message_grouping_queue`, adicionar:

```text
Para cada mensagem:
  1. Buscar contato pelo telefone (SELECT rapido)
  2. Buscar conversa ativa (SELECT rapido)
  3. Se conversa.status === 'nina':
     - INSERT na nina_processing_queue com scheduled_for = now + 15s
  4. Continuar com EdgeRuntime.waitUntil para o resto
```

Isso garante que mesmo com `early_drop`, a mensagem ja esta na fila para a IA processar.
