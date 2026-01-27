
## Plano: Detectar e Tratar Motoristas CLT Buscando Emprego

### Problema Identificado

Quando um lead responde à prospecção com "CLT" e "Motorista profissional", a IA assume que é um profissional do setor de transporte respondendo sobre seu tipo de contratação. Na verdade, o lead pode estar buscando emprego como motorista.

**Evidência da conversa:**
- Agente pergunta: "você trabalha como contratado direto ou subcontratado?"
- Lead responde: "CLT" e "Motorista profissional"
- IA continua qualificação: "Você emite o CT-e?" (pergunta errada para funcionário CLT)
- Operador humano Adriano intervém: "sua necessidade se refere a oportunidades de trabalho ou a seguro de carga?"
- Lead confirma: **"Oportunidade de trabalho"** + **"De motorista"**

### Gaps Identificados no Código

**1. Falta detecção de "motorista empregado CLT"**
- O sistema tem proteção de contexto de transporte (linha 862-876) que evita falsos positivos
- Mas não detecta o padrão específico de funcionário CLT buscando emprego

**2. Keywords de job_seeker incompletas**
- Não inclui: "oportunidade de trabalho", "de motorista" (resposta curta confirmando emprego)
- Não inclui: "CLT" isolado + contexto de não ter empresa

**3. Não há fluxo de desambiguação**
- Quando há dúvida, a IA deveria perguntar antes de continuar qualificação

---

### Solução Proposta

#### 1. Adicionar Detecção de "Motorista CLT" com Perguntas de Desambiguação

**Arquivo:** `supabase/functions/nina-orchestrator/index.ts`

Criar nova interface e função para detectar padrão CLT/motorista profissional:

```typescript
// ===== CLT EMPLOYEE DETECTION (job clarification needed) =====
interface CltEmployeePattern {
  needsClarification: boolean;
  matchedTerms: string[];
}

const CLT_EMPLOYEE_INDICATORS = [
  'clt', 'carteira assinada', 'registro em carteira',
  'motorista profissional', 'sou motorista', 'trabalho como motorista',
  'motorista de empresa', 'empregado', 'funcionário', 'funcionario',
  'trabalho numa empresa', 'trabalho em uma empresa'
];

const CLT_EXCLUSION_TERMS = [
  // Termos que indicam que é dono/gestor (não funcionário)
  'minha frota', 'meus caminhões', 'meus caminhaos', 'minha transportadora',
  'minha empresa', 'sou dono', 'sou proprietário', 'sou proprietario',
  'emito ct-e', 'cnpj', 'antt', 'rntrc', 'minha carreta', 'meu caminhão'
];

function detectCltEmployeePattern(messageContent: string, allUserMessages: string[]): CltEmployeePattern {
  const content = messageContent.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const allContent = allUserMessages.join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // Check exclusions first - if they mention ownership terms, not an employee
  const hasExclusion = CLT_EXCLUSION_TERMS.some(term => 
    allContent.includes(term.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
  );
  
  if (hasExclusion) {
    return { needsClarification: false, matchedTerms: [] };
  }
  
  // Check for CLT indicators
  const matchedTerms: string[] = [];
  for (const indicator of CLT_EMPLOYEE_INDICATORS) {
    const normalizedIndicator = indicator.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (content.includes(normalizedIndicator)) {
      matchedTerms.push(indicator);
    }
  }
  
  // Need clarification if found CLT indicators without ownership context
  return {
    needsClarification: matchedTerms.length > 0,
    matchedTerms
  };
}
```

#### 2. Expandir Keywords de Job Seeker

Adicionar à lista de `job_seeker.keywords` (linha ~550):

