import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Trash2, Loader2, AlertTriangle } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Agent {
  id: string;
  name: string;
}

interface InsightCounts {
  pending: number;
  reviewing: number;
  total: number;
}

interface BulkInsightActionsProps {
  agents: Agent[];
  counts: Record<string, InsightCounts>;
  onComplete: () => void;
}

const BulkInsightActions = ({ agents, counts, onComplete }: BulkInsightActionsProps) => {
  const [loading, setLoading] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [showConfirm, setShowConfirm] = useState(false);

  const totalPending = Object.values(counts).reduce((sum, c) => sum + c.pending, 0);
  const totalReviewing = Object.values(counts).reduce((sum, c) => sum + c.reviewing, 0);
  const totalToDiscard = totalPending + totalReviewing;

  const getAgentTotal = (agentId: string) => {
    const agentCounts = counts[agentId] || { pending: 0, reviewing: 0 };
    return agentCounts.pending + agentCounts.reviewing;
  };

  const getDiscardCount = () => {
    if (selectedAgent === 'all') {
      return totalToDiscard;
    }
    return getAgentTotal(selectedAgent);
  };

  const handleBulkDiscard = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('learning_insights')
        .update({ 
          status: 'discarded',
          updated_at: new Date().toISOString()
        })
        .in('status', ['pending', 'reviewing']);

      if (selectedAgent !== 'all') {
        query = query.eq('agent_id', selectedAgent);
      }

      const { error } = await query;

      if (error) throw error;

      toast.success(`${getDiscardCount()} insights descartados com sucesso!`);
      setShowConfirm(false);
      onComplete();
    } catch (error) {
      console.error('Error bulk discarding:', error);
      toast.error('Erro ao descartar insights');
    } finally {
      setLoading(false);
    }
  };

  if (totalToDiscard === 0) {
    return null;
  }

  return (
    <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          className="border-red-500/30 text-red-400 hover:bg-red-500/20 hover:text-red-300"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Limpar Pendentes
          <Badge className="ml-2 bg-red-500/20 text-red-400 border-0">
            {totalToDiscard}
          </Badge>
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent className="bg-slate-900 border-slate-700">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            Limpar Insights Pendentes
          </AlertDialogTitle>
          <AlertDialogDescription className="text-slate-400 space-y-4">
            <p>
              Esta ação irá descartar todos os insights com status "pendente" ou "em revisão".
              Esta ação não pode ser desfeita.
            </p>

            <div className="space-y-2">
              <label className="text-sm text-slate-300">Escopo da limpeza:</label>
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue placeholder="Selecione o agente" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="all" className="text-white">
                    Todos os agentes ({totalToDiscard} insights)
                  </SelectItem>
                  {agents.map((agent) => {
                    const agentTotal = getAgentTotal(agent.id);
                    if (agentTotal === 0) return null;
                    return (
                      <SelectItem key={agent.id} value={agent.id} className="text-white">
                        {agent.name} ({agentTotal} insights)
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-red-400 font-medium">
                {getDiscardCount()} insight{getDiscardCount() !== 1 ? 's' : ''} será{getDiscardCount() !== 1 ? 'ão' : ''} descartado{getDiscardCount() !== 1 ? 's' : ''}
              </p>
              {selectedAgent === 'all' ? (
                <p className="text-sm text-slate-400 mt-1">
                  {totalPending} pendentes + {totalReviewing} em revisão
                </p>
              ) : (
                <p className="text-sm text-slate-400 mt-1">
                  De: {agents.find(a => a.id === selectedAgent)?.name || 'Desconhecido'}
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel 
            className="bg-slate-800 text-white border-slate-700 hover:bg-slate-700"
            disabled={loading}
          >
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-500 text-white hover:bg-red-600"
            onClick={(e) => {
              e.preventDefault();
              handleBulkDiscard();
            }}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Descartando...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                Descartar {getDiscardCount()} Insights
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default BulkInsightActions;
