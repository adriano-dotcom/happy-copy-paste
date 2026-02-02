import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { 
  XCircle, 
  RefreshCw, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  AlertTriangle,
  Lightbulb,
  Calendar,
  BarChart3,
  PieChart,
  Loader2
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { PieChart as RechartsPie, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface ReasonBreakdown {
  count: number;
  percentage: number;
}

interface TopReason {
  reason: string;
  count: number;
  percentage: number;
}

interface ComparisonData {
  current: number;
  previous: number;
  change: number;
}

interface ClosureReport {
  id: string;
  agent_id: string | null;
  agent_name: string;
  report_date: string;
  period_start: string;
  period_end: string;
  total_closures: number;
  by_reason: Record<string, ReasonBreakdown>;
  comparison_previous: Record<string, ComparisonData>;
  top_reasons: TopReason[];
  avg_time_to_close: number | null;
  insights: string[];
  sent_at: string | null;
  created_at: string;
}

interface Agent {
  id: string;
  name: string;
}

const REASON_COLORS: Record<string, string> = {
  'Sem resposta': '#ef4444',
  'Lead desqualificado': '#f59e0b',
  'Fora do perfil': '#8b5cf6',
  'Cliente desistiu': '#ec4899',
  'Duplicado': '#6b7280',
  'Outro': '#3b82f6',
  'Sem motivo': '#94a3b8',
  'Preço alto': '#f97316',
  'Concorrência': '#14b8a6',
  'Timing ruim': '#a855f7',
};

const PIE_COLORS = ['#ef4444', '#f59e0b', '#8b5cf6', '#ec4899', '#3b82f6', '#14b8a6', '#f97316', '#6366f1'];

export default function ClosureReasonsDashboard() {
  const [reports, setReports] = useState<ClosureReport[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('7');
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    fetchAgents();
    fetchReports();
  }, [selectedAgent, selectedPeriod]);

  const fetchAgents = async () => {
    const { data } = await supabase
      .from('agents')
      .select('id, name')
      .eq('is_active', true);
    setAgents(data || []);
  };

  const fetchReports = async () => {
    setIsLoading(true);
    const startDate = subDays(new Date(), parseInt(selectedPeriod)).toISOString().split('T')[0];

    let query = supabase
      .from('closure_reason_reports')
      .select('*')
      .gte('report_date', startDate)
      .order('report_date', { ascending: false })
      .order('total_closures', { ascending: false });

    if (selectedAgent !== 'all') {
      query = query.eq('agent_id', selectedAgent);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching reports:', error);
      toast.error('Erro ao carregar relatórios');
    } else {
      // Type the data properly
      const typedReports = (data || []).map(r => ({
        ...r,
        by_reason: (r.by_reason || {}) as unknown as Record<string, ReasonBreakdown>,
        comparison_previous: (r.comparison_previous || {}) as unknown as Record<string, ComparisonData>,
        top_reasons: (r.top_reasons || []) as unknown as TopReason[],
        insights: (r.insights || []) as unknown as string[]
      })) as ClosureReport[];
      setReports(typedReports);
    }
    setIsLoading(false);
  };

  const generateReport = async () => {
    setIsGenerating(true);
    try {
      const { error } = await supabase.functions.invoke('generate-closure-report', {
        body: { triggered_by: 'manual' }
      });

      if (error) throw error;

      toast.success('Relatório gerado com sucesso!');
      fetchReports();
    } catch (error) {
      console.error('Error generating report:', error);
      toast.error('Erro ao gerar relatório');
    } finally {
      setIsGenerating(false);
    }
  };

  // Aggregate data for charts
  const aggregatedByReason: Record<string, number> = {};
  const totalClosures = reports.reduce((sum, r) => sum + r.total_closures, 0);
  
  for (const report of reports) {
    for (const [reason, data] of Object.entries(report.by_reason)) {
      aggregatedByReason[reason] = (aggregatedByReason[reason] || 0) + (data.count || 0);
    }
  }

  const pieData = Object.entries(aggregatedByReason)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // Group reports by agent for summary
  const reportsByAgent = agents.map(agent => {
    const agentReports = reports.filter(r => r.agent_id === agent.id);
    const latestReport = agentReports[0];
    const totalAgentClosures = agentReports.reduce((sum, r) => sum + r.total_closures, 0);
    return { agent, latestReport, totalAgentClosures, reportsCount: agentReports.length };
  }).filter(item => item.totalAgentClosures > 0);

  // Collect all insights - deduplicate and filter redundant "zero closures" messages
  const allInsights = [...new Set(reports.flatMap(r => r.insights))]
    .filter(i => !i.includes('zerou encerramentos') || totalClosures === 0)
    .slice(0, 6);

  const getTrendIcon = (change: number) => {
    if (change > 10) return <TrendingUp className="h-4 w-4 text-red-400" />;
    if (change < -10) return <TrendingDown className="h-4 w-4 text-emerald-400" />;
    return <Minus className="h-4 w-4 text-slate-400" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-slate-900/40 backdrop-blur-xl border border-slate-700/30">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-red-500/20 to-orange-500/20 border border-red-500/30 shadow-lg shadow-red-500/20">
            <XCircle className="h-5 w-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              Motivos de Fechamento por Agente
            </h3>
            <p className="text-sm text-slate-400">
              Análise de encerramentos e tendências diárias
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Select value={selectedAgent} onValueChange={setSelectedAgent}>
            <SelectTrigger className="w-[180px] bg-slate-800/60 border-slate-700">
              <SelectValue placeholder="Todos os agentes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os agentes</SelectItem>
              {agents.map(agent => (
                <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-[140px] bg-slate-800/60 border-slate-700">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="14">Últimos 14 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
            </SelectContent>
          </Select>

          <Button
            onClick={generateReport}
            disabled={isGenerating}
            className="bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Gerar Relatório
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-slate-900/60 backdrop-blur-xl border-slate-700/50">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-red-500/20 border border-red-500/30">
                    <XCircle className="h-6 w-6 text-red-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Total Fechamentos</p>
                    <p className="text-3xl font-bold text-white">{totalClosures}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/60 backdrop-blur-xl border-slate-700/50">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-cyan-500/20 border border-cyan-500/30">
                    <BarChart3 className="h-6 w-6 text-cyan-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Relatórios Gerados</p>
                    <p className="text-3xl font-bold text-white">{reports.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/60 backdrop-blur-xl border-slate-700/50">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-amber-500/20 border border-amber-500/30">
                    <Calendar className="h-6 w-6 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-400">Período</p>
                    <p className="text-lg font-semibold text-white">Últimos {selectedPeriod} dias</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pie Chart */}
            <Card className="bg-slate-900/60 backdrop-blur-xl border-slate-700/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <PieChart className="h-5 w-5 text-violet-400" />
                  Distribuição por Motivo
                </CardTitle>
              </CardHeader>
              <CardContent>
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <RechartsPie>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        labelLine={{ stroke: '#64748b', strokeWidth: 1 }}
                      >
                        {pieData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={REASON_COLORS[entry.name] || PIE_COLORS[index % PIE_COLORS.length]} 
                          />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: '#1e293b', 
                          border: '1px solid #334155',
                          borderRadius: '8px'
                        }}
                      />
                    </RechartsPie>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-slate-400">
                    Nenhum dado disponível
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Agent Summary Cards */}
            <Card className="bg-slate-900/60 backdrop-blur-xl border-slate-700/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <BarChart3 className="h-5 w-5 text-cyan-400" />
                  Por Agente
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar">
                {reportsByAgent.length > 0 ? (
                  reportsByAgent.map(({ agent, latestReport, totalAgentClosures }) => (
                    <div 
                      key={agent.id}
                      className="p-3 rounded-lg bg-slate-800/60 border border-slate-700/50 hover:border-slate-600/50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-white">{agent.name}</span>
                        <span className={cn(
                          "px-2 py-1 rounded-full text-xs font-semibold",
                          totalAgentClosures > 10 
                            ? "bg-red-500/20 text-red-400" 
                            : totalAgentClosures > 5 
                            ? "bg-amber-500/20 text-amber-400"
                            : "bg-emerald-500/20 text-emerald-400"
                        )}>
                          {totalAgentClosures} fechamentos
                        </span>
                      </div>
                      {latestReport && latestReport.top_reasons.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {latestReport.top_reasons.slice(0, 2).map((reason, idx) => (
                            <span 
                              key={idx}
                              className="px-2 py-0.5 rounded text-xs bg-slate-700/50 text-slate-300"
                            >
                              {reason.reason}: {reason.count}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="flex items-center justify-center h-24 text-slate-400">
                    Nenhum fechamento no período
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Insights */}
          {allInsights.length > 0 && (
            <Card className="bg-slate-900/60 backdrop-blur-xl border-amber-500/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-amber-400">
                  <Lightbulb className="h-5 w-5" />
                  Insights do Período
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Observações automáticas baseadas nos padrões de fechamento
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {allInsights.map((insight, idx) => (
                    <li 
                      key={idx}
                      className="flex items-start gap-2 text-sm text-slate-300"
                    >
                      <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
                      {insight}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Detailed Reports Table */}
          {reports.length > 0 && (
            <Card className="bg-slate-900/60 backdrop-blur-xl border-slate-700/50">
              <CardHeader>
                <CardTitle className="text-white">Histórico de Relatórios</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="text-left p-3 text-slate-400 font-medium">Data</th>
                        <th className="text-left p-3 text-slate-400 font-medium">Agente</th>
                        <th className="text-center p-3 text-slate-400 font-medium">Total</th>
                        <th className="text-left p-3 text-slate-400 font-medium">Principal Motivo</th>
                        <th className="text-center p-3 text-slate-400 font-medium">Tempo Médio</th>
                        <th className="text-center p-3 text-slate-400 font-medium">Tendência</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports.slice(0, 20).map(report => {
                        const topReason = report.top_reasons[0];
                        const mainComparison = topReason 
                          ? report.comparison_previous[topReason.reason] 
                          : null;
                        
                        return (
                          <tr 
                            key={report.id}
                            className="border-b border-slate-800 hover:bg-slate-800/40 transition-colors"
                          >
                            <td className="p-3 text-slate-300">
                              {format(new Date(report.report_date), "dd/MM/yyyy", { locale: ptBR })}
                            </td>
                            <td className="p-3 text-white font-medium">
                              {report.agent_name}
                            </td>
                            <td className="p-3 text-center">
                              <span className={cn(
                                "px-2 py-1 rounded-full text-xs font-semibold",
                                report.total_closures > 10 
                                  ? "bg-red-500/20 text-red-400" 
                                  : "bg-slate-700/50 text-slate-300"
                              )}>
                                {report.total_closures}
                              </span>
                            </td>
                            <td className="p-3 text-slate-300">
                              {topReason ? (
                                <span className="flex items-center gap-2">
                                  <span 
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: REASON_COLORS[topReason.reason] || '#6b7280' }}
                                  />
                                  {topReason.reason} ({topReason.percentage.toFixed(0)}%)
                                </span>
                              ) : '-'}
                            </td>
                            <td className="p-3 text-center text-slate-400">
                              {report.avg_time_to_close 
                                ? `${Math.round(report.avg_time_to_close / 60)}h` 
                                : '-'}
                            </td>
                            <td className="p-3 text-center">
                              {mainComparison ? getTrendIcon(mainComparison.change) : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {reports.length === 0 && !isLoading && (
            <Card className="bg-slate-900/60 backdrop-blur-xl border-slate-700/50">
              <CardContent className="p-12 text-center">
                <XCircle className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-slate-300 mb-2">
                  Nenhum relatório encontrado
                </h3>
                <p className="text-sm text-slate-500 mb-4">
                  Clique em "Gerar Relatório" para criar o primeiro relatório de fechamentos.
                </p>
                <Button
                  onClick={generateReport}
                  disabled={isGenerating}
                  className="bg-gradient-to-r from-red-500 to-orange-500"
                >
                  {isGenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Gerar Primeiro Relatório
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
