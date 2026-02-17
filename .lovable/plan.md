

# Analise Profunda de UX: Sistema "Tremendo" ao Mudar de Tela

## Problema Identificado

Ao navegar entre telas (ex: Chat -> Dashboard -> Contatos), todo o sistema parece "recarregar" e ficar estranho. A causa raiz sao multiplos problemas arquiteturais que se acumulam.

## Causas Raiz Encontradas

### 1. Nenhum cache de dados - tudo recarrega do zero
O projeto tem `@tanstack/react-query` instalado mas **nunca e usado**. Todos os componentes usam `useEffect + useState` manuais. Isso significa que toda vez que voce sai de uma tela e volta, os dados sao buscados do zero, mostrando loading spinners desnecessarios.

### 2. UnreadMessagesProvider faz consultas excessivas (N+1)
O componente que conta mensagens nao lidas executa uma consulta individual para **cada conversa** ativa. Com 50 conversas, sao 100+ consultas ao banco a cada atualizacao. E como ele escuta eventos em tempo real, qualquer mensagem nova dispara tudo de novo, causando lentidao global.

### 3. useUserRole recarrega em cada tela admin
Cada `AdminRoute` (Equipe, Funcoes, Prospeccao, Campanhas, Configuracoes) cria uma instancia separada do `useUserRole`, cada uma fazendo sua propria consulta ao banco. Ao navegar entre telas admin, multiplicas consultas redundantes sao disparadas.

### 4. animate-pulse em elementos persistentes
Elementos como o avatar glow no `ContactDetailsDrawer` usam `animate-pulse` infinito, que pode causar re-paints constantes do navegador, contribuindo para a sensacao de instabilidade.

## Plano de Correcao

### Etapa 1: Adicionar React Query (cache global de dados)
- Criar `QueryClientProvider` no `App.tsx` com `staleTime` de 5 minutos
- Isso permite que dados fiquem em cache e nao sejam re-buscados ao voltar para uma tela

### Etapa 2: Cachear o papel do usuario (useUserRole)
- Converter `useUserRole` para usar React Query com `staleTime: Infinity`
- O papel do usuario nao muda durante a sessao, entao uma unica consulta e suficiente
- Elimina 5+ consultas redundantes ao navegar entre telas admin

### Etapa 3: Otimizar UnreadMessagesProvider
- Substituir o loop N+1 por uma unica consulta SQL agregada usando `.rpc()` ou uma query otimizada
- Adicionar debounce de 2 segundos nos eventos realtime para evitar rafagas de re-fetch
- Isso reduz drasticamente a carga no banco e os re-renders da Sidebar

### Etapa 4: Remover animate-pulse de elementos persistentes
- Substituir `animate-pulse` por gradientes estaticos em elementos que ficam visiveis por longos periodos (como glow de avatares)
- Manter `animate-pulse` apenas em indicadores temporarios de loading

### Etapa 5: Estabilizar transicoes de rota
- Adicionar `key` estavel no `Outlet` do layout para evitar desmontagem desnecessaria
- Garantir que o `ProtectedRoute` e `AdminRoute` nao causem flash de loading quando dados ja estao em cache

## Detalhes Tecnicos

### Arquivo: `src/App.tsx`
- Importar `QueryClient` e `QueryClientProvider` do `@tanstack/react-query`
- Envolver a arvore de componentes com `QueryClientProvider`
- Configurar `defaultOptions.queries.staleTime = 5 * 60 * 1000` e `refetchOnWindowFocus: false`

### Arquivo: `src/hooks/useUserRole.ts`
- Substituir `useEffect + useState` por `useQuery` do React Query
- Usar `queryKey: ['user-role', user?.id]`
- Configurar `staleTime: Infinity` (papel nao muda na sessao)
- Manter a mesma interface publica (`role`, `isAdmin`, `isOperator`, `loading`)

### Arquivo: `src/contexts/UnreadMessagesContext.tsx`
- Substituir o loop N+1 (linhas 89-151) por uma query unica otimizada:
  - Buscar conversas ativas com contagem de mensagens nao lidas em um unico SELECT com subquery
  - Usar `LEFT JOIN` ou subquery para contar `unread_count` por conversa
- Adicionar debounce de 2s no callback do realtime para evitar rafagas
- Usar `useRef` com timestamp para ignorar refetches dentro da janela de debounce

### Arquivo: `src/components/ContactDetailsDrawer.tsx`
- Linha 170: Remover `animate-pulse` do glow do avatar
- Substituir por gradiente estatico com `opacity` fixa

### Arquivo: `src/components/chat/LeadScoreBadge.tsx`
- Linhas 54 e 64: Condicionar `animate-pulse` para nao executar indefinidamente
- Usar `animation-iteration-count: 3` via classe customizada para pulsar apenas 3 vezes

### Arquivo: `src/components/AdminRoute.tsx`
- Usar o hook `useUserRole` refatorado (que agora usa React Query)
- O cache evita loading spinner redundante ao navegar entre telas admin

## Resultado Esperado

- Navegacao entre telas sem "tremor" ou recarregamento visual
- Dados permanecem em cache ao voltar para telas ja visitadas
- Sidebar estavel sem re-renders excessivos
- Consultas ao banco reduzidas em ~80% durante navegacao normal
- Papel do usuario consultado uma unica vez por sessao

