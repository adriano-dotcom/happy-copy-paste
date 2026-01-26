

## Plano: Corrigir Repetição de Mensagens Entre Automações

### Problema Identificado

A mesma mensagem "Lucas, você é transportador ou embarcador da carga?" foi enviada duas vezes porque:

1. **Duas automações diferentes** processaram a mesma conversa:
   - "Sem Retorno Inteligente" às 10:05
   - "Follow-up Prospecção Atlas" às 13:10

2. **A verificação anti-repetição é isolada por automação**, não global. Cada automação só vê seus próprios logs anteriores.

---

### Correções Propostas

**Arquivo:** `supabase/functions/process-followups/index.ts`

#### Correção 1: Buscar última mensagem GLOBAL (linhas ~1280-1284)

**De:**
```typescript
// Get last message sent for anti-repetition
const lastMessageSent = previousLogs?.[0]?.message_content || undefined;
```

**Para:**
```typescript
// Get last message sent for anti-repetition - GLOBAL (any automation OR conversation messages)
// 1. First try: get from any automation's followup_logs for this conversation
const { data: globalFollowupLogs } = await supabase
  .from('followup_logs')
  .select('message_content, created_at')
  .eq('conversation_id', conv.id)
  .eq('status', 'sent')
  .not('message_content', 'is', null)
  .order('created_at', { ascending: false })
  .limit(1);

// 2. Fallback: get from conversation messages (last nina/agent message)
const lastNinaMessageFromConv = recentMessages?.find(m => 
  m.from_type !== 'user' && m.content
)?.content;

// Use global followup log OR conversation message (whichever is more recent)
const lastMessageSent = globalFollowupLogs?.[0]?.message_content || 
                        lastNinaMessageFromConv || 
                        undefined;
```

#### Correção 2: Validar mensagem gerada antes de enviar (linhas ~1514)

Antes de inserir na `send_queue`, verificar se a mensagem gerada é idêntica ou muito similar a alguma mensagem recente:

**Adicionar após linha ~1513:**
```typescript
// ANTI-DUPLICIDADE FINAL: Verificar se mensagem gerada é idêntica a alguma recente
const isDuplicateMessage = recentMessages?.some(m => {
  if (m.from_type === 'user') return false;
  if (!m.content) return false;
  
  // Verificar se é exatamente igual
  if (m.content.trim().toLowerCase() === messageContent.trim().toLowerCase()) {
    console.log(`[process-followups] ⛔ DUPLICATE DETECTED: Message identical to recent conversation message`);
    return true;
  }
  
  // Verificar similaridade alta (>80%)
  const similarity = calculateWordSimilarity(messageContent, m.content);
  if (similarity > 0.8) {
    console.log(`[process-followups] ⛔ DUPLICATE DETECTED: Message ${(similarity * 100).toFixed(0)}% similar to recent message`);
    return true;
  }
  
  return false;
});

if (isDuplicateMessage) {
  console.log(`[process-followups] Skipping duplicate message for conversation ${conv.id}`);
  skipped++;
  continue;
}

console.log(`[process-followups] Sending message (attempt ${attemptNumber}) to ${conv.id}: "${messageContent.substring(0, 50)}..."`);
```

#### Correção 3: Adicionar função de similaridade no process-followups

Adicionar a função `calculateWordSimilarity` (já existe no generate-followup-message, mas não no process-followups):

```typescript
// Verificar similaridade de palavras
function calculateWordSimilarity(msg1: string, msg2: string): number {
  const normalize = (s: string) => s.toLowerCase()
    .replace(/[^a-záàâãéèêíïóôõöúç0-9 ]/gi, '')
    .split(' ')
    .filter(w => w.length > 3);
  
  const words1 = new Set(normalize(msg1));
  const words2 = new Set(normalize(msg2));
  
  if (words1.size === 0 || words2.size === 0) return 0;
  
  const intersection = [...words1].filter(w => words2.has(w));
  return intersection.length / Math.max(words1.size, words2.size);
}
```

---

### Fluxo Após Correção

```text
Automação "Sem Retorno Inteligente" processa conversa
         ↓
Gera mensagem: "Lucas, você é transportador ou embarcador...?"
         ↓
Envia e salva em followup_logs (10:05)
         ↓
3 horas depois...
         ↓
Automação "Follow-up Prospecção Atlas" processa conversa
         ↓
Busca lastMessageSent GLOBAL de followup_logs
         ↓
Encontra: "Lucas, você é transportador ou embarcador...?"
         ↓
generate-followup-message recebe last_message_sent
         ↓
IA forçada a gerar mensagem DIFERENTE (tema diferente)
         ↓
Verificação anti-duplicidade final confirma que é diferente
         ↓
Envia nova mensagem com tema diferente (ex: "Qual tipo de mercadoria você transporta?")
```

---

### Resumo das Alterações

| Linha Aproximada | Alteração |
|------------------|-----------|
| ~250 (nova) | Adicionar função `calculateWordSimilarity` |
| ~1280-1284 | Substituir busca por automação para busca GLOBAL |
| ~1514 (novo bloco) | Adicionar verificação anti-duplicidade final antes de enviar |

---

### Seção Técnica

**Por que a trava de 10 minutos não funcionou?**

A trava nas linhas 1154-1163 verifica se há mensagem do agente nos últimos 10 minutos. Mas entre as duas mensagens passaram 3 horas, então a trava não se aplica.

**Por que buscar de `followup_logs` E de `messages`?**

1. `followup_logs` contém o histórico de TODAS as automações
2. `messages` contém mensagens enviadas diretamente pelo orchestrator (que não passam por followup_logs)
3. Usar ambos garante cobertura completa

**Threshold de 80% de similaridade:**

Escolhido porque:
- 100% = apenas exatamente igual
- 80% = detecta reformulações da mesma pergunta
- Abaixo de 80% pode gerar falsos positivos