```typescript
// ===== CONFIRMAÇÕES EXPLÍCITAS DE BUSCA DE EMPREGO (added 2026-01-27) =====
'oportunidade de trabalho', 'oportunidades de trabalho',
'oportunidade de emprego', 'oportunidades de emprego', 
'busco trabalho', 'busco emprego', 'busco oportunidade',
'de motorista', 'como motorista', 'trabalho de motorista',
'quero trabalhar como motorista', 'quero ser contratado',
'sou motorista e busco', 'sou motorista procurando',
'preciso de trabalho como motorista', 'preciso trabalhar como motorista'
```

#### 3. Adicionar Fluxo de Desambiguação no Nina-Orchestrator

**Onde inserir:** Antes do bloco de detecção de disqualificação (~linha 4185)

```typescript
// ===== CLT EMPLOYEE DISAMBIGUATION =====
// Detect if user might be a CLT employee looking for job (not insurance)
if (message.content && agent?.slug !== 'sofia') {
  const userMessages = recentMessages
    ?.filter((m: any) => m.from_type === 'user')
    .map((m: any) => m.content || '') || [];
  
  const cltCheck = detectCltEmployeePattern(message.content, userMessages);
  
  // Check if we're already in disambiguation flow
  const ninaContext = conversation.nina_context || {};
  const awaitingJobClarification = ninaContext.awaiting_job_clarification === true;
  
  if (awaitingJobClarification) {
    // User is responding to our clarification question
    const userResponse = message.content.toLowerCase();
    
    const isJobSeeker = /oportunidade.*trabalho|oportunidade.*emprego|busco.*trabalho|busco.*emprego|preciso.*emprego|quero.*trabalhar|de motorista|como motorista|sim.*emprego|sim.*trabalho|procuro.*vaga/i.test(userResponse);
    const isInsuranceInterest = /seguro|cotação|cotacao|cotar|proteção|protecao|carga|frota|caminhão|caminhao/i.test(userResponse);
    
    if (isJobSeeker && !isInsuranceInterest) {
      console.log('[Nina] 💼 CLT employee confirmed job seeking');
      
      // Apply job_seeker disqualification
      const jobSeekerCategory = DISQUALIFICATION_CATEGORIES.find(c => c.key === 'job_seeker')!;
      
      // Add tag
      const currentTags = conversation.contact?.tags || [];
      if (!currentTags.includes(jobSeekerCategory.tag)) {
        await supabase
          .from('contacts')
          .update({ tags: [...currentTags, jobSeekerCategory.tag] })
          .eq('id', conversation.contact_id);
      }
      
      // Send response and pause
      const delayMin = settings?.response_delay_min || 1000;
      const delayMax = settings?.response_delay_max || 3000;
      const delay = Math.random() * (delayMax - delayMin) + delayMin;
      const aiSettings = getModelSettings(settings, [], message, conversation.contact, {});
      
      await queueTextResponse(supabase, conversation, message, jobSeekerCategory.response!, settings, aiSettings, delay, agent);
      
      // Mark as processed
      await supabase
        .from('messages')
        .update({ processed_by_nina: true })
        .eq('id', message.id);
      
      // Pause conversation
      await supabase
        .from('conversations')
        .update({
          status: 'paused',
          nina_context: {
            ...ninaContext,
            awaiting_job_clarification: false,
            disqualified_category: 'job_seeker_clt',
            followup_stopped: true,
            paused_reason: 'job_seeker_clt',
            paused_at: new Date().toISOString()
          }
        })
        .eq('id', conversation.id);
      
      // Trigger sender
      fetch(`${supabaseUrl}/functions/v1/whatsapp-sender`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ triggered_by: 'nina-orchestrator-job-seeker-clt' })
      }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
      
      console.log('[Nina] ✅ CLT job seeker handled - conversation paused');
      return;
    } else {
      // Not job seeking, continue with normal flow
      console.log('[Nina] ✅ CLT employee wants insurance - continuing qualification');
      await supabase
        .from('conversations')
        .update({
          nina_context: { ...ninaContext, awaiting_job_clarification: false }
        })
        .eq('id', conversation.id);
      // Continue to normal AI processing
    }
  } else if (cltCheck.needsClarification && !ninaContext.job_clarification_asked) {
    // First time detecting CLT pattern - ask clarification question
    console.log(`[Nina] 🤔 CLT employee pattern detected: ${cltCheck.matchedTerms.join(', ')}`);
    
    const clarificationMessage = 'Só pra eu entender melhor: você está buscando oportunidade de trabalho ou precisa de seguro para sua operação de transporte?';
    
    const delayMin = settings?.response_delay_min || 1000;
    const delayMax = settings?.response_delay_max || 3000;
    const delay = Math.random() * (delayMax - delayMin) + delayMin;
    const aiSettings = getModelSettings(settings, [], message, conversation.contact, {});
    
    await queueTextResponse(supabase, conversation, message, clarificationMessage, settings, aiSettings, delay, agent);
    
    // Mark as processed
    await supabase
      .from('messages')
      .update({ processed_by_nina: true })
      .eq('id', message.id);
    
    // Set flag to await clarification
    await supabase
      .from('conversations')
      .update({
        nina_context: {
          ...ninaContext,
          awaiting_job_clarification: true,
          job_clarification_asked: true,
          clt_terms_detected: cltCheck.matchedTerms
        }
      })
      .eq('id', conversation.id);
    
    // Trigger sender
    fetch(`${supabaseUrl}/functions/v1/whatsapp-sender`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({ triggered_by: 'nina-orchestrator-clt-clarification' })
    }).catch(err => console.error('[Nina] Error triggering whatsapp-sender:', err));
    
    console.log('[Nina] ❓ CLT clarification question sent');
    return;
  }
}
// ===== END CLT EMPLOYEE DISAMBIGUATION =====
```

