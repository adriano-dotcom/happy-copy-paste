import React from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Trophy, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TemplatePerformance {
  name: string;
  sent: number;
  responses: number;
  responseRate: number;
  conversions: number;
  conversionRate: number;
}

interface TemplateRankingProps {
  templates: TemplatePerformance[];
  loading: boolean;
}

const medals = ['🥇', '🥈', '🥉'];

export const TemplateRanking: React.FC<TemplateRankingProps> = ({ templates, loading }) => {
  if (loading) {
    return (
      <Card className="p-6 bg-slate-900/50 border-slate-800/50">
        <h3 className="text-lg font-semibold text-white mb-4">Templates Mais Eficazes</h3>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full bg-slate-800" />
          ))}
        </div>
      </Card>
    );
  }

  const topTemplates = templates.slice(0, 5);

  return (
    <Card className="p-6 bg-slate-900/50 border-slate-800/50">
      <div className="flex items-center gap-2 mb-6">
        <Trophy className="w-5 h-5 text-amber-400" />
        <h3 className="text-lg font-semibold text-white">Templates Mais Eficazes</h3>
      </div>

      {topTemplates.length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          Nenhum template enviado neste período
        </div>
      ) : (
        <div className="space-y-3">
          {topTemplates.map((template, index) => (
            <div
              key={template.name}
              className={cn(
                'p-4 rounded-lg border transition-all duration-200',
                index === 0
                  ? 'bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border-amber-500/30'
                  : 'bg-slate-800/30 border-slate-700/50 hover:border-slate-600/50'
              )}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">
                    {index < 3 ? medals[index] : `${index + 1}️⃣`}
                  </span>
                  <div>
                    <p className="font-medium text-white truncate max-w-[200px]">
                      {template.name}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {template.sent} enviados • {template.responses} respostas
                    </p>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="flex items-center gap-1 text-cyan-400">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span className="font-semibold">{template.responseRate.toFixed(1)}%</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Taxa resposta
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-3">
                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      index === 0
                        ? 'bg-gradient-to-r from-amber-400 to-yellow-500'
                        : 'bg-gradient-to-r from-cyan-500 to-blue-500'
                    )}
                    style={{ width: `${template.responseRate}%` }}
                  />
                </div>
              </div>

              {/* Conversion badge */}
              {template.conversions > 0 && (
                <div className="mt-2 flex items-center gap-1">
                  <span className="text-xs text-emerald-400">
                    {template.conversions} conversões ({template.conversionRate.toFixed(1)}%)
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
