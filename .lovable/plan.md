

# Fluxo de "Nao e o responsavel" na Prospeccao

## Problema

Quando o Atlas pergunta "Voce seria o responsavel por essa area na EMPRESA X?" e o contato responde simplesmente "nao", o sistema nao detecta isso como rejeicao. O Atlas continua insistindo ao inves de encerrar educadamente.

## Solucao

Criar uma deteccao contextual no nina-orchestrator: quando a ultima mensagem do agente pergunta sobre ser o responsavel e o lead responde "nao", o sistema deve:

1. Agradecer o contato pelo tempo
2. Informar que vai atualizar o cadastro
3. Aplicar a tag "Prospeccao numero errado" (id: `40043cab-449d-42d9-9654-08439fc16589`)
4. Pausar a conversa e mover deal para "Perdido"

## Detalhes Tecnicos

### Arquivo: `supabase/functions/nina-orchestrator/index.ts`

### 1. Nova funcao de deteccao contextual

Criar uma funcao `detectNotResponsible()` que verifica:
- Se a ultima mensagem do agente contém padroes como "responsavel", "responsável", "confirmar se", "seria o responsavel"
- Se a resposta do lead e negativa: "nao", "não", "nao sou", "não sou", "nao e comigo", etc.

```text
Padroes da pergunta do agente:
- /responsável|responsavel/i
- /confirmar se.*whatsapp/i
- /seria o responsável/i

Padroes de resposta negativa:
- /^n[aã]o\.?$/i  (simplesmente "nao")
- /n[aã]o\s*(sou|é|e)\b/i
- /n[aã]o\s*,?\s*(n[aã]o\s*)?(sou|é|e)/i
```

### 2. Novo bloco de tratamento antes do prospecting rejection existente

Inserir ANTES do bloco `PROSPECTING REJECTION DETECTION` (linha ~3416) um novo bloco que:

1. Chama `detectNotResponsible()` com a ultima mensagem do agente e a mensagem atual do lead
2. Se detectado:
   - Envia mensagem: "Entendi! Obrigado por nos avisar. Vamos atualizar o contato no nosso cadastro. Desculpe o incomodo e tenha um otimo dia!"
   - Aplica a tag `prospeccao_numero_errado` no contato
   - Marca o deal como "Perdido" com razao "Nao e o responsavel"
   - Pausa a conversa com `followup_stopped: true`
   - Marca mensagem como processada

### 3. Mensagem de resposta

A mensagem sera fixa (sem passar pela IA) para garantir consistencia:

```
Entendi! Obrigado por nos avisar. Vamos atualizar o contato no nosso cadastro. Desculpe o incomodo e tenha um otimo dia!
```

### 4. Aplicacao da tag

Usando o mesmo padrao do codigo existente (ex: tag "emprego"):
- Busca a tag `prospeccao_numero_errado` na tabela `tag_definitions`
- Adiciona ao array `tags` do contato se ainda nao existir

### 5. Fluxo completo

```text
Lead: "nao"
  |
  v
detectNotResponsible() = true?
  |
  v
1. Queue mensagem de agradecimento
2. Marcar mensagem como processada  
3. Aplicar tag "Prospeccao numero errado" no contato
4. Mover deal para "Perdido" (razao: "Nao e o responsavel")
5. Pausar conversa (status: paused, followup_stopped: true)
6. Trigger whatsapp-sender
7. Return (nao processa mais nada)
```

### Impacto

- Conversas futuras onde o lead nega ser o responsavel serao encerradas automaticamente
- A tag permite filtrar e visualizar esses contatos no dashboard
- O deal e movido para "Perdido" para manter o pipeline limpo
