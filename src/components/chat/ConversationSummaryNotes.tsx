import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { UIMessage } from '@/types';

interface ConversationSummaryNotesProps {
  conversationId: string;
  contactId: string;
  messages: UIMessage[];
  initialNotes: string | null;
  contactName: string;
  agentName?: string;
}

export function ConversationSummaryNotes({
  conversationId,
  contactId,
  messages,
  initialNotes,
  contactName,
  agentName = 'Adri'
}: ConversationSummaryNotesProps) {
  const [notes, setNotes] = useState(initialNotes || '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Reset notes when contact changes
  useEffect(() => {
    setNotes(initialNotes || '');
    setHasChanges(false);
  }, [contactId, initialNotes]);

  const handleNotesChange = (value: string) => {
    setNotes(value);
    setHasChanges(value !== (initialNotes || ''));
  };

  const handleGenerateSummary = async () => {
    if (messages.length === 0) {
      toast.error('Nenhuma mensagem para resumir');
      return;
    }

    setIsGenerating(true);

    try {
      // Get last 20 messages for context
      const recentMessages = messages.slice(-20).map(m => ({
        content: m.content,
        from_type: m.fromType,
        sent_at: m.timestamp
      }));

      const { data, error } = await supabase.functions.invoke('generate-summary', {
        body: {
          messages: recentMessages,
          contactName,
          agentName
        }
      });

      if (error) throw error;

      if (data?.summary) {
        // Append to existing notes or replace
        const newNotes = notes.trim() 
          ? `${notes}\n\n---\n📋 Resumo gerado em ${new Date().toLocaleString('pt-BR')}:\n${data.summary}`
          : data.summary;
        
        setNotes(newNotes);
        setHasChanges(true);
        toast.success('Resumo gerado com sucesso');
      }
    } catch (error) {
      console.error('Error generating summary:', error);
      toast.error('Erro ao gerar resumo');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveNotes = async () => {
    setIsSaving(true);

    try {
      const { error } = await supabase
        .from('contacts')
        .update({ notes })
        .eq('id', contactId);

      if (error) throw error;

      setHasChanges(false);
      toast.success('Notas salvas');
    } catch (error) {
      console.error('Error saving notes:', error);
      toast.error('Erro ao salvar notas');
    } finally {
      setIsSaving(false);
    }
  };

  // Debounced auto-save
  const debouncedSave = useCallback(() => {
    if (hasChanges && notes.trim()) {
      const timeout = setTimeout(() => {
        handleSaveNotes();
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [hasChanges, notes]);

  useEffect(() => {
    return debouncedSave();
  }, [debouncedSave]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Notas Internas
        </h4>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleGenerateSummary}
          disabled={isGenerating || messages.length === 0}
          className="h-7 px-2 text-xs gap-1.5 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Gerando...
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              Gerar Resumo
            </>
          )}
        </Button>
      </div>

      <textarea 
        className="w-full bg-slate-950/50 border border-slate-800 rounded-lg p-3 text-sm text-slate-300 placeholder:text-slate-600 focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50 outline-none resize-none transition-all"
        rows={6}
        placeholder="Adicione observações sobre este lead ou clique em 'Gerar Resumo' para criar um resumo automático..."
        value={notes}
        onChange={(e) => handleNotesChange(e.target.value)}
      />

      {hasChanges && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSaveNotes}
            disabled={isSaving}
            className="h-7 px-3 text-xs gap-1.5 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                Salvar
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
