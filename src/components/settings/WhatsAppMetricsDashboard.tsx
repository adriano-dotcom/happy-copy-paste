import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Send, CheckCircle, Eye, XCircle, TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

type Period = 'today' | '7d' | '30d';

interface HourlyData {
  hour: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  delivery_rate: number;
  err_131026: number;
  err_131042: number;
  err_131049: number;
  err_other: number;
}

interface Totals {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  templates: number;
  rate: number;
}

const PERIOD_LABELS: Record<Period, string> = { today: 'Hoje', '7d': '7 dias', '30d': '30 dias' };

const WhatsAppMetricsDashboard: React.FC = () => {
  const [period, setPeriod] = useState<Period>('today');
  const [hourly, setHourly] = useState<HourlyData[]>([]);
  const [totals, setTotals] = useState<Totals>({ sent: 0, delivered: 0, read: 0, failed: 0, templates: 0, rate: 0 });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const startDate = new Date(now);
      if (period === 'today') startDate.setHours(0, 0, 0, 0);
      else if (period === '7d') startDate.setDate(now.getDate() - 7);
      else startDate.setDate(now.getDate() - 30);

      const { data, error } = await supabase
        .from('whatsapp_metrics')
        .select('*')
        .gte('metric_date', startDate.toISOString().split('T')[0])
        .order('metric_date', { ascending: true })
        .order('metric_hour', { ascending: true });

      if (error) throw error;

      // Aggregate by hour (for today) or by date bucket
      const rows = data || [];
      const bucketMap = new Map<string, HourlyData>();

      let tSent = 0, tDel = 0, tRead = 0, tFail = 0, tTempl = 0;

      rows.forEach((r) => {
        const key = period === 'today' ? `${String(r.metric_hour).padStart(2, '0')}h` : r.metric_date;
        const existing = bucketMap.get(key) || {
          hour: key, sent: 0, delivered: 0, read: 0, failed: 0, delivery_rate: 0,
          err_131026: 0, err_131042: 0, err_131049: 0, err_other: 0,
        };
        existing.sent += r.messages_sent || 0;
        existing.delivered += r.messages_delivered || 0;
        existing.read += r.messages_read || 0;
        existing.failed += r.messages_failed || 0;
        existing.err_131026 += r.error_131026_count || 0;
        existing.err_131042 += r.error_131042_count || 0;
        existing.err_131049 += r.error_131049_count || 0;
        existing.err_other += r.error_other_count || 0;
        bucketMap.set(key, existing);

        tSent += r.messages_sent || 0;
        tDel += r.messages_delivered || 0;
        tRead += r.messages_read || 0;
        tFail += r.messages_failed || 0;
        tTempl += r.templates_sent || 0;
      });

      // Compute delivery_rate per bucket
      bucketMap.forEach((v) => {
        v.delivery_rate = v.sent > 0 ? Math.round((v.delivered / v.sent) * 100) : 0;
      });

      setHourly(Array.from(bucketMap.values()));
      setTotals({
        sent: tSent, delivered: tDel, read: tRead, failed: tFail, templates: tTempl,
        rate: tSent > 0 ? Math.round((tDel / tSent) * 100) : 0,
      });
    } catch {
      toast.error('Erro ao carregar métricas');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const kpis = [
    { label: 'Enviadas', value: totals.sent, icon: Send, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
    { label: 'Entregues', value: totals.delivered, icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10' },
    { label: 'Lidas', value: totals.read, icon: Eye, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Falhas', value: totals.failed, icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10' },
    { label: 'Taxa Entrega', value: `${totals.rate}%`, icon: TrendingUp, color: totals.rate >= 90 ? 'text-green-400' : totals.rate >= 70 ? 'text-amber-400' : 'text-red-400', bg: totals.rate >= 90 ? 'bg-green-500/10' : totals.rate >= 70 ? 'bg-amber-500/10' : 'bg-red-500/10' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-bold text-white">Métricas WhatsApp</h3>
          <p className="text-xs text-slate-400 mt-1">Dados da tabela whatsapp_metrics</p>
        </div>
        <div className="flex items-center gap-2">
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <Button
              key={p}
              variant={period === p ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setPeriod(p)}
              className={period === p ? 'bg-cyan-600 text-white hover:bg-cyan-700' : 'text-slate-400 hover:text-white'}
            >
              {PERIOD_LABELS[p]}
            </Button>
          ))}
          <Button variant="ghost" size="sm" onClick={fetchData} disabled={loading} className="text-slate-400 hover:text-white">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-3">
        {kpis.map((k) => (
          <Card key={k.label} className="bg-slate-800/50 border-slate-700/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${k.bg}`}>
                <k.icon className={`w-5 h-5 ${k.color}`} />
              </div>
              <div>
                <p className="text-xs text-slate-400">{k.label}</p>
                <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
        </div>
      ) : hourly.length === 0 ? (
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardContent className="p-12 text-center text-slate-400">
            Sem dados para o período selecionado.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Messages Bar Chart */}
          <Card className="bg-slate-800/50 border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-base text-white">Mensagens por {period === 'today' ? 'Hora' : 'Dia'}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={hourly} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="hour" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="sent" name="Enviadas" fill="#22d3ee" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="delivered" name="Entregues" fill="#4ade80" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="read" name="Lidas" fill="#60a5fa" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="failed" name="Falhas" fill="#f87171" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Delivery Rate Line Chart */}
          <Card className="bg-slate-800/50 border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-base text-white">Taxa de Entrega (%)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={hourly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="hour" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
                  <Line type="monotone" dataKey="delivery_rate" name="Taxa %" stroke="#22d3ee" strokeWidth={2} dot={{ r: 4, fill: '#22d3ee' }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Error Breakdown Stacked Bar */}
          <Card className="bg-slate-800/50 border-slate-700/50">
            <CardHeader>
              <CardTitle className="text-base text-white">Erros por Código</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={hourly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="hour" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f1f5f9' }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="err_131026" name="131026 (Inválido)" stackId="errors" fill="#fbbf24" />
                  <Bar dataKey="err_131042" name="131042 (Pagamento)" stackId="errors" fill="#f87171" />
                  <Bar dataKey="err_131049" name="131049 (Limite)" stackId="errors" fill="#60a5fa" />
                  <Bar dataKey="err_other" name="Outros" stackId="errors" fill="#94a3b8" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default WhatsAppMetricsDashboard;
