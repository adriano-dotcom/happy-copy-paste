import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Layers,
  Check,
  X,
  Eye,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
  AlertTriangle,
  Lightbulb,
  Target,
  Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Agent {
  id: string;
  name: string;
}

interface ConsolidatedInsight {
  id: string;
  agent_id: string | null;
  title: string;
  description: string;
  suggestion: string | null;
  category: string;
  priority: number | null;
  occurrence_count: number | null;
  consolidated_into: string | null;
  status: string | null;
  created_at: string | null;
}

interface ConsolidatedInsightsReviewProps {
  agents: Agent[];
  onRefresh?: () => void;
}

const ConsolidatedInsightsReview = ({ agents, onRefresh }: ConsolidatedInsightsReviewProps) => {
  const [insights, setInsights] = useState<ConsolidatedInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [selectedInsights, setSelectedInsights] = useState<Set<string>>(new Set());
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [detailInsight, setDetailInsight] = useState<ConsolidatedInsight | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState<ConsolidatedInsight | null>(null);
  const [bulkDiscardAgent, setBulkDiscardAgent] = useState<string | null>(null);

  useEffect(() => {
    fetchConsolidatedInsights();
  }, []);

  const fetchConsolidatedInsights = async () => {
    try {
      const { data, error } = await supabase
        .from('learning_insights')
        .select('*')
        .eq('status', 'consolidated')
        .order('priority', { ascending: true })
        .order('occurrence_count', { ascending: false });

      if (error) throw error;
      setInsights(data || []);
      
      // Auto-expand agents that have consolidated insights
      const agentIds = new Set((data || []).map(i => i.agent_id || 'general'));
      setExpandedAgents(agentIds);
    } catch (error) {
      console.error('Error fetching consolidated insights:', error);
    } finally {
      setLoading(false);
    }
  };

  const getAgentName = (agentId: string | null) => {
    if (!agentId) return 'Geral';
    const agent = agents.find(a => a.id === agentId);
    return agent?.name || 'Desconhecido';
  };

  const getPriorityConfig = (priority: number) => {
    switch (priority) {
      case 1: return { label: 'Crítico', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: AlertTriangle };
      case 2: return { label: 'Alto', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', icon: Lightbulb };
      case 3: return { label: 'Médio', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', icon: Target };
      default: return { label: 'Baixo', color: 'bg-slate-500/20 text-slate-400 border-slate-500/30', icon: Target };
    }
  };

  const groupedByAgent = insights.reduce((acc, insight) => {
    const key = insight.agent_id || 'general';
    if (!acc[key]) acc[key] = [];
    acc[key].push(insight);
    return acc;
  }, {} as Record<string, ConsolidatedInsight[]>);

  const applyInsight = async (insight: ConsolidatedInsight) => {
    setApplying(insight.id);
    try {
      // Fetch agent to get current prompt
      const { data: agent, error: agentError } = await supabase
        .from('agents')
        .select('id, name, system_prompt')
        .eq('id', insight.agent_id!)
        .single();

      if (agentError) throw agentError;

      // Format the learning to add
      const now = new Date().toISOString().split('T')[0];
      const newLearning = `\n\n<!-- Aprendizado aplicado em ${now} -->\n### ${insight.title}\n${insight.suggestion || insight.description}`;

      // Update agent prompt
      const updatedPrompt = (agent.system_prompt || '') + newLearning;
      
      const { error: updateError } = await supabase
        .from('agents')
        .update({ system_prompt: updatedPrompt, updated_at: new Date().toISOString() })
        .eq('id', insight.agent_id!);

      if (updateError) throw updateError;

      // Update insight status to applied
      const { error: insightError } = await supabase
        .from('learning_insights')
        .update({ 
          status: 'applied', 
          applied_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', insight.id);

      if (insightError) throw insightError;

      toast.success(`Insight aplicado ao prompt de ${agent.name}!`);
      fetchConsolidatedInsights();
      onRefresh?.();
    } catch (error) {
      console.error('Error applying insight:', error);
      toast.error('Erro ao aplicar insight');
    } finally {
      setApplying(null);
    }
  };

  const discardInsight = async (insight: ConsolidatedInsight) => {
    try {
      const { error } = await supabase
        .from('learning_insights')
        .update({ 
          status: 'discarded',
          updated_at: new Date().toISOString()
        })
        .eq('id', insight.id);

      if (error) throw error;

      toast.success('Insight descartado');
      setConfirmDiscard(null);
      fetchConsolidatedInsights();
      onRefresh?.();
    } catch (error) {
      console.error('Error discarding insight:', error);
      toast.error('Erro ao descartar insight');
    }
  };

  const bulkDiscardByAgent = async (agentId: string) => {
    try {
      const { error } = await supabase
        .from('learning_insights')
        .update({ 
          status: 'discarded',
          updated_at: new Date().toISOString()
        })
        .eq('agent_id', agentId)
        .eq('status', 'consolidated');

      if (error) throw error;

      const discardedCount = groupedByAgent[agentId]?.length || 0;
      toast.success(`${discardedCount} insights descartados`);
      setBulkDiscardAgent(null);
      fetchConsolidatedInsights();
      onRefresh?.();
    } catch (error) {
      console.error('Error bulk discarding:', error);
      toast.error('Erro ao descartar insights');
    }
  };

  const toggleAgentExpand = (agentId: string) => {
    const newExpanded = new Set(expandedAgents);
    if (newExpanded.has(agentId)) {
      newExpanded.delete(agentId);
    } else {
      newExpanded.add(agentId);
    }
    setExpandedAgents(newExpanded);
  };

  if (loading) {
    return (
      <Card className="bg-slate-900/60 backdrop-blur-xl border-slate-700/50 shadow-xl">
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (insights.length === 0) {
    return (
      <Card className="bg-slate-900/60 backdrop-blur-xl border-slate-700/50 shadow-xl">
        <CardHeader className="border-b border-slate-700/30 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30">
              <Layers className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <CardTitle className="text-white text-lg">📋 Insights Consolidados</CardTitle>
              <p className="text-sm text-slate-400 mt-0.5">Revisão de insights mesclados pelo supervisor</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="text-center py-8 text-slate-400">
            <Sparkles className="w-12 h-12 mx-auto mb-3 text-slate-600" />
            <p>Nenhum insight consolidado aguardando revisão</p>
            <p className="text-sm text-slate-500 mt-1">Execute a consolidação para gerar novos insights</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="relative overflow-hidden bg-slate-900/60 backdrop-blur-xl border-slate-700/50 shadow-xl">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-cyan-500/5 pointer-events-none" />
        
        <CardHeader className="relative border-b border-slate-700/30 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 shadow-lg shadow-emerald-500/10">
                <Layers className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-white text-lg">📋 Insights Consolidados</CardTitle>
                <p className="text-sm text-slate-400 mt-0.5">
                  {insights.length} insight{insights.length !== 1 ? 's' : ''} aguardando revisão
                </p>
              </div>
            </div>
            <Badge className="bg-emerald-500/20 text-emerald-400 border-0">
              {insights.length} para revisar
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="relative p-4 space-y-4">
          {Object.entries(groupedByAgent).map(([agentId, agentInsights]) => (
            <div key={agentId} className="rounded-xl bg-slate-800/40 border border-slate-700/50 overflow-hidden">
              {/* Agent Header */}
              <button
                onClick={() => toggleAgentExpand(agentId)}
                className="w-full flex items-center justify-between p-4 hover:bg-slate-800/60 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-white">{getAgentName(agentId === 'general' ? null : agentId)}</span>
                  <Badge className="bg-emerald-500/20 text-emerald-400 border-0 text-xs">
                    {agentInsights.length} consolidado{agentInsights.length !== 1 ? 's' : ''}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setBulkDiscardAgent(agentId);
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Descartar Todos
                  </Button>
                  {expandedAgents.has(agentId) ? (
                    <ChevronUp className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  )}
                </div>
              </button>

              {/* Agent Insights */}
              {expandedAgents.has(agentId) && (
                <div className="border-t border-slate-700/50 divide-y divide-slate-700/30">
                  {agentInsights.map((insight) => {
                    const priorityConfig = getPriorityConfig(insight.priority ?? 2);
                    const PriorityIcon = priorityConfig.icon;
                    
                    return (
                      <div
                        key={insight.id}
                        className="p-4 hover:bg-slate-800/40 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge className={cn("border text-xs", priorityConfig.color)}>
                                <PriorityIcon className="w-3 h-3 mr-1" />
                                {priorityConfig.label}
                              </Badge>
                              <span className="text-xs text-slate-500">
                                {insight.occurrence_count} ocorrência{insight.occurrence_count !== 1 ? 's' : ''}
                              </span>
                            </div>
                            <h4 className="font-medium text-white mb-1 truncate">
                              {insight.title}
                            </h4>
                            <p className="text-sm text-slate-400 line-clamp-2">
                              {insight.description}
                            </p>
                          </div>
                          
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-slate-400 hover:text-white"
                              onClick={() => setDetailInsight(insight)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                              onClick={() => setConfirmDiscard(insight)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30"
                              onClick={() => applyInsight(insight)}
                              disabled={applying === insight.id}
                            >
                              {applying === insight.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <>
                                  <Check className="w-4 h-4 mr-1" />
                                  Aplicar
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <Dialog open={!!detailInsight} onOpenChange={() => setDetailInsight(null)}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-emerald-400" />
              {detailInsight?.title}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Insight consolidado pelo supervisor
            </DialogDescription>
          </DialogHeader>
          
          {detailInsight && (
            <div className="space-y-4 mt-4">
              <div>
                <h4 className="text-sm font-medium text-slate-400 mb-1">Descrição</h4>
                <p className="text-white bg-slate-800/50 p-3 rounded-lg">
                  {detailInsight.description}
                </p>
              </div>
              
              {detailInsight.suggestion && (
                <div>
                  <h4 className="text-sm font-medium text-slate-400 mb-1">Sugestão de Melhoria</h4>
                  <p className="text-emerald-400 bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20">
                    {detailInsight.suggestion}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-4 text-sm text-slate-400">
                <span>Categoria: <span className="text-white">{detailInsight.category}</span></span>
                <span>Ocorrências: <span className="text-white">{detailInsight.occurrence_count}</span></span>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-700">
                <Button
                  variant="ghost"
                  className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                  onClick={() => {
                    setConfirmDiscard(detailInsight);
                    setDetailInsight(null);
                  }}
                >
                  <X className="w-4 h-4 mr-1" />
                  Descartar
                </Button>
                <Button
                  className="bg-emerald-500 text-white hover:bg-emerald-600"
                  onClick={() => {
                    applyInsight(detailInsight);
                    setDetailInsight(null);
                  }}
                  disabled={applying === detailInsight.id}
                >
                  <Check className="w-4 h-4 mr-1" />
                  Aplicar ao Prompt
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm Discard Dialog */}
      <AlertDialog open={!!confirmDiscard} onOpenChange={() => setConfirmDiscard(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Descartar insight?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              O insight "{confirmDiscard?.title}" será descartado permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 text-white border-slate-700 hover:bg-slate-700">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 text-white hover:bg-red-600"
              onClick={() => confirmDiscard && discardInsight(confirmDiscard)}
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Discard Dialog */}
      <AlertDialog open={!!bulkDiscardAgent} onOpenChange={() => setBulkDiscardAgent(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Descartar todos os insights?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Todos os {groupedByAgent[bulkDiscardAgent || '']?.length || 0} insights consolidados de{' '}
              <span className="text-white font-medium">
                {getAgentName(bulkDiscardAgent === 'general' ? null : bulkDiscardAgent)}
              </span>{' '}
              serão descartados permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-slate-800 text-white border-slate-700 hover:bg-slate-700">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 text-white hover:bg-red-600"
              onClick={() => bulkDiscardAgent && bulkDiscardByAgent(bulkDiscardAgent)}
            >
              Descartar Todos
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ConsolidatedInsightsReview;
