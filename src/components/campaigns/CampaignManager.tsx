import React, { useState, useEffect } from 'react';
import { useCampaigns, Campaign, CreateCampaignParams } from '@/hooks/useCampaigns';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { 
  Play, Pause, Square, RefreshCw, Plus, Users, Send, 
  CheckCircle2, XCircle, Clock, AlertTriangle, Loader2,
  ChevronDown, ChevronRight, Zap
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CreateCampaignModal } from './CreateCampaignModal';

interface CampaignManagerProps {
  onCreateCampaign?: () => void;
  selectedContactIds?: string[];
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: 'Rascunho', color: 'bg-slate-500', icon: <Clock className="w-3 h-3" /> },
  scheduled: { label: 'Agendada', color: 'bg-blue-500', icon: <Clock className="w-3 h-3" /> },
  running: { label: 'Executando', color: 'bg-emerald-500', icon: <Play className="w-3 h-3" /> },
  paused: { label: 'Pausada', color: 'bg-amber-500', icon: <Pause className="w-3 h-3" /> },
  completed: { label: 'Concluída', color: 'bg-green-600', icon: <CheckCircle2 className="w-3 h-3" /> },
  cancelled: { label: 'Cancelada', color: 'bg-red-500', icon: <XCircle className="w-3 h-3" /> },
  failed: { label: 'Falhou', color: 'bg-red-600', icon: <AlertTriangle className="w-3 h-3" /> }
};

const getETA = (campaign: Campaign): string | null => {
  if (campaign.status !== 'running' || !campaign.started_at) return null;
  const processed = campaign.sent_count + campaign.failed_count + campaign.skipped_count;
  if (processed === 0) return 'Calculando...';
  const elapsed = (Date.now() - new Date(campaign.started_at).getTime()) / 1000;
  const avgPerMsg = elapsed / processed;
  const remaining = campaign.total_contacts - processed;
  const etaSeconds = Math.round(remaining * avgPerMsg);
  if (etaSeconds < 60) return `~${etaSeconds}s restantes`;
  return `~${Math.round(etaSeconds / 60)}min restantes`;
};

