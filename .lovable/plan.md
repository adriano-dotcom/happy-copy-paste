

# Remover tom ameaçador da mensagem de abertura do Atlas

## Diagnóstico

A mensagem "Seguro de transportadora — e tem uma mudança regulatória chegando em julho que afeta diretamente quem opera com RNTRC" vem do **prompt do agente Atlas** armazenado no banco de dados (tabela `agents`, slug `atlas`).

Ela aparece em **3 lugares** no `system_prompt` do Atlas:

1. **Exemplo de resposta correta (RC1):** mostra essa frase como modelo
2. **Seção "ARGUMENTO REGULATÓRIO":** instrui o Atlas a usar a mudança da ANTT/julho como gancho de vendas
3. **Seção "PRIMEIRA RESPOSTA — REGRA DE OURO":** lista 3 modelos de abertura que todos usam tom regulatório/ameaçador

## Mudança proposta

Atualizar o `system_prompt` do Atlas no banco de dados via migration SQL para:

1. **Trocar os modelos de abertura** por versões consultivas e profissionais, sem tom de ameaça:
   - "Somos corretora especializada em seguros para transportadoras. Quero entender como está a proteção da sua operação hoje — frota e carga. Você é o responsável por essa área?"
   - "Trabalhamos com seguros para transportadoras em todo o Brasil. Posso te fazer umas perguntas rápidas sobre a situação atual de seguros da empresa?"

2. **Suavizar o argumento regulatório** — manter a informação da ANTT mas sem tom alarmista. Em vez de "corre risco de ter RNTRC suspenso", usar algo como "muitas empresas estão revisando suas apólices para se adequar às novas exigências".

3. **Atualizar o exemplo da RC1** para refletir o novo tom.

4. **Manter a regra de usar o argumento no máximo 1 vez** por conversa.

## Implementação

| O que | Como |
|-------|------|
| Prompt do Atlas | Migration SQL com `UPDATE agents SET system_prompt = '...' WHERE slug = 'atlas'` |

A migration vai substituir as 3 seções no prompt mantendo toda a estrutura restante intacta.