---

### Fluxo Após Implementação

```text
1. Lead responde "CLT" + "Motorista profissional"
         ↓
2. detectCltEmployeePattern() detecta padrão
         ↓
3. Nina pergunta: "Só pra eu entender melhor: você está 
   buscando oportunidade de trabalho ou precisa de seguro 
   para sua operação de transporte?"
         ↓
4a. Lead responde "Oportunidade de trabalho" / "De motorista"
         ↓
    → Aplica tag "emprego"
    → Envia mensagem: "Somos corretora de seguros... Desejamos sucesso!"
    → Pausa conversa
    → followup_stopped = true
         
4b. Lead responde "Seguro" / "Preciso de seguro"
         ↓
    → awaiting_job_clarification = false
    → Continua com qualificação normal
```

---

### Resumo das Alterações

| Arquivo | Linhas Aprox. | Alteração |
|---------|---------------|-----------|
| nina-orchestrator/index.ts | ~140 (nova função) | Adicionar `detectCltEmployeePattern()` |
| nina-orchestrator/index.ts | ~550-650 | Expandir keywords de job_seeker |
| nina-orchestrator/index.ts | ~4180 (antes do disqualification) | Adicionar fluxo de desambiguação CLT |

---

### Seção Técnica

**Por que não detectou automaticamente?**

O sistema tem uma proteção de contexto de transporte (linha 862-876) que evita falsos positivos quando termos como "trabalho" aparecem em contexto de qualificação. Essa proteção corretamente evita desqualificar quem diz "trabalho como contratado direto", mas também bloqueia a detecção de "motorista profissional CLT" como potencial job seeker.

**Por que usar desambiguação em vez de desqualificação direta?**

- "CLT" e "Motorista profissional" são respostas legítimas para gestores de frota que contratam motoristas CLT
- Desqualificar diretamente geraria falsos positivos
- A pergunta de clarificação é simples e resolve a ambiguidade em 1 interação

**Integração com sistema existente:**

- Usa mesma estrutura de `DISQUALIFICATION_CATEGORIES` para a resposta
- Reutiliza `queueTextResponse()` para envio
- Mantém padrão de `nina_context` flags
- Aplica tag `emprego` existente (confirmado no banco: `key: emprego, label: Emprego`)
