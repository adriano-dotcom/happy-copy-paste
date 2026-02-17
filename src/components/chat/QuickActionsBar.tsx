import React, { useState } from 'react';
import { CheckCircle, Calendar, Send, Loader2, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { UIConversation } from '@/types';
import { useQueryClient } from '@tanstack/react-query';
import { ScheduleCallbackModal } from './ScheduleCallbackModal';
import { SendToPipedriveModal } from './SendToPipedriveModal';

interface QuickActionsBarProps {
  activeChat: UIConversation;
  existingDeal: any;
  dealStages: any[];
  onDealUpdated: (deal: any) => void;
  onRefetch: () => void;
}

export function QuickActionsBar({
  activeChat,
  existingDeal,
  dealStages,
  onDealUpdated,
  onRefetch
}: QuickActionsBarProps) {
  const queryClient = useQueryClient();
  const [isQualifying, setIsQualifying] = useState(false);
  const [isCallingIris, setIsCallingIris] = useState(false);
  const [showCallbackModal, setShowCallbackModal] = useState(false);
  const [showPipedriveModal, setShowPipedriveModal] = useState(false);

  // Find "Qualificado pela IA" stage
  const qualifiedStage = dealStages.find(
    s => s.title.toLowerCase().includes('qualificado') && s.title.toLowerCase().includes('ia')
  );

  // Check if already qualified
  const isAlreadyQualified = existingDeal?.stageId === qualifiedStage?.id;

  const handleQuickQualify = async () => {
    if (!existingDeal || !qualifiedStage) {
      toast.error('Estágio "Qualificado pela IA" não encontrado');
      return;
    }

    if (isAlreadyQualified) {
      toast.info('Lead já está qualificado');
      return;
    }

    setIsQualifying(true);
    try {
      // Update deal stage
      const { error: dealError } = await supabase
        .from('deals')
        .update({ 
          stage_id: qualifiedStage.id,
          stage: 'qualified'
        })
        .eq('id', existingDeal.id);

      if (dealError) throw dealError;

      // Update qualification score in nina_context
      const currentContext = activeChat.ninaContext || {};
      const updatedContext = {
        ...currentContext,
        qualification_score: Math.max((currentContext as any)?.qualification_score || 0, 75)
      };

      await supabase
        .from('conversations')
        .update({ nina_context: updatedContext })
        .eq('id', activeChat.id);

      // Update local state
      onDealUpdated({ ...existingDeal, stageId: qualifiedStage.id });
      
      toast.success('Lead qualificado!', {
        description: `Movido para "${qualifiedStage.title}"`,
        action: {
          label: 'Ver Kanban',
          onClick: () => window.location.href = `/kanban?pipeline=${existingDeal.pipelineId}`
        }
      });

      onRefetch();
    } catch (error) {
      console.error('Error qualifying lead:', error);
      toast.error('Erro ao qualificar lead');
    } finally {
      setIsQualifying(false);
    }
  };

  const handleCallIris = async () => {
    if (!activeChat.contactId) return;
    setIsCallingIris(true);
    try {
      const { error } = await supabase.functions.invoke('trigger-elevenlabs-call', {
        body: { contact_id: activeChat.contactId, force: true }
      });
      if (error) throw error;
      toast.success('Ligação da Iris disparada!');
      queryClient.invalidateQueries({ queryKey: ['voice-qualification', activeChat.contactId] });
      queryClient.invalidateQueries({ queryKey: ['contact-voice-qualifications', activeChat.contactId] });
    } catch (error: any) {
      console.error('Error calling Iris:', error);
      toast.error(error?.message || 'Erro ao disparar ligação');
    } finally {
      setIsCallingIris(false);
    }
  };

  const handleOpenPipedriveModal = () => {
    if (!activeChat.contactId) {
      toast.error('Contato não encontrado');
      return;
    }
    setShowPipedriveModal(true);
  };

  if (!existingDeal) return null;

  return (
    <>
      <div className="space-y-3">
        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Ações Rápidas
        </h4>
      <div className="flex gap-3">
          {/* Qualificar */}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleQuickQualify}
            disabled={isQualifying || isAlreadyQualified}
            className={`flex-1 text-xs transition-all duration-200 ${
              isAlreadyQualified 
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' 
                : 'bg-slate-800/60 text-amber-400 border border-amber-500/30 hover:bg-amber-500/15 hover:border-amber-500/50 hover:shadow-[0_0_12px_rgba(245,158,11,0.2)]'
            }`}
          >
            {isQualifying ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
            ) : (
              <CheckCircle className="w-4 h-4 mr-1.5" />
            )}
            {isAlreadyQualified ? 'Qualificado' : 'Qualificar'}
          </Button>

          {/* Callback */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowCallbackModal(true)}
            className="flex-1 text-xs bg-slate-800/60 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/15 hover:border-cyan-500/50 hover:shadow-[0_0_12px_rgba(6,182,212,0.2)] transition-all duration-200"
          >
            <Calendar className="w-4 h-4 mr-1.5" />
            Callback
          </Button>

          {/* Pipedrive */}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleOpenPipedriveModal}
            className="flex-1 text-xs bg-slate-800/60 text-purple-400 border border-purple-500/30 hover:bg-purple-500/15 hover:border-purple-500/50 hover:shadow-[0_0_12px_rgba(168,85,247,0.2)] transition-all duration-200"
          >
            <Send className="w-4 h-4 mr-1.5" />
          </Button>
        </div>

        {/* Ligar com Iris */}
        <Button
          size="sm"
          variant="ghost"
          onClick={handleCallIris}
          disabled={isCallingIris}
          className="w-full text-xs bg-gradient-to-r from-violet-600/20 to-purple-600/20 text-violet-300 border border-violet-500/30 hover:from-violet-600/30 hover:to-purple-600/30 hover:border-violet-400/50 hover:shadow-[0_0_12px_rgba(139,92,246,0.3)] transition-all duration-200 disabled:opacity-50"
        >
          {isCallingIris ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Mic className="w-4 h-4 mr-1.5" />}
          {isCallingIris ? 'Disparando...' : 'Ligar com Iris'}
        </Button>
      </div>

      <ScheduleCallbackModal
        open={showCallbackModal}
        onOpenChange={setShowCallbackModal}
        dealId={existingDeal.id}
        contactName={activeChat.contactName}
        onScheduled={() => {
          setShowCallbackModal(false);
          onRefetch();
        }}
      />

      <SendToPipedriveModal
        open={showPipedriveModal}
        onOpenChange={setShowPipedriveModal}
        contact={{
          id: activeChat.contactId,
          name: activeChat.contactName,
          phone_number: activeChat.contactPhone,
          email: activeChat.contactEmail,
          company: activeChat.contactCompany,
          tags: activeChat.tags
        }}
        dealId={existingDeal?.id}
        conversationId={activeChat.id}
        onSent={onRefetch}
        initialNotes={activeChat.notes}
      />
    </>
  );
}
