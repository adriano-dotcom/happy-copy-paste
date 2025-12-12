import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { 
  Brain, 
  TrendingUp, 
  TrendingDown, 
  RefreshCw, 
  ChevronDown, 
  ChevronUp,
  Lightbulb,
  Target,
  AlertTriangle,
  CheckCircle,
  Clock
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface StrengthItem {
  title: string;
  description: string;
  example?: string;
}

interface ImprovementItem {
  title: string;
  description: string;
  example?: string;
  suggestion?: string;
}

interface ActionItem {
  priority: number;
  action: string;
  impact: string;
  category?: string;
}

interface ExampleItem {
  conversation_id?: string;
  excerpt: string;
  why_good?: string;
  why_bad?: string;
  better_response?: string;
}

interface CoachingReport {
  id: string;
  agent_id: string | null;
  report_type: string;
  analysis_period_start: string;
  analysis_period_end: string;
  conversations_analyzed: number;
  calls_analyzed: number;
  human_interactions_analyzed: number;
  strengths: StrengthItem[];
  improvement_areas: ImprovementItem[];
  recommended_actions: ActionItem[];
  prompt_suggestions: string | null;
  good_examples: ExampleItem[];
  bad_examples: ExampleItem[];
  overall_score: number | null;
  qualification_effectiveness: number | null;
  objection_handling_score: number | null;
  closing_skills_score: number | null;
  is_applied: boolean;
  created_at: string;
}

interface Agent {
  id: string;
  name: string;
}

export default function SalesCoachingSettings() {
  const [reports, setReports] = useState<CoachingReport[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [reportType, setReportType] = useState<string>('daily');
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);

  useEffect(() => {
    fetchReports();
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    const { data } = await supabase
      .from('agents')
      .select('id, name')
      .eq('is_active', true);
    setAgents(data || []);
  };

  const fetchReports = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from('sales_coaching_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      toast.error('Erro ao carregar relatórios');
      console.error(error);
    } else {
      // Cast the data to our interface
      const typedReports = (data || []).map(r => ({
        ...r,
        strengths: (r.strengths || []) as unknown as StrengthItem[],
        improvement_areas: (r.improvement_areas || []) as unknown as ImprovementItem[],
        recommended_actions: (r.recommended_actions || []) as unknown as ActionItem[],
        good_examples: (r.good_examples || []) as unknown as ExampleItem[],
        bad_examples: (r.bad_examples || []) as unknown as ExampleItem[],
      }));
      setReports(typedReports);
    }
    setIsLoading(false);
  };

  const generateReport = async () => {
    setIsGenerating(true);
    try {
      const days = reportType === 'weekly' ? 7 : 1;
      
      const { data, error } = await supabase.functions.invoke('sales-coaching-analysis', {
        body: {
          report_type: reportType,
          agent_id: selectedAgent === 'all' ? null : selectedAgent,
          days
        }
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

  const getScoreColor = (score: number | null) => {
    if (!score) return 'text-muted-foreground';
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getScoreBg = (score: number | null) => {
    if (!score) return 'bg-muted';
    if (score >= 80) return 'bg-green-500/20';
    if (score >= 60) return 'bg-yellow-500/20';
    return 'bg-red-500/20';
  };

  const ScoreCard = ({ label, score }: { label: string; score: number | null }) => (
    <div className={`p-3 rounded-lg ${getScoreBg(score)}`}>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-2xl font-bold ${getScoreColor(score)}`}>
        {score ?? '-'}
      </p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Gerente de Vendas IA
          </h3>
          <p className="text-sm text-muted-foreground">
            Análise automática de performance e coaching para agentes
          </p>
        </div>
      </div>

      {/* Generate Report Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gerar Novo Relatório</CardTitle>
          <CardDescription>
            Analise as conversas e ligações para obter insights de melhoria
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-2">
              <label className="text-sm font-medium">Agente</label>
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os agentes</SelectItem>
                  {agents.map(agent => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Período</label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Últimas 24h</SelectItem>
                  <SelectItem value="weekly">Últimos 7 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button 
              onClick={generateReport} 
              disabled={isGenerating}
              className="gap-2"
            >
              {isGenerating ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Brain className="h-4 w-4" />
              )}
              {isGenerating ? 'Analisando...' : 'Gerar Análise'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Reports List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">Relatórios Recentes</h4>
          <Button variant="ghost" size="sm" onClick={fetchReports} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        {reports.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum relatório gerado ainda</p>
              <p className="text-sm">Clique em "Gerar Análise" para começar</p>
            </CardContent>
          </Card>
        ) : (
          reports.map(report => (
            <Card key={report.id} className="overflow-hidden">
              <CardHeader 
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setExpandedReport(expandedReport === report.id ? null : report.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${getScoreBg(report.overall_score)}`}>
                      <span className={`text-xl font-bold ${getScoreColor(report.overall_score)}`}>
                        {report.overall_score ?? '-'}
                      </span>
                    </div>
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        {report.report_type === 'daily' ? 'Análise Diária' : 'Análise Semanal'}
                        <span className="text-xs font-normal text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(report.created_at), "dd/MM HH:mm", { locale: ptBR })}
                        </span>
                      </CardTitle>
                      <CardDescription className="flex items-center gap-4 mt-1">
                        <span>{report.conversations_analyzed} conversas</span>
                        <span>{report.calls_analyzed} ligações</span>
                        <span>{report.human_interactions_analyzed} msg humanas</span>
                      </CardDescription>
                    </div>
                  </div>
                  {expandedReport === report.id ? (
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
              </CardHeader>

              {expandedReport === report.id && (
                <CardContent className="border-t space-y-6">
                  {/* Scores Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <ScoreCard label="Score Geral" score={report.overall_score} />
                    <ScoreCard label="Qualificação" score={report.qualification_effectiveness} />
                    <ScoreCard label="Objeções" score={report.objection_handling_score} />
                    <ScoreCard label="Fechamento" score={report.closing_skills_score} />
                  </div>

                  {/* Strengths */}
                  {report.strengths?.length > 0 && (
                    <div>
                      <h5 className="font-medium flex items-center gap-2 mb-3 text-green-600">
                        <TrendingUp className="h-4 w-4" />
                        Pontos Fortes
                      </h5>
                      <div className="space-y-2">
                        {report.strengths.map((s, i) => (
                          <div key={i} className="p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                            <p className="font-medium text-sm">{s.title}</p>
                            <p className="text-sm text-muted-foreground">{s.description}</p>
                            {s.example && (
                              <p className="text-xs mt-2 italic text-muted-foreground">"{s.example}"</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Improvement Areas */}
                  {report.improvement_areas?.length > 0 && (
                    <div>
                      <h5 className="font-medium flex items-center gap-2 mb-3 text-amber-600">
                        <TrendingDown className="h-4 w-4" />
                        Áreas de Melhoria
                      </h5>
                      <div className="space-y-2">
                        {report.improvement_areas.map((area, i) => (
                          <div key={i} className="p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
                            <p className="font-medium text-sm">{area.title}</p>
                            <p className="text-sm text-muted-foreground">{area.description}</p>
                            {area.suggestion && (
                              <p className="text-xs mt-2 text-amber-600">
                                💡 Sugestão: {area.suggestion}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recommended Actions */}
                  {report.recommended_actions?.length > 0 && (
                    <div>
                      <h5 className="font-medium flex items-center gap-2 mb-3">
                        <Target className="h-4 w-4" />
                        Ações Recomendadas
                      </h5>
                      <div className="space-y-2">
                        {report.recommended_actions
                          .sort((a, b) => a.priority - b.priority)
                          .map((action, i) => (
                            <div key={i} className="p-3 bg-muted rounded-lg flex items-start gap-3">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                action.priority === 1 ? 'bg-red-500/20 text-red-600' :
                                action.priority === 2 ? 'bg-amber-500/20 text-amber-600' :
                                'bg-blue-500/20 text-blue-600'
                              }`}>
                                P{action.priority}
                              </span>
                              <div className="flex-1">
                                <p className="text-sm">{action.action}</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Impacto: {action.impact}
                                </p>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Prompt Suggestions */}
                  {report.prompt_suggestions && (
                    <div>
                      <h5 className="font-medium flex items-center gap-2 mb-3">
                        <Lightbulb className="h-4 w-4" />
                        Sugestões para o Prompt
                      </h5>
                      <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
                        <p className="text-sm whitespace-pre-wrap">{report.prompt_suggestions}</p>
                      </div>
                    </div>
                  )}

                  {/* Good Examples */}
                  {report.good_examples?.length > 0 && (
                    <div>
                      <h5 className="font-medium flex items-center gap-2 mb-3 text-green-600">
                        <CheckCircle className="h-4 w-4" />
                        Exemplos Positivos
                      </h5>
                      <div className="space-y-2">
                        {report.good_examples.map((ex, i) => (
                          <div key={i} className="p-3 bg-green-500/5 rounded-lg border border-green-500/20">
                            <p className="text-sm italic">"{ex.excerpt}"</p>
                            <p className="text-xs text-green-600 mt-2">✓ {ex.why_good}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Bad Examples */}
                  {report.bad_examples?.length > 0 && (
                    <div>
                      <h5 className="font-medium flex items-center gap-2 mb-3 text-red-600">
                        <AlertTriangle className="h-4 w-4" />
                        Exemplos a Melhorar
                      </h5>
                      <div className="space-y-2">
                        {report.bad_examples.map((ex, i) => (
                          <div key={i} className="p-3 bg-red-500/5 rounded-lg border border-red-500/20">
                            <p className="text-sm italic">"{ex.excerpt}"</p>
                            <p className="text-xs text-red-600 mt-2">✗ {ex.why_bad}</p>
                            {ex.better_response && (
                              <p className="text-xs text-green-600 mt-1">
                                ↳ Melhor: "{ex.better_response}"
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
