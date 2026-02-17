import React, { useState } from 'react';
import { Phone, Mic, ChevronDown, ChevronUp, RotateCcw, Loader2, Clock, Star, MessageSquare, Target, PhoneOff } from 'lucide-react';
import { Button } from './ui/button';
import { useVoiceQualification } from '@/hooks/useVoiceQualification';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

interface VoiceQualificationSectionProps {
  contactId: string | null;
  contactName?: string;
}

const statusConfig: Record<string, { label: string; gradient: string; text: string; border: string }> = {
  pending: { label: 'Agendada', gradient: 'from-amber-500/20 to-yellow-500/20', text: 'text-amber-300', border: 'border-amber-400/30' },
  scheduled: { label: 'Agendada', gradient: 'from-amber-500/20 to-yellow-500/20', text: 'text-amber-300', border: 'border-amber-400/30' },
  calling: { label: 'Em Ligação', gradient: 'from-blue-500/20 to-cyan-500/20', text: 'text-blue-300', border: 'border-blue-400/30' },
  completed: { label: 'Concluída', gradient: 'from-emerald-500/20 to-green-500/20', text: 'text-emerald-300', border: 'border-emerald-400/30' },
  no_answer: { label: 'Sem Resposta', gradient: 'from-orange-500/20 to-amber-500/20', text: 'text-orange-300', border: 'border-orange-400/30' },
  busy: { label: 'Ocupado', gradient: 'from-orange-500/20 to-amber-500/20', text: 'text-orange-300', border: 'border-orange-400/30' },
  failed: { label: 'Falhou', gradient: 'from-red-500/20 to-rose-500/20', text: 'text-red-300', border: 'border-red-400/30' },
  not_contacted: { label: 'Não Contactado', gradient: 'from-slate-500/20 to-gray-500/20', text: 'text-slate-300', border: 'border-slate-400/30' },
};

const qualificationColors: Record<string, { label: string; text: string }> = {
  qualificado: { label: 'Qualificado', text: 'text-emerald-400' },
  nao_qualificado: { label: 'Não Qualificado', text: 'text-red-400' },
  sem_interesse: { label: 'Sem Interesse', text: 'text-slate-400' },
};

const interestColors: Record<string, { label: string; text: string; stars: number }> = {
  alto: { label: 'Alto', text: 'text-emerald-400', stars: 3 },
  medio: { label: 'Médio', text: 'text-amber-400', stars: 2 },
  baixo: { label: 'Baixo', text: 'text-red-400', stars: 1 },
};