export const CampaignManager: React.FC<CampaignManagerProps> = ({ 
  onCreateCampaign,
  selectedContactIds = []
}) => {
  const { 
    campaigns, 
    loading, 
    fetchCampaigns, 
    startCampaign, 
    pauseCampaign, 
    resumeCampaign, 
    cancelCampaign,
    createCampaign 
  } = useCampaigns();
  
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [processingAction, setProcessingAction] = useState<string | null>(null);

  // Refresh campaigns periodically while any is running
  useEffect(() => {
    const hasRunning = campaigns.some(c => c.status === 'running');
    if (!hasRunning) return;

    const interval = setInterval(() => {
      fetchCampaigns();
    }, 5000);

    return () => clearInterval(interval);
  }, [campaigns, fetchCampaigns]);

  const handleAction = async (action: () => Promise<void>, campaignId: string) => {
    setProcessingAction(campaignId);
    try {
      await action();
    } finally {
      setProcessingAction(null);
    }
  };

  const getProgressPercentage = (campaign: Campaign) => {
    if (campaign.total_contacts === 0) return 0;
    const processed = campaign.sent_count + campaign.failed_count + campaign.skipped_count;
    return Math.round((processed / campaign.total_contacts) * 100);
  };

  const getDeliveryRate = (campaign: Campaign) => {
    if (campaign.sent_count === 0) return 0;
    return Math.round((campaign.delivered_count / campaign.sent_count) * 100);
  };

  const handleCreateCampaign = async (params: CreateCampaignParams) => {
    const result = await createCampaign(params);
    if (result) {
      setShowCreateModal(false);
    }
  };

  if (loading && campaigns.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const runningCampaigns = campaigns.filter(c => c.status === 'running');

  return (
    <div className="space-y-4">
      {/* Active Campaign Banner */}
      {runningCampaigns.length > 0 && (
        <div className="space-y-2">
          {runningCampaigns.map(rc => {
            const processed = rc.sent_count + rc.failed_count + rc.skipped_count;
            const pct = rc.total_contacts > 0 ? Math.round((processed / rc.total_contacts) * 100) : 0;
            const eta = getETA(rc);
            return (
              <div key={rc.id} className="relative overflow-hidden rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                    </span>
                    <span className="font-medium text-sm">{rc.name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="font-mono font-semibold text-foreground">{processed}/{rc.total_contacts} enviados</span>
                    {eta && <span>{eta}</span>}
                    {rc.replied_count > 0 && (
                      <span className="text-emerald-500">💬 {rc.replied_count} respostas</span>
                    )}
                  </div>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden flex">
                  {rc.sent_count > 0 && (
                    <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${(rc.sent_count / rc.total_contacts) * 100}%` }} />
                  )}
                  {rc.failed_count > 0 && (
                    <div className="h-full bg-destructive transition-all duration-500" style={{ width: `${(rc.failed_count / rc.total_contacts) * 100}%` }} />
                  )}
                  {rc.skipped_count > 0 && (
                    <div className="h-full bg-amber-500 transition-all duration-500" style={{ width: `${(rc.skipped_count / rc.total_contacts) * 100}%` }} />
                  )}
                </div>
                <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Enviadas {rc.sent_count}</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-destructive inline-block" /> Falhas {rc.failed_count}</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Ignoradas {rc.skipped_count}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-400" />
          <h2 className="text-lg font-semibold">Campanhas WhatsApp</h2>
          <Badge variant="outline" className="ml-2">
            {campaigns.length} campanhas
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={fetchCampaigns}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button 
            size="sm" 
            onClick={() => setShowCreateModal(true)}
          >
            <Plus className="w-4 h-4 mr-2" />
            Nova Campanha
          </Button>
        </div>
      </div>

      {/* Campaigns List */}
      <ScrollArea className="h-[500px]">
        <div className="space-y-3 pr-4">
          {campaigns.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Send className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-center">
                  Nenhuma campanha criada ainda.
                  <br />
                  Crie sua primeira campanha para enviar templates em massa.
                </p>
                <Button 
                  className="mt-4" 
                  onClick={() => setShowCreateModal(true)}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Criar Campanha
                </Button>
              </CardContent>
            </Card>
          ) : (
            campaigns.map(campaign => {
              const status = statusConfig[campaign.status] || statusConfig.draft;
              const progress = getProgressPercentage(campaign);
              const isExpanded = expandedCampaign === campaign.id;
              const isProcessing = processingAction === campaign.id;

              return (
                <Card key={campaign.id} className="overflow-hidden">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="p-0 h-6 w-6"
                          onClick={() => setExpandedCampaign(isExpanded ? null : campaign.id)}
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </Button>
                        <div>
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-base">{campaign.name}</CardTitle>
                            <Badge className={`${status.color} text-white text-xs`}>
                              {status.icon}
                              <span className="ml-1">{status.label}</span>
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {campaign.whatsapp_templates?.name || 'Template não definido'}
                          </p>
                        </div>
                      </div>
                      
                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        {campaign.status === 'draft' && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleAction(() => startCampaign(campaign.id), campaign.id)}
                            disabled={isProcessing}
                          >
                            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                          </Button>
                        )}
                        {campaign.status === 'running' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleAction(() => pauseCampaign(campaign.id), campaign.id)}
                            disabled={isProcessing}
                          >
                            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pause className="w-4 h-4" />}
                          </Button>
                        )}
                        {campaign.status === 'paused' && (
                          <>
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleAction(() => resumeCampaign(campaign.id), campaign.id)}
                              disabled={isProcessing}
                            >
                              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleAction(() => cancelCampaign(campaign.id), campaign.id)}
                              disabled={isProcessing}
                            >
                              <Square className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                        {campaign.status === 'scheduled' && (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleAction(() => cancelCampaign(campaign.id), campaign.id)}
                            disabled={isProcessing}
                          >
                            <Square className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="pt-0">
                    {/* Progress bar */}
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {campaign.sent_count + campaign.failed_count + campaign.skipped_count} / {campaign.total_contacts}
                        </span>
                        <span>{progress}%</span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-primary transition-all duration-500"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center gap-4 mt-3 text-xs">
                      <div className="flex items-center gap-1 text-emerald-500">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{campaign.sent_count} enviadas</span>
                      </div>
                      <div className="flex items-center gap-1 text-blue-500">
                        <Send className="w-3 h-3" />
                        <span>{campaign.delivered_count} entregues ({getDeliveryRate(campaign)}%)</span>
                      </div>
                      <div className="flex items-center gap-1 text-red-500">
                        <XCircle className="w-3 h-3" />
                        <span>{campaign.failed_count} falhas</span>
                      </div>
                    </div>

                    {/* Error message if any */}
                    {campaign.error_message && (
                      <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
                        {campaign.error_message}
                      </div>
                    )}

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t space-y-2 text-sm">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <span className="text-muted-foreground">Intervalo:</span>
                            <span className="ml-2">{campaign.interval_seconds}s</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Batch:</span>
                            <span className="ml-2">{campaign.messages_per_batch} msg/vez</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Prospecção:</span>
                            <span className="ml-2">{campaign.is_prospecting ? 'Sim' : 'Não'}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Lidas:</span>
                            <span className="ml-2">{campaign.read_count}</span>
                          </div>
                        </div>
                        {campaign.started_at && (
                          <div>
                            <span className="text-muted-foreground">Iniciada:</span>
                            <span className="ml-2">
                              {formatDistanceToNow(new Date(campaign.started_at), { 
                                addSuffix: true,
                                locale: ptBR 
                              })}
                            </span>
                          </div>
                        )}
                        {campaign.completed_at && (
                          <div>
                            <span className="text-muted-foreground">Concluída:</span>
                            <span className="ml-2">
                              {formatDistanceToNow(new Date(campaign.completed_at), { 
                                addSuffix: true,
                                locale: ptBR 
                              })}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Create Campaign Modal */}
      <CreateCampaignModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateCampaign}
        preselectedContactIds={selectedContactIds}
      />
    </div>
  );
};
