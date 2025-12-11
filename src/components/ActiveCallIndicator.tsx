import React, { useState, useEffect } from 'react';
import { Phone, Loader2, PhoneOff } from 'lucide-react';
import { CallLog } from '@/hooks/useActiveCall';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ActiveCallIndicatorProps {
  call: CallLog;
  onDismiss?: () => void;
}

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const ActiveCallIndicator: React.FC<ActiveCallIndicatorProps> = ({ call, onDismiss }) => {
  const [elapsed, setElapsed] = useState(0);
  const [isCancelling, setIsCancelling] = useState(false);

  // Calculate elapsed time for active calls
  useEffect(() => {
    if (!['answered', 'ringing', 'dialing'].includes(call.status)) return;

    const startTime = call.answered_at 
      ? new Date(call.answered_at).getTime() 
      : new Date(call.started_at).getTime();

    const updateElapsed = () => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [call.status, call.answered_at, call.started_at]);

  const handleHangup = async () => {
    setIsCancelling(true);
    try {
      // Call the hangup edge function to actually terminate the call
      const { data, error } = await supabase.functions.invoke('api4com-hangup', {
        body: { 
          call_log_id: call.id,
          api4com_call_id: call.api4com_call_id 
        }
      });

      if (error) throw error;
      
      toast.info('Chamada encerrada');
      onDismiss?.();
    } catch (error) {
      console.error('Error hanging up call:', error);
      toast.error('Erro ao encerrar chamada');
    } finally {
      setIsCancelling(false);
    }
  };

  const getStatusConfig = () => {
    switch (call.status) {
      case 'dialing':
        return { label: 'Discando...', color: 'from-blue-600 to-blue-700', pulse: true };
      case 'ringing':
        return { label: 'Tocando...', color: 'from-amber-600 to-amber-700', pulse: true };
      case 'answered':
        return { label: 'Em chamada', color: 'from-emerald-600 to-emerald-700', pulse: false };
      default:
        return { label: call.status, color: 'from-slate-600 to-slate-700', pulse: false };
    }
  };

  const config = getStatusConfig();

  return (
    <div 
      className={`
        flex items-center gap-3 px-4 py-2.5 rounded-lg 
        bg-gradient-to-r ${config.color}
        border border-white/10 shadow-lg
        ${config.pulse ? 'animate-pulse' : ''}
      `}
    >
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-white/20">
        {config.pulse ? (
          <Loader2 className="w-4 h-4 text-white animate-spin" />
        ) : (
          <Phone className="w-4 h-4 text-white" />
        )}
      </div>
      
      <div className="flex-1">
        <div className="text-sm font-medium text-white">{config.label}</div>
        <div className="text-xs text-white/70">
          {call.status === 'answered' && (
            <span className="font-mono">{formatDuration(elapsed)}</span>
          )}
          {call.status !== 'answered' && (
            <span>Ramal {call.extension}</span>
          )}
        </div>
      </div>

      <button
        onClick={handleHangup}
        disabled={isCancelling}
        className="flex items-center justify-center w-8 h-8 rounded-full bg-red-500/80 hover:bg-red-500 transition-colors disabled:opacity-50"
        title="Encerrar chamada"
      >
        {isCancelling ? (
          <Loader2 className="w-4 h-4 text-white animate-spin" />
        ) : (
          <PhoneOff className="w-4 h-4 text-white" />
        )}
      </button>
    </div>
  );
};
