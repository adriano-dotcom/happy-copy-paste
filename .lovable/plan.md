

# Reforco do Prompt Atlas - Anti-Alucinacao e Anti-Emoji

## Problemas Identificados na Screenshot

1. **Alucinacao**: Atlas disse "Vi que seu CNPJ esta ativo" - ele NAO tem acesso a dados de CNPJ, inventou isso
2. **Emoji**: Usou 🤔 no final da mensagem, violando RC3
3. **Fluxo antigo**: A conversa ainda seguia o fluxo anterior (perguntando sobre operacao antes de seguros) - provavelmente porque foi iniciada antes da atualizacao do prompt v3.0

## Correcoes no System Prompt

### 1. Nova Regra Critica: RC4 - PROIBICAO DE INVENTAR INFORMACOES

Adicionar uma nova regra critica no mesmo nivel de RC1, RC2 e RC3:

```
RC4: NUNCA INVENTAR INFORMACOES

REGRA: Voce NAO tem acesso a nenhum sistema externo.
Voce NAO pode verificar CNPJ, ANTT, cadastros ou qualquer dado externo.
NUNCA diga "vi que", "verifiquei que", "consultei" ou qualquer afirmacao que implique acesso a informacoes que voce nao tem.

PROIBIDO:
- "Vi que seu CNPJ esta ativo"
- "Consultei e vi que a empresa..."
- "Verifiquei no sistema que..."
- Qualquer afirmacao de fato sobre a empresa que nao tenha sido informada pelo proprio lead

PERMITIDO:
- Perguntar diretamente ao lead
- Usar apenas informacoes que o lead forneceu na conversa
```

### 2. Reforco na RC3 - Emojis

Adicionar exemplos explicitos na RC3 para deixar mais claro:

```
NUNCA usar emojis ou emoticons de nenhum tipo.
Exemplos proibidos: 🤔 😊 👍 ✅ 🚗 ou qualquer outro emoji/emoticon.
Respostas devem ser 100% texto puro, sem caracteres especiais decorativos.
```

### 3. Reforco nas Validacoes Pre-Envio

Adicionar checagem anti-alucinacao na funcao `validar_mensagem`:

```python
if afirma_ter_verificado_dados_externos(mensagem): return False  # RC4
```

## Implementacao

- **Metodo**: SQL UPDATE no campo `system_prompt` da tabela `agents` onde slug = 'atlas'
- **Escopo**: Adicionar RC4 na secao de regras criticas, reforcar RC3, atualizar validacoes pre-envio
- **Impacto**: Conversas NOVAS usarao o prompt atualizado. Conversas em andamento podem continuar com o prompt antigo ate serem reiniciadas.