const VoiceQualificationSection: React.FC<VoiceQualificationSectionProps> = ({ contactId, contactName }) => {
  const { data: vq, isLoading } = useVoiceQualification(contactId);
  const [showTranscript, setShowTranscript] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isHangingUp, setIsHangingUp] = useState(false);
  const queryClient = useQueryClient();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-slate-500 text-sm p-3">
        <Loader2 className="w-4 h-4 animate-spin" />
        Carregando...
      </div>
    );
  }

  if (!vq) return null;

  const status = statusConfig[vq.status] || statusConfig.pending;
  const qualification = vq.qualification_result ? qualificationColors[vq.qualification_result] : null;
  const interest = vq.interest_level ? interestColors[vq.interest_level] : null;

  const handleRetry = async () => {
    if (!contactId) return;
    setIsRetrying(true);
    try {
      const { error } = await supabase.functions.invoke('trigger-elevenlabs-call', {
        body: { contact_id: contactId, force: true }
      });
      if (error) throw error;
      toast.success('Ligação disparada com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['voice-qualification', contactId] });
    } catch (err: any) {
      console.error('Error retrying call:', err);
      toast.error('Erro ao disparar ligação');
    } finally {
      setIsRetrying(false);
    }
  };

  const handleHangup = async () => {
    if (!vq) return;
    setIsHangingUp(true);
    try {
      const { error } = await supabase.functions.invoke('elevenlabs-hangup', {
        body: { vq_id: vq.id, elevenlabs_conversation_id: vq.elevenlabs_conversation_id }
      });
      if (error) throw error;
      toast.success('Ligação encerrada com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['voice-qualification', contactId] });
    } catch (err: any) {
      console.error('Error hanging up:', err);
      toast.error('Erro ao encerrar ligação');
    } finally {
      setIsHangingUp(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Status + Attempts */}
      <div className="flex items-center justify-between">
        <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold border bg-gradient-to-r ${status.gradient} ${status.text} ${status.border}`}>
          {status.label}
        </span>
        <span className="text-xs text-slate-500">
          {vq.attempt_number}/{vq.max_attempts} tentativas
        </span>
      </div>

      {/* Qualification Result + Interest */}
      {(qualification || interest) && (
        <div className="flex items-center gap-4">
          {qualification && (
            <div className="flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-slate-500" />
              <span className={`text-sm font-medium ${qualification.text}`}>{qualification.label}</span>
            </div>
          )}
          {interest && (
            <div className="flex items-center gap-1.5">
              <div className="flex gap-0.5">
                {[1, 2, 3].map(i => (
                  <Star key={i} className={`w-3 h-3 ${i <= interest.stars ? interest.text + ' fill-current' : 'text-slate-600'}`} />
                ))}
              </div>
              <span className={`text-xs ${interest.text}`}>{interest.label}</span>
            </div>
          )}
        </div>
      )}

      {/* Summary */}
      {vq.call_summary && (
        <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.03]">
          <div className="flex items-center gap-1.5 mb-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-xs text-slate-500">Resumo</span>
          </div>
          <p className="text-sm text-slate-300">{vq.call_summary}</p>
        </div>
      )}

      {/* Next Step */}
      {vq.next_step && (
        <div className="flex items-start gap-2 text-sm">
          <Target className="w-3.5 h-3.5 text-violet-400 mt-0.5 shrink-0" />
          <div>
            <span className="text-xs text-slate-500 block">Próximo passo</span>
            <span className="text-slate-300">{vq.next_step}</span>
          </div>
        </div>
      )}

      {/* Best Contact Time */}
      {vq.best_contact_time && (
        <div className="flex items-start gap-2 text-sm">
          <Clock className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
          <div>
            <span className="text-xs text-slate-500 block">Melhor horário</span>
            <span className="text-slate-300">{vq.best_contact_time}</span>
          </div>
        </div>
      )}

      {/* Transcript toggle */}
      {vq.full_transcript && (
        <div>
          <button
            onClick={() => setShowTranscript(!showTranscript)}
            className="flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            {showTranscript ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {showTranscript ? 'Ocultar transcrição' : 'Ver transcrição completa'}
          </button>
          {showTranscript && (
            <pre className="mt-2 p-3 rounded-lg bg-white/[0.02] border border-white/[0.03] text-xs text-slate-400 whitespace-pre-wrap max-h-60 overflow-y-auto font-mono">
              {vq.full_transcript}
            </pre>
          )}
        </div>
      )}

      {/* Hangup Button */}
      {['calling', 'in_progress'].includes(vq.status) && (
        <Button
          onClick={handleHangup}
          disabled={isHangingUp}
          size="sm"
          className="w-full bg-red-500/20 border border-red-500/30 hover:bg-red-500/30 text-red-300 text-xs"
          variant="outline"
        >
          {isHangingUp ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <PhoneOff className="w-3.5 h-3.5 mr-1.5" />}
          Encerrar Ligação
        </Button>
      )}

      {/* Retry Button */}
      {['completed', 'failed', 'not_contacted', 'no_answer'].includes(vq.status) && (
        <Button
          onClick={handleRetry}
          disabled={isRetrying}
          size="sm"
          className="w-full bg-gradient-to-r from-cyan-500/20 to-teal-500/20 border border-cyan-500/30 hover:from-cyan-500/30 hover:to-teal-500/30 text-cyan-300 text-xs"
          variant="outline"
        >
          {isRetrying ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 mr-1.5" />}
          Religar
        </Button>
      )}
    </div>
  );
};

export default VoiceQualificationSection;
