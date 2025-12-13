import React from 'react';
import { Card } from '@/components/ui/card';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProspectingKPICardProps {
  title: string;
  value: string | number;
  trend: string;
  trendUp: boolean;
  icon: React.ReactNode;
  color: 'violet' | 'cyan' | 'rose' | 'emerald';
  invertTrend?: boolean;
}

const colorClasses = {
  violet: {
    bg: 'from-violet-500/20 to-purple-500/20',
    border: 'border-violet-500/30',
    icon: 'text-violet-400',
    glow: 'bg-violet-500/10',
  },
  cyan: {
    bg: 'from-cyan-500/20 to-blue-500/20',
    border: 'border-cyan-500/30',
    icon: 'text-cyan-400',
    glow: 'bg-cyan-500/10',
  },
  rose: {
    bg: 'from-rose-500/20 to-red-500/20',
    border: 'border-rose-500/30',
    icon: 'text-rose-400',
    glow: 'bg-rose-500/10',
  },
  emerald: {
    bg: 'from-emerald-500/20 to-green-500/20',
    border: 'border-emerald-500/30',
    icon: 'text-emerald-400',
    glow: 'bg-emerald-500/10',
  },
};

export const ProspectingKPICard: React.FC<ProspectingKPICardProps> = ({
  title,
  value,
  trend,
  trendUp,
  icon,
  color,
  invertTrend = false,
}) => {
  const colors = colorClasses[color];
  const isPositiveTrend = invertTrend ? !trendUp : trendUp;

  return (
    <Card className={cn(
      'relative overflow-hidden p-4 bg-slate-900/50 border-slate-800/50',
      'hover:border-slate-700/50 transition-all duration-300'
    )}>
      {/* Background glow */}
      <div className={cn('absolute top-0 right-0 w-24 h-24 rounded-full blur-2xl', colors.glow)} />
      
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div className={cn(
            'p-2 rounded-lg bg-gradient-to-br',
            colors.bg,
            'border',
            colors.border
          )}>
            <span className={colors.icon}>{icon}</span>
          </div>
          <div className={cn(
            'flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full',
            isPositiveTrend ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
          )}>
            {isPositiveTrend ? (
              <TrendingUp className="w-3 h-3" />
            ) : (
              <TrendingDown className="w-3 h-3" />
            )}
            {trend}
          </div>
        </div>
        
        <div className="text-2xl font-bold text-white mb-1">
          {value}
        </div>
        <div className="text-sm text-slate-400">
          {title}
        </div>
      </div>
    </Card>
  );
};
