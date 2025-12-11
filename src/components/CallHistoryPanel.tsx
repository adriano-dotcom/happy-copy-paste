import React from 'react';
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, PlayCircle, Loader2 } from 'lucide-react';
import { CallLog } from '@/hooks/useActiveCall';

interface CallHistoryPanelProps {
  calls: CallLog[];
  loading?: boolean;
}

const formatDuration = (seconds: number | null): string => {
  if (!seconds) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatTime = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Hoje';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Ontem';
  }
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

const getStatusConfig = (status: string) => {
  switch (status) {
    case 'completed':
      return { icon: PhoneOutgoing, color: 'text-emerald-400', bg: 'bg-emerald-500/10', label: 'Concluída' };
    case 'answered':
      return { icon: Phone, color: 'text-cyan-400', bg: 'bg-cyan-500/10', label: 'Em andamento' };
    case 'ringing':
      return { icon: PhoneIncoming, color: 'text-amber-400', bg: 'bg-amber-500/10', label: 'Tocando' };
    case 'dialing':
      return { icon: Phone, color: 'text-blue-400', bg: 'bg-blue-500/10', label: 'Discando' };
    case 'no_answer':
      return { icon: PhoneMissed, color: 'text-orange-400', bg: 'bg-orange-500/10', label: 'Não atendeu' };
    case 'busy':
      return { icon: PhoneMissed, color: 'text-amber-400', bg: 'bg-amber-500/10', label: 'Ocupado' };
    case 'failed':
      return { icon: PhoneMissed, color: 'text-red-400', bg: 'bg-red-500/10', label: 'Falhou' };
    default:
      return { icon: Phone, color: 'text-slate-400', bg: 'bg-slate-500/10', label: status };
  }
};

export const CallHistoryPanel: React.FC<CallHistoryPanelProps> = ({ calls, loading }) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
      </div>
    );
  }

  if (calls.length === 0) {
    return (
      <div className="text-center py-6">
        <Phone className="w-8 h-8 text-slate-600 mx-auto mb-2" />
        <p className="text-sm text-slate-500">Nenhuma ligação registrada</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {calls.map((call) => {
        const config = getStatusConfig(call.status);
        const Icon = config.icon;
        const isActive = ['dialing', 'ringing', 'answered'].includes(call.status);

        return (
          <div
            key={call.id}
            className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
              isActive 
                ? 'bg-cyan-500/10 border-cyan-500/30 animate-pulse' 
                : 'bg-slate-800/50 border-slate-700/50 hover:bg-slate-800'
            }`}
          >
            <div className={`w-8 h-8 rounded-full ${config.bg} flex items-center justify-center`}>
              <Icon className={`w-4 h-4 ${config.color}`} />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium ${config.color}`}>
                  {config.label}
                </span>
                {isActive && (
                  <span className="flex items-center gap-1 text-[10px] text-cyan-400">
                    <Loader2 className="w-3 h-3 animate-spin" />
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                <span>{formatDate(call.started_at)}</span>
                <span>•</span>
                <span>{formatTime(call.started_at)}</span>
                {call.duration_seconds && call.duration_seconds > 0 && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatDuration(call.duration_seconds)}
                    </span>
                  </>
                )}
              </div>
            </div>

            {call.record_url && (
              <a
                href={call.record_url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-md hover:bg-slate-700 transition-colors"
                title="Ouvir gravação"
              >
                <PlayCircle className="w-4 h-4 text-slate-400 hover:text-cyan-400" />
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
};
