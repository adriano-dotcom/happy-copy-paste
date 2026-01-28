
# Plano: Melhorias de UX - Badge, Empty States e Confirmacao

## Visao Geral

Implementacao de 3 melhorias prioritarias de UX que impactam diretamente a experiencia do usuario no CRM.

---

## 1. Badge Flutuante "Novas Mensagens" (#5)

### Problema
Quando o usuario esta lendo mensagens antigas (scroll acima), novas mensagens chegam mas ele nao percebe. Precisa de um indicador visual clicavel.

### Solucao
Criar um badge flutuante animado que aparece quando:
- O usuario esta com scroll acima do final
- Novas mensagens chegam na conversa ativa

### Implementacao

**Arquivo: `src/components/ChatInterface.tsx`**

1. Adicionar estados para controle de scroll:
```typescript
const [isScrolledUp, setIsScrolledUp] = useState(false);
const [newMessagesCount, setNewMessagesCount] = useState(0);
const messagesContainerRef = useRef<HTMLDivElement>(null);
```

2. Criar handler de scroll na area de mensagens (linha ~2296):
```typescript
const handleMessagesScroll = (e: React.UIEvent<HTMLDivElement>) => {
  const target = e.currentTarget;
  const isNearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 100;
  setIsScrolledUp(!isNearBottom);
  if (isNearBottom) setNewMessagesCount(0);
};
```

3. Detectar novas mensagens quando scrollado:
```typescript
useEffect(() => {
  if (isScrolledUp && activeChat?.messages) {
    // Comparar com quantidade anterior
    setNewMessagesCount(prev => prev + 1);
  }
}, [activeChat?.messages?.length]);
```

4. Renderizar badge flutuante (posicionado dentro da area de mensagens):
```tsx
{isScrolledUp && newMessagesCount > 0 && (
  <motion.button
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: 20 }}
    onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
    className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10 
               px-4 py-2 bg-cyan-600 hover:bg-cyan-700 
               text-white text-sm font-medium rounded-full 
               shadow-lg shadow-cyan-900/40 flex items-center gap-2"
  >
    <ChevronDown className="w-4 h-4" />
    {newMessagesCount} nova{newMessagesCount > 1 ? 's' : ''} mensagem{newMessagesCount > 1 ? 'ns' : ''}
  </motion.button>
)}
```

**Estimativa:** 45 minutos

---

## 2. Empty States Visuais (#1)

### Problema
Listas vazias mostram apenas "Nenhum item" sem contexto visual ou call-to-action, gerando sensacao de vazio.

### Solucao
Adicionar ilustracoes com icones grandes, texto explicativo e botao de acao em cada tela.

### Implementacao

**Criar componente reutilizavel: `src/components/ui/empty-state.tsx`**

```tsx
interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export const EmptyState: React.FC<EmptyStateProps> = ({ 
  icon, title, description, action 
}) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="w-20 h-20 rounded-full bg-slate-800/50 flex items-center justify-center mb-6">
      {icon}
    </div>
    <h3 className="text-lg font-semibold text-slate-200 mb-2">{title}</h3>
    <p className="text-sm text-slate-500 max-w-sm mb-6">{description}</p>
    {action && (
      <Button onClick={action.onClick} className="bg-cyan-600 hover:bg-cyan-700">
        <Plus className="w-4 h-4 mr-2" />
        {action.label}
      </Button>
    )}
  </div>
);
```

**Arquivo: `src/components/Contacts.tsx`**

Substituir a tabela vazia (quando `filteredContacts.length === 0`):
```tsx
<EmptyState
  icon={<Users className="w-10 h-10 text-slate-600" />}
  title="Nenhum contato encontrado"
  description={activeTab === 'outbound' 
    ? "Importe uma lista de contatos para comecar sua prospeccao outbound."
    : "Seus leads inbound aparecerao aqui quando entrarem em contato."}
  action={activeTab === 'outbound' ? {
    label: "Importar Contatos",
    onClick: () => setIsImportModalOpen(true)
  } : undefined}
/>
```

**Arquivo: `src/components/Kanban.tsx`**

Quando nao houver deals no pipeline selecionado:
```tsx
{deals.length === 0 && (
  <EmptyState
    icon={<Briefcase className="w-10 h-10 text-slate-600" />}
    title="Pipeline vazio"
    description="Adicione seu primeiro negocio para comecar a acompanhar o funil de vendas."
    action={{
      label: "Criar Negocio",
      onClick: () => setIsCreateModalOpen(true)
    }}
  />
)}
```

**Arquivo: `src/components/ChatInterface.tsx`**

