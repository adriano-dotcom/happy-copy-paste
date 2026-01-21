import React from 'react';
import { Card } from '@/components/ui/card';
import { Truck, Shield, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ButtonClicksFunnelProps {
  buttonsSent: number;
  totalClicks: number;
  transportadorClicks: number;
  outrosClicks: number;
  enganoClicks: number;
}

export const ButtonClicksFunnel: React.FC<ButtonClicksFunnelProps> = ({
  buttonsSent,
  totalClicks,
  transportadorClicks,
  outrosClicks,
  enganoClicks,
}) => {
  const clickRate = buttonsSent > 0 ? (totalClicks / buttonsSent) * 100 : 0;
  
  const stages = [
    {
      label: 'Botões Enviados',
      value: buttonsSent,
      percentage: 100,
      color: 'from-violet-500 to-purple-500',
      bgColor: 'bg-violet-500/20',
      icon: null,
    },
    {
      label: 'Cliques Recebidos',
      value: totalClicks,
      percentage: clickRate,
      color: 'from-cyan-500 to-blue-500',
      bgColor: 'bg-cyan-500/20',
      icon: null,
    },
    {
      label: 'Sou Transportador',
      value: transportadorClicks,
      percentage: buttonsSent > 0 ? (transportadorClicks / buttonsSent) * 100 : 0,
      color: 'from-emerald-500 to-green-500',
      bgColor: 'bg-emerald-500/20',
      icon: <Truck className="w-4 h-4" />,
    },
    {
      label: 'Outros Seguros',
      value: outrosClicks,
      percentage: buttonsSent > 0 ? (outrosClicks / buttonsSent) * 100 : 0,
      color: 'from-blue-500 to-indigo-500',
      bgColor: 'bg-blue-500/20',
      icon: <Shield className="w-4 h-4" />,
    },
    {
      label: 'Foi Engano',
      value: enganoClicks,
      percentage: buttonsSent > 0 ? (enganoClicks / buttonsSent) * 100 : 0,
      color: 'from-red-500 to-rose-500',
      bgColor: 'bg-red-500/20',
      icon: <XCircle className="w-4 h-4" />,
    },
  ];

  return (
    <Card className="p-6 bg-slate-900/50 border-slate-800/50">
      <h3 className="text-lg font-semibold text-white mb-6">Funil de Triagem</h3>
      
      <div className="space-y-3">
        {stages.map((stage, index) => (
          <div key={stage.label} className="relative">
            {/* Stage bar */}
            <div 
              className={cn(
                'relative h-12 rounded-lg overflow-hidden transition-all duration-500',
                stage.bgColor
              )}
              style={{ width: `${Math.max(stage.percentage, 20)}%` }}
            >
              {/* Gradient fill */}
              <div
                className={cn(
                  'absolute inset-0 bg-gradient-to-r opacity-80',
                  stage.color
                )}
                style={{ width: `${Math.min(stage.percentage, 100)}%` }}
              />
              
              {/* Content */}
              <div className="relative h-full flex items-center justify-between px-4 z-10">
                <div className="flex items-center gap-2">
                  {stage.icon && <span className="text-white/90">{stage.icon}</span>}
                  <span className="text-sm font-medium text-white truncate">
                    {stage.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
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
            {index < stages.length - 1 && index < 1 && (
              <div className="absolute -bottom-1.5 left-8 w-px h-3 bg-slate-700" />
            )}
            
            {/* Branch connector for button types */}
            {index === 1 && (
              <div className="absolute -bottom-1.5 left-8 w-px h-3 bg-slate-600" />
            )}
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="mt-6 pt-4 border-t border-slate-800 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">Taxa de clique total</span>
          <span className="text-cyan-400 font-semibold">
            {clickRate.toFixed(1)}%
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">Taxa de transportadores</span>
          <span className="text-emerald-400 font-semibold">
            {totalClicks > 0 ? ((transportadorClicks / totalClicks) * 100).toFixed(1) : 0}%
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-400">Taxa de engano (desperdiço)</span>
          <span className={cn(
            'font-semibold',
            enganoClicks / Math.max(totalClicks, 1) > 0.15 ? 'text-red-400' : 'text-slate-400'
          )}>
            {totalClicks > 0 ? ((enganoClicks / totalClicks) * 100).toFixed(1) : 0}%
          </span>
        </div>
      </div>
    </Card>
  );
};
