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
  Clock,
  Users,
  Mail,
  Building2
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
  pipeline_id: string | null;
  pipeline_name: string | null;
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
  alert_sent: boolean;
  created_at: string;
}

interface Agent {
  id: string;
  name: string;
}

interface Pipeline {
  id: string;
  name: string;
  icon: string | null;
  agent_id: string | null;
}

export default function SalesCoachingSettings() {
  const [reports, setReports] = useState<CoachingReport[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [selectedPipeline, setSelectedPipeline] = useState<string>('all');
  const [reportType, setReportType] = useState<string>('daily');
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);

  useEffect(() => {
    fetchReports();
    fetchAgents();
    fetchPipelines();
  }, []);

  const fetchAgents = async () => {
    const { data } = await supabase
      .from('agents')
      .select('id, name')
      .eq('is_active', true);
    setAgents(data || []);
  };

  const fetchPipelines = async () => {
    const { data } = await supabase
      .from('pipelines')
      .select('id, name, icon, agent_id')
      .eq('is_active', true);
    setPipelines(data || []);
  };

  const fetchReports = async () => {
    setIsLoading(true);
    let query = supabase
      .from('sales_coaching_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(30);

    if (selectedAgent !== 'all') {
      query = query.eq('agent_id', selectedAgent);
    }
    if (selectedPipeline !== 'all') {
      query = query.eq('pipeline_id', selectedPipeline);
    }

    const { data, error } = await query;

    if (error) {
      toast.error('Erro ao carregar relatórios');
      console.error(error);
    } else {
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

  useEffect(() => {
    fetchReports();
  }, [selectedAgent, selectedPipeline]);

  const generateReport = async () => {
    setIsGenerating(true);
    try {
      const days = reportType === 'weekly' ? 7 : 1;
      const generateAll = selectedAgent === 'all';
      
      const { data, error } = await supabase.functions.invoke('sales-coaching-analysis', {
        body: {
          report_type: reportType,
          agent_id: selectedAgent === 'all' ? null : selectedAgent,
          days,
          generate_all: generateAll,
          send_alerts: true
        }
      });

      if (error) throw error;

      const reportsCount = data?.reports_count || 1;
      const alertsSent = data?.alerts_sent?.length || 0;
      
      let message = `${reportsCount} relatório(s) gerado(s) com sucesso!`;
      if (alertsSent > 0) {
        message += ` ${alertsSent} alerta(s) enviado(s) por email.`;
      }
      
      toast.success(message);
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
    if (score >= 70) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getScoreBg = (score: number | null) => {
    if (!score) return 'bg-muted';
    if (score >= 80) return 'bg-green-500/20';
    if (score >= 70) return 'bg-yellow-500/20';
    return 'bg-red-500/20';
  };

  const getAgentName = (agentId: string | null) => {
    if (!agentId) return 'Todos';
    return agents.find(a => a.id === agentId)?.name || 'Desconhecido';
  };

  const ScoreCard = ({ label, score }: { label: string; score: number | null }) => (
    <div className={`p-3 rounded-lg ${getScoreBg(score)}`}>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-2xl font-bold ${getScoreColor(score)}`}>
        {score ?? '-'}
      </p>
    </div>
  );

  // Group reports by agent for summary view
  const latestReportsByAgent = agents.map(agent => {
    const agentReports = reports.filter(r => r.agent_id === agent.id);
    const latestReport = agentReports[0];
    const pipeline = pipelines.find(p => p.agent_id === agent.id);
    return {
      agent,
      pipeline,
      latestReport
    };
  }).filter(item => item.latestReport);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Gerente de Vendas IA
          </h3>
          <p className="text-sm text-muted-foreground">
            Análise automática de performance por agente e departamento
          </p>
        </div>
      </div>

      {/* Agent/Department Summary Cards */}
      {latestReportsByAgent.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {latestReportsByAgent.map(({ agent, pipeline, latestReport }) => (
            <Card key={agent.id} className={`${latestReport.overall_score && latestReport.overall_score < 70 ? 'border-red-500/50' : ''}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {pipeline && <span className="text-lg">{pipeline.icon}</span>}
                    <div>
                      <CardTitle className="text-base">{agent.name}</CardTitle>
                      {pipeline && (
                        <CardDescription className="flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {pipeline.name}
                        </CardDescription>
                      )}
                    </div>
                  </div>
                  <div className={`p-2 rounded-lg ${getScoreBg(latestReport.overall_score)}`}>
                    <span className={`text-xl font-bold ${getScoreColor(latestReport.overall_score)}`}>
                      {latestReport.overall_score ?? '-'}
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">Qualificação</p>
                    <p className={`font-semibold ${getScoreColor(latestReport.qualification_effectiveness)}`}>
                      {latestReport.qualification_effectiveness ?? '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Objeções</p>
                    <p className={`font-semibold ${getScoreColor(latestReport.objection_handling_score)}`}>
                      {latestReport.objection_handling_score ?? '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Fechamento</p>
                    <p className={`font-semibold ${getScoreColor(latestReport.closing_skills_score)}`}>
                      {latestReport.closing_skills_score ?? '-'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {format(new Date(latestReport.created_at), "dd/MM HH:mm", { locale: ptBR })}
                  </span>
                  {latestReport.alert_sent && (
                    <span className="flex items-center gap-1 text-red-500">
                      <Mail className="h-3 w-3" />
                      Alerta enviado
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Generate Report Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gerar Novo Relatório</CardTitle>
          <CardDescription>
            Analise as conversas e ligações por agente/departamento
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
                  <SelectItem value="all">
                    <span className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Todos os agentes
                    </span>
                  </SelectItem>
                  {agents.map(agent => {
                    const pipeline = pipelines.find(p => p.agent_id === agent.id);
                    return (
                      <SelectItem key={agent.id} value={agent.id}>
                        <span className="flex items-center gap-2">
                          {pipeline?.icon && <span>{pipeline.icon}</span>}
                          {agent.name}
                        </span>
                      </SelectItem>
                    );
                  })}
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
              {isGenerating ? 'Analisando...' : selectedAgent === 'all' ? 'Gerar para Todos' : 'Gerar Análise'}
            </Button>
          </div>
          
          <p className="text-xs text-muted-foreground mt-3">
            Relatórios com score abaixo de 70 enviam alerta automático por email para adriano@jacometo.com.br
          </p>
        </CardContent>
      </Card>

      {/* Reports List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">Relatórios Recentes</h4>
          <div className="flex items-center gap-2">
            <Select value={selectedPipeline} onValueChange={setSelectedPipeline}>
              <SelectTrigger className="w-[150px] h-8 text-xs">
                <SelectValue placeholder="Departamento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {pipelines.map(pipeline => (
                  <SelectItem key={pipeline.id} value={pipeline.id}>
                    {pipeline.icon} {pipeline.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={fetchReports} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
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
            <Card key={report.id} className={`overflow-hidden ${report.alert_sent ? 'border-l-4 border-l-red-500' : ''}`}>
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
                        <span className="flex items-center gap-1">
                          {report.pipeline_name && (
                            <span className="text-muted-foreground">
                              {pipelines.find(p => p.id === report.pipeline_id)?.icon}
                            </span>
                          )}
                          {getAgentName(report.agent_id)}
                        </span>
                        <span className="text-xs font-normal px-2 py-0.5 bg-muted rounded">
                          {report.report_type === 'daily' ? 'Diário' : 'Semanal'}
                        </span>
                        <span className="text-xs font-normal text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(report.created_at), "dd/MM HH:mm", { locale: ptBR })}
                        </span>
                        {report.alert_sent && (
                          <span className="text-xs font-normal text-red-500 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Alerta
                          </span>
                        )}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-4 mt-1">
                        {report.pipeline_name && <span>{report.pipeline_name}</span>}
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
                                Sugestão: {area.suggestion}
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
                            <p className="text-xs text-green-600 mt-2">{ex.why_good}</p>
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
                            <p className="text-xs text-red-600 mt-2">{ex.why_bad}</p>
                            {ex.better_response && (
                              <p className="text-xs text-green-600 mt-1">
                                Melhor: "{ex.better_response}"
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
