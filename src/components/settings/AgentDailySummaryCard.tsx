import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Sparkles, 
  TrendingDown, 
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Agent {
  id: string;
  name: string;
}

interface DailySummary {
  id: string;
  agent_id: string;
  summary_date: string;
  insights_before: number;
  insights_after: number;
  consolidation_ratio: number;
  executive_summary: string | null;
  top_priorities: { title: string; priority: number; impact: string }[];
  discarded_count: number;
  created_at: string;
}

interface AgentDailySummaryCardProps {
  agents: Agent[];
}

const AgentDailySummaryCard = ({ agents }: AgentDailySummaryCardProps) => {
  const [summaries, setSummaries] = useState<DailySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [consolidating, setConsolidating] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchSummaries();
  }, []);

  const fetchSummaries = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('agent_daily_summaries')
        .select('*')
        .eq('summary_date', today)
        .order('consolidation_ratio', { ascending: false });

      if (error) throw error;
      // Cast top_priorities from JSON
      const parsed = (data || []).map((item: any) => ({
        ...item,
        top_priorities: (item.top_priorities || []) as { title: string; priority: number; impact: string }[],
      }));
      setSummaries(parsed);
    } catch (error) {
      console.error('Error fetching summaries:', error);
    } finally {
      setLoading(false);
    }
  };

  const getAgentName = (agentId: string) => {
    const agent = agents.find(a => a.id === agentId);
    return agent?.name || 'Desconhecido';
  };

  const runConsolidation = async (agentId?: string) => {
    setConsolidating(true);
    try {
      const { data, error } = await supabase.functions.invoke('consolidate-learning-insights', {
        body: agentId ? { agent_id: agentId } : {},
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(`Consolidação concluída! ${data.stats.total_before} → ${data.stats.total_after} insights`);
        fetchSummaries();
      } else {
        throw new Error(data?.error || 'Erro desconhecido');
      }
    } catch (error) {
      console.error('Consolidation error:', error);
      toast.error('Erro ao executar consolidação');
    } finally {
      setConsolidating(false);
    }
  };

  const totalBefore = summaries.reduce((sum, s) => sum + s.insights_before, 0);
  const totalAfter = summaries.reduce((sum, s) => sum + s.insights_after, 0);
  const totalDiscarded = summaries.reduce((sum, s) => sum + s.discarded_count, 0);
  const avgReduction = totalBefore > 0 ? ((1 - totalAfter / totalBefore) * 100).toFixed(0) : 0;

  if (loading) {
    return (
      <Card className="bg-slate-900/60 backdrop-blur-xl border-slate-700/50 shadow-xl">
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="relative overflow-hidden bg-slate-900/60 backdrop-blur-xl border-slate-700/50 shadow-xl">
      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-emerald-500/5 pointer-events-none" />
      
      <CardHeader className="relative border-b border-slate-700/30 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500/20 to-emerald-500/20 border border-purple-500/30 shadow-lg shadow-purple-500/10">
              <Sparkles className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <CardTitle className="text-white text-lg">🤖 Supervisor de Consolidação</CardTitle>
              <p className="text-sm text-slate-400 mt-0.5">Insights consolidados automaticamente por agente</p>
            </div>
          </div>
          
          <Button
            size="sm"
            variant="outline"
            className="border-purple-500/30 text-purple-400 hover:bg-purple-500/20 hover:text-purple-300"
            onClick={() => runConsolidation()}
            disabled={consolidating}
          >
            <RefreshCw className={cn("w-4 h-4 mr-2", consolidating && "animate-spin")} />
            {consolidating ? 'Consolidando...' : 'Consolidar Agora'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="relative p-4 space-y-4">
        {summaries.length === 0 ? (
          <div className="text-center py-8">
            <TrendingDown className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">Nenhuma consolidação feita hoje</p>
            <p className="text-sm text-slate-500 mt-1">Clique em "Consolidar Agora" para iniciar</p>
          </div>
        ) : (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 text-center">
                <p className="text-2xl font-bold text-amber-400">{totalBefore}</p>
                <p className="text-xs text-slate-400">Antes</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 text-center">
                <p className="text-2xl font-bold text-emerald-400">{totalAfter}</p>
                <p className="text-xs text-slate-400">Após</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50 text-center">
                <p className="text-2xl font-bold text-red-400">{totalDiscarded}</p>
                <p className="text-xs text-slate-400">Descartados</p>
              </div>
              <div className="p-3 rounded-lg bg-gradient-to-br from-purple-500/20 to-emerald-500/20 border border-purple-500/30 text-center">
                <p className="text-2xl font-bold text-purple-400">-{avgReduction}%</p>
                <p className="text-xs text-slate-400">Redução</p>
              </div>
            </div>

            {/* Agent summaries */}
            <div className="space-y-2">
              {summaries.slice(0, expanded ? undefined : 3).map((summary) => (
                <div
                  key={summary.id}
                  className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 hover:bg-slate-800/60 transition-all"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{getAgentName(summary.agent_id)}</span>
                      <Badge className="bg-emerald-500/20 text-emerald-400 border-0 text-xs">
                        {summary.insights_before} → {summary.insights_after}
                      </Badge>
                      <Badge className="bg-purple-500/20 text-purple-400 border-0 text-xs">
                        -{summary.consolidation_ratio?.toFixed(0) || 0}%
                      </Badge>
                    </div>
                    {summary.discarded_count > 0 && (
                      <span className="text-xs text-red-400">
                        {summary.discarded_count} descartados
                      </span>
                    )}
                  </div>

                  {summary.executive_summary && (
                    <p className="text-sm text-slate-400 mb-3 line-clamp-2">
                      💡 {summary.executive_summary}
                    </p>
                  )}

                  {summary.top_priorities && summary.top_priorities.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {summary.top_priorities.map((priority, idx) => (
                        <div
                          key={idx}
                          className={cn(
                            "flex items-center gap-1 px-2 py-1 rounded-lg text-xs",
                            priority.priority === 1 ? "bg-red-500/20 text-red-400" :
                            priority.priority === 2 ? "bg-amber-500/20 text-amber-400" :
                            "bg-slate-700/50 text-slate-300"
                          )}
                        >
                          {priority.priority === 1 ? <AlertTriangle className="w-3 h-3" /> :
                           priority.priority === 2 ? <Lightbulb className="w-3 h-3" /> :
                           <CheckCircle2 className="w-3 h-3" />}
                          <span className="truncate max-w-[150px]">{priority.title}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {summaries.length > 3 && (
              <Button
                variant="ghost"
                className="w-full text-purple-400 hover:text-purple-300 hover:bg-purple-500/10"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? (
                  <>
                    <ChevronUp className="w-4 h-4 mr-1" />
                    Ver menos
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4 mr-1" />
                    Ver todos ({summaries.length} agentes)
                  </>
                )}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default AgentDailySummaryCard;
