import React, { useState, useEffect } from 'react';
import { Megaphone, TrendingUp, TrendingDown, RefreshCw, Target, Users, MessageSquare, XCircle, Rocket, Shield, AlertTriangle, CheckCircle, MousePointerClick } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ProspectingFunnel } from './prospecting/ProspectingFunnel';
import { TemplateRanking } from './prospecting/TemplateRanking';
import { PeriodComparison } from './prospecting/PeriodComparison';
import { CampaignTable } from './prospecting/CampaignTable';
import { ProspectingKPICard } from './prospecting/ProspectingKPICard';
import { CampaignManager } from './campaigns/CampaignManager';
import { ButtonMetricsDashboard } from './prospecting/ButtonMetricsDashboard';
interface QualityStatus {
  rating: 'GREEN' | 'YELLOW' | 'RED';
  tier?: string;
  event?: string;
  last_check?: string;
  display_phone_number?: string;
}

interface ProspectingMetrics {
  templatesSent: number;
  responsesReceived: number;
  positiveResponses: number;
  rejections: number;
  qualifiedDeals: number;
  convertedDeals: number;
  responseRate: number;
  positiveRate: number;
  rejectionRate: number;
  conversionRate: number;
  prevTemplatesSent: number;
  prevResponseRate: number;
  prevRejectionRate: number;
  prevConversionRate: number;
}

interface TemplatePerformance {
  name: string;
  sent: number;
  responses: number;
  responseRate: number;
  conversions: number;
  conversionRate: number;
}

interface CampaignData {
  date: string;
  templateName: string;
  sent: number;
  responses: number;
  responseRate: number;
  rejections: number;
  rejectionRate: number;
  conversions: number;
  conversionRate: number;
}

interface TrendData {
  date: string;
  name: string;
  sent: number;
  responses: number;
  conversions: number;
}

