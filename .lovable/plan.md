
# Fix: Modal Discreto quando Auto-Attendant esta Ativo

## Problema
Quando o Auto-Attendant esta ativo e a Iris atende as chamadas automaticamente, o modal grande de chamada (`IncomingCallModal`) ainda aparece para os operadores humanos nas outras paginas (`/chat`, `/dashboard`, etc.), bloqueando a tela inteira.

O codigo de supressao ja existe no `useIncomingWhatsAppCall`, mas pode haver uma corrida de tempo (race condition) entre o INSERT da chamada e a consulta ao flag `auto_attendant_active`. Alem disso, mesmo que funcione, o usuario quer poder **monitorar** as chamadas sendo atendidas pela Iris sem ser bloqueado pelo modal.

## Solucao

Substituir a logica binaria (mostrar ou nao o modal) por uma logica de 3 estados:
1. **Auto-attendant desligado**: Modal completo (comportamento atual)
2. **Auto-attendant ligado**: Banner discreto no topo da tela, sem bloquear a interface
3. **Auto-attendant ligado + chamada ja tratada**: Banner desaparece apos alguns segundos

### Etapa 1: Hook retorna flag de supressao em vez de esconder silenciosamente

No `useIncomingWhatsAppCall.ts`:
- Em vez de `return` silencioso quando `auto_attendant_active === true`, retornar a chamada com um flag `suppressedByAutoAttendant: true`
- Isso permite que o componente pai decida como exibir (modal cheio vs banner discreto)

### Etapa 2: Criar componente `AutoAttendantCallBanner`

Componente pequeno e discreto que aparece quando `suppressedByAutoAttendant === true`:
- Barra fina no topo da tela (nao bloqueia interacao)
- Mostra: nome do contato, numero, indicador "Iris atendendo..."
- Desaparece automaticamente quando a chamada muda de status (answered, ended, etc.)
- Animacao suave de entrada/saida

### Etapa 3: Atualizar `AppLayout` no `App.tsx`

- Renderizar o `AutoAttendantCallBanner` quando a chamada esta suprimida
- Manter o `IncomingCallModal` apenas para chamadas nao suprimidas
- Logica: se `suppressedByAutoAttendant` -> banner; senao -> modal completo

### Etapa 4: Garantir que o flag e setado antes da primeira chamada

No `useWhatsAppAutoAttendant.activate()`, o `await` no update do banco ja esta correto, mas adicionar um pequeno delay (200ms) entre setar o flag e comecar a escutar chamadas para garantir que a propagacao realtime nao perca o timing.

---

## Detalhes Tecnicos

### Arquivos modificados:

1. **`src/hooks/useIncomingWhatsAppCall.ts`**
   - Adicionar campo `suppressedByAutoAttendant` no estado retornado
   - Quando `auto_attendant_active === true`: setar a chamada com flag de supressao em vez de ignorar completamente
   - Nao tocar ringtone quando suprimida

2. **`src/components/AutoAttendantCallBanner.tsx`** (novo)
   - Banner discreto fixo no topo
   - Mostra icone de robo/IA + nome do contato + "Iris esta atendendo"
   - Barra de progresso animada
   - Auto-dismiss apos a chamada sair de `ringing`
   - Estilo: bg-cyan-900/80, texto pequeno, sem bloqueio de cliques

3. **`src/App.tsx`**
   - Importar e renderizar `AutoAttendantCallBanner` dentro do `AppLayout`
   - Condicional: se chamada suprimida, mostrar banner; se nao, mostrar modal

4. **`src/hooks/useWhatsAppAutoAttendant.ts`**
   - Nenhuma mudanca estrutural, apenas garantir que `activate()` aguarda o update do banco antes de escutar chamadas
