import React, { useState } from 'react';
import { CheckCircle, Calendar, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { UIConversation } from '@/types';
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
  const [isQualifying, setIsQualifying] = useState(false);
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
        <div className="flex gap-2">
          {/* Qualificar */}
          <Button
            size="sm"
            variant="outline"
            onClick={handleQuickQualify}
            disabled={isQualifying || isAlreadyQualified}
            className={`flex-1 text-xs ${
              isAlreadyQualified 
                ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' 
                : 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:border-amber-500/50'
            }`}
          >
            {isQualifying ? (
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
            ) : (
              <CheckCircle className="w-3 h-3 mr-1" />
            )}
            {isAlreadyQualified ? 'Qualificado' : 'Qualificar'}
          </Button>

          {/* Agendar Callback */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowCallbackModal(true)}
            className="flex-1 text-xs border-blue-500/30 text-blue-400 hover:bg-blue-500/10 hover:border-blue-500/50"
          >
            <Calendar className="w-3 h-3 mr-1" />
            Callback
          </Button>

          {/* Enviar Contato Pipedrive */}
          <Button
            size="sm"
            variant="outline"
            onClick={handleOpenPipedriveModal}
            className="flex-1 text-xs border-purple-500/30 text-purple-400 hover:bg-purple-500/10 hover:border-purple-500/50"
          >
            <Send className="w-3 h-3 mr-1" />
            Contato
          </Button>
        </div>
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
        onSent={onRefetch}
      />
    </>
  );
}
