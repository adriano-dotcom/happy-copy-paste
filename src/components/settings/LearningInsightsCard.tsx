import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  BookOpen, 
  Eye, 
  Edit, 
  Check, 
  X, 
  AlertTriangle,
  Lightbulb,
  ChevronRight,
  Clock,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import LearningInsightModal from './LearningInsightModal';

interface LearningInsight {
  id: string;
  category: string;
  agent_id: string | null;
  pipeline_id: string | null;
  title: string;
  description: string;
  suggestion: string | null;
  examples: any[];
  priority: number;
  impact: string | null;
  occurrence_count: number;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  applied_at: string | null;
  rejection_reason: string | null;
  review_notes: string | null;
  source_reports: string[];
  created_at: string;
  updated_at: string;
}

interface Agent {
  id: string;
  name: string;
}

interface LearningInsightsCardProps {
  agents: Agent[];
}

const LearningInsightsCard = ({ agents }: LearningInsightsCardProps) => {
  const [insights, setInsights] = useState<LearningInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInsight, setSelectedInsight] = useState<LearningInsight | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetchInsights();
  }, []);

  const fetchInsights = async () => {
    try {
      const { data, error } = await supabase
        .from('learning_insights')
        .select('*')
        .in('status', ['pending', 'reviewing'])
        .order('priority', { ascending: true })
        .order('occurrence_count', { ascending: false });

      if (error) throw error;
      setInsights((data as LearningInsight[]) || []);
    } catch (error) {
      console.error('Error fetching insights:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPriorityConfig = (priority: number) => {
    switch (priority) {
      case 1:
        return { 
          label: 'CRÍTICO', 
          color: 'text-red-400', 
          bg: 'bg-red-500/20',
          border: 'border-red-500/30',
          glow: 'shadow-red-500/20',
          icon: AlertTriangle
        };
      case 2:
        return { 
          label: 'ALTO', 
          color: 'text-amber-400', 
          bg: 'bg-amber-500/20',
          border: 'border-amber-500/30',
          glow: 'shadow-amber-500/20',
          icon: AlertTriangle
        };
      default:
        return { 
          label: 'MÉDIO', 
          color: 'text-blue-400', 
          bg: 'bg-blue-500/20',
          border: 'border-blue-500/30',
          glow: 'shadow-blue-500/20',
          icon: Lightbulb
        };
    }
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'pending':
        return { label: 'Pendente', color: 'text-slate-400', bg: 'bg-slate-500/20', icon: Clock };
      case 'reviewing':
        return { label: 'Em Revisão', color: 'text-cyan-400', bg: 'bg-cyan-500/20', icon: Eye };
      case 'applied':
        return { label: 'Aplicado', color: 'text-emerald-400', bg: 'bg-emerald-500/20', icon: CheckCircle2 };
      case 'rejected':
        return { label: 'Rejeitado', color: 'text-red-400', bg: 'bg-red-500/20', icon: XCircle };
      default:
        return { label: status, color: 'text-slate-400', bg: 'bg-slate-500/20', icon: Clock };
    }
  };

  const getAgentName = (agentId: string | null) => {
    if (!agentId) return 'Geral';
    const agent = agents.find(a => a.id === agentId);
    return agent?.name || 'Desconhecido';
  };

  const integrateInsightToPrompt = async (insight: LearningInsight): Promise<boolean> => {
    if (!insight.agent_id || !insight.suggestion) {
      console.log('[LearningInsights] Insight sem agent_id ou suggestion, pulando integração');
      return false;
    }

    try {
      // Buscar prompt atual do agente
      const { data: agent, error: agentError } = await supabase
        .from('agents')
        .select('id, name, system_prompt')
        .eq('id', insight.agent_id)
        .single();

      if (agentError || !agent) {
        console.error('[LearningInsights] Erro ao buscar agente:', agentError);
        throw new Error('Agente não encontrado');
      }

      // Preparar novo aprendizado formatado
      const newLearning = `### ${insight.title}\n${insight.suggestion}`;
      
      // Atualizar ou criar seção de aprendizados
      let updatedPrompt = agent.system_prompt || '';
      const learningsHeader = '## APRENDIZADOS APLICADOS';
      const dateStr = new Date().toLocaleDateString('pt-BR');
      
      if (updatedPrompt.includes(learningsHeader)) {
        // Seção existe - verificar se insight já foi adicionado
        if (updatedPrompt.includes(`### ${insight.title}`)) {
          console.log('[LearningInsights] Insight já existe no prompt, pulando');
          return true;
        }
        
        // Encontrar o final da seção e adicionar novo insight
        const sectionStart = updatedPrompt.indexOf(learningsHeader);
        const sectionEndMarker = updatedPrompt.indexOf('\n---', sectionStart + learningsHeader.length);
        
        if (sectionEndMarker !== -1) {
          // Inserir antes do marcador de fim
          updatedPrompt = 
            updatedPrompt.slice(0, sectionEndMarker) + 
            `\n\n${newLearning}` + 
            updatedPrompt.slice(sectionEndMarker);
        } else {
          // Adicionar no final
          updatedPrompt = updatedPrompt.trim() + `\n\n${newLearning}`;
        }
        
        // Atualizar data
        updatedPrompt = updatedPrompt.replace(
          /Última atualização: .*/,
          `Última atualização: ${dateStr}`
        );
      } else {
        // Seção não existe - criar no final do prompt
        const learningsSection = `

---

## APRENDIZADOS APLICADOS

> Seção gerada automaticamente a partir de insights aprovados.
> Última atualização: ${dateStr}

${newLearning}

---`;
        
        updatedPrompt = updatedPrompt.trim() + learningsSection;
      }

      // Salvar prompt atualizado
      const { error: updateError } = await supabase
        .from('agents')
        .update({ 
          system_prompt: updatedPrompt,
          updated_at: new Date().toISOString()
        })
        .eq('id', insight.agent_id);

      if (updateError) {
        console.error('[LearningInsights] Erro ao atualizar prompt:', updateError);
        throw new Error('Falha ao integrar insight ao prompt');
      }

      console.log(`[LearningInsights] Insight "${insight.title}" integrado ao prompt do agente ${agent.name}`);
      return true;
    } catch (error) {
      console.error('[LearningInsights] Erro na integração:', error);
      throw error;
    }
  };

  const handleUpdateStatus = async (insightId: string, newStatus: string, rejectionReason?: string) => {
    try {
      // Se for aplicação, buscar dados completos do insight primeiro
      let insightData: LearningInsight | null = null;
      
      if (newStatus === 'applied') {
        const { data, error: fetchError } = await supabase
          .from('learning_insights')
          .select('*')
          .eq('id', insightId)
          .single();
        
        if (fetchError) throw fetchError;
        insightData = data as LearningInsight;
        
        // Se for insight de prompt com agent_id e suggestion, integrar ao prompt
        if (insightData.category === 'prompt' && insightData.agent_id && insightData.suggestion) {
          await integrateInsightToPrompt(insightData);
        }
      }

      const updateData: any = { 
        status: newStatus,
        updated_at: new Date().toISOString()
      };

      if (newStatus === 'reviewing') {
        updateData.reviewed_at = new Date().toISOString();
      } else if (newStatus === 'applied') {
        updateData.applied_at = new Date().toISOString();
      } else if (newStatus === 'rejected' && rejectionReason) {
        updateData.rejection_reason = rejectionReason;
      }

      const { error } = await supabase
        .from('learning_insights')
        .update(updateData)
        .eq('id', insightId);

      if (error) throw error;

      const successMessage = newStatus === 'applied' && insightData?.category === 'prompt' && insightData?.agent_id
        ? 'Insight aplicado e integrado ao prompt do agente!'
        : newStatus === 'applied' 
          ? 'Insight aplicado com sucesso'
          : newStatus === 'rejected' 
            ? 'Insight rejeitado' 
            : 'Insight atualizado';

      toast.success(successMessage);
      fetchInsights();
      setShowModal(false);
    } catch (error) {
      console.error('Error updating insight:', error);
      toast.error('Erro ao atualizar insight');
    }
  };

  const pendingCount = insights.filter(i => i.status === 'pending').length;
  const reviewingCount = insights.filter(i => i.status === 'reviewing').length;
  const displayedInsights = showAll ? insights : insights.slice(0, 5);

  if (loading) {
    return (
      <Card className="bg-slate-900/60 backdrop-blur-xl border-slate-700/50 shadow-xl">
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="relative overflow-hidden bg-slate-900/60 backdrop-blur-xl border-slate-700/50 shadow-xl">
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-cyan-500/5 pointer-events-none" />
        
        <CardHeader className="relative border-b border-slate-700/30 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500/20 to-cyan-500/20 border border-purple-500/30 shadow-lg shadow-purple-500/10">
                <BookOpen className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <CardTitle className="text-white text-lg">📚 O que Aprendemos</CardTitle>
                <p className="text-sm text-slate-400 mt-0.5">Insights consolidados dos relatórios de coaching</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {pendingCount > 0 && (
                <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  {pendingCount} Pendentes
                </Badge>
              )}
              {reviewingCount > 0 && (
                <Badge className="bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                  {reviewingCount} Em Revisão
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="relative p-4 space-y-3">
          {insights.length === 0 ? (
            <div className="text-center py-8">
              <Lightbulb className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400">Nenhum insight pendente</p>
              <p className="text-sm text-slate-500 mt-1">Insights serão agregados automaticamente dos relatórios</p>
            </div>
          ) : (
            <>
              {displayedInsights.map((insight) => {
                const priorityConfig = getPriorityConfig(insight.priority);
                const statusConfig = getStatusConfig(insight.status);
                const PriorityIcon = priorityConfig.icon;
                
                return (
                  <div
                    key={insight.id}
                    className={cn(
                      "p-4 rounded-xl backdrop-blur-sm transition-all duration-300",
                      "bg-slate-800/40 border",
                      priorityConfig.border,
                      "hover:bg-slate-800/60 hover:shadow-lg",
                      priorityConfig.glow,
                      insight.priority === 1 && "animate-pulse"
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Header with priority and count */}
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className={cn("text-xs font-semibold", priorityConfig.bg, priorityConfig.color, "border-0")}>
                            <PriorityIcon className="w-3 h-3 mr-1" />
                            {priorityConfig.label}
                          </Badge>
                          <Badge className={cn("text-xs", statusConfig.bg, statusConfig.color, "border-0")}>
                            {statusConfig.label}
                          </Badge>
                          <span className="text-xs text-slate-500">
                            {getAgentName(insight.agent_id)}
                          </span>
                          <span className={cn(
                            "ml-auto text-xs font-semibold px-2 py-0.5 rounded-full",
                            insight.occurrence_count >= 5 ? "bg-red-500/20 text-red-400" :
                            insight.occurrence_count >= 3 ? "bg-amber-500/20 text-amber-400" :
                            "bg-slate-700/50 text-slate-400"
                          )}>
                            [{insight.occurrence_count}x]
                          </span>
                        </div>

                        {/* Title and description */}
                        <h4 className="font-medium text-white mb-1 truncate">{insight.title}</h4>
                        <p className="text-sm text-slate-400 line-clamp-2">{insight.description}</p>

                        {/* Suggestion preview */}
                        {insight.suggestion && (
                          <div className="mt-2 flex items-start gap-2 text-sm">
                            <Lightbulb className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
                            <span className="text-cyan-400/80 line-clamp-1">{insight.suggestion}</span>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-slate-700/50"
                          onClick={() => {
                            setSelectedInsight(insight);
                            setShowModal(true);
                          }}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/20"
                          onClick={() => {
                            setSelectedInsight(insight);
                            setShowModal(true);
                          }}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20"
                          onClick={() => handleUpdateStatus(insight.id, 'applied')}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/20"
                          onClick={() => handleUpdateStatus(insight.id, 'rejected', 'Não aplicável')}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Show more button */}
              {insights.length > 5 && (
                <Button
                  variant="ghost"
                  className="w-full text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
                  onClick={() => setShowAll(!showAll)}
                >
                  {showAll ? 'Ver menos' : `Ver Todos os Aprendizados (${insights.length})`}
                  <ChevronRight className={cn("w-4 h-4 ml-1 transition-transform", showAll && "rotate-90")} />
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Modal */}
      {showModal && selectedInsight && (
        <LearningInsightModal
          insight={selectedInsight}
          agents={agents}
          onClose={() => {
            setShowModal(false);
            setSelectedInsight(null);
          }}
          onUpdate={handleUpdateStatus}
          onRefresh={fetchInsights}
        />
      )}
    </>
  );
};

export default LearningInsightsCard;
