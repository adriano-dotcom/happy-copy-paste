import React, { useState, useMemo } from 'react';
import { Phone, PhoneOff, PhoneMissed, CheckCircle, Clock, XCircle, TrendingUp, AlertTriangle, Loader2, Star, Filter, Pause, Play } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie, Cell, Line, LineChart } from 'recharts';
import { useVoiceDashboardMetrics, VoiceDashboardRecord } from '@/hooks/useVoiceDashboardMetrics';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type StatusFilter = 'all' | 'completed' | 'pending' | 'failed' | 'no_answer' | 'cancelled';

const statusLabels: Record<string, string> = {
  completed: 'Concluída',
  pending: 'Pendente',
  scheduled: 'Agendada',
  calling: 'Ligando',
  in_progress: 'Em andamento',
  no_answer: 'Sem resposta',
  failed: 'Falha',
  not_contacted: 'Não contatado',
  cancelled: 'Cancelada',
  call_initiation_failure: 'Falha ao iniciar',
};

const statusColors: Record<string, string> = {
  completed: '#8b5cf6',
  pending: '#64748b',
  scheduled: '#64748b',
  no_answer: '#f59e0b',
  failed: '#ef4444',
  not_contacted: '#ef4444',
  call_initiation_failure: '#ef4444',
  cancelled: '#94a3b8',
  calling: '#3b82f6',
  in_progress: '#3b82f6',
};

