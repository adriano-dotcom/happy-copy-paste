

# Fluxo: Ligacao Automatica da Iris quando Lead abre conversa

## Como funciona

1. Lead manda mensagem para o numero WhatsApp
2. Sistema detecta que a janela de conversa foi aberta (primeira mensagem do lead)
3. Iris liga automaticamente para o lead via WhatsApp

## Onde implementar

A logica sera adicionada no `nina-orchestrator`, que ja processa todas as mensagens recebidas. O ponto de insercao e logo apos a verificacao da janela WhatsApp (linha ~3259), antes do processamento normal pela IA.

## Logica

Quando uma mensagem do tipo `user` chega:

1. Verificar se `nina_settings.auto_voice_on_window` esta ativo (novo campo)
2. Verificar se e a **primeira mensagem** do lead (abre a janela) — ou seja, nao havia `whatsapp_window_start` antes, ou a janela anterior ja tinha expirado
3. Verificar se nao existe uma `voice_qualification` recente (ultimas 24h) para esse contato
4. Verificar se o Auto-Attendant esta ativo (`auto_attendant_active = true`)
5. Se tudo ok, disparar `trigger-elevenlabs-call` com `force: true`
6. Nina continua respondendo normalmente por texto (a ligacao e disparada em paralelo)

## Detalhes Tecnicos

### 1. Novo campo em `nina_settings`

Adicionar coluna `auto_voice_on_window` (boolean, default false) para controlar se o fluxo esta ativo.

```sql
ALTER TABLE nina_settings ADD COLUMN auto_voice_on_window boolean NOT NULL DEFAULT false;
```

### 2. Mudanca no `nina-orchestrator` (trecho apos linha ~3268)

```text
// Apos verificar que a janela esta aberta:

if (settings.auto_voice_on_window && settings.auto_attendant_active) {
  // Verificar se e abertura de janela (primeira msg ou janela reaberta)
  // A janela acabou de ser atualizada pelo trigger update_whatsapp_window
  // Se whatsapp_window_start foi atualizado nos ultimos 30 segundos, e nova janela
  
  const windowJustOpened = windowStart && 
    (now.getTime() - windowStart.getTime()) < 30000; // 30s
  
  if (windowJustOpened) {
    // Checar se nao tem VQ recente
    const { data: recentVq } = await supabase
      .from('voice_qualifications')
      .select('id')
      .eq('contact_id', conversation.contact_id)
      .gte('created_at', new Date(Date.now() - 24*60*60*1000).toISOString())
      .limit(1)
      .maybeSingle();
    
    if (!recentVq) {
      // Disparar ligacao Iris em background
      fetch(`${supabaseUrl}/functions/v1/trigger-elevenlabs-call`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ contact_id: conversation.contact_id, force: true })
      }).catch(err => console.error('[Nina] Auto-voice trigger error:', err));
      
      console.log(`[Nina] Auto-voice: triggered call for contact ${conversation.contact_id}`);
    }
  }
}
// Continua processamento normal (Nina responde por texto)
```

### 3. Toggle na UI (Settings)

Adicionar toggle "Ligar automaticamente quando lead abrir conversa" nas configuracoes de voz (`AgentSettings` ou `GeneralSettings`).

### Arquivos modificados

1. **Migration SQL** — Adicionar coluna `auto_voice_on_window` em `nina_settings`
2. **`supabase/functions/nina-orchestrator/index.ts`** — Adicionar logica de auto-voice apos verificacao de janela (~linha 3268)
3. **`src/components/settings/AgentSettings.tsx`** ou **`GeneralSettings.tsx`** — Toggle para ativar/desativar o fluxo

### Pre-requisitos (ja implementados)

- Auto-Attendant ativo (toggle na Sidebar)
- Pelo menos uma aba do sistema aberta (para WebRTC)
- `voice_call_channel = 'whatsapp'` em `nina_settings`

### Seguranca

- Limite de 1 chamada por contato a cada 24h (evita spam)
- Respeita horario comercial (o `trigger-elevenlabs-call` ja faz essa checagem)
- Flag dedicado `auto_voice_on_window` permite ligar/desligar sem afetar outras funcionalidades
- Nina continua respondendo por texto normalmente (a ligacao e paralela)
