import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Plus, Search, MoreHorizontal, DollarSign, Loader2, CalendarClock, Tag, X, 
  Building, User, Calendar, ArrowRight, CheckCircle2, Circle, 
  FileText, Phone, Mail, Paperclip, Send, CheckSquare, Clock, Trash2, Settings, Brain, MessageSquare
} from 'lucide-react';
import { Button } from './Button';
import { api } from '../services/api';
import { Deal, DealActivity, TeamMember, KanbanColumn, Pipeline } from '../types';
import { supabase } from '../integrations/supabase/client';
import { CreateDealModal } from './CreateDealModal';
import { LostReasonModal } from './LostReasonModal';
import { PipelineSettingsModal } from './PipelineSettingsModal';
import { EmailComposeModal } from './EmailComposeModal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { toast } from 'sonner';
import { useCompanySettings } from '@/hooks/useCompanySettings';

const Kanban: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { sdrName } = useCompanySettings();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [stages, setStages] = useState<KanbanColumn[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [activeTab, setActiveTab] = useState<'note' | 'activity' | 'email'>('note');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isLostModalOpen, setIsLostModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [activities, setActivities] = useState<DealActivity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [newActivityTitle, setNewActivityTitle] = useState('');
  const [newActivityDescription, setNewActivityDescription] = useState('');
  const [conversationMessages, setConversationMessages] = useState<any[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  
  const dragItem = useRef<string | null>(null);
  
  const handleDealCreated = async () => {
    // Reload deals after creation
    const pipelineId = selectedPipelineId === 'all' ? undefined : selectedPipelineId;
    const data = await api.fetchPipeline(pipelineId);
    setDeals(data);
  };

  // Load pipelines on mount and check URL param for pipeline selection
  useEffect(() => {
    const loadPipelines = async () => {
      try {
        let data = await api.fetchPipelines();
        // Link agents to pipelines if needed
        if (data.length > 0 && !data[0].agentId) {
          await api.linkAgentsToPipelines();
          data = await api.fetchPipelines();
        }
        setPipelines(data);
        
        // Check URL param first
        const pipelineParam = searchParams.get('pipeline');
        if (pipelineParam && data.some(p => p.id === pipelineParam)) {
          setSelectedPipelineId(pipelineParam);
          // Clear URL param after using it
          searchParams.delete('pipeline');
          setSearchParams(searchParams, { replace: true });
        } else {
          // Definir "Transporte" como padrão
          const transportePipeline = data.find(p => p.slug === 'transporte');
          if (transportePipeline) {
            setSelectedPipelineId(transportePipeline.id);
          } else if (data.length > 0) {
            setSelectedPipelineId(data[0].id);
          } else {
            setSelectedPipelineId('all');
          }
        }
      } catch (error) {
        console.error("Erro ao carregar pipelines", error);
        setSelectedPipelineId('all');
      }
    };
    loadPipelines();
  }, []);

  useEffect(() => {
    // Aguardar seleção de pipeline
    if (!selectedPipelineId) return;
    
    const loadStages = async () => {
      try {
        const pipelineId = selectedPipelineId === 'all' ? undefined : selectedPipelineId;
        const data = await api.fetchPipelineStages(pipelineId);
        setStages(data);
      } catch (error) {
        console.error("Erro ao carregar etapas", error);
      }
    };
    loadStages();

    const loadPipeline = async () => {
      try {
        const pipelineId = selectedPipelineId === 'all' ? undefined : selectedPipelineId;
        const data = await api.fetchPipeline(pipelineId);
        setDeals(data);
      } catch (error) {
        console.error("Erro ao carregar pipeline", error);
      } finally {
        setLoading(false);
      }
    };
    loadPipeline();

    // Load team members
    const loadTeamMembers = async () => {
      try {
        const members = await api.fetchTeam();
        setTeamMembers(members);
      } catch (error) {
        console.error("Erro ao carregar membros da equipe", error);
      }
    };
    loadTeamMembers();

    // Real-time subscription for deals and stages
    const dealsChannel = supabase
      .channel('deals-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deals'
        },
        async () => {
          const pipelineId = selectedPipelineId === 'all' ? undefined : selectedPipelineId;
          const data = await api.fetchPipeline(pipelineId);
          setDeals(data);
        }
      )
      .subscribe();

    const stagesChannel = supabase
      .channel('pipeline-stages-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pipeline_stages'
        },
        async () => {
          const pipelineId = selectedPipelineId === 'all' ? undefined : selectedPipelineId;
          const data = await api.fetchPipelineStages(pipelineId);
          setStages(data);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(dealsChannel);
      supabase.removeChannel(stagesChannel);
    };
  }, [selectedPipelineId]);

  // Load activities when deal is selected
  useEffect(() => {
    if (selectedDeal) {
      loadActivities();
    }
  }, [selectedDeal?.id]);

  // Load conversation messages when deal is selected
  useEffect(() => {
    if (selectedDeal?.conversationId) {
      loadConversationMessages();
    } else {
      setConversationMessages([]);
    }
  }, [selectedDeal?.conversationId]);

  const loadConversationMessages = async () => {
    if (!selectedDeal?.conversationId) return;
    setLoadingMessages(true);
    try {
      const messages = await api.fetchConversationMessages(selectedDeal.conversationId, 15);
      setConversationMessages(messages);
    } catch (error) {
      console.error("Erro ao carregar mensagens", error);
    } finally {
      setLoadingMessages(false);
    }
  };

  const loadActivities = async () => {
    if (!selectedDeal) return;
    setLoadingActivities(true);
    try {
      const data = await api.fetchDealActivities(selectedDeal.id);
      setActivities(data);
    } catch (error) {
      console.error("Erro ao carregar atividades", error);
    } finally {
      setLoadingActivities(false);
    }
  };

  const handleMarkWon = async () => {
    if (!selectedDeal) return;
    try {
      await api.markDealWon(selectedDeal.id);
      toast.success("Deal marcado como ganho! Parabéns pelo fechamento!");
      setSelectedDeal(null);
    } catch (error) {
      console.error("Erro ao marcar deal como ganho", error);
      toast.error("Não foi possível marcar como ganho");
    }
  };

  const handleMarkLost = async (reason: string) => {
    if (!selectedDeal) return;
    try {
      await api.markDealLost(selectedDeal.id, reason);
      toast.success("Deal marcado como perdido. Motivo registrado.");
      setSelectedDeal(null);
    } catch (error) {
      console.error("Erro ao marcar deal como perdido", error);
      toast.error("Não foi possível marcar como perdido");
    }
  };

  const handleDeleteDeal = async (dealId: string) => {
    const confirmed = window.confirm("Tem certeza que deseja excluir este negócio? Esta ação não pode ser desfeita.");
    if (!confirmed) return;
    
    try {
      await api.deleteDeal(dealId);
      setDeals(deals.filter(d => d.id !== dealId));
      setSelectedDeal(null);
      toast.success("Negócio excluído com sucesso");
    } catch (error) {
      console.error('Erro ao excluir deal:', error);
      toast.error("Erro ao excluir negócio");
    }
  };

  const handleOwnerChange = async (ownerId: string) => {
    if (!selectedDeal) return;
    try {
      await api.updateDealOwner(selectedDeal.id, ownerId);
      const member = teamMembers.find(m => m.id === ownerId);
      setSelectedDeal({ ...selectedDeal, ownerId, ownerName: member?.name });
      toast.success("Proprietário atualizado");
    } catch (error) {
      console.error("Erro ao atualizar proprietário", error);
      toast.error("Não foi possível atualizar proprietário");
    }
  };

  const handleCreateActivity = async () => {
    if (!selectedDeal || !newActivityTitle.trim()) return;
    try {
      await api.createDealActivity({
        dealId: selectedDeal.id,
        type: activeTab === 'activity' ? 'call' : activeTab === 'email' ? 'email' : 'note',
        title: newActivityTitle,
        description: newActivityDescription,
      });
      setNewActivityTitle('');
      setNewActivityDescription('');
      loadActivities();
      toast.success("Atividade criada");
    } catch (error) {
      console.error("Erro ao criar atividade", error);
      toast.error("Não foi possível criar atividade");
    }
  };

  const handleToggleActivityComplete = async (activityId: string, isCompleted: boolean) => {
    try {
      await api.updateDealActivity(activityId, { isCompleted: !isCompleted });
      loadActivities();
    } catch (error) {
      console.error("Erro ao atualizar atividade", error);
    }
  };

  const handleDeleteActivity = async (activityId: string) => {
    try {
      await api.deleteDealActivity(activityId);
      loadActivities();
      toast.success("Atividade excluída");
    } catch (error) {
      console.error("Erro ao excluir atividade", error);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const onDragStart = (e: React.DragEvent, dealId: string) => {
    dragItem.current = dealId;
    e.dataTransfer.effectAllowed = "move";
    (e.target as HTMLElement).style.opacity = '0.5';
  };

  const onDragEnd = (e: React.DragEvent) => {
    dragItem.current = null;
    (e.target as HTMLElement).style.opacity = '1';
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const onDrop = async (e: React.DragEvent, targetStageId: string) => {
    e.preventDefault();
    const dealId = dragItem.current;
    if (!dealId) return;

    // Optimistic update
    const updatedDeals = deals.map(deal => {
      if (deal.id === dealId) {
        return { ...deal, stageId: targetStageId };
      }
      return deal;
    });
    setDeals(updatedDeals);

    // Persist to database
    try {
      const result = await api.moveDealStage(dealId, targetStageId);
      
      // Show Pipedrive sync feedback
      if (result?.synced) {
        toast.success('✅ Lead sincronizado com Pipedrive!');
      } else if (result?.error && result.error !== 'Pipedrive integration is disabled') {
        toast.error(`❌ Erro ao sincronizar: ${result.error}`);
      }
    } catch (error) {
      console.error('Error moving deal:', error);
      // Revert on error
      const pipelineId = selectedPipelineId === 'all' ? undefined : selectedPipelineId;
      const data = await api.fetchPipeline(pipelineId);
      setDeals(data);
    }
  };

  const filteredDeals = deals.filter(deal => 
    deal.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    deal.company.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getPriorityColor = (priority: string) => {
      switch(priority) {
          case 'high': return 'bg-red-500/10 text-red-400 border-red-500/20';
          case 'medium': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
          default: return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      }
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col bg-slate-950 text-slate-50 p-4 md:p-6 overflow-hidden">
        {/* Header skeleton */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-8 gap-4 flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="space-y-2">
              <div className="h-8 w-48 bg-slate-800/50 rounded animate-pulse" />
              <div className="h-4 w-64 bg-slate-800/50 rounded animate-pulse" />
            </div>
            <div className="h-9 w-[200px] bg-slate-800/50 rounded animate-pulse" />
          </div>
          <div className="flex gap-3">
            <div className="h-10 w-64 bg-slate-800/50 rounded-lg animate-pulse" />
            <div className="h-10 w-28 bg-slate-800/50 rounded-lg animate-pulse" />
            <div className="h-10 w-28 bg-slate-800/50 rounded-lg animate-pulse" />
          </div>
        </div>
        {/* Columns skeleton */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4">
          <div className="flex h-full gap-4 min-w-max">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="w-72 flex flex-col h-full bg-slate-900/30 rounded-xl border border-slate-800/50">
                <div className="p-3 border-b border-slate-800/50 space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="h-4 w-24 bg-slate-800/50 rounded animate-pulse" />
                    <div className="h-5 w-8 bg-slate-800/50 rounded-full animate-pulse" />
                  </div>
                  <div className="h-3 w-20 bg-slate-800/50 rounded animate-pulse" />
                </div>
                <div className="flex-1 p-2 space-y-2">
                  {[1, 2, 3].map((j) => (
                    <div key={j} className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-slate-800/50 rounded animate-pulse" />
                        <div className="h-4 flex-1 bg-slate-800/50 rounded animate-pulse" />
                      </div>
                      <div className="h-3 w-2/3 bg-slate-800/50 rounded animate-pulse" />
                      <div className="flex items-center justify-between">
                        <div className="h-5 w-20 bg-slate-800/50 rounded-full animate-pulse" />
                        <div className="h-4 w-16 bg-slate-800/50 rounded animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-50 p-4 md:p-6 overflow-hidden relative">
      {/* Header */}
      <div className="flex flex-col gap-4 mb-6 md:mb-8 flex-shrink-0">
        {/* Title row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 md:gap-4">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-white">Pipeline de Vendas</h2>
              <p className="text-xs md:text-sm text-slate-400 mt-1 hidden sm:block">Gerencie oportunidades e acompanhe o fluxo de receita.</p>
            </div>
            {/* Pipeline Selector */}
            <Select value={selectedPipelineId} onValueChange={setSelectedPipelineId}>
              <SelectTrigger className="w-full sm:w-[180px] md:w-[200px] h-9 bg-slate-900 border-slate-700">
                <SelectValue placeholder="Selecione pipeline">
                  {selectedPipelineId === 'all' ? (
                    <span className="flex items-center gap-2">📊 Todos</span>
                  ) : (
                    <span className="flex items-center gap-2">
                      {pipelines.find(p => p.id === selectedPipelineId)?.icon} {pipelines.find(p => p.id === selectedPipelineId)?.name}
                    </span>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <span className="flex items-center gap-2">📊 Todos os Pipelines</span>
                </SelectItem>
                {pipelines.map((pipeline) => (
                  <SelectItem key={pipeline.id} value={pipeline.id}>
                    <span className="flex items-center gap-2">
                      {pipeline.icon} {pipeline.name}
                      {pipeline.agentName && (
                        <span className="text-xs text-slate-500">({pipeline.agentName})</span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Actions row */}
          <div className="flex gap-2 md:gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-initial sm:w-48 md:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input 
                type="text" 
                placeholder="Buscar..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 focus:ring-1 focus:ring-cyan-500 outline-none placeholder:text-slate-600"
              />
            </div>
            <Button 
              variant="outline" 
              size="icon"
              className="border-slate-700 text-slate-300 hover:bg-slate-800 md:hidden"
              onClick={() => setIsSettingsModalOpen(true)}
              disabled={selectedPipelineId === 'all'}
              title={selectedPipelineId === 'all' ? 'Selecione um pipeline específico' : 'Configurar etapas'}
            >
              <Settings className="w-4 h-4" />
            </Button>
            <Button 
              variant="outline" 
              className="border-slate-700 text-slate-300 hover:bg-slate-800 hidden md:flex"
              onClick={() => setIsSettingsModalOpen(true)}
              disabled={selectedPipelineId === 'all'}
              title={selectedPipelineId === 'all' ? 'Selecione um pipeline específico' : 'Configurar etapas do pipeline'}
            >
              <Settings className="w-4 h-4 mr-2" />
              Configurar
            </Button>
            <Button 
              size="icon"
              className="shadow-lg shadow-cyan-500/20 md:hidden" 
              onClick={() => setIsCreateModalOpen(true)}
            >
              <Plus className="w-4 h-4" />
            </Button>
            <Button 
              className="shadow-lg shadow-cyan-500/20 hidden md:flex" 
              onClick={() => setIsCreateModalOpen(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Novo Deal
            </Button>
          </div>
        </div>
      </div>

      {/* Board Scroll Container */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4">
        <div className="flex h-full gap-4 min-w-max">
          {stages.map((column) => {
            const columnDeals = filteredDeals.filter(d => d.stageId === column.id);
            const totalValue = columnDeals.reduce((acc, curr) => acc + curr.value, 0);

            return (
              <div 
                key={column.id}
                className="w-72 flex flex-col h-full bg-slate-900/30 rounded-xl border border-slate-800/50 backdrop-blur-sm"
                onDragOver={onDragOver}
                onDrop={(e) => onDrop(e, column.id)}
              >
                {/* Column Header */}
                <div className={`p-3 border-b border-slate-800/50 flex flex-col gap-1 border-t-2 ${column.color}`}>
                  <div className="flex justify-between items-center">
                    <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wide">{column.title}</h3>
                    <span className="bg-slate-800 text-slate-400 text-[10px] px-2 py-0.5 rounded-full font-mono">{columnDeals.length}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium">
                     Total: <span className="text-slate-300">{formatCurrency(totalValue)}</span>
                  </div>
                </div>

                {/* Column Body */}
                <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                  {columnDeals.map((deal) => (
                    <div
                      key={deal.id}
                      draggable
                      onDragStart={(e) => onDragStart(e, deal.id)}
                      onDragEnd={onDragEnd}
                      onClick={() => setSelectedDeal(deal)}
                      className="bg-slate-900 border border-slate-800 rounded-lg p-3 shadow-sm cursor-grab active:cursor-grabbing hover:border-cyan-500/50 hover:shadow-cyan-500/10 transition-all group relative"
                    >
                      <div className="flex justify-between items-start mb-1.5">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${getPriorityColor(deal.priority)}`}>
                           {deal.priority === 'high' ? 'Alta' : deal.priority === 'medium' ? 'Média' : 'Baixa'}
                        </span>
                        <button className="text-slate-600 hover:text-white transition-colors opacity-0 group-hover:opacity-100">
                           <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <h4 className="font-semibold text-white text-sm mb-0.5 leading-tight">{deal.title}</h4>
                      <p className="text-[10px] text-slate-400 mb-2">{deal.company}</p>

                      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                         {deal.tags.map(tag => (
                             <span key={tag} className="text-[9px] text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded flex items-center gap-1">
                                <Tag className="w-2.5 h-2.5" /> {tag}
                             </span>
                         ))}
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                         <div className="flex items-center gap-1.5 text-slate-300 text-xs font-bold">
                            <DollarSign className="w-3 h-3 text-emerald-500" />
                            {formatCurrency(deal.value)}
                         </div>
                         <div className="flex items-center gap-2">
                            {deal.dueDate && (
                                <div className="text-[9px] text-slate-500 flex items-center gap-1" title="Data de previsão">
                                    <CalendarClock className="w-3 h-3" />
                                    {new Date(deal.dueDate).toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'})}
                                </div>
                            )}
                            <img src={deal.ownerAvatar} alt="Owner" className="w-5 h-5 rounded-full border border-slate-700" />
                         </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pipedrive-style Side Drawer */}
      {/* Backdrop */}
      {selectedDeal && (
        <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity"
            onClick={() => setSelectedDeal(null)}
        />
      )}

      {/* Drawer */}
      <div 
        className={`fixed top-0 right-0 h-full w-full max-w-2xl bg-slate-950 border-l border-slate-800 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${selectedDeal ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {selectedDeal && (
            <>
                {/* 1. Header & Stage Progress */}
                <div className="flex-shrink-0 bg-slate-900 border-b border-slate-800">
                    {/* Top Bar */}
                    <div className="p-6 pb-4 flex justify-between items-start">
                        <div>
                            <h2 className="text-2xl font-bold text-white mb-1">{selectedDeal.title}</h2>
                            <div className="flex items-center gap-2 text-slate-400 text-sm flex-wrap">
                                <span className="font-semibold text-emerald-400">{formatCurrency(selectedDeal.value)}</span>
                                <span className="w-1 h-1 rounded-full bg-slate-600"></span>
                                <span className="flex items-center gap-1"><Building className="w-3 h-3" /> {selectedDeal.company}</span>
                                <span className="w-1 h-1 rounded-full bg-slate-600"></span>
                                <Select value={selectedDeal.ownerId || ''} onValueChange={handleOwnerChange}>
                                  <SelectTrigger className="w-[180px] h-7 text-xs bg-slate-800 border-slate-700">
                                    <SelectValue placeholder="Selecione proprietário">
                                      <span className="flex items-center gap-1">
                                        <User className="w-3 h-3" /> 
                                        {selectedDeal.ownerName || 'Sem proprietário'}
                                      </span>
                                    </SelectValue>
                                  </SelectTrigger>
                                  <SelectContent>
                                    {teamMembers.map(member => (
                                      <SelectItem key={member.id} value={member.id}>
                                        {member.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button 
                              variant="secondary" 
                              onClick={() => handleDeleteDeal(selectedDeal.id)} 
                              className="bg-slate-700/50 hover:bg-red-500/20 border-slate-700 text-slate-400 hover:text-red-400"
                              title="Excluir negócio"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                            <Button variant="secondary" onClick={handleMarkWon} className="bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20 text-emerald-400">
                              Ganho
                            </Button>
                            <Button variant="secondary" onClick={() => setIsLostModalOpen(true)} className="bg-red-500/10 hover:bg-red-500/20 border-red-500/20 text-red-400">
                              Perdido
                            </Button>
                            <button 
                                onClick={() => setSelectedDeal(null)} 
                                className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                    </div>

                    {/* Pipeline Visual Progress */}
                    <div className="px-6 pb-6 overflow-x-auto">
                        <div className="flex items-center gap-1 w-full min-w-max">
                            {stages.map((col, idx) => {
                                const currentStageIndex = stages.findIndex(c => c.id === selectedDeal.stageId);
                                const isCompleted = idx < currentStageIndex;
                                const isActive = idx === currentStageIndex;
                                
                                return (
                                    <div 
                                        key={col.id} 
                                        className={`flex-1 h-8 flex items-center justify-center px-2 relative cursor-pointer group transition-all first:rounded-l-md last:rounded-r-md 
                                            ${isCompleted ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30' : 
                                              isActive ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-500/20' : 
                                              'bg-slate-800 text-slate-500 hover:bg-slate-700 hover:text-slate-300'}
                                        `}
                                        onClick={async () => {
                                            // Optimistic update for UI feel
                                            setDeals(deals.map(d => d.id === selectedDeal.id ? {...d, stageId: col.id} : d));
                                            setSelectedDeal({...selectedDeal, stageId: col.id});
                                            
                                            // Persist to database
                                            try {
                                              const result = await api.moveDealStage(selectedDeal.id, col.id);
                                              
                                              // Show Pipedrive sync feedback
                                              if (result?.synced) {
                                                toast.success('✅ Lead sincronizado com Pipedrive!');
                                              } else if (result?.error && result.error !== 'Pipedrive integration is disabled') {
                                                toast.error(`❌ Erro ao sincronizar: ${result.error}`);
                                              }
                                            } catch (error) {
                                              console.error('Error moving deal:', error);
                                            }
                                        }}
                                    >
                                        <span className="text-xs font-bold whitespace-nowrap z-10">{col.title}</span>
                                        {/* Arrow shape via clip-path could go here, simplified with simple blocks for now */}
                                        {idx !== stages.length - 1 && (
                                            <div className="absolute right-0 top-0 bottom-0 w-[1px] bg-slate-950/20 z-20"></div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>

                {/* 2. Content Area */}
                <div className="flex-1 overflow-y-auto bg-slate-950 custom-scrollbar">
                    
                    {/* Action Composer */}
                    <div className="p-6 border-b border-slate-800 bg-slate-900/30">
                        <div className="flex gap-4 mb-4">
                            <button 
                                onClick={() => setActiveTab('note')}
                                className={`flex items-center gap-2 text-sm font-medium transition-colors ${activeTab === 'note' ? 'text-cyan-400' : 'text-slate-400 hover:text-white'}`}
                            >
                                <div className={`p-2 rounded-full ${activeTab === 'note' ? 'bg-cyan-500/10' : 'bg-slate-800'}`}>
                                    <FileText className="w-4 h-4" />
                                </div>
                                Nota
                            </button>
                            <button 
                                onClick={() => setActiveTab('activity')}
                                className={`flex items-center gap-2 text-sm font-medium transition-colors ${activeTab === 'activity' ? 'text-amber-400' : 'text-slate-400 hover:text-white'}`}
                            >
                                <div className={`p-2 rounded-full ${activeTab === 'activity' ? 'bg-amber-500/10' : 'bg-slate-800'}`}>
                                    <Calendar className="w-4 h-4" />
                                </div>
                                Atividade
                            </button>
                            <button 
                                onClick={() => setActiveTab('email')}
                                className={`flex items-center gap-2 text-sm font-medium transition-colors ${activeTab === 'email' ? 'text-violet-400' : 'text-slate-400 hover:text-white'}`}
                            >
                                <div className={`p-2 rounded-full ${activeTab === 'email' ? 'bg-violet-500/10' : 'bg-slate-800'}`}>
                                    <Mail className="w-4 h-4" />
                                </div>
                                Email
                            </button>
                        </div>

                        {activeTab === 'email' ? (
                          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
                            <Mail className="w-8 h-8 text-violet-500 mx-auto mb-3" />
                            <p className="text-sm text-slate-400 mb-4">
                              Envie emails profissionais usando templates personalizados
                            </p>
                            <Button 
                              onClick={() => setIsEmailModalOpen(true)}
                              className="bg-violet-600 hover:bg-violet-700"
                            >
                              <Send className="w-4 h-4 mr-2" />
                              Compor Email
                            </Button>
                          </div>
                        ) : (
                          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden focus-within:ring-1 focus-within:ring-cyan-500/50 transition-all shadow-inner">
                            <input 
                                type="text"
                                className="w-full bg-transparent p-3 text-sm text-slate-200 placeholder:text-slate-600 outline-none border-b border-slate-800"
                                placeholder="Título da atividade"
                                value={newActivityTitle}
                                onChange={(e) => setNewActivityTitle(e.target.value)}
                            />
                            <textarea 
                                className="w-full bg-transparent p-4 text-sm text-slate-200 placeholder:text-slate-600 outline-none resize-none min-h-[80px]"
                                placeholder={
                                    activeTab === 'note' ? "Escreva uma nota..." :
                                    "Descreva a atividade..."
                                }
                                value={newActivityDescription}
                                onChange={(e) => setNewActivityDescription(e.target.value)}
                            />
                            <div className="px-3 py-2 bg-slate-950/50 border-t border-slate-800 flex justify-between items-center">
                                <div className="flex gap-2">
                                    <button className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-cyan-400 transition-colors"><Paperclip className="w-4 h-4" /></button>
                                </div>
                                <Button size="sm" className="h-8" onClick={handleCreateActivity} disabled={!newActivityTitle.trim()}>
                                    Salvar
                                </Button>
                            </div>
                          </div>
                        )}
                    </div>

                    {/* Activities Timeline */}
                    <div className="p-6">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-6 flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5" /> Atividades ({activities.length})
                        </h4>
                        
                        {loadingActivities ? (
                          <div className="flex justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-cyan-500" />
                          </div>
                        ) : activities.length === 0 ? (
                          <div className="text-center py-8 text-slate-500 text-sm">
                            Nenhuma atividade registrada
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {activities.map(activity => {
                              const activityIcon = activity.type === 'call' ? Phone :
                                                   activity.type === 'email' ? Mail :
                                                   activity.type === 'meeting' ? Calendar :
                                                   activity.type === 'task' ? CheckSquare :
                                                   FileText;
                              const activityColor = activity.type === 'call' ? 'text-amber-500 bg-amber-500/10' :
                                                    activity.type === 'email' ? 'text-violet-500 bg-violet-500/10' :
                                                    activity.type === 'meeting' ? 'text-cyan-500 bg-cyan-500/10' :
                                                    activity.type === 'task' ? 'text-emerald-500 bg-emerald-500/10' :
                                                    'text-slate-500 bg-slate-500/10';
                              const ActivityIcon = activityIcon;
                              
                              return (
                                <div key={activity.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition-all group">
                                  <button 
                                    onClick={() => handleToggleActivityComplete(activity.id, activity.isCompleted)}
                                    className="mt-0.5 text-slate-500 hover:text-emerald-500 transition-colors"
                                  >
                                    {activity.isCompleted ? (
                                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                    ) : (
                                      <Circle className="w-5 h-5" />
                                    )}
                                  </button>
                                  <div className={`p-1.5 rounded ${activityColor}`}>
                                    <ActivityIcon className="w-3.5 h-3.5" />
                                  </div>
                                  <div className="flex-1">
                                    <p className={`text-sm font-medium transition-colors ${activity.isCompleted ? 'text-slate-500 line-through' : 'text-slate-200 group-hover:text-white'}`}>
                                      {activity.title}
                                    </p>
                                    {activity.description && (
                                      <p className="text-xs text-slate-500 mt-1">{activity.description}</p>
                                    )}
                                    <p className="text-[10px] text-slate-600 mt-1">
                                      {new Date(activity.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                      {activity.createdByName && ` • ${activity.createdByName}`}
                                    </p>
                                  </div>
                                  <button 
                                    onClick={() => handleDeleteActivity(activity.id)}
                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/10 rounded text-slate-500 hover:text-red-500 transition-all"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                    </div>

                    {/* Nina Insights Section */}
                    {selectedDeal.clientMemory && (
                      <div className="p-6 border-t border-slate-800">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                          <Brain className="w-4 h-4 text-violet-500" /> Insights do(a) {sdrName}
                        </h4>
                        
                        <div className="space-y-3">
                          {/* Qualification Score */}
                          <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs text-slate-400">Score de Qualificação</span>
                              <span className="text-sm font-bold text-cyan-400">
                                {selectedDeal.clientMemory.lead_profile.qualification_score || 0}%
                              </span>
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-1.5">
                              <div 
                                className="bg-gradient-to-r from-cyan-500 to-violet-500 h-1.5 rounded-full transition-all"
                                style={{ width: `${selectedDeal.clientMemory.lead_profile.qualification_score || 0}%` }}
                              />
                            </div>
                          </div>

                          {/* Next Best Action */}
                          <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800">
                            <span className="text-xs text-slate-400">Próxima Ação Sugerida</span>
                            <p className="text-sm text-cyan-400 mt-1 font-medium">
                              {selectedDeal.clientMemory.sales_intelligence.next_best_action === 'qualify' ? '📋 Qualificar lead' :
                               selectedDeal.clientMemory.sales_intelligence.next_best_action === 'demo' ? '🎯 Agendar demonstração' :
                               selectedDeal.clientMemory.sales_intelligence.next_best_action === 'follow_up' ? '📞 Fazer follow-up' :
                               selectedDeal.clientMemory.sales_intelligence.next_best_action}
                            </p>
                          </div>

                          {/* Interests */}
                          {selectedDeal.clientMemory.lead_profile.interests.length > 0 && (
                            <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800">
                              <span className="text-xs text-slate-400">Interesses</span>
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {selectedDeal.clientMemory.lead_profile.interests.map((interest, idx) => (
                                  <span key={idx} className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-xs rounded-md border border-emerald-500/20">
                                    {interest}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Pain Points */}
                          {selectedDeal.clientMemory.sales_intelligence.pain_points.length > 0 && (
                            <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800">
                              <span className="text-xs text-slate-400">Dores Identificadas</span>
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {selectedDeal.clientMemory.sales_intelligence.pain_points.map((pain, idx) => (
                                  <span key={idx} className="px-2 py-0.5 bg-red-500/10 text-red-400 text-xs rounded-md border border-red-500/20">
                                    {pain}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Budget & Timeline */}
                          <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800">
                              <span className="text-xs text-slate-400">Orçamento</span>
                              <p className="text-sm text-slate-200 mt-1 font-medium">
                                💰 {selectedDeal.clientMemory.sales_intelligence.budget_indication === 'unknown' ? 'Não informado' : selectedDeal.clientMemory.sales_intelligence.budget_indication}
                              </p>
                            </div>
                            <div className="p-3 rounded-lg bg-slate-900/50 border border-slate-800">
                              <span className="text-xs text-slate-400">Timeline</span>
                              <p className="text-sm text-slate-200 mt-1 font-medium">
                                ⏰ {selectedDeal.clientMemory.sales_intelligence.decision_timeline === 'unknown' ? 'Não definido' : selectedDeal.clientMemory.sales_intelligence.decision_timeline}
                              </p>
                            </div>
                          </div>

                          {/* View Conversation Button */}
                          {selectedDeal.conversationId && (
                            <Button 
                              className="w-full mt-2 bg-violet-600 hover:bg-violet-700"
                              onClick={() => {
                                window.location.href = `/chat?conversation=${selectedDeal.conversationId}`;
                              }}
                            >
                              <MessageSquare className="w-4 h-4 mr-2" />
                              Ver Conversa Completa
                            </Button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Histórico de Conversa */}
                    {selectedDeal.conversationId && (
                      <div className="p-6 border-t border-slate-800">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                          <MessageSquare className="w-4 h-4 text-cyan-500" /> 
                          Últimas Mensagens ({conversationMessages.length})
                        </h4>
                        
                        {loadingMessages ? (
                          <div className="flex justify-center py-4">
                            <Loader2 className="w-5 h-5 animate-spin text-cyan-500" />
                          </div>
                        ) : conversationMessages.length === 0 ? (
                          <div className="text-center py-4 text-slate-500 text-sm">
                            Nenhuma mensagem encontrada
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
                            {conversationMessages.map(msg => (
                              <div 
                                key={msg.id}
                                className={`p-2 rounded-lg text-sm ${
                                  msg.from_type === 'user' 
                                    ? 'bg-slate-800 text-slate-200 ml-0 mr-8' 
                                    : msg.from_type === 'nina'
                                      ? 'bg-cyan-900/30 text-cyan-100 ml-8 mr-0'
                                      : 'bg-emerald-900/30 text-emerald-100 ml-8 mr-0'
                                }`}
                              >
                                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mb-1">
                                  <span className="font-medium">
                                    {msg.from_type === 'user' ? '👤 Lead' : msg.from_type === 'nina' ? `🤖 ${sdrName}` : '👨‍💼 Humano'}
                                  </span>
                                  <span>•</span>
                                  <span>{new Date(msg.sent_at).toLocaleString('pt-BR', { 
                                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
                                  })}</span>
                                </div>
                                <p className="leading-relaxed line-clamp-3">{msg.content || '[mídia]'}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        <Button 
                          className="w-full mt-3 bg-violet-600 hover:bg-violet-700"
                          onClick={() => window.location.href = `/chat?conversation=${selectedDeal.conversationId}`}
                        >
                          <MessageSquare className="w-4 h-4 mr-2" />
                          Ver Conversa Completa
                        </Button>
                      </div>
                    )}
                </div>
            </>
        )}
      </div>

      {/* Modal para criar novo deal */}
      <CreateDealModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        onDealCreated={handleDealCreated}
      />
      
      {/* Modal de motivo de perda */}
      <LostReasonModal
        open={isLostModalOpen}
        onOpenChange={setIsLostModalOpen}
        onConfirm={handleMarkLost}
        dealTitle={selectedDeal?.title || ''}
      />

      {/* Modal de configuração de etapas */}
      <PipelineSettingsModal
        open={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        pipelineId={selectedPipelineId}
        pipelineName={pipelines.find(p => p.id === selectedPipelineId)?.name || 'Pipeline'}
        pipelineIcon={pipelines.find(p => p.id === selectedPipelineId)?.icon}
      />

      {/* Modal de composição de email */}
      {selectedDeal && (
        <EmailComposeModal
          isOpen={isEmailModalOpen}
          onClose={() => setIsEmailModalOpen(false)}
          dealId={selectedDeal.id}
          contactEmail={selectedDeal.contactEmail}
          contactName={selectedDeal.contactName || selectedDeal.title}
          company={selectedDeal.company}
          value={selectedDeal.value}
          onEmailSent={loadActivities}
        />
      )}
    </div>
  );
};

export default Kanban;