import React, { useState } from 'react';
import { AlertTriangle, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface FailedProcessingBannerProps {
  conversationId: string;
  failedCount: number;
  errorMessage: string | null;
  failedItemIds: string[];
  onReprocessed: () => void;
}

export const FailedProcessingBanner: React.FC<FailedProcessingBannerProps> = ({
  conversationId,
  failedCount,
  errorMessage,
  failedItemIds,
  onReprocessed,
}) => {
  const [isReprocessing, setIsReprocessing] = useState(false);

  const handleReprocess = async () => {
    if (failedItemIds.length === 0) return;
    
    setIsReprocessing(true);
    try {
      // Reset failed items to pending status
      const { error } = await supabase
        .from('nina_processing_queue')
        .update({
          status: 'pending',
          error_message: null,
          processed_at: null,
          scheduled_for: new Date().toISOString(),
          retry_count: 0,
        })
        .in('id', failedItemIds);

      if (error) throw error;

      toast.success('Reprocessamento iniciado!', {
        description: 'A IA vai processar as mensagens novamente',
      });

      onReprocessed();
    } catch (error) {
      console.error('[FailedProcessingBanner] Error reprocessing:', error);
      toast.error('Erro ao reprocessar', {
        description: 'Tente novamente ou contate o suporte',
      });
    } finally {
      setIsReprocessing(false);
    }
  };

  // Truncate error message for display
  const displayError = errorMessage 
    ? errorMessage.replace('[ALERTA ENVIADO', '').substring(0, 80) + (errorMessage.length > 80 ? '...' : '')
    : null;

  return (
    <div className="mx-4 mb-2 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
        
        <div className="flex-1 min-w-0">
          <p className="text-sm text-orange-300 font-medium">
            {failedCount === 1 
              ? '1 mensagem não processada' 
              : `${failedCount} mensagens não processadas`}
          </p>
          {displayError && (
            <p className="text-xs text-orange-400/80 mt-0.5 truncate">
              {displayError}
            </p>
          )}
        </div>
        
        <Button
          size="sm"
          variant="outline"
          className="border-orange-500/50 text-orange-300 hover:bg-orange-500/20 hover:text-orange-200 flex-shrink-0"
          onClick={handleReprocess}
          disabled={isReprocessing}
        >
          {isReprocessing ? (
            <>
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              Processando...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-1.5" />
              Reprocessar
            </>
          )}
        </Button>
      </div>
    </div>
  );
};
