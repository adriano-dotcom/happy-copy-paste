import React, { useState, useRef } from 'react';
import { Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, Play, Pause, Volume2, Loader2 } from 'lucide-react';
import { CallLog } from '@/hooks/useActiveCall';

interface CallHistoryPanelProps {
  calls: CallLog[];
  loading?: boolean;
  compact?: boolean;
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
    case 'cancelled':
      return { icon: PhoneMissed, color: 'text-slate-400', bg: 'bg-slate-500/10', label: 'Cancelada' };
    case 'timeout':
      return { icon: PhoneMissed, color: 'text-slate-400', bg: 'bg-slate-500/10', label: 'Timeout' };
    default:
      return { icon: Phone, color: 'text-slate-400', bg: 'bg-slate-500/10', label: status };
  }
};

// Inline Audio Player Component
const AudioPlayer: React.FC<{ url: string }> = ({ url }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const togglePlay = async () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      setIsLoading(true);
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (error) {
        console.error('Error playing audio:', error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const formatAudioTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="mt-2 p-2 bg-slate-900/50 rounded-lg border border-slate-700/50">
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        preload="metadata"
      />
      
      <div className="flex items-center gap-2">
        <button
          onClick={togglePlay}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-cyan-600 hover:bg-cyan-500 transition-colors"
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 text-white animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-4 h-4 text-white" />
          ) : (
            <Play className="w-4 h-4 text-white ml-0.5" />
          )}
        </button>

        <div className="flex-1 flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeek}
            className="flex-1 h-1 bg-slate-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400"
          />
          <span className="text-xs text-slate-500 font-mono min-w-[70px] text-right">
            {formatAudioTime(currentTime)} / {formatAudioTime(duration)}
          </span>
        </div>

        <Volume2 className="w-4 h-4 text-slate-500" />
      </div>
    </div>
  );
};

export const CallHistoryPanel: React.FC<CallHistoryPanelProps> = ({ calls, loading, compact = false }) => {
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null);

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

  const displayCalls = compact ? calls.slice(0, 5) : calls;

  return (
    <div className="space-y-2">
      {displayCalls.map((call) => {
        const config = getStatusConfig(call.status);
        const Icon = config.icon;
        const isActive = ['dialing', 'ringing', 'answered'].includes(call.status);
        const isExpanded = expandedCallId === call.id;
        const hasRecording = !!call.record_url;

        return (
          <div
            key={call.id}
            className={`rounded-lg border transition-colors ${
              isActive 
                ? 'bg-cyan-500/10 border-cyan-500/30 animate-pulse' 
                : 'bg-slate-800/50 border-slate-700/50 hover:bg-slate-800'
            }`}
          >
            <div 
              className={`flex items-center gap-3 p-3 ${hasRecording ? 'cursor-pointer' : ''}`}
              onClick={() => hasRecording && setExpandedCallId(isExpanded ? null : call.id)}
            >
              <div className={`w-8 h-8 rounded-full ${config.bg} flex items-center justify-center flex-shrink-0`}>
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
                  {hasRecording && (
                    <span className="flex items-center gap-1 text-[10px] text-slate-500">
                      <Volume2 className="w-3 h-3" />
                      Gravação
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
            </div>

            {/* Expanded Audio Player */}
            {isExpanded && call.record_url && (
              <div className="px-3 pb-3">
                <AudioPlayer url={call.record_url} />
              </div>
            )}
          </div>
        );
      })}

      {compact && calls.length > 5 && (
        <p className="text-xs text-slate-500 text-center py-2">
          + {calls.length - 5} chamadas anteriores
        </p>
      )}
    </div>
  );
};
