

# Atualizar System Prompt do Atlas para v3.2

## O que será feito
Atualizar o campo `system_prompt` do agente Atlas na tabela `agents` com o conteúdo completo do arquivo `atlas_v3.2.txt` enviado.

## Como
Executar uma migration SQL que faz `UPDATE` no registro do agente Atlas (identificado por `slug = 'atlas'`) com o novo prompt v3.2 completo.

```sql
UPDATE public.agents 
SET system_prompt = '...conteúdo completo do atlas_v3.2.txt...',
    updated_at = now()
WHERE slug = 'atlas';
```

## Mudanças do v3.2 (changelog)
- Regra de abertura de alto impacto — primeira frase sempre com gancho regulatório
- Bloco de argumento regulatório ANTT/Lei 14.599/2023 com regra de uso único
- Encerramento "warm" para leads receptivos com vencimento 61-120 dias
- Variável `argumento_antt_usado` no estado para evitar repetição
- Dado de volume/NF como obrigatório no handoff de carga
- Objeção "nunca tive problema sem seguro" com resposta ANTT
- RC1 agora tem exceção para mensagens de encerramento
- RCTR-C explicado brevemente na primeira menção com leads menos técnicos

## Arquivos
Nenhum arquivo de código será alterado. Apenas uma migration SQL para atualizar o banco de dados.

