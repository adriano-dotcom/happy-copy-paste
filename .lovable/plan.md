

# Adicionar função de Alterar Senha

## Situação atual
- Não existe nenhuma funcionalidade de reset/alteração de senha no sistema
- Não há rota `/reset-password` nem chamada a `resetPasswordForEmail` ou `updateUser({ password })`
- A página de Auth (`src/pages/Auth.tsx`) já possui validação de senha (8+ chars, uppercase, number, special)

## Plano

### 1. Adicionar botão "Alterar Senha" na página /team (ou perfil do usuário logado)
- Na tela de Team, adicionar um botão no header ou ao lado do nome do usuário logado para "Alterar minha senha"
- Ao clicar, abre um modal com campos: senha atual (para confirmação), nova senha, confirmar nova senha
- Reutilizar a validação de senha que já existe em `Auth.tsx`
- Chamar `supabase.auth.updateUser({ password: novaSenha })` (funciona para o usuário autenticado)

### 2. Adicionar "Esqueci minha senha" na tela de login
- Adicionar link "Esqueci minha senha" na aba de Login em `Auth.tsx`
- Ao clicar, exibe campo de email e chama `supabase.auth.resetPasswordForEmail(email, { redirectTo: origin + '/reset-password' })`

### 3. Criar página `/reset-password`
- Nova página `src/pages/ResetPassword.tsx`
- Detecta token `type=recovery` na URL
- Exibe formulário para definir nova senha (com validação)
- Chama `supabase.auth.updateUser({ password })` para aplicar

### 4. Registrar rota no App.tsx
- Adicionar rota pública `/reset-password` apontando para `ResetPassword.tsx`

## Arquivos

| Arquivo | Mudança |
|---------|---------|
| `src/pages/Auth.tsx` | Adicionar link "Esqueci minha senha" + fluxo de envio de email |
| `src/pages/ResetPassword.tsx` | **Novo** - página de redefinição de senha |
| `src/components/Team.tsx` | Adicionar botão/modal "Alterar minha senha" para usuário logado |
| `src/App.tsx` | Adicionar rota `/reset-password` |

