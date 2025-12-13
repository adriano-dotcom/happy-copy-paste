import React from 'react';
import { Flame, Thermometer, Snowflake } from 'lucide-react';
import { ClientMemory } from '@/types';

interface LeadScoreBadgeProps {
  clientMemory: ClientMemory;
  compact?: boolean;
}

export const LeadScoreBadge: React.FC<LeadScoreBadgeProps> = ({ clientMemory, compact = false }) => {
  const score = clientMemory?.lead_profile?.qualification_score || 0;
  
  // Determine lead temperature based on score
  const getLeadTemperature = () => {
    if (score >= 70) {
      return {
        label: 'Hot',
        icon: Flame,
        color: 'bg-red-500/20 text-red-400 border-red-500/30',
        bgGlow: 'shadow-red-500/20'
      };
    }
    if (score >= 40) {
      return {
        label: 'Warm',
        icon: Thermometer,
        color: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
        bgGlow: 'shadow-amber-500/20'
      };
    }
    return {
      label: 'Cold',
      icon: Snowflake,
      color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      bgGlow: 'shadow-blue-500/20'
    };
  };

  const temp = getLeadTemperature();
  const Icon = temp.icon;

  if (compact) {
    return (
      <span 
        className={`px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-0.5 border ${temp.color}`}
        title={`Lead Score: ${score}%`}
      >
        <Icon className="w-2.5 h-2.5" />
        {score > 0 && <span>{score}</span>}
      </span>
    );
  }

  return (
    <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${temp.color} ${temp.bgGlow} shadow-lg`}>
      <Icon className="w-4 h-4" />
      <div className="flex flex-col">
        <span className="text-xs font-bold">{temp.label} Lead</span>
        <span className="text-[10px] opacity-70">Score: {score}%</span>
      </div>
    </div>
  );
};