Quando nao houver conversas (lista lateral vazia):
```tsx
{conversations.length === 0 && !loading && (
  <EmptyState
    icon={<MessageSquare className="w-10 h-10 text-slate-600" />}
    title="Nenhuma conversa"
    description="Quando seus leads enviarem mensagens, as conversas aparecerao aqui."
  />
)}
```

**Estimativa:** 1 hora

---

## 3. Modal "Type to Confirm" (#4)

### Problema
O `window.confirm()` nativo e inseguro (facil clicar sem querer) e visualmente inconsistente com o design do sistema.

### Solucao
Criar modal customizado onde o usuario precisa digitar uma palavra-chave (ex: "EXCLUIR") para confirmar acoes destrutivas.

### Implementacao

**Criar componente: `src/components/ui/type-to-confirm-dialog.tsx`**

```tsx
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from './alert-dialog';
import { Input } from './input';
import { Button } from './button';
import { AlertTriangle } from 'lucide-react';

interface TypeToConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText: string; // Texto que o usuario precisa digitar
  onConfirm: () => void;
  destructive?: boolean;
}

export const TypeToConfirmDialog: React.FC<TypeToConfirmDialogProps> = ({
  open, onOpenChange, title, description, confirmText, onConfirm, destructive = true
}) => {
  const [inputValue, setInputValue] = useState('');
  const isMatch = inputValue.toUpperCase() === confirmText.toUpperCase();

  const handleConfirm = () => {
    if (isMatch) {
      onConfirm();
      setInputValue('');
      onOpenChange(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-slate-900 border-slate-700">
        <AlertDialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <AlertDialogTitle className="text-slate-100">{title}</AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-slate-400 mt-4">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <div className="my-4">
          <p className="text-sm text-slate-300 mb-2">
            Digite <span className="font-bold text-red-400">{confirmText}</span> para confirmar:
          </p>
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={confirmText}
            className="bg-slate-950 border-slate-700 text-slate-100"
            autoFocus
          />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel 
            onClick={() => setInputValue('')}
            className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
          >
            Cancelar
          </AlertDialogCancel>
          <Button
            onClick={handleConfirm}
            disabled={!isMatch}
            className={destructive 
              ? "bg-red-600 hover:bg-red-700 disabled:bg-slate-700 disabled:text-slate-500"
              : "bg-cyan-600 hover:bg-cyan-700"
            }
          >
            Confirmar Exclusao
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
```

**Arquivo: `src/components/Kanban.tsx`**

Substituir `window.confirm` por modal (linha 238-250):

```tsx
// Estado
const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
const [dealToDelete, setDealToDelete] = useState<string | null>(null);

// Handler atualizado
const handleDeleteDeal = (dealId: string) => {
  setDealToDelete(dealId);
  setDeleteConfirmOpen(true);
};

const confirmDeleteDeal = async () => {
  if (!dealToDelete) return;
  try {
    await api.deleteDeal(dealToDelete);
    setDeals(deals.filter(d => d.id !== dealToDelete));
    setSelectedDeal(null);
    toast.success("Negocio excluido com sucesso");
  } catch (error) {
    toast.error("Erro ao excluir negocio");
  }
  setDealToDelete(null);
};

// No JSX (antes do fechamento do componente)
<TypeToConfirmDialog
  open={deleteConfirmOpen}
  onOpenChange={setDeleteConfirmOpen}
  title="Excluir Negocio"
  description="Esta acao ira remover permanentemente este negocio e todas as atividades relacionadas. Esta acao nao pode ser desfeita."
  confirmText="EXCLUIR"
  onConfirm={confirmDeleteDeal}
/>
```

**Estimativa:** 45 minutos

---

## Resumo de Arquivos

| Arquivo | Acao |
|---------|------|
| `src/components/ui/empty-state.tsx` | Criar novo |
| `src/components/ui/type-to-confirm-dialog.tsx` | Criar novo |
| `src/components/ChatInterface.tsx` | Editar (badge + empty state) |
| `src/components/Contacts.tsx` | Editar (empty state) |
| `src/components/Kanban.tsx` | Editar (empty state + modal confirmacao) |

---

## Ordem de Implementacao

1. **TypeToConfirmDialog** - Componente isolado, facil de testar
2. **EmptyState** - Componente isolado, aplicar em multiplas telas
3. **Badge Novas Mensagens** - Integrar no ChatInterface

**Tempo total estimado:** 2h 30min

---

## Secao Tecnica

### Dependencias
- `framer-motion` (ja instalado) para animacoes do badge
- `@radix-ui/react-alert-dialog` (ja instalado) para o modal

### Consideracoes de Performance
- O handler de scroll usa throttling implicito do React
- O badge usa AnimatePresence para evitar re-renders desnecessarios
- Empty states sao componentes puros sem efeitos colaterais
