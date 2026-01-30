
# Plano: Melhorar Usabilidade do Menu de Filtros dos Chats

## Problema Identificado

O menu de filtros do chat tem 3 linhas de pills horizontais que são difíceis de navegar:

1. **Pipeline Filter Pills** - Todos, Transporte, Saúde, etc.
2. **Status Filter Pills** - Status, Sofia, Humano, Pausado, etc.
3. **Owner Filter Pills** - Operadores (Sofia, Bárbara, Garcia, etc.)

### Problemas Atuais:
- **Scrollbar invisível** (`scrollbar-none`) - usuário não sabe que pode rolar
- **Roda do mouse não funciona** - scroll vertical não é convertido para horizontal
- **Sem indicadores visuais** - não há feedback de que existe mais conteúdo
- **Arrastar é pouco intuitivo** - em desktop, espera-se usar roda do mouse

## Solução Proposta

### 1. Criar Componente Reutilizável: `HorizontalScrollPills`

Um componente dedicado para scroll horizontal de pills com:
- Handler `onWheel` que converte scroll vertical em horizontal
- Gradientes de fade nas bordas indicando mais conteúdo
- Setas de navegação opcionais (aparecem ao hover)
- Scrollbar sutil visível
- Suporte a arrastar (drag scroll) para touch

### 2. Recursos do Componente

| Recurso | Descrição |
|---------|-----------|
| Wheel scroll | Roda do mouse rola horizontalmente |
| Fade indicators | Gradientes nas bordas quando há mais conteúdo |
| Setas de navegação | Botões `<` `>` aparecem no hover |
| Scrollbar sutil | Barra de scroll fina visível |
| Drag scroll | Arrastar com mouse funciona |

### 3. Aplicação nas 3 Áreas de Filtros

Substituir os divs atuais pelo novo componente:

```
┌─────────────────────────────────────────────────────────────┐
│ Chats Ativos                                                │
├─────────────────────────────────────────────────────────────┤
│ ◀ [Todos] [Transporte] [Saúde] [Prospecção] [Arqui...] ▶   │ ← Fade + setas
│ ◀ [Status] [Sofia] [Humano] [Pausado] [Atlas] [...]    ▶   │ ← Fade + setas
│ ◀ [Todos] [Sofia] [Bárbara] [Garcia] [Alessandro...]   ▶   │ ← Fade + setas
└─────────────────────────────────────────────────────────────┘
```

## Implementação

### Arquivo 1: Novo Componente

**`src/components/ui/horizontal-scroll-pills.tsx`**

Componente que encapsula:
- Container com `ref` para controle de scroll
- Handler `onWheel` que faz `scrollLeft += deltaY`
- Estados para detectar se pode rolar esquerda/direita
- Gradientes CSS posicionados absolutamente nas bordas
- Botões de seta opcionais com click handlers

### Arquivo 2: Atualização do ChatInterface

**`src/components/ChatInterface.tsx`**

- Importar o novo componente
- Substituir os 3 divs de filtros (`overflow-x-auto scrollbar-none`) pelo `HorizontalScrollPills`
- Manter a mesma estrutura interna de botões

## Resumo de Alterações

| Arquivo | Ação |
|---------|------|
| `src/components/ui/horizontal-scroll-pills.tsx` | **Criar** - Novo componente |
| `src/components/ChatInterface.tsx` | **Editar** - Usar novo componente nos 3 filtros |
| `src/index.css` | **Editar** (opcional) - Estilos de fade/gradiente |

## Comportamento Esperado

1. **Scroll com roda do mouse**: Funciona naturalmente
2. **Indicadores visuais**: Gradientes mostram que há mais conteúdo
3. **Setas de navegação**: Clique para scroll suave esquerda/direita
4. **Touch/arrastar**: Continua funcionando como antes
5. **Scrollbar visível**: Barra fina aparece ao interagir

---

## Seção Técnica

### Implementação do Wheel Handler

```typescript
const handleWheel = (e: React.WheelEvent) => {
  if (containerRef.current) {
    e.preventDefault();
    containerRef.current.scrollLeft += e.deltaY;
    updateScrollState();
  }
};
```

### Gradientes de Fade

```css
/* Esquerda */
.fade-left::before {
  background: linear-gradient(to right, rgb(15 23 42), transparent);
}

/* Direita */  
.fade-right::after {
  background: linear-gradient(to left, rgb(15 23 42), transparent);
}
```

### Detecção de Scroll Disponível

```typescript
const updateScrollState = () => {
  const el = containerRef.current;
  if (el) {
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }
};
```
