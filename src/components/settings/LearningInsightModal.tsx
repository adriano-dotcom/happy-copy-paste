import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { 
  AlertTriangle, 
  Lightbulb, 
  Check, 
  X, 
  Clock,
  FileText,
  Eye,
  Edit,
  Sparkles,
  MessageSquare
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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

interface LearningInsightModalProps {
  insight: LearningInsight;
  agents: Agent[];
  onClose: () => void;
  onUpdate: (id: string, status: string, rejectionReason?: string) => void;
  onRefresh: () => void;
}

const LearningInsightModal = ({ insight, agents, onClose, onUpdate, onRefresh }: LearningInsightModalProps) => {
  const [reviewNotes, setReviewNotes] = useState(insight.review_notes || '');
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectionInput, setShowRejectionInput] = useState(false);

  const getPriorityConfig = (priority: number) => {
    switch (priority) {
      case 1:
        return { label: 'CRÍTICO', color: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-500/30' };
      case 2:
        return { label: 'ALTO', color: 'text-amber-400', bg: 'bg-amber-500/20', border: 'border-amber-500/30' };
      default:
        return { label: 'MÉDIO', color: 'text-blue-400', bg: 'bg-blue-500/20', border: 'border-blue-500/30' };
    }
  };

  const getCategoryConfig = (category: string) => {
    switch (category) {
      case 'prompt':
        return { label: 'Ajuste no Prompt', icon: Edit, color: 'text-purple-400', bg: 'bg-purple-500/20' };
      case 'process':
        return { label: 'Processo', icon: FileText, color: 'text-cyan-400', bg: 'bg-cyan-500/20' };
      case 'training':
        return { label: 'Treinamento', icon: Sparkles, color: 'text-amber-400', bg: 'bg-amber-500/20' };
      default:
        return { label: category, icon: Lightbulb, color: 'text-slate-400', bg: 'bg-slate-500/20' };
    }
  };

  const getAgentName = (agentId: string | null) => {
    if (!agentId) return 'Todos os Agentes';
    const agent = agents.find(a => a.id === agentId);
    return agent?.name || 'Desconhecido';
  };

  const priorityConfig = getPriorityConfig(insight.priority);
  const categoryConfig = getCategoryConfig(insight.category);
  const CategoryIcon = categoryConfig.icon;

  const handleApply = () => {
    onUpdate(insight.id, 'applied');
  };

  const handleReject = () => {
    if (!rejectionReason.trim()) {
      setShowRejectionInput(true);
      return;
    }
    onUpdate(insight.id, 'rejected', rejectionReason);
  };

  const handleStartReview = () => {
    onUpdate(insight.id, 'reviewing');
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-slate-900/95 backdrop-blur-xl border-slate-700/50 text-white">
        <DialogHeader className="border-b border-slate-700/30 pb-4">
          <div className="flex items-center gap-3 mb-2">
            <Badge className={cn("text-xs font-semibold", priorityConfig.bg, priorityConfig.color, "border-0")}>
              <AlertTriangle className="w-3 h-3 mr-1" />
              {priorityConfig.label}
            </Badge>
            <Badge className={cn("text-xs", categoryConfig.bg, categoryConfig.color, "border-0")}>
              <CategoryIcon className="w-3 h-3 mr-1" />
              {categoryConfig.label}
            </Badge>
            <span className={cn(
              "text-xs font-semibold px-2 py-0.5 rounded-full",
              insight.occurrence_count >= 5 ? "bg-red-500/20 text-red-400" :
              insight.occurrence_count >= 3 ? "bg-amber-500/20 text-amber-400" :
              "bg-slate-700/50 text-slate-400"
            )}>
              Apareceu {insight.occurrence_count}x
            </span>
          </div>
          <DialogTitle className="text-xl">{insight.title}</DialogTitle>
          <DialogDescription className="text-slate-400">
            Agente: {getAgentName(insight.agent_id)} • Criado em {format(new Date(insight.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4 max-h-[60vh] overflow-y-auto">
          {/* Description */}
          <div className="space-y-2">
            <Label className="text-sm text-slate-400 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Problema Identificado
            </Label>
            <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/30">
              <p className="text-white">{insight.description}</p>
            </div>
          </div>

          {/* Suggestion */}
          {insight.suggestion && (
            <div className="space-y-2">
              <Label className="text-sm text-slate-400 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-cyan-400" />
                Sugestão de Correção
              </Label>
              <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                <p className="text-cyan-300">{insight.suggestion}</p>
              </div>
            </div>
          )}

          {/* Impact */}
          {insight.impact && (
            <div className="space-y-2">
              <Label className="text-sm text-slate-400 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                Impacto Esperado
              </Label>
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <p className="text-amber-300">{insight.impact}</p>
              </div>
            </div>
          )}

          {/* Examples */}
          {insight.examples && insight.examples.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm text-slate-400 flex items-center gap-2">
                <Eye className="w-4 h-4" />
                Exemplos ({insight.examples.length})
              </Label>
              <div className="space-y-2">
                {insight.examples.map((example: any, idx: number) => (
                  <div 
                    key={idx} 
                    className={cn(
                      "p-3 rounded-lg border text-sm",
                      example.type === 'good' 
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                        : "bg-red-500/10 border-red-500/20 text-red-300"
                    )}
                  >
                    <span className="font-semibold">
                      {example.type === 'good' ? '✅ Bom:' : '❌ Ruim:'}
                    </span>
                    <p className="mt-1">{example.text}</p>
                    {example.context && (
                      <p className="mt-1 text-xs opacity-70">Contexto: {example.context}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Source reports info */}
          {insight.source_reports && insight.source_reports.length > 0 && (
            <div className="text-xs text-slate-500 flex items-center gap-2">
              <FileText className="w-3 h-3" />
              Baseado em {insight.source_reports.length} relatório(s)
            </div>
          )}

          {/* Review Notes */}
          <div className="space-y-2">
            <Label className="text-sm text-slate-400">Notas da Revisão</Label>
            <Textarea
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              placeholder="Adicione notas sobre a revisão..."
              className="bg-slate-800/60 border-slate-700/50 text-white resize-none min-h-[80px]"
            />
          </div>

          {/* Rejection reason input */}
          {showRejectionInput && (
            <div className="space-y-2">
              <Label className="text-sm text-red-400">Motivo da Rejeição</Label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explique por que este insight não será aplicado..."
                className="bg-red-500/10 border-red-500/30 text-white resize-none min-h-[60px]"
              />
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-slate-700/30 pt-4 gap-2">
          {insight.status === 'pending' && (
            <Button
              variant="outline"
              className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20"
              onClick={handleStartReview}
            >
              <Clock className="w-4 h-4 mr-2" />
              Iniciar Revisão
            </Button>
          )}
          
          <Button
            variant="outline"
            className="border-red-500/30 text-red-400 hover:bg-red-500/20"
            onClick={handleReject}
          >
            <X className="w-4 h-4 mr-2" />
            Rejeitar
          </Button>
          
          <Button
            className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white"
            onClick={handleApply}
          >
            <Check className="w-4 h-4 mr-2" />
            Marcar como Aplicado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default LearningInsightModal;
