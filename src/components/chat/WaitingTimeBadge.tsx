import React, { useState, useEffect } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

interface WaitingTimeBadgeProps {
  lastMessageAt: string;
  lastMessageFromUser: boolean;
  compact?: boolean;
}

export const WaitingTimeBadge: React.FC<WaitingTimeBadgeProps> = ({ 
  lastMessageAt, 
  lastMessageFromUser,
  compact = false 
}) => {
  const [waitingMinutes, setWaitingMinutes] = useState(0);

  useEffect(() => {
    const calculateWaiting = () => {
      if (!lastMessageFromUser) return 0;
      const lastMsgTime = new Date(lastMessageAt);
      const now = new Date();
      const diffMs = now.getTime() - lastMsgTime.getTime();
      return Math.floor(diffMs / (1000 * 60));
    };

    setWaitingMinutes(calculateWaiting());

    const interval = setInterval(() => {
      setWaitingMinutes(calculateWaiting());
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [lastMessageAt, lastMessageFromUser]);

  // Don't show if not waiting for response (last message was from agent)
  if (!lastMessageFromUser || waitingMinutes < 1) {
    return null;
  }

  const getUrgencyStyle = () => {
    if (waitingMinutes >= 30) {
      return {
        color: 'bg-red-500/20 text-red-400 border-red-500/30',
        pulse: true,
        icon: AlertTriangle
      };
    }
    if (waitingMinutes >= 10) {
      return {
        color: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        pulse: false,
        icon: Clock
      };
    }
    return {
      color: 'bg-slate-700/50 text-slate-400 border-slate-600/30',
      pulse: false,
      icon: Clock
    };
  };

  const formatWaitingTime = () => {
    if (waitingMinutes >= 60) {
      const hours = Math.floor(waitingMinutes / 60);
      const mins = waitingMinutes % 60;
      return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
    }
    return `${waitingMinutes}min`;
  };

  const urgency = getUrgencyStyle();
  const Icon = urgency.icon;

  if (compact) {
    return (
      <span 
        className={`px-1.5 py-0.5 rounded text-[9px] font-medium flex items-center gap-0.5 border ${urgency.color} ${urgency.pulse ? 'animate-pulse' : ''}`}
        title={`Aguardando resposta há ${formatWaitingTime()}`}
      >
        <Icon className="w-2.5 h-2.5" />
        {formatWaitingTime()}
      </span>
    );
  }

  return (
    <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${urgency.color} ${urgency.pulse ? 'animate-pulse' : ''}`}>
      <Icon className="w-4 h-4" />
      <div className="flex flex-col">
        <span className="text-xs font-medium">Aguardando</span>
        <span className="text-[10px] opacity-70">{formatWaitingTime()}</span>
      </div>
    </div>
  );
};
