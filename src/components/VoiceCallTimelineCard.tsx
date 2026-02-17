import React, { useState } from 'react';
import { Bot, Phone, PhoneMissed, PhoneOff, Clock, Star, ChevronDown, ChevronUp, FileText, ArrowRight, Calendar, Loader2 } from 'lucide-react';
import { VoiceQualification } from '@/hooks/useVoiceQualification';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from './ui/button';

interface VoiceCallTimelineCardProps {
  qualification: VoiceQualification;
}

const VoiceCallTimelineCard: React.FC<VoiceCallTimelineCardProps> = ({ qualification }) => {
  const [showTranscript, setShowTranscript] = useState(false);
  const [isHangingUp, setIsHangingUp] = useState(false);
  const queryClient = useQueryClient();

  const handleHangup = async () => {
    setIsHangingUp(true);
    try {
      const { error } = await supabase.functions.invoke('elevenlabs-hangup', {
        body: { vq_id: qualification.id, elevenlabs_conversation_id: qualification.elevenlabs_conversation_id }
      });
      if (error) throw error;
      toast.success('Ligação encerrada com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['voice-qualification', qualification.contact_id] });
    } catch (err: any) {
      console.error('Error hanging up:', err);
      toast.error('Erro ao encerrar ligação');
    } finally {
      setIsHangingUp(false);
    }
  };

  const formatTime = (dateStr: string | null): string => {
    if (!dateStr) return '--:--';
    return new Date(dateStr).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo'
    });
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'completed':
        return {
          icon: Phone,
          label: 'Ligação IA Concluída',
          bgColor: 'bg-violet-500/10',
          borderColor: 'border-violet-500/30',
          textColor: 'text-violet-400',
          iconBg: 'bg-violet-500/20'
        };
      case 'no_answer':
      case 'failed':
        return {
          icon: PhoneMissed,
          label: status === 'no_answer' ? 'Não Atendeu' : 'Falha na Ligação',
          bgColor: 'bg-amber-500/10',
          borderColor: 'border-amber-500/30',
          textColor: 'text-amber-400',
          iconBg: 'bg-amber-500/20'
        };
      case 'in_progress':
        return {
          icon: Phone,
          label: 'Em Andamento',
          bgColor: 'bg-blue-500/10',
          borderColor: 'border-blue-500/30',
          textColor: 'text-blue-400',
          iconBg: 'bg-blue-500/20'
        };
      case 'pending':
      case 'scheduled':
        return {
          icon: Clock,
          label: 'Agendada',
          bgColor: 'bg-slate-500/10',
          borderColor: 'border-slate-500/30',
          textColor: 'text-slate-400',
          iconBg: 'bg-slate-500/20'
        };
      case 'cancelled':
        return {
          icon: PhoneOff,
          label: 'Cancelada',
          bgColor: 'bg-slate-500/10',
          borderColor: 'border-slate-500/30',
          textColor: 'text-slate-400',
          iconBg: 'bg-slate-500/20'
        };
      default:
        return {
          icon: Phone,
          label: 'Ligação IA',
          bgColor: 'bg-violet-500/10',
          borderColor: 'border-violet-500/30',
          textColor: 'text-violet-400',
          iconBg: 'bg-violet-500/20'
        };
    }
  };

  const getQualificationBadge = () => {
    if (!qualification.qualification_result) return null;
    const isQualified = qualification.qualification_result.toLowerCase().includes('qualificado') &&
      !qualification.qualification_result.toLowerCase().includes('não');
    return {
      label: isQualified ? 'Qualificado' : 'Não Qualificado',
      className: isQualified
        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
        : 'bg-red-500/20 text-red-400 border-red-500/30'
    };
  };

  const getInterestStars = () => {
    if (!qualification.interest_level) return null;
    const level = qualification.interest_level.toLowerCase();
    if (level.includes('alto') || level.includes('high')) return 3;
    if (level.includes('médio') || level.includes('medio') || level.includes('medium')) return 2;
    if (level.includes('baixo') || level.includes('low')) return 1;
    return null;
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'completed': return 'Concluída';
      case 'no_answer': return 'Sem resposta';
      case 'failed': return 'Falha';
      case 'not_contacted': return 'Não contatado';
      case 'in_progress': return 'Em andamento';
      case 'pending':
      case 'scheduled': return 'Agendada';
      case 'cancelled': return 'Cancelada';
      default: return status;
    }
  };

  const config = getStatusConfig(qualification.status);
  const StatusIcon = config.icon;
  const qualBadge = getQualificationBadge();
  const stars = getInterestStars();

  return (
    <div className="flex justify-center my-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className={`w-full max-w-md ${config.bgColor} ${config.borderColor} border rounded-xl p-4 shadow-lg backdrop-blur-sm`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 ${config.iconBg} rounded-full flex items-center justify-center relative`}>
              <StatusIcon className={`w-5 h-5 ${config.textColor}`} />
              <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-violet-600 rounded-full flex items-center justify-center border border-slate-900">
                <Bot className="w-2.5 h-2.5 text-white" />
              </div>
            </div>
            <div>
              <p className={`font-semibold ${config.textColor} flex items-center gap-2`}>
                {config.label}
                {['completed', 'no_answer', 'failed', 'not_contacted'].includes(qualification.status)
                  ? <span className="text-[10px] px-1.5 py-0.5 bg-violet-500/20 text-violet-300 rounded-full font-medium">elevenlabs</span>
                  : <span className="text-[10px] px-1.5 py-0.5 bg-violet-500/20 text-violet-300 rounded-full font-medium">Iris</span>
                }
              </p>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Clock className="w-3 h-3" />
                <span>{formatTime(qualification.called_at || qualification.created_at)}</span>
                <span className="text-slate-600">·</span>
                <span className={config.textColor}>{getStatusLabel(qualification.status)}</span>
                {qualification.attempt_number > 1 && (
                  <>
                    <span className="text-slate-600">·</span>
                    <span>Tentativa {qualification.attempt_number}/{qualification.max_attempts}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          {['calling', 'in_progress'].includes(qualification.status) && (
            <Button
              onClick={handleHangup}
              disabled={isHangingUp}
              size="sm"
              className="bg-red-500/20 border border-red-500/30 hover:bg-red-500/30 text-red-300 text-xs h-8 px-3"
              variant="outline"
            >
              {isHangingUp ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <PhoneOff className="w-3.5 h-3.5 mr-1" />}
              Encerrar
            </Button>
          )}
        </div>

        {/* Qualification Result + Interest */}
        {(qualBadge || stars) && (
          <div className="flex items-center gap-2 mb-3">
            {qualBadge && (
              <span className={`text-xs px-2 py-1 rounded-full border font-medium ${qualBadge.className}`}>
                {qualBadge.label}
              </span>
            )}
            {stars && (
              <div className="flex items-center gap-0.5">
                {[1, 2, 3].map(i => (
                  <Star
                    key={i}
                    className={`w-3.5 h-3.5 ${i <= stars ? 'text-yellow-400 fill-yellow-400' : 'text-slate-600'}`}
                  />
                ))}
                <span className="text-xs text-slate-400 ml-1">{qualification.interest_level}</span>
              </div>
            )}
          </div>
        )}

        {/* Summary */}
        {qualification.call_summary && (
          <div className="mb-3 p-3 bg-slate-800/50 rounded-lg">
            <p className="text-xs text-slate-300 leading-relaxed">{qualification.call_summary}</p>
          </div>
        )}

        {/* Next Step */}
        {qualification.next_step && (
          <div className="flex items-start gap-2 mb-3 text-xs">
            <ArrowRight className="w-3.5 h-3.5 text-cyan-400 mt-0.5 shrink-0" />
            <span className="text-slate-300"><span className="text-cyan-400 font-medium">Próximo passo:</span> {qualification.next_step}</span>
          </div>
        )}

        {/* Best Contact Time */}
        {qualification.best_contact_time && (
          <div className="flex items-start gap-2 mb-3 text-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
            <span className="text-slate-400">Melhor horário: {qualification.best_contact_time}</span>
          </div>
        )}

        {/* Observations */}
        {qualification.observations && (
          <div className="mb-3 text-xs text-slate-400 italic">
            {qualification.observations}
          </div>
        )}

        {/* Transcript Toggle */}
        {qualification.full_transcript && (
          <div>
            <button
              onClick={() => setShowTranscript(!showTranscript)}
              className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-300 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Ver transcrição</span>
              {showTranscript ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showTranscript && (
              <div className="mt-2 p-3 bg-slate-800/50 rounded-lg text-xs text-slate-300 leading-relaxed max-h-60 overflow-y-auto custom-scrollbar whitespace-pre-wrap">
                {qualification.full_transcript}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default VoiceCallTimelineCard;
