

## Adicionar Status da Chamada na Timeline

### O que muda
Adicionar um texto de status da chamada (ex: "Sem resposta", "Concluida", "Em andamento") visivel no card da timeline, logo abaixo do horario e tentativas.

### Mudanca

**Arquivo: `src/components/VoiceCallTimelineCard.tsx`**

Adicionar um mapeamento de status para texto legivel em portugues e exibir como badge/texto na linha do horario:

```text
Status → Texto exibido
─────────────────────────
completed     → "Concluída"
no_answer     → "Sem resposta"  
failed        → "Falha"
not_contacted → "Não contatado"
in_progress   → "Em andamento"
pending       → "Agendada"
scheduled     → "Agendada"
```

O status sera exibido como um pequeno badge colorido na mesma linha do horario, depois do separador "·", usando as cores ja definidas no `getStatusConfig` (amber para no_answer/failed, violet para completed, etc).

Exemplo visual:
```text
Ligacao IA Concluida  [elevenlabs]
⏰ 14:22 · Sem resposta
```

### Secao tecnica

- Criar funcao `getStatusLabel(status)` que retorna o texto em portugues
- Inserir o label na div existente (linha 119) que ja mostra horario e tentativas
- Usar a cor do `config.textColor` para manter consistencia visual
- Nenhuma mudanca em outros arquivos
