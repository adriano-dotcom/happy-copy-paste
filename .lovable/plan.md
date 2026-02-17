

## Botao para forcar encerramento de chamadas ElevenLabs em andamento

### Como funciona

A ElevenLabs oferece um endpoint WebSocket de monitoramento que aceita comandos de controle, incluindo `end_call`. O fluxo sera:

1. Usuario clica no botao "Encerrar" no card da chamada em andamento
2. Frontend chama uma nova edge function `elevenlabs-hangup`
3. A edge function conecta ao WebSocket de monitoramento da ElevenLabs, envia o comando `end_call`, e atualiza o status local para `cancelled`

### Mudancas

**Novo arquivo: `supabase/functions/elevenlabs-hangup/index.ts`**

Edge function que:
- Recebe `{ vq_id, elevenlabs_conversation_id }` no body
- Conecta ao WebSocket `wss://api.us.elevenlabs.io/v1/convai/conversations/{conversation_id}/monitor` com header `xi-api-key`
- Envia o comando `{ "command_type": "end_call" }`
- Fecha o WebSocket
- Atualiza a `voice_qualifications` com `status: 'cancelled'`, `completed_at: now()`, `observations: 'Encerrada manualmente pelo operador'`

**Arquivo modificado: `src/components/VoiceQualificationSection.tsx`**

- Adicionar botao "Encerrar Ligacao" visivel quando `vq.status === 'calling'` ou `vq.status === 'in_progress'`
- O botao chama `supabase.functions.invoke('elevenlabs-hangup', { body: { vq_id, elevenlabs_conversation_id } })`
- Estilo similar ao botao de hangup do API4COM (vermelho, icone PhoneOff)
- Estado de loading durante a chamada

**Arquivo modificado: `src/components/VoiceCallTimelineCard.tsx`**

- Adicionar botao "Encerrar" no header do card quando status e `calling` ou `in_progress`
- Mesmo comportamento do VoiceQualificationSection

### Secao tecnica

**Edge function `elevenlabs-hangup`:**

```typescript
// 1. Validar params
const { vq_id, elevenlabs_conversation_id } = await req.json();

// 2. Conectar ao WebSocket de monitoramento
const ws = new WebSocket(
  `wss://api.us.elevenlabs.io/v1/convai/conversations/${elevenlabs_conversation_id}/monitor`,
  { headers: { 'xi-api-key': elevenlabsApiKey } }
);

// 3. Enviar comando end_call
ws.send(JSON.stringify({ command_type: "end_call" }));

// 4. Fechar conexao
ws.close();

// 5. Atualizar DB
await supabase.from('voice_qualifications').update({
  status: 'cancelled',
  completed_at: new Date().toISOString(),
  observations: 'Encerrada manualmente pelo operador'
}).eq('id', vq_id);
```

**Botao no VoiceQualificationSection (apos o bloco de status):**

```typescript
{['calling', 'in_progress'].includes(vq.status) && (
  <Button onClick={handleHangup} disabled={isHangingUp}
    className="w-full bg-red-500/20 border-red-500/30 text-red-300 hover:bg-red-500/30">
    <PhoneOff /> Encerrar Ligacao
  </Button>
)}
```

**Config.toml** - Adicionar `verify_jwt = false` para a nova function.

