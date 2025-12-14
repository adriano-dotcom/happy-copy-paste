import React, { useState } from 'react';
import { Wand2, Heart, Briefcase, Smile, Sparkles, Loader2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type ToneType = 'friendly' | 'professional' | 'sympathetic' | 'clearer';

interface ToneOption {
  value: ToneType;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const toneOptions: ToneOption[] = [
  {
    value: 'friendly',
    label: 'Mais Amigável',
    icon: <Heart className="w-4 h-4" />,
    description: 'Torna a mensagem calorosa e empática'
  },
  {
    value: 'professional',
    label: 'Mais Profissional',
    icon: <Briefcase className="w-4 h-4" />,
    description: 'Linguagem corporativa e objetiva'
  },
  {
    value: 'sympathetic',
    label: 'Mais Simpático',
    icon: <Smile className="w-4 h-4" />,
    description: 'Adiciona cordialidade e simpatia'
  },
  {
    value: 'clearer',
    label: 'Melhorar Clareza',
    icon: <Sparkles className="w-4 h-4" />,
    description: 'Reescreve para ser mais claro'
  }
];

interface MessageToneAssistantProps {
  originalMessage: string;
  onApplySuggestion: (newMessage: string) => void;
  contactName?: string;
  lastMessages?: string[];
  disabled?: boolean;
}

export const MessageToneAssistant: React.FC<MessageToneAssistantProps> = ({
  originalMessage,
  onApplySuggestion,
  contactName,
  lastMessages = [],
  disabled = false
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const handleToneSelect = async (tone: ToneType) => {
    if (!originalMessage.trim()) {
      toast.error('Digite uma mensagem primeiro');
      return;
    }

    setIsLoading(true);
    setIsOpen(false);

    try {
      const { data, error } = await supabase.functions.invoke('rewrite-message', {
        body: {
          originalMessage: originalMessage.trim(),
          tone,
          context: {
            contactName: contactName || 'Cliente',
            lastMessages: lastMessages.slice(-3)
          }
        }
      });

      if (error) throw error;

      if (data?.rewrittenMessage) {
        onApplySuggestion(data.rewrittenMessage);
        toast.success('Mensagem reformulada!');
      } else {
        throw new Error('Resposta inválida da IA');
      }
    } catch (error) {
      console.error('Error rewriting message:', error);
      toast.error('Erro ao reformular mensagem');
    } finally {
      setIsLoading(false);
    }
  };

  // Only show when there's text and not disabled
  if (!originalMessage.trim() || disabled) {
    return null;
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
          disabled={isLoading}
          title="Ajustar tom da mensagem"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Wand2 className="w-4 h-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-card border-border">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Ajustar Tom da Mensagem
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {toneOptions.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => handleToneSelect(option.value)}
            className="flex items-start gap-3 py-2 cursor-pointer"
          >
            <span className="text-primary mt-0.5">{option.icon}</span>
            <div className="flex flex-col">
              <span className="font-medium text-sm">{option.label}</span>
              <span className="text-xs text-muted-foreground">{option.description}</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
