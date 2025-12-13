import React, { useEffect, useState } from 'react';
import { Activity, DollarSign, MessageSquare, Users, Loader2, TrendingUp, TrendingDown, ArrowUpRight, Bot, Phone, Briefcase, Layers, Zap, MessageCircle, Clock } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { StatMetric } from '../types';
import { api } from '../services/api';
import { OnboardingBanner } from './OnboardingBanner';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

interface OutletContext {
  showOnboarding: boolean;
  setShowOnboarding: (show: boolean) => void;
}

type PeriodFilter = 'today' | '7days' | '30days';

const periodLabels: Record<PeriodFilter, string> = {
  today: 'Hoje',
  '7days': '7 Dias',
  '30days': '30 Dias'
};

const periodDays: Record<PeriodFilter, number> = {
  today: 1,
  '7days': 7,
  '30days': 30
};

interface SystemMetrics {
  totalMessages: number;
  aiMessages: number;
  clientMessages: number;
  avgResponseTime: number;
  totalContacts: number;
  totalDeals: number;
  totalConversations: number;
  totalCalls: number;
  totalAgents: number;
  totalPipelines: number;
  totalStages: number;
  activeAutomations: number;
  approvedTemplates: number;
  integrations: {
    whatsapp: boolean;
    elevenlabs: boolean;
    resend: boolean;
    api4com: boolean;
    pipedrive: boolean;
  };
  systemStartDate: string | null;
}

const Dashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<StatMetric[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodFilter>('today');
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const { setShowOnboarding } = useOutletContext<OutletContext>();

  const fetchSystemMetrics = async () => {
    try {
      const [
        { count: totalMessages },
        { count: aiMessages },
        { count: clientMessages },
        { data: avgTimeData },
        { count: totalContacts },
        { count: totalDeals },
        { count: totalConversations },
        { count: totalCalls },
        { count: totalAgents },
        { count: totalPipelines },
        { count: totalStages },
        { count: activeAutomations },
        { count: approvedTemplates },
        { data: settingsData },
        { data: firstConversation }
      ] = await Promise.all([
        supabase.from('messages').select('*', { count: 'exact', head: true }),
        supabase.from('messages').select('*', { count: 'exact', head: true }).eq('from_type', 'nina'),
        supabase.from('messages').select('*', { count: 'exact', head: true }).eq('from_type', 'user'),
        supabase.from('messages').select('nina_response_time').not('nina_response_time', 'is', null),
        supabase.from('contacts').select('*', { count: 'exact', head: true }),
        supabase.from('deals').select('*', { count: 'exact', head: true }),
        supabase.from('conversations').select('*', { count: 'exact', head: true }),
        supabase.from('call_logs').select('*', { count: 'exact', head: true }),
        supabase.from('agents').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('pipelines').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('pipeline_stages').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('followup_automations').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('whatsapp_templates').select('*', { count: 'exact', head: true }).eq('status', 'APPROVED'),
        supabase.from('nina_settings').select('whatsapp_phone_number_id, elevenlabs_api_key, api4com_enabled, pipedrive_enabled, elevenlabs_key_in_vault, api4com_token_in_vault, pipedrive_token_in_vault').limit(1).maybeSingle(),
        supabase.from('conversations').select('created_at').order('created_at', { ascending: true }).limit(1).maybeSingle()
      ]);

      const avgResponseTime = avgTimeData && avgTimeData.length > 0
        ? Math.round(avgTimeData.reduce((sum, m) => sum + (m.nina_response_time || 0), 0) / avgTimeData.length)
        : 0;

      setSystemMetrics({
        totalMessages: totalMessages || 0,
        aiMessages: aiMessages || 0,
        clientMessages: clientMessages || 0,
        avgResponseTime,
        totalContacts: totalContacts || 0,
        totalDeals: totalDeals || 0,
        totalConversations: totalConversations || 0,
        totalCalls: totalCalls || 0,
        totalAgents: totalAgents || 0,
        totalPipelines: totalPipelines || 0,
        totalStages: totalStages || 0,
        activeAutomations: activeAutomations || 0,
        approvedTemplates: approvedTemplates || 0,
        integrations: {
          whatsapp: !!settingsData?.whatsapp_phone_number_id,
          elevenlabs: !!settingsData?.elevenlabs_api_key || !!settingsData?.elevenlabs_key_in_vault,
          resend: true, // Resend is configured via edge function secrets
          api4com: !!settingsData?.api4com_enabled || !!settingsData?.api4com_token_in_vault,
          pipedrive: !!settingsData?.pipedrive_enabled || !!settingsData?.pipedrive_token_in_vault
        },
        systemStartDate: firstConversation?.created_at || null
      });
    } catch (error) {
      console.error('Erro ao carregar métricas do sistema:', error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const days = periodDays[period];
        const [metricsData, chartDataResponse] = await Promise.all([
          api.fetchDashboardMetrics(days),
          api.fetchChartData(days),
          fetchSystemMetrics()
        ]);
        setMetrics(metricsData);
        setChartData(chartDataResponse);
      } catch (error) {
        console.error("Erro ao carregar dashboard:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [period]);

  const getIcon = (label: string) => {
    if (label.includes('Conversões')) return <DollarSign className="h-5 w-5 text-emerald-400" />;
    if (label.includes('Atendimentos')) return <MessageSquare className="h-5 w-5 text-cyan-400" />;
    if (label.includes('Leads')) return <Users className="h-5 w-5 text-violet-400" />;
    return <Activity className="h-5 w-5 text-orange-400" />;
  };

  const getGradient = (label: string) => {
    if (label.includes('Conversões')) return 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/20';
    if (label.includes('Atendimentos')) return 'from-cyan-500/20 to-cyan-500/5 border-cyan-500/20';
    if (label.includes('Leads')) return 'from-violet-500/20 to-violet-500/5 border-violet-500/20';
    return 'from-orange-500/20 to-orange-500/5 border-orange-500/20';
  };

  const getMetricLabel = (baseLabel: string) => {
    if (baseLabel.includes('Atendimentos')) {
      return period === 'today' ? 'Atendimentos Hoje' : `Atendimentos (${periodLabels[period]})`;
    }
    if (baseLabel.includes('Leads')) {
      return period === 'today' ? 'Novos Leads' : `Novos Leads (${periodLabels[period]})`;
    }
    return baseLabel;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
             <div className="absolute inset-0 bg-cyan-500/20 blur-xl rounded-full"></div>
             <Loader2 className="h-10 w-10 animate-spin text-cyan-400 relative z-10" />
          </div>
          <p className="text-sm text-slate-400 font-medium animate-pulse">Carregando insights...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 overflow-y-auto h-full bg-slate-950 text-slate-50 custom-scrollbar">
      {/* Onboarding Banner */}
      <OnboardingBanner onOpenWizard={() => setShowOnboarding(true)} />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-white">Dashboard</h2>
          <p className="text-slate-400 mt-1">
            Visão geral da performance da sua IA {period === 'today' ? 'hoje' : `nos últimos ${periodLabels[period].toLowerCase()}`}.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-lg border border-slate-800">
          {(['today', '7days', '30days'] as PeriodFilter[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                period === p
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((stat, index) => (
          <div 
            key={index} 
            className={`relative overflow-hidden rounded-2xl border bg-slate-900/50 backdrop-blur-sm p-6 shadow-xl transition-all duration-300 hover:translate-y-[-2px] hover:bg-slate-900 group ${getGradient(stat.label)}`}
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div className="text-sm font-medium text-slate-400">{getMetricLabel(stat.label)}</div>
              <div className="p-2 rounded-lg bg-slate-800/50 border border-slate-700/50 group-hover:border-slate-600 transition-colors">
                 {getIcon(stat.label)}
              </div>
            </div>
            <div className="flex items-end justify-between">
                <div className="text-3xl font-bold text-white tracking-tight">{stat.value}</div>
                <div className={`flex items-center text-xs font-medium px-2 py-1 rounded-full ${stat.trendUp ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                    {stat.trendUp ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                    {stat.trend}
                </div>
            </div>
            {/* Decorative Glow */}
            <div className="absolute -bottom-10 -right-10 w-24 h-24 bg-white/5 blur-2xl rounded-full group-hover:bg-white/10 transition-all"></div>
          </div>
        ))}
      </div>

      {/* Charts Section */}
      <div className="grid gap-6 md:grid-cols-7">
        {/* Main Chart */}
        <div className="col-span-4 rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm p-6 shadow-lg">
          <div className="mb-6 flex items-center justify-between">
            <div>
                <h3 className="text-lg font-semibold text-white">Volume de Atendimentos</h3>
                <p className="text-sm text-slate-400">
                  Interações da IA {period === 'today' ? 'hoje' : `nos últimos ${periodDays[period]} dias`}
                </p>
            </div>
            <button className="text-cyan-400 hover:text-cyan-300 transition-colors p-2 hover:bg-cyan-950/30 rounded-lg">
                <ArrowUpRight className="w-5 h-5" />
            </button>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorChats" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tickMargin={10} 
                    fontSize={12} 
                    stroke="#64748b"
                />
                <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    fontSize={12} 
                    stroke="#64748b"
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #1e293b', color: '#f8fafc', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)' }} 
                  itemStyle={{ color: '#06b6d4' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="chats" 
                  stroke="#06b6d4" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorChats)" 
                  activeDot={{ r: 6, strokeWidth: 0, fill: '#fff' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Secondary Chart */}
        <div className="col-span-3 rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm p-6 shadow-lg flex flex-col">
           <div className="mb-6">
            <h3 className="text-lg font-semibold text-white">Conversões</h3>
            <p className="text-sm text-slate-400">Reuniões, vendas e ações concluídas</p>
          </div>
          
          <div className="flex-1 flex flex-col justify-center space-y-5">
            {chartData.slice(0, 5).map((day, i) => (
              <div key={i} className="group">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-300">{day.name}</span>
                    <span className="text-sm font-bold text-white group-hover:text-cyan-400 transition-colors">{day.sales} conv.</span>
                </div>
                <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-cyan-600 to-teal-500 rounded-full shadow-[0_0_10px_rgba(6,182,212,0.3)] transition-all duration-1000 ease-out group-hover:shadow-[0_0_15px_rgba(6,182,212,0.6)]" 
                    style={{ width: `${Math.min((day.sales / Math.max(...chartData.map(d => d.sales), 1)) * 100, 100)}%` }} 
                  />
                </div>
              </div>
            ))}
          </div>
          
          <div className="mt-6 pt-4 border-t border-slate-800">
             <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Total no período</span>
                <span className="text-emerald-400 font-bold">
                  {chartData.reduce((sum, d) => sum + d.sales, 0)} conversões
                </span>
             </div>
          </div>
        </div>
      </div>

      {/* System Metrics Section */}
      {systemMetrics && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-700 to-transparent"></div>
            <h3 className="text-lg font-semibold text-slate-300 flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-400" />
              Métricas do Sistema
            </h3>
            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-slate-700 to-transparent"></div>
          </div>

          {/* Communication Metrics */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-cyan-400 uppercase tracking-wider">Comunicação</h4>
            <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
              <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs text-slate-400">Mensagens</span>
                </div>
                <p className="text-2xl font-bold text-white">{systemMetrics.totalMessages}</p>
              </div>
              <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Bot className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs text-slate-400">Respostas IA</span>
                </div>
                <p className="text-2xl font-bold text-white">{systemMetrics.aiMessages}</p>
                <p className="text-xs text-cyan-400/80 mt-1">
                  {systemMetrics.totalMessages > 0 ? Math.round((systemMetrics.aiMessages / systemMetrics.totalMessages) * 100) : 0}% do total
                </p>
              </div>
              <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs text-slate-400">Clientes</span>
                </div>
                <p className="text-2xl font-bold text-white">{systemMetrics.clientMessages}</p>
              </div>
              <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs text-slate-400">Tempo IA</span>
                </div>
                <p className="text-2xl font-bold text-white">{systemMetrics.avgResponseTime}s</p>
              </div>
            </div>
          </div>

          {/* Operations Metrics */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-violet-400 uppercase tracking-wider">Operações</h4>
            <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
              <div className="rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-violet-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-violet-400" />
                  <span className="text-xs text-slate-400">Contatos</span>
                </div>
                <p className="text-2xl font-bold text-white">{systemMetrics.totalContacts}</p>
              </div>
              <div className="rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-violet-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Briefcase className="w-4 h-4 text-violet-400" />
                  <span className="text-xs text-slate-400">Negócios</span>
                </div>
                <p className="text-2xl font-bold text-white">{systemMetrics.totalDeals}</p>
              </div>
              <div className="rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-violet-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <MessageCircle className="w-4 h-4 text-violet-400" />
                  <span className="text-xs text-slate-400">Conversas</span>
                </div>
                <p className="text-2xl font-bold text-white">{systemMetrics.totalConversations}</p>
              </div>
              <div className="rounded-xl border border-violet-500/20 bg-gradient-to-br from-violet-500/10 to-violet-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Phone className="w-4 h-4 text-violet-400" />
                  <span className="text-xs text-slate-400">Chamadas</span>
                </div>
                <p className="text-2xl font-bold text-white">{systemMetrics.totalCalls}</p>
              </div>
            </div>
          </div>

          {/* Infrastructure Metrics */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-emerald-400 uppercase tracking-wider">Infraestrutura</h4>
            <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
              <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Bot className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs text-slate-400">Agentes IA</span>
                </div>
                <p className="text-2xl font-bold text-white">{systemMetrics.totalAgents}</p>
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Layers className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs text-slate-400">Pipelines</span>
                </div>
                <p className="text-2xl font-bold text-white">{systemMetrics.totalPipelines}</p>
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs text-slate-400">Estágios</span>
                </div>
                <p className="text-2xl font-bold text-white">{systemMetrics.totalStages}</p>
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs text-slate-400">Automações</span>
                </div>
                <p className="text-2xl font-bold text-white">{systemMetrics.activeAutomations}</p>
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs text-slate-400">Templates</span>
                </div>
                <p className="text-2xl font-bold text-white">{systemMetrics.approvedTemplates}</p>
              </div>
            </div>
          </div>

          {/* Active Integrations */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-rose-400 uppercase tracking-wider">Integrações Ativas</h4>
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
              <div className="flex flex-wrap gap-3">
                {[
                  { name: 'WhatsApp', active: systemMetrics.integrations.whatsapp },
                  { name: 'ElevenLabs', active: systemMetrics.integrations.elevenlabs },
                  { name: 'Resend', active: systemMetrics.integrations.resend },
                  { name: 'API4Com', active: systemMetrics.integrations.api4com },
                  { name: 'Pipedrive', active: systemMetrics.integrations.pipedrive }
                ].map((integration) => (
                  <div
                    key={integration.name}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                      integration.active
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-slate-800/50 border-slate-700 text-slate-500'
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full ${integration.active ? 'bg-emerald-400' : 'bg-slate-600'}`}></div>
                    <span className="text-sm font-medium">{integration.name}</span>
                  </div>
                ))}
              </div>
              {systemMetrics.systemStartDate && (
                <div className="mt-4 pt-3 border-t border-slate-800">
                  <p className="text-xs text-slate-500">
                    Sistema iniciado em: {new Date(systemMetrics.systemStartDate).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;