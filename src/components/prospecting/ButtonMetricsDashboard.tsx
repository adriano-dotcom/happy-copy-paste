import React, { useState, useEffect } from 'react';
import { MousePointerClick, MessageSquare, ArrowRightLeft, Truck, Shield, XCircle, RefreshCw } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ProspectingKPICard } from './ProspectingKPICard';
import { ButtonClicksFunnel } from './ButtonClicksFunnel';
import { ButtonDistributionChart } from './ButtonDistributionChart';
import { ButtonEvolutionChart } from './ButtonEvolutionChart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface ButtonMetrics {
  buttonsSent: number;
  totalClicks: number;
  transportadorClicks: number;
  outrosClicks: number;
  enganoClicks: number;
  clickRate: number;
  handoffCount: number;
  prevButtonsSent: number;
  prevClickRate: number;
  prevHandoffCount: number;
}

interface DailyData {
  date: string;
  displayDate: string;
  sent: number;
  clicks: number;
  transportador: number;
  outros: number;
  engano: number;
  clickRate: number;
}

export const ButtonMetricsDashboard: React.FC = () => {
  const [period, setPeriod] = useState<string>('7');
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<ButtonMetrics | null>(null);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);

  const fetchButtonMetrics = async () => {
    setLoading(true);
    try {
      const days = parseInt(period);
      const periodStart = new Date();
      periodStart.setDate(periodStart.getDate() - days);
      periodStart.setHours(0, 0, 0, 0);

      const prevPeriodStart = new Date(periodStart);
      prevPeriodStart.setDate(prevPeriodStart.getDate() - days);

      // Fetch interactive buttons sent
      const { data: sentButtons, error: sentError } = await supabase
        .from('messages')
        .select('id, conversation_id, sent_at, metadata')
        .eq('from_type', 'nina')
        .gte('sent_at', periodStart.toISOString())
        .not('metadata', 'is', null);

      if (sentError) throw sentError;

      // Filter for interactive messages
      const interactiveMessages = (sentButtons || []).filter(m => {
        const meta = m.metadata as any;
        return meta?.is_interactive === true || meta?.message_type === 'interactive';
      });

      // Fetch button clicks
      const { data: buttonClicks, error: clicksError } = await supabase
        .from('messages')
        .select('id, conversation_id, sent_at, metadata')
        .eq('from_type', 'user')
        .gte('sent_at', periodStart.toISOString())
        .not('metadata', 'is', null);

      if (clicksError) throw clicksError;

      // Filter for button replies
      const buttonReplies = (buttonClicks || []).filter(m => {
        const meta = m.metadata as any;
        return meta?.is_button_reply === true;
      });

      // Previous period data
      const { data: prevSentButtons } = await supabase
        .from('messages')
        .select('id, metadata')
        .eq('from_type', 'nina')
        .gte('sent_at', prevPeriodStart.toISOString())
        .lt('sent_at', periodStart.toISOString())
        .not('metadata', 'is', null);

      const prevInteractiveMessages = (prevSentButtons || []).filter(m => {
        const meta = m.metadata as any;
        return meta?.is_interactive === true || meta?.message_type === 'interactive';
      });

      const { data: prevButtonClicks } = await supabase
        .from('messages')
        .select('id, metadata')
        .eq('from_type', 'user')
        .gte('sent_at', prevPeriodStart.toISOString())
        .lt('sent_at', periodStart.toISOString())
        .not('metadata', 'is', null);

      const prevButtonReplies = (prevButtonClicks || []).filter(m => {
        const meta = m.metadata as any;
        return meta?.is_button_reply === true;
      });

      // Count by button type
      const clicksByType = {
        btn_transportador: 0,
        btn_outros_seguros: 0,
        btn_engano: 0,
      };

      buttonReplies.forEach(msg => {
        const meta = msg.metadata as any;
        const buttonId = meta?.button_id;
        if (buttonId && buttonId in clicksByType) {
          clicksByType[buttonId as keyof typeof clicksByType]++;
        }
      });

      // Count handoffs (outros_seguros clicks indicate handoff to Sofia)
      const handoffCount = clicksByType.btn_outros_seguros;
      
      // Previous handoffs
      let prevHandoffCount = 0;
      prevButtonReplies.forEach(msg => {
        const meta = msg.metadata as any;
        if (meta?.button_id === 'btn_outros_seguros') {
          prevHandoffCount++;
        }
      });

      // Calculate metrics
      const buttonsSent = interactiveMessages.length;
      const totalClicks = buttonReplies.length;
      const clickRate = buttonsSent > 0 ? (totalClicks / buttonsSent) * 100 : 0;

      const prevButtonsSent = prevInteractiveMessages.length;
      const prevTotalClicks = prevButtonReplies.length;
      const prevClickRate = prevButtonsSent > 0 ? (prevTotalClicks / prevButtonsSent) * 100 : 0;

      setMetrics({
        buttonsSent,
        totalClicks,
        transportadorClicks: clicksByType.btn_transportador,
        outrosClicks: clicksByType.btn_outros_seguros,
        enganoClicks: clicksByType.btn_engano,
        clickRate,
        handoffCount,
        prevButtonsSent,
        prevClickRate,
        prevHandoffCount,
      });

      // Build daily data
      const dailyMap = new Map<string, DailyData>();
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        dailyMap.set(dateStr, {
          date: dateStr,
          displayDate: `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`,
          sent: 0,
          clicks: 0,
          transportador: 0,
          outros: 0,
          engano: 0,
          clickRate: 0,
        });
      }

      // Populate sent
      interactiveMessages.forEach(m => {
        const dateStr = new Date(m.sent_at).toISOString().split('T')[0];
        const entry = dailyMap.get(dateStr);
        if (entry) {
          entry.sent++;
        }
      });

      // Populate clicks
      buttonReplies.forEach(m => {
        const dateStr = new Date(m.sent_at).toISOString().split('T')[0];
        const entry = dailyMap.get(dateStr);
        if (entry) {
          entry.clicks++;
          const meta = m.metadata as any;
          const buttonId = meta?.button_id;
          if (buttonId === 'btn_transportador') entry.transportador++;
          else if (buttonId === 'btn_outros_seguros') entry.outros++;
          else if (buttonId === 'btn_engano') entry.engano++;
        }
      });

      // Calculate click rates
      dailyMap.forEach(entry => {
        entry.clickRate = entry.sent > 0 ? (entry.clicks / entry.sent) * 100 : 0;
      });

      setDailyData(Array.from(dailyMap.values()));
    } catch (error) {
      console.error('Error fetching button metrics:', error);
      toast.error('Erro ao carregar métricas de botões');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchButtonMetrics();
  }, [period]);

  const getTrendValue = (current: number, previous: number, isPercentage = false) => {
    const diff = current - previous;
    const sign = diff >= 0 ? '+' : '';
    if (isPercentage) {
      return `${sign}${diff.toFixed(1)}pp`;
    }
    const percentChange = previous > 0 ? ((diff / previous) * 100).toFixed(0) : (current > 0 ? '+100' : '0');
    return `${diff >= 0 ? '+' : ''}${percentChange}%`;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-64 bg-slate-800" />
          <Skeleton className="h-10 w-32 bg-slate-800" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-32 bg-slate-800" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-80 bg-slate-800" />
          <Skeleton className="h-80 bg-slate-800" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30">
            <MousePointerClick className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Triagem Interativa</h2>
            <p className="text-sm text-slate-400">Métricas dos botões de triagem da Íris</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
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
            onClick={fetchButtonMetrics}
            disabled={loading}
            className="border-slate-700"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ProspectingKPICard
            title="Botões Enviados"
            value={metrics.buttonsSent}
            trend={getTrendValue(metrics.buttonsSent, metrics.prevButtonsSent)}
            trendUp={metrics.buttonsSent >= metrics.prevButtonsSent}
            icon={<MessageSquare className="w-5 h-5" />}
            color="violet"
          />
          <ProspectingKPICard
            title="Taxa de Cliques"
            value={`${metrics.clickRate.toFixed(1)}%`}
            trend={getTrendValue(metrics.clickRate, metrics.prevClickRate, true)}
            trendUp={metrics.clickRate >= metrics.prevClickRate}
            icon={<MousePointerClick className="w-5 h-5" />}
            color="cyan"
          />
          <ProspectingKPICard
            title="Handoffs Sofia"
            value={metrics.handoffCount}
            trend={getTrendValue(metrics.handoffCount, metrics.prevHandoffCount)}
            trendUp={metrics.handoffCount >= metrics.prevHandoffCount}
            icon={<ArrowRightLeft className="w-5 h-5" />}
            color="emerald"
          />
        </div>
      )}

      {/* Charts Row */}
      {metrics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Funnel */}
          <ButtonClicksFunnel
            buttonsSent={metrics.buttonsSent}
            totalClicks={metrics.totalClicks}
            transportadorClicks={metrics.transportadorClicks}
            outrosClicks={metrics.outrosClicks}
            enganoClicks={metrics.enganoClicks}
          />

          {/* Distribution Chart */}
          <ButtonDistributionChart
            transportador={metrics.transportadorClicks}
            outros={metrics.outrosClicks}
            engano={metrics.enganoClicks}
          />
        </div>
      )}

      {/* Evolution Chart */}
      <ButtonEvolutionChart data={dailyData} />

      {/* Daily Table */}
      <Card className="bg-slate-900/50 border-slate-800/50">
        <CardHeader>
          <CardTitle className="text-white text-lg">Detalhes por Dia</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700 hover:bg-slate-800/50">
                <TableHead className="text-slate-400">Data</TableHead>
                <TableHead className="text-slate-400 text-right">Enviados</TableHead>
                <TableHead className="text-slate-400 text-right">Cliques</TableHead>
                <TableHead className="text-slate-400 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Truck className="w-3 h-3 text-emerald-400" />
                    Transp.
                  </div>
                </TableHead>
                <TableHead className="text-slate-400 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Shield className="w-3 h-3 text-blue-400" />
                    Outros
                  </div>
                </TableHead>
                <TableHead className="text-slate-400 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <XCircle className="w-3 h-3 text-red-400" />
                    Engano
                  </div>
                </TableHead>
                <TableHead className="text-slate-400 text-right">Taxa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dailyData.slice().reverse().slice(0, 10).map((day) => (
                <TableRow key={day.date} className="border-slate-700/50 hover:bg-slate-800/30">
                  <TableCell className="text-white font-medium">{day.displayDate}</TableCell>
                  <TableCell className="text-right text-slate-300">{day.sent}</TableCell>
                  <TableCell className="text-right text-slate-300">{day.clicks}</TableCell>
                  <TableCell className="text-right text-emerald-400 font-medium">{day.transportador}</TableCell>
                  <TableCell className="text-right text-blue-400 font-medium">{day.outros}</TableCell>
                  <TableCell className="text-right text-red-400 font-medium">{day.engano}</TableCell>
                  <TableCell className="text-right">
                    <span className={`font-medium ${day.clickRate >= 50 ? 'text-emerald-400' : day.clickRate >= 30 ? 'text-amber-400' : 'text-red-400'}`}>
                      {day.clickRate.toFixed(1)}%
                    </span>
                  </TableCell>
                </TableRow>
              ))}
              {dailyData.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-slate-400 py-8">
                    Nenhum dado disponível para o período selecionado
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
