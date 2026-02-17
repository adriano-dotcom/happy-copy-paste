

# Plano de Teste - Fluxo de Qualificacao por Voz ElevenLabs

## Objetivo
Testar o fluxo completo de ligacao outbound usando seu numero pessoal (55 43 99914-5000).

## Passos

### 1. Criar registro de teste na tabela voice_qualifications
- Inserir um registro com `status = 'pending'` e `scheduled_for = now()` vinculado a um contato existente ou novo com seu numero de telefone
- Isso simula o que o nina-orchestrator faria automaticamente apos um handoff

### 2. Disparar a edge function trigger-elevenlabs-call
- Chamar a funcao manualmente via HTTP para processar o registro pendente
- Como estamos dentro do horario comercial de SP (08h-20h, Seg-Sab), a ligacao deve ser iniciada imediatamente

### 3. Verificar o resultado
- Confirmar que voce recebeu a ligacao no celular
- Verificar os logs da edge function para confirmar sucesso
- Checar se o `elevenlabs_conversation_id` e `call_sid` foram salvos no registro

### 4. Testar o webhook de retorno
- Apos a ligacao encerrar, o ElevenLabs deve enviar o webhook para `elevenlabs-post-call-webhook`
- Verificar se a transcricao, resumo e resultado da qualificacao foram salvos
- Confirmar se o deal foi movido para o estagio correto (se aplicavel)

## Detalhes Tecnicos

### Passo 1 - SQL para inserir registro de teste
Inserir um contato de teste (ou reusar existente) com phone_number `5543999145000`, criar uma voice_qualification pendente vinculada a ele.

### Passo 2 - Chamada da edge function
Usar `supabase.functions.invoke('trigger-elevenlabs-call')` ou chamar via curl para processar a fila.

### Passo 3 - Monitoramento
- Logs do `trigger-elevenlabs-call` para ver resposta da API ElevenLabs
- Logs do `elevenlabs-post-call-webhook` para ver processamento do retorno
- Consulta na tabela `voice_qualifications` para ver status atualizado

### O que esperar
1. Voce recebe uma ligacao no celular do numero configurado no ElevenLabs
2. A agente Iris se apresenta e faz perguntas de qualificacao sobre Seguro de Carga
3. Apos encerrar, o webhook atualiza o registro com transcricao e resultado
4. O deal associado e movido automaticamente se o lead for qualificado