const ProspectingDashboard: React.FC = () => {
  const [period, setPeriod] = useState<string>('7');
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<ProspectingMetrics | null>(null);
  const [templates, setTemplates] = useState<TemplatePerformance[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignData[]>([]);
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [qualityStatus, setQualityStatus] = useState<QualityStatus | null>(null);
  const [checkingQuality, setCheckingQuality] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const days = parseInt(period);
      const periodStart = new Date();
      periodStart.setDate(periodStart.getDate() - days);
      periodStart.setHours(0, 0, 0, 0);
      
      const prevPeriodStart = new Date(periodStart);
      prevPeriodStart.setDate(prevPeriodStart.getDate() - days);

      // Fetch prospecting pipeline
      const { data: pipeline } = await supabase
        .from('pipelines')
        .select('id')
        .eq('slug', 'prospeccao')
        .single();

      if (!pipeline) {
        toast.error('Pipeline de prospecção não encontrado');
        setLoading(false);
        return;
      }

      // Fetch all data in parallel
      const [messagesResult, prevMessagesResult, dealsResult, prevDealsResult] = await Promise.all([
        // Current period messages
        supabase
          .from('messages')
          .select('id, content, metadata, conversation_id, from_type, sent_at')
          .eq('from_type', 'nina')
          .gte('sent_at', periodStart.toISOString())
          .not('metadata', 'is', null),
        // Previous period messages
        supabase
          .from('messages')
          .select('id, content, metadata, from_type, sent_at')
          .eq('from_type', 'nina')
          .gte('sent_at', prevPeriodStart.toISOString())
          .lt('sent_at', periodStart.toISOString())
          .not('metadata', 'is', null),
        // Current period deals
        supabase
          .from('deals')
          .select('id, stage_id, lost_reason, won_at, lost_at, created_at, pipeline_id')
          .eq('pipeline_id', pipeline.id)
          .gte('created_at', periodStart.toISOString()),
        // Previous period deals
        supabase
          .from('deals')
          .select('id, stage_id, lost_reason, won_at, lost_at, created_at, pipeline_id')
          .eq('pipeline_id', pipeline.id)
          .gte('created_at', prevPeriodStart.toISOString())
          .lt('created_at', periodStart.toISOString()),
      ]);

      // Filter template messages (is_prospecting or template_name in metadata)
      const templateMessages = (messagesResult.data || []).filter(m => {
        const meta = m.metadata as any;
        return meta?.is_prospecting || meta?.template_name || meta?.is_template;
      });
      
      const prevTemplateMessages = (prevMessagesResult.data || []).filter(m => {
        const meta = m.metadata as any;
        return meta?.is_prospecting || meta?.template_name || meta?.is_template;
      });

      // Get conversation IDs for responses
      const conversationIds = [...new Set(templateMessages.map(m => m.conversation_id))];
      
      // Fetch user responses to these conversations
      const { data: responsesData } = await supabase
        .from('messages')
        .select('id, conversation_id, content, sent_at')
        .eq('from_type', 'user')
        .in('conversation_id', conversationIds)
        .gte('sent_at', periodStart.toISOString());

      const responses = responsesData || [];
      const conversationsWithResponse = new Set(responses.map(r => r.conversation_id));
      
      // Deals metrics
      const deals = dealsResult.data || [];
      const prevDeals = prevDealsResult.data || [];
      const rejections = deals.filter(d => d.lost_reason?.toLowerCase().includes('rejei'));
      const qualified = deals.filter(d => !d.lost_at && !d.won_at);
      const converted = deals.filter(d => d.won_at);

      const prevRejections = prevDeals.filter(d => d.lost_reason?.toLowerCase().includes('rejei'));
      const prevConverted = prevDeals.filter(d => d.won_at);

      // Calculate metrics
      const templatesSent = templateMessages.length;
      const responsesReceived = conversationsWithResponse.size;
      const responseRate = templatesSent > 0 ? (responsesReceived / templatesSent) * 100 : 0;
      const rejectionRate = templatesSent > 0 ? (rejections.length / templatesSent) * 100 : 0;
      const conversionRate = templatesSent > 0 ? (converted.length / templatesSent) * 100 : 0;

      const prevTemplatesSent = prevTemplateMessages.length;
      const prevResponseRate = prevTemplatesSent > 0 ? (prevDeals.filter(d => !d.lost_at).length / prevTemplatesSent) * 100 : 0;
      const prevRejectionRate = prevTemplatesSent > 0 ? (prevRejections.length / prevTemplatesSent) * 100 : 0;
      const prevConversionRate = prevTemplatesSent > 0 ? (prevConverted.length / prevTemplatesSent) * 100 : 0;

      setMetrics({
        templatesSent,
        responsesReceived,
        positiveResponses: responsesReceived - rejections.length,
        rejections: rejections.length,
        qualifiedDeals: qualified.length,
        convertedDeals: converted.length,
        responseRate,
        positiveRate: templatesSent > 0 ? ((responsesReceived - rejections.length) / templatesSent) * 100 : 0,
        rejectionRate,
        conversionRate,
        prevTemplatesSent,
        prevResponseRate,
        prevRejectionRate,
        prevConversionRate,
      });

      // Template performance
      const templateMap = new Map<string, { sent: number; responses: number; conversions: number }>();
      templateMessages.forEach(m => {
        const meta = m.metadata as any;
        const name = meta?.template_name || 'Outros';
        const current = templateMap.get(name) || { sent: 0, responses: 0, conversions: 0 };
        current.sent++;
        if (conversationsWithResponse.has(m.conversation_id)) {
          current.responses++;
        }
        templateMap.set(name, current);
      });

      // Add conversions per template (approximate - based on deals with matching conversation)
      const templatePerf: TemplatePerformance[] = Array.from(templateMap.entries()).map(([name, data]) => ({
        name,
        sent: data.sent,
        responses: data.responses,
        responseRate: data.sent > 0 ? (data.responses / data.sent) * 100 : 0,
        conversions: Math.round(data.responses * (conversionRate / 100)) || 0,
        conversionRate: data.sent > 0 ? (Math.round(data.responses * (conversionRate / 100)) / data.sent) * 100 : 0,
      })).sort((a, b) => b.responseRate - a.responseRate);

      setTemplates(templatePerf);

      // Campaign data by date
      const campaignMap = new Map<string, CampaignData>();
      templateMessages.forEach(m => {
        const date = new Date(m.sent_at).toISOString().split('T')[0];
        const meta = m.metadata as any;
        const templateName = meta?.template_name || 'Outros';
        const key = `${date}-${templateName}`;
        
        const current = campaignMap.get(key) || {
          date,
          templateName,
          sent: 0,
          responses: 0,
          responseRate: 0,
          rejections: 0,
          rejectionRate: 0,
          conversions: 0,
          conversionRate: 0,
        };
        current.sent++;
        if (conversationsWithResponse.has(m.conversation_id)) {
          current.responses++;
        }
        campaignMap.set(key, current);
      });

      const campaignData = Array.from(campaignMap.values())
        .map(c => ({
          ...c,
          responseRate: c.sent > 0 ? (c.responses / c.sent) * 100 : 0,
          conversionRate: c.sent > 0 ? (c.conversions / c.sent) * 100 : 0,
        }))
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 20);

      setCampaigns(campaignData);

      // Trend data by day
      const trendMap = new Map<string, TrendData>();
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        trendMap.set(dateStr, {
          date: dateStr,
          name: days <= 7 ? dayNames[d.getDay()] : `${d.getDate()}/${d.getMonth() + 1}`,
          sent: 0,
          responses: 0,
          conversions: 0,
        });
      }

      templateMessages.forEach(m => {
        const dateStr = new Date(m.sent_at).toISOString().split('T')[0];
        const trend = trendMap.get(dateStr);
        if (trend) {
          trend.sent++;
          if (conversationsWithResponse.has(m.conversation_id)) {
            trend.responses++;
          }
        }
      });

      setTrendData(Array.from(trendMap.values()));
    } catch (error) {
      console.error('Error fetching prospecting data:', error);
      toast.error('Erro ao carregar dados de prospecção');
    } finally {
      setLoading(false);
    }
  };

  // Fetch quality status
  const fetchQualityStatus = async () => {
    try {
      const { data: settings } = await supabase
        .from('nina_settings')
        .select('whatsapp_quality_status')
        .maybeSingle();
      
      if (settings?.whatsapp_quality_status) {
        setQualityStatus(settings.whatsapp_quality_status as unknown as QualityStatus);
      }
    } catch (error) {
      console.error('Error fetching quality status:', error);
    }
  };

  // Check quality manually
  const checkQuality = async () => {
    setCheckingQuality(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-whatsapp-quality');
      if (error) throw error;
      
      if (data?.quality) {
        setQualityStatus(data.quality);
        if (data.changed) {
          toast.info(`Quality Score atualizado: ${data.quality.rating}`);
        } else {
          toast.success('Quality Score verificado: ' + data.quality.rating);
        }
      }
    } catch (error) {
      console.error('Error checking quality:', error);
      toast.error('Erro ao verificar quality score');
    } finally {
      setCheckingQuality(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchQualityStatus();
  }, [period]);

  const getTrendIcon = (current: number, previous: number) => {
    if (current >= previous) {
      return <TrendingUp className="w-4 h-4 text-emerald-400" />;
    }
    return <TrendingDown className="w-4 h-4 text-red-400" />;
  };

  const getTrendValue = (current: number, previous: number, isPercentage = false) => {
    const diff = current - previous;
    const sign = diff >= 0 ? '+' : '';
    if (isPercentage) {
      return `${sign}${diff.toFixed(1)}pp`;
    }
    const percentChange = previous > 0 ? ((diff / previous) * 100).toFixed(0) : (current > 0 ? '+100' : '0');
    return `${diff >= 0 ? '+' : ''}${percentChange}%`;
  };

  return (
    <div className="h-full overflow-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 border border-violet-500/30">
            <Megaphone className="w-6 h-6 text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Dashboard de Prospecção</h1>
            <p className="text-sm text-slate-400">Visão completa das campanhas de outbound</p>
          </div>
        </div>
      </div>

      {/* Tabs for different views */}
      <Tabs defaultValue="campaigns" className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <TabsList className="bg-slate-800/50 border border-slate-700">
            <TabsTrigger value="campaigns" className="data-[state=active]:bg-violet-500/20 data-[state=active]:text-violet-400">
              <Megaphone className="w-4 h-4 mr-2" />
              Campanhas
            </TabsTrigger>
            <TabsTrigger value="triagem" className="data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400">
              <MousePointerClick className="w-4 h-4 mr-2" />
              Triagem Interativa
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-3">
            {/* Quality Score Badge */}
          {qualityStatus && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={checkQuality}
                    disabled={checkingQuality}
                    className={`border gap-2 ${
                      qualityStatus.rating === 'GREEN' 
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20' 
                        : qualityStatus.rating === 'YELLOW'
                        ? 'border-amber-500/50 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                        : 'border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20'
                    }`}
                  >
                    {qualityStatus.rating === 'GREEN' ? (
                      <CheckCircle className="w-4 h-4" />
                    ) : qualityStatus.rating === 'YELLOW' ? (
                      <AlertTriangle className="w-4 h-4" />
                    ) : (
                      <Shield className="w-4 h-4" />
                    )}
                    <span className="hidden md:inline">Quality: {qualityStatus.rating}</span>
                    <Badge 
                      variant="outline" 
                      className={`text-xs ${
                        qualityStatus.rating === 'GREEN' 
                          ? 'border-emerald-500/50 text-emerald-400' 
                          : qualityStatus.rating === 'YELLOW'
                          ? 'border-amber-500/50 text-amber-400'
                          : 'border-red-500/50 text-red-400'
                      }`}
                    >
                      {qualityStatus.tier?.replace('TIER_', '') || '1K'}
                    </Badge>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <div className="space-y-1">
                    <p className="font-semibold">Quality Score: {qualityStatus.rating}</p>
                    <p className="text-xs text-muted-foreground">Tier: {qualityStatus.tier || 'TIER_1K'}</p>
                    {qualityStatus.last_check && (
                      <p className="text-xs text-muted-foreground">
                        Última verificação: {new Date(qualityStatus.last_check).toLocaleString('pt-BR')}
                      </p>
                    )}
                    {qualityStatus.rating !== 'GREEN' && (
                      <p className="text-xs text-amber-400 mt-2">
                        ⚠️ {qualityStatus.rating === 'YELLOW' 
                          ? 'Número está sendo monitorado. Reduza volume de envios.'
                          : 'Número restrito! Pause campanhas imediatamente.'}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">Clique para atualizar</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[140px] bg-slate-800/50 border-slate-700">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Hoje</SelectItem>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={fetchData}
            disabled={loading}
            className="border-slate-700"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          </div>
        </div>

        {/* Campaigns Tab Content */}
        <TabsContent value="campaigns" className="mt-0 space-y-6">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ProspectingKPICard
              title="Templates Enviados"
              value={metrics?.templatesSent || 0}
              trend={getTrendValue(metrics?.templatesSent || 0, metrics?.prevTemplatesSent || 0)}
              trendUp={(metrics?.templatesSent || 0) >= (metrics?.prevTemplatesSent || 0)}
              icon={<MessageSquare className="w-5 h-5" />}
              color="violet"
            />
            <ProspectingKPICard
              title="Taxa de Resposta"
              value={`${(metrics?.responseRate || 0).toFixed(1)}%`}
              trend={getTrendValue(metrics?.responseRate || 0, metrics?.prevResponseRate || 0, true)}
              trendUp={(metrics?.responseRate || 0) >= (metrics?.prevResponseRate || 0)}
              icon={<Users className="w-5 h-5" />}
              color="cyan"
            />
            <ProspectingKPICard
              title="Taxa de Rejeição"
              value={`${(metrics?.rejectionRate || 0).toFixed(1)}%`}
              trend={getTrendValue(metrics?.rejectionRate || 0, metrics?.prevRejectionRate || 0, true)}
              trendUp={(metrics?.rejectionRate || 0) <= (metrics?.prevRejectionRate || 0)}
              icon={<XCircle className="w-5 h-5" />}
              color="rose"
              invertTrend
            />
            <ProspectingKPICard
              title="Conversão Final"
              value={`${(metrics?.conversionRate || 0).toFixed(1)}%`}
              trend={getTrendValue(metrics?.conversionRate || 0, metrics?.prevConversionRate || 0, true)}
              trendUp={(metrics?.conversionRate || 0) >= (metrics?.prevConversionRate || 0)}
              icon={<Target className="w-5 h-5" />}
              color="emerald"
            />
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Funnel */}
            <ProspectingFunnel
              templatesSent={metrics?.templatesSent || 0}
              responses={metrics?.responsesReceived || 0}
              positives={metrics?.positiveResponses || 0}
              qualified={metrics?.qualifiedDeals || 0}
              converted={metrics?.convertedDeals || 0}
              loading={loading}
            />

            {/* Template Ranking */}
            <TemplateRanking templates={templates} loading={loading} />
          </div>

          {/* Period Comparison Chart */}
          <PeriodComparison data={trendData} loading={loading} />

          {/* Campaign Table */}
          <CampaignTable campaigns={campaigns} loading={loading} />

          {/* Active Campaigns Manager */}
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500/20 to-green-500/20 border border-emerald-500/30">
                  <Rocket className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <CardTitle className="text-lg text-white">Campanhas de Disparo</CardTitle>
                  <p className="text-sm text-slate-400">Gerenciamento de campanhas WhatsApp em massa</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <CampaignManager />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Triagem Tab Content */}
        <TabsContent value="triagem" className="mt-0">
          <ButtonMetricsDashboard />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ProspectingDashboard;
