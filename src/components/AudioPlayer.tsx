import React, { useState, useRef, useMemo } from 'react';
import { Play, Pause, Mic } from 'lucide-react';

interface AudioPlayerProps {
  messageId: string;
  mediaUrl: string | null;
  transcription?: string | null;
  isOutgoing: boolean;
  className?: string;
}

// Generate static waveform bars based on message ID for consistency
const generateWaveform = (msgId: string, barCount: number = 28): number[] => {
  const seed = msgId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return Array.from({ length: barCount }, (_, i) => {
    const variation = Math.sin(seed * 0.1 + i * 0.8) * 30 + Math.cos(seed * 0.05 + i * 0.3) * 20;
    return Math.min(100, Math.max(20, 50 + variation));
  });
};

// Format audio time helper
const formatAudioTime = (seconds: number): string => {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const AudioPlayer: React.FC<AudioPlayerProps> = ({
  messageId,
  mediaUrl,
  transcription,
  isOutgoing,
  className = ''
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);
  const audioRef = useRef<HTMLAudioElement>(null);

  const waveformBars = useMemo(() => generateWaveform(messageId), [messageId]);
  const progressPercent = duration ? (progress / duration) * 100 : 0;
  const hasTranscription = transcription && transcription !== '[áudio]';

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.playbackRate = speed;
      audio.play();
      setIsPlaying(true);
    }
  };

  const cycleSpeed = () => {
    const nextSpeed = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(nextSpeed);
    
    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = nextSpeed;
    }
  };

  const seekAudio = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    audio.currentTime = Math.max(0, Math.min(duration, percent * duration));
  };

  const [loadError, setLoadError] = useState(false);
  const [resolvedUrl, setResolvedUrl] = useState(mediaUrl);
  const [hasTriedFallback, setHasTriedFallback] = useState(false);

  // Try converting signed nina-audio URL to public URL on error
  const handleAudioError = () => {
    if (!hasTriedFallback && resolvedUrl && resolvedUrl.includes('/object/sign/nina-audio/')) {
      const publicUrl = resolvedUrl.split('?')[0].replace('/object/sign/', '/object/public/');
      setResolvedUrl(publicUrl);
      setHasTriedFallback(true);
    } else {
      setLoadError(true);
    }
  };

  // If no media URL, show unavailable state
  if (!mediaUrl) {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className={`flex items-center gap-3 min-w-[260px] py-2 px-3 rounded-lg ${
          isOutgoing ? 'bg-white/10' : 'bg-slate-700/50'
        }`}>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
            isOutgoing ? 'bg-white/20' : 'bg-slate-600'
          }`}>
            <Mic className={`w-5 h-5 ${isOutgoing ? 'text-white/60' : 'text-slate-400'}`} />
          </div>
          <div className="flex-1">
            <p className={`text-sm ${isOutgoing ? 'text-white/70' : 'text-slate-400'}`}>
              Áudio indisponível
            </p>
            <p className={`text-xs ${isOutgoing ? 'text-white/50' : 'text-slate-500'}`}>
              Arquivo não encontrado
            </p>
          </div>
        </div>
        {hasTranscription && (
          <div className={`flex items-start gap-2 pt-2 border-t ${
            isOutgoing ? 'border-white/20' : 'border-slate-700/50'
          }`}>
            <Mic className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
              isOutgoing ? 'text-cyan-200' : 'text-cyan-400'
            }`} />
            <p className={`text-sm italic leading-relaxed ${
              isOutgoing ? 'text-cyan-100/90' : 'text-slate-300/90'
            }`}>
              {transcription}
            </p>
          </div>
        )}
      </div>
    );
  }

  // If load error, show error state
  if (loadError) {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className={`flex items-center gap-3 min-w-[260px] py-2 px-3 rounded-lg ${
          isOutgoing ? 'bg-red-500/20' : 'bg-red-900/30'
        }`}>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
            isOutgoing ? 'bg-red-500/30' : 'bg-red-800/50'
          }`}>
            <Mic className={`w-5 h-5 ${isOutgoing ? 'text-red-200' : 'text-red-400'}`} />
          </div>
          <div className="flex-1">
            <p className={`text-sm ${isOutgoing ? 'text-red-100' : 'text-red-300'}`}>
              Erro ao carregar áudio
            </p>
            <p className={`text-xs ${isOutgoing ? 'text-red-200/70' : 'text-red-400/70'}`}>
              Não foi possível reproduzir
            </p>
          </div>
        </div>
        {hasTranscription && (
          <div className={`flex items-start gap-2 pt-2 border-t ${
            isOutgoing ? 'border-white/20' : 'border-slate-700/50'
          }`}>
            <Mic className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
              isOutgoing ? 'text-cyan-200' : 'text-cyan-400'
            }`} />
            <p className={`text-sm italic leading-relaxed ${
              isOutgoing ? 'text-cyan-100/90' : 'text-slate-300/90'
            }`}>
              {transcription}
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Audio player */}
      <div className="flex items-center gap-2 min-w-[260px] py-1">
        {/* Hidden audio element */}
        <audio
          ref={audioRef}
          src={resolvedUrl || undefined}
          onLoadedMetadata={(e) => {
            setDuration(e.currentTarget.duration);
          }}
          onTimeUpdate={(e) => {
            setProgress(e.currentTarget.currentTime);
          }}
          onEnded={() => setIsPlaying(false)}
          onError={handleAudioError}
        />
        
        {/* Play/Pause button */}
        <button 
          onClick={togglePlay}
          className={`flex items-center justify-center rounded-full transition-all shadow-md shrink-0 ${
            isOutgoing 
              ? 'w-10 h-10 bg-white text-cyan-600 hover:bg-cyan-50' 
              : 'w-12 h-12 bg-cyan-500 text-white hover:bg-cyan-400 shadow-lg'
          }`}
        >
          {isPlaying ? (
            <Pause className={`fill-current ${isOutgoing ? 'w-4 h-4' : 'w-5 h-5'}`} />
          ) : (
            <Play className={`ml-0.5 fill-current ${isOutgoing ? 'w-4 h-4' : 'w-5 h-5'}`} />
          )}
        </button>
        {/* Waveform and duration */}
        <div className="flex-1 flex flex-col gap-1 justify-center">
          {/* Waveform visualization */}
          <div 
            className="flex items-center gap-[2px] h-8 cursor-pointer"
            onClick={seekAudio}
          >
            {waveformBars.map((height, i) => {
              const barPercent = (i / waveformBars.length) * 100;
              const isPlayed = barPercent < progressPercent;
              
              // Animate bars near the current playback position
              const distanceFromProgress = Math.abs(barPercent - progressPercent);
              const isNearProgress = distanceFromProgress < 12;
              const shouldAnimate = isPlaying && isNearProgress;
              
              return (
                <div
                  key={i}
                  className={`w-[3px] rounded-full transition-colors duration-150 origin-center ${
                    isPlayed 
                      ? (isOutgoing ? 'bg-white' : 'bg-cyan-400')
                      : (isOutgoing ? 'bg-white/30' : 'bg-slate-500')
                  } ${shouldAnimate ? 'animate-waveform-pulse' : ''}`}
                  style={{ 
                    height: `${height}%`,
                    animationDelay: shouldAnimate ? `${(i % 4) * 0.08}s` : undefined
                  }}
                />
              );
            })}
          </div>
          
          {/* Duration */}
          <span className={`text-[10px] font-medium ${
            isOutgoing ? 'text-cyan-100' : 'text-slate-400'
          }`}>
            {formatAudioTime(progress)} / {formatAudioTime(duration)}
          </span>
        </div>
        
        {/* Speed control button - More visible for incoming messages */}
        <button
          onClick={cycleSpeed}
          className={`font-bold rounded-full transition-all shrink-0 ${
            isOutgoing 
              ? 'text-[10px] px-2 py-1 bg-white/20 text-white hover:bg-white/30'
              : 'text-sm px-4 py-2 bg-cyan-600 text-white hover:bg-cyan-500 shadow-lg border-2 border-cyan-400'
          }`}
        >
          {speed}x
        </button>
      </div>
      
      {/* Transcription indicator */}
      {hasTranscription && (
        <div className={`flex items-start gap-2 pt-2 border-t ${
          isOutgoing 
            ? 'border-white/20' 
            : 'border-slate-700/50'
        }`}>
          <Mic className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
            isOutgoing 
              ? 'text-cyan-200' 
              : 'text-cyan-400'
          }`} />
          <p className={`text-sm italic leading-relaxed ${
            isOutgoing 
              ? 'text-cyan-100/90' 
              : 'text-slate-300/90'
          }`}>
            {transcription}
          </p>
        </div>
      )}
    </div>
  );
};

export { AudioPlayer };
