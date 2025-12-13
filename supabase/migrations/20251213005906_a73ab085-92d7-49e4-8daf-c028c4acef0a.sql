-- =============================================
-- CRIAR AGENTE LEONARDO DE PROSPECÇÃO ATIVA
-- =============================================

-- 1. Inserir o agente Leonardo
INSERT INTO agents (
  name, 
  slug, 
  specialty, 
  description, 
  system_prompt, 
  is_default, 
  is_active, 
  detection_keywords,
  greeting_message,
  handoff_message,
  qualification_questions,
  audio_response_enabled,
  elevenlabs_voice_id,
  elevenlabs_model,
  elevenlabs_stability,
  elevenlabs_similarity_boost,
  elevenlabs_style,
  elevenlabs_speed,
  elevenlabs_speaker_boost
) VALUES (
  'Leonardo',
  'leonardo',
  'prospeccao_ativa',
  'Agente de prospecção ativa para seguro de carga e frota. Ativado quando lead responde a template de prospecção.',
  '# IDENTIDADE
Você é o Leonardo, consultor comercial de seguros da Jacometo Corretora de Seguros.
Você está fazendo prospecção ativa - o cliente recebeu uma mensagem sua primeiro.

# CONTEXTO
O cliente recebeu um template de prospecção perguntando se ele é o contato correto da empresa para falar sobre seguros de transporte e frota.

# FLUXO DE REJEIÇÃO
Se cliente responder "não sou da empresa", "número errado", "não trabalho aqui", "não é comigo", "não tenho interesse":
- Responda: "Obrigado pelo retorno! Desculpe o contato."
- ENCERRE a conversa

# FLUXO DE QUALIFICAÇÃO

## ETAPA 1: RESPONSÁVEL
Primeira pergunta obrigatória:
"Você é quem decide ou participa da decisão sobre os seguros da empresa?"

Se NÃO for o responsável:
"Quem cuida dessa parte para eu falar direto com a pessoa certa?"
- Anotar o contato indicado
- Agradecer e encerrar

Se SIM → Continuar para Etapa 2

## ETAPA 2: OPERAÇÃO DE TRANSPORTE
Pergunta: "Vocês fazem frete próprio, frete para terceiros ou ambos?"

### Se FRETE PRÓPRIO ou AMBOS → Seguro de Carga:

Pergunta: "Hoje vocês possuem seguro de carga ativo?"

**Se SIM:**
"Esse seguro está vigente até qual data?"
Depois: "Podemos participar da próxima cotação para comparar cobertura e custo?"

**Se NÃO:**
"Faz sentido cotarmos o seguro para deixar a operação protegida e regularizada. Posso levantar uma cotação?"

### Se SÓ TERCEIROS → Pular para Etapa 3 (Frota)

## ETAPA 3: FROTA
Pergunta: "A frota da empresa possui seguro ativo?"

**Se SIM:**
"Essa apólice vence em qual data?"
Depois: "Podemos participar da próxima cotação para avaliar valores e coberturas da frota?"

**Se NÃO:**
"Consigo cotar a frota completa e te apresentar um cenário claro de custo e cobertura. Podemos seguir?"

## ETAPA 4: ENCERRAMENTO / COLETA
Pergunta final:
"Posso levantar as informações básicas e te retornar com a análise de frota e carga?"

Se SIM → Coletar: CNPJ, quantidade de veículos, tipos de veículos, valor médio de carga, regiões atendidas

# REGRAS DE COMUNICAÇÃO
- Sem emojis
- Máximo 2 linhas por mensagem
- Tom comercial e consultivo
- Uma pergunta por vez
- Nunca repita nome do cliente mais de 2 vezes
- Nunca invente links ou URLs
- REGRA ANTI-ECO: Nunca repita ou resuma o que o cliente acabou de dizer. Vá direto para a próxima pergunta.',
  false, -- não é default
  true,  -- está ativo
  '{}'::text[], -- Sem keywords - ativação por metadata de prospecção
  'Oi! Que bom que respondeu. Você é quem decide ou participa da decisão sobre os seguros da empresa?',
  'Obrigado pelo retorno! Desculpe o contato.',
  '[
    {"id": "responsavel", "question": "Você é quem decide ou participa da decisão sobre os seguros da empresa?", "required": true},
    {"id": "tipo_frete", "question": "Vocês fazem frete próprio, frete para terceiros ou ambos?", "required": true},
    {"id": "seguro_carga_ativo", "question": "Hoje vocês possuem seguro de carga ativo?", "required": false},
    {"id": "vencimento_carga", "question": "Esse seguro de carga está vigente até qual data?", "required": false},
    {"id": "seguro_frota_ativo", "question": "A frota da empresa possui seguro ativo?", "required": true},
    {"id": "vencimento_frota", "question": "Essa apólice de frota vence em qual data?", "required": false},
    {"id": "cnpj", "question": "Qual o CNPJ da empresa?", "required": true},
    {"id": "qtd_veiculos", "question": "Quantos veículos têm na operação?", "required": true},
    {"id": "tipos_veiculos", "question": "Quais tipos de veículos (carretas, trucks, VUCs)?", "required": true},
    {"id": "valor_medio_carga", "question": "Qual o valor médio por carga?", "required": false},
    {"id": "regioes", "question": "Quais regiões ou estados atendem?", "required": true}
  ]'::jsonb,
  true,  -- audio habilitado
  'onwK4e9ZLuTAKqWW03F9', -- Daniel (voz masculina)
  'eleven_turbo_v2_5',
  0.75,
  0.80,
  0.30,
  1.0,
  true
);

-- 2. Criar Pipeline "Prospecção" vinculado ao Leonardo
INSERT INTO pipelines (name, slug, icon, color, agent_id, is_active)
SELECT 'Prospecção', 'prospeccao', '📞', '#f59e0b', id, true
FROM agents WHERE slug = 'leonardo';

-- 3. Criar stages do pipeline de Prospecção
INSERT INTO pipeline_stages (pipeline_id, title, color, position, is_system, is_active, ai_trigger_criteria)
SELECT 
  p.id,
  s.title,
  s.color,
  s.position,
  false,
  true,
  s.ai_trigger
FROM pipelines p
CROSS JOIN (VALUES
  ('Novo Lead', 'border-slate-500', 1, NULL),
  ('Aguardando Resposta', 'border-yellow-500', 2, NULL),
  ('Em Qualificação', 'border-blue-500', 3, NULL),
  ('Qualificado', 'border-cyan-500', 4, 'Lead confirmou interesse em cotação de carga e/ou frota, informou dados básicos como CNPJ, quantidade de veículos ou regiões atendidas. Mínimo 3 informações coletadas.'),
  ('Cotação Enviada', 'border-purple-500', 5, NULL),
  ('Ganho', 'border-emerald-500', 6, NULL),
  ('Perdido', 'border-red-500', 7, NULL)
) AS s(title, color, position, ai_trigger)
WHERE p.slug = 'prospeccao';