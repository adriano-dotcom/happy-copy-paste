import React from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface ProspectingFunnelProps {
  templatesSent: number;
  responses: number;
  positives: number;
  qualified: number;
  converted: number;
  loading: boolean;
}

export const ProspectingFunnel: React.FC<ProspectingFunnelProps> = ({
  templatesSent,
  responses,
  positives,
  qualified,
  converted,
  loading,
}) => {
  const stages = [
    {
      label: 'Templates Enviados',
      value: templatesSent,
      percentage: 100,
      color: 'from-violet-500 to-purple-500',
      bgColor: 'bg-violet-500/20',
    },
    {
      label: 'Respostas',
      value: responses,
      percentage: templatesSent > 0 ? (responses / templatesSent) * 100 : 0,
      color: 'from-cyan-500 to-blue-500',
      bgColor: 'bg-cyan-500/20',
    },
    {
      label: 'Positivas',
      value: positives,
      percentage: templatesSent > 0 ? (positives / templatesSent) * 100 : 0,
      color: 'from-teal-500 to-emerald-500',
      bgColor: 'bg-teal-500/20',
    },
    {
      label: 'Qualificados',
      value: qualified,
      percentage: templatesSent > 0 ? (qualified / templatesSent) * 100 : 0,
      color: 'from-amber-500 to-orange-500',
      bgColor: 'bg-amber-500/20',
    },
    {
      label: 'Convertidos',
      value: converted,
      percentage: templatesSent > 0 ? (converted / templatesSent) * 100 : 0,
      color: 'from-emerald-500 to-green-500',
      bgColor: 'bg-emerald-500/20',
    },
  ];

  if (loading) {
    return (
      <Card className="p-6 bg-slate-900/50 border-slate-800/50">
        <h3 className="text-lg font-semibold text-white mb-4">Funil de Prospecção</h3>
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full bg-slate-800" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-slate-900/50 border-slate-800/50">
      <h3 className="text-lg font-semibold text-white mb-6">Funil de Prospecção</h3>
      
      <div className="space-y-3">
        {stages.map((stage, index) => (
          <div key={stage.label} className="relative">
            {/* Stage bar */}
            <div 
              className={cn(
                'relative h-14 rounded-lg overflow-hidden transition-all duration-500',
                stage.bgColor
              )}
              style={{ width: `${Math.max(stage.percentage, 15)}%` }}
            >
              {/* Gradient fill */}
              <div
                className={cn(
                  'absolute inset-0 bg-gradient-to-r opacity-80',
                  stage.color
                )}
                style={{ width: `${stage.percentage}%` }}
              />
              
              {/* Content */}
              <div className="relative h-full flex items-center justify-between px-4 z-10">
                <span className="text-sm font-medium text-white">
                  {stage.label}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-white">
                    {stage.value}
                  </span>
                  <span className="text-xs text-white/70">
                    ({stage.percentage.toFixed(1)}%)
                  </span>
                </div>
              </div>
            </div>

            {/* Connector line */}
            {index < stages.length - 1 && (
              <div className="absolute -bottom-1.5 left-8 w-px h-3 bg-slate-700" />
            )}
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="mt-6 pt-4 border-t border-slate-800">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">Taxa de conversão final</span>
          <span className="text-emerald-400 font-semibold">
            {templatesSent > 0 ? ((converted / templatesSent) * 100).toFixed(1) : 0}%
          </span>
        </div>
      </div>
    </Card>
  );
};