const KPICard: React.FC<{ title: string; value: string | number; subtitle?: string; icon: React.ReactNode; color: string }> = ({ title, value, subtitle, icon, color }) => (
  <div className="bg-white/5 border border-white/10 rounded-xl p-5 hover:bg-white/[0.07] transition-all">
    <div className="flex items-center justify-between mb-3">
      <span className="text-xs text-slate-400 uppercase tracking-wider font-medium">{title}</span>
      <div className={`w-9 h-9 rounded-lg ${color} flex items-center justify-center`}>{icon}</div>
    </div>
    <p className="text-2xl font-bold text-white">{value}</p>
    {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
  </div>
);

const VoiceDashboard: React.FC = () => {
  const { data: metrics, isLoading } = useVoiceDashboardMetrics();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [toggling, setToggling] = useState(false);

  const { data: voiceSettings, refetch: refetchSettings } = useQuery({
    queryKey: ['voice-automation-status'],
    queryFn: async () => {
      const { data } = await supabase
        .from('nina_settings')
        .select('id, auto_voice_paused, auto_voice_paused_at')
        .limit(1)
        .single();
      return data;
    },
  });

  const isPaused = voiceSettings?.auto_voice_paused ?? false;

  const togglePause = async () => {
    if (!voiceSettings?.id) return;
    setToggling(true);
    const newState = !isPaused;
    const { error } = await supabase
      .from('nina_settings')
      .update({
        auto_voice_paused: newState,
        auto_voice_paused_at: newState ? new Date().toISOString() : null,
      } as any)
      .eq('id', voiceSettings.id);
    setToggling(false);
    if (error) {
      toast.error('Erro ao atualizar automação');
      return;
    }
    refetchSettings();
    toast.success(newState ? 'Automação pausada' : 'Automação retomada');
  };

  const filteredRecords = useMemo(() => {
    if (!metrics) return [];
    if (statusFilter === 'all') return metrics.records;
    if (statusFilter === 'failed') return metrics.records.filter(r => ['failed', 'not_contacted', 'call_initiation_failure'].includes(r.status));
    if (statusFilter === 'pending') return metrics.records.filter(r => ['pending', 'scheduled'].includes(r.status));
    return metrics.records.filter(r => r.status === statusFilter);
  }, [metrics, statusFilter]);

  const pieData = useMemo(() => {
    if (!metrics) return [];
    return Object.entries(metrics.byStatus).map(([status, count]) => ({
      name: statusLabels[status] || status,
      value: count,
      fill: statusColors[status] || '#64748b',
    }));
  }, [metrics]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-950">
        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
      </div>
    );
  }

  if (!metrics) return null;

  const formatDate = (d: string | null) => {
    if (!d) return '--';
    return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      completed: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
      pending: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
      scheduled: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
      no_answer: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      failed: 'bg-red-500/20 text-red-400 border-red-500/30',
      not_contacted: 'bg-red-500/20 text-red-400 border-red-500/30',
      call_initiation_failure: 'bg-red-500/20 text-red-400 border-red-500/30',
      cancelled: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
      calling: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      in_progress: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    };
    return (
      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${colors[status] || 'bg-slate-500/20 text-slate-400 border-slate-500/30'}`}>
        {statusLabels[status] || status}
      </span>
    );
  };

    return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Phone className="w-7 h-7 text-violet-400" />
            Ligações IA — Iris
          </h1>
          <p className="text-sm text-slate-400 mt-1">Dashboard de qualificação por voz via ElevenLabs</p>
        </div>
        <button
          onClick={togglePause}
          disabled={toggling || !voiceSettings}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-all disabled:opacity-50 ${
            isPaused
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30'
              : 'bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30'
          }`}
        >
          {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          {toggling ? 'Aguarde...' : isPaused ? 'Retomar Automação' : 'Pausar Automação'}
        </button>
      </div>

      {/* Paused Banner */}
      {isPaused && (
        <div className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>
            Automação de ligações <strong>PAUSADA</strong>
            {voiceSettings?.auto_voice_paused_at && (
              <> desde {new Date(voiceSettings.auto_voice_paused_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}</>
            )}
            . Nenhuma ligação automática será feita.
          </span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard title="Total" value={metrics.total} icon={<Phone className="w-4 h-4 text-white" />} color="bg-violet-500/20" />
        <KPICard title="Taxa Atend." value={`${metrics.attendanceRate.toFixed(0)}%`} subtitle={`${metrics.completedCount} atendidas`} icon={<CheckCircle className="w-4 h-4 text-white" />} color="bg-emerald-500/20" />
        <KPICard title="Taxa Qualif." value={`${metrics.qualificationRate.toFixed(0)}%`} subtitle={`${metrics.qualifiedCount} qualificados`} icon={<TrendingUp className="w-4 h-4 text-white" />} color="bg-cyan-500/20" />
        <KPICard title="Pendentes" value={metrics.pendingCount} icon={<Clock className="w-4 h-4 text-white" />} color="bg-slate-500/20" />
        <KPICard title="Canceladas" value={metrics.cancelledCount} icon={<XCircle className="w-4 h-4 text-white" />} color="bg-slate-600/20" />
        <KPICard title="Falhas" value={metrics.failedCount + metrics.noAnswerCount} subtitle={`${metrics.noAnswerCount} sem resp.`} icon={<AlertTriangle className="w-4 h-4 text-white" />} color="bg-red-500/20" />
      </div>

      {/* Auto-Voice on Window Panel */}
      <div className="bg-white/5 border border-cyan-500/20 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-cyan-400 mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Auto-Voice (Abertura de Janela)
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard title="Disparos Auto" value={metrics.autoWindowTotal} icon={<Phone className="w-4 h-4 text-white" />} color="bg-cyan-500/20" />
          <KPICard title="Ligações Realizadas" value={metrics.autoWindowCalled} icon={<TrendingUp className="w-4 h-4 text-white" />} color="bg-blue-500/20" />
          <KPICard title="Atendidas" value={metrics.autoWindowCompleted} icon={<CheckCircle className="w-4 h-4 text-white" />} color="bg-emerald-500/20" />
          <KPICard title="Taxa Atendimento" value={`${metrics.autoWindowRate.toFixed(0)}%`} subtitle={`${metrics.autoWindowCompleted}/${metrics.autoWindowCalled}`} icon={<Star className="w-4 h-4 text-white" />} color="bg-violet-500/20" />
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Status Distribution */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Distribuição por Status</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} strokeWidth={0}>
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-2 mt-2">
            {pieData.map((e, i) => (
              <span key={i} className="flex items-center gap-1.5 text-[10px] text-slate-400">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: e.fill }} />
                {e.name} ({e.value})
              </span>
            ))}
          </div>
        </div>

        {/* Daily calls */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Ligações por Dia</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={metrics.dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="total" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.15} name="Total" />
              <Area type="monotone" dataKey="completed" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.1} name="Atendidas" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Qualification rate over time */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Qualificação por Dia</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={metrics.dailyData.map(d => ({
              ...d,
              rate: d.completed > 0 ? Math.round((d.qualified / d.completed) * 100) : 0,
            }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} domain={[0, 100]} />
              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [`${v}%`, 'Taxa']} />
              <Line type="monotone" dataKey="rate" stroke="#22d3ee" strokeWidth={2} dot={{ r: 3, fill: '#22d3ee' }} name="Taxa Qualif. %" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Calls Table */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-300">Ligações Recentes</h3>
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            {(['all', 'completed', 'pending', 'no_answer', 'failed', 'cancelled'] as StatusFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`text-[10px] px-2.5 py-1 rounded-full border transition-all ${statusFilter === f ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10'}`}
              >
                {f === 'all' ? 'Todas' : statusLabels[f] || f}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Contato</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Status</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Resultado</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Interesse</th>
                <th className="text-center py-2 px-3 text-slate-500 font-medium">Tentativa</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Data</th>
                <th className="text-left py-2 px-3 text-slate-500 font-medium">Resumo</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.slice(0, 50).map(r => (
                <tr key={r.id} className="border-b border-white/5 hover:bg-white/[0.03] transition-colors">
                  <td className="py-2.5 px-3">
                    <p className="text-slate-200 font-medium">{r.contacts?.name || 'Sem nome'}</p>
                    <p className="text-slate-500">{r.contacts?.phone_number || '--'}</p>
                  </td>
                  <td className="py-2.5 px-3">{getStatusBadge(r.status)}</td>
                  <td className="py-2.5 px-3 text-slate-400">{r.qualification_result || '--'}</td>
                  <td className="py-2.5 px-3">
                    {r.interest_level ? (
                      <div className="flex items-center gap-1">
                        {[1, 2, 3].map(i => {
                          const level = r.interest_level?.toLowerCase() || '';
                          const stars = level.includes('alto') || level.includes('high') ? 3 : level.includes('méd') || level.includes('med') ? 2 : 1;
                          return <Star key={i} className={`w-3 h-3 ${i <= stars ? 'text-yellow-400 fill-yellow-400' : 'text-slate-700'}`} />;
                        })}
                      </div>
                    ) : <span className="text-slate-600">--</span>}
                  </td>
                  <td className="py-2.5 px-3 text-center text-slate-400">{r.attempt_number}/{r.max_attempts}</td>
                  <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">{formatDate(r.called_at || r.created_at)}</td>
                  <td className="py-2.5 px-3 text-slate-500 max-w-[200px] truncate">{r.call_summary || r.observations || '--'}</td>
                </tr>
              ))}
              {filteredRecords.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-slate-500">Nenhuma ligação encontrada</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Failures Section */}
      {metrics.recentFailures.length > 0 && (
        <div className="bg-white/5 border border-red-500/10 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-red-400 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Últimas Falhas / Sem Resposta
          </h3>
          <div className="space-y-2">
            {metrics.recentFailures.map(r => (
              <div key={r.id} className="flex items-center gap-4 p-3 bg-white/[0.02] rounded-lg border border-white/5 text-xs">
                <div className="flex-shrink-0">{getStatusBadge(r.status)}</div>
                <span className="text-slate-300 font-medium">{r.contacts?.name || r.contacts?.phone_number || '--'}</span>
                <span className="text-slate-500 flex-1 truncate">{r.observations || 'Sem observações'}</span>
                <span className="text-slate-600 whitespace-nowrap">{formatDate(r.called_at || r.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default VoiceDashboard;
