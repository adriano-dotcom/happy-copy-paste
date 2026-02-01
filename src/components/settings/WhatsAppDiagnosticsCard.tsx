import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  RefreshCw, 
  TrendingUp, 
  TrendingDown,
  CreditCard,
  Users,
  MessageSquare,
  ExternalLink
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useWhatsAppAlerts, WhatsAppAlert, ERROR_CODE_INFO } from '@/hooks/useWhatsAppAlerts';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ErrorStats {
  error_131026: number;
  error_131042: number;
  error_131049: number;
  error_other: number;
  total_sent: number;
  total_delivered: number;
  total_failed: number;
  delivery_rate: number;
}

export const WhatsAppDiagnosticsCard: React.FC = () => {
  const [stats, setStats] = useState<ErrorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { alerts, resolveAlert, hasUnresolvedCritical } = useWhatsAppAlerts();

  const fetchStats = async () => {
    try {
      // Get metrics from last 24 hours
      const { data: metrics, error } = await supabase
        .from('whatsapp_metrics')
        .select('*')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Aggregate metrics
      const aggregated = (metrics || []).reduce((acc, m) => ({
        error_131026: acc.error_131026 + (m.error_131026_count || 0),
        error_131042: acc.error_131042 + ((m as any).error_131042_count || 0),
        error_131049: acc.error_131049 + (m.error_131049_count || 0),
        error_other: acc.error_other + (m.error_other_count || 0),
        total_sent: acc.total_sent + (m.messages_sent || 0),
        total_delivered: acc.total_delivered + (m.messages_delivered || 0),
        total_failed: acc.total_failed + (m.messages_failed || 0),
        delivery_rate: 0
      }), {
        error_131026: 0,
        error_131042: 0,
        error_131049: 0,
        error_other: 0,
        total_sent: 0,
        total_delivered: 0,
        total_failed: 0,
        delivery_rate: 0
      });

      aggregated.delivery_rate = aggregated.total_sent > 0 
        ? (aggregated.total_delivered / aggregated.total_sent) * 100 
        : 0;

      setStats(aggregated);
    } catch (err) {
      console.error('Error fetching WhatsApp stats:', err);
      toast.error('Erro ao carregar diagnóstico');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchStats();
    setRefreshing(false);
    toast.success('Diagnóstico atualizado');
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const getDeliveryRateColor = (rate: number) => {
    if (rate >= 90) return 'text-green-400';
    if (rate >= 70) return 'text-amber-400';
    return 'text-red-400';
  };

  const getDeliveryRateIcon = (rate: number) => {
    if (rate >= 90) return <CheckCircle className="w-5 h-5 text-green-400" />;
    if (rate >= 70) return <AlertTriangle className="w-5 h-5 text-amber-400" />;
    return <XCircle className="w-5 h-5 text-red-400" />;
  };

  return (
    <Card className="bg-slate-800/50 border-slate-700/50">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${hasUnresolvedCritical ? 'bg-red-500/20' : 'bg-emerald-500/20'}`}>
            <MessageSquare className={`w-5 h-5 ${hasUnresolvedCritical ? 'text-red-400' : 'text-emerald-400'}`} />
          </div>
          <div>
            <CardTitle className="text-lg text-white">Diagnóstico WhatsApp</CardTitle>
            <p className="text-xs text-slate-400 mt-0.5">Últimas 24 horas</p>
          </div>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-slate-400 hover:text-white"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Critical Alerts Section */}
        {alerts.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              Alertas Ativos ({alerts.length})
            </h4>
            <div className="space-y-2">
              {alerts.slice(0, 3).map((alert) => (
                <div 
                  key={alert.id}
                  className="bg-red-500/10 border border-red-500/30 rounded-lg p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {alert.error_code === 131042 && (
                          <CreditCard className="w-4 h-4 text-red-400" />
                        )}
                        <span className="text-sm font-medium text-red-400">
                          {alert.title}
                        </span>
                        <Badge variant="outline" className="text-xs border-red-500/30 text-red-400">
                          {alert.error_code}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-400 line-clamp-2">
                        {alert.description}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-1">
                        {format(new Date(alert.created_at), "dd/MM HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => resolveAlert(alert.id, 'admin')}
                      className="text-xs text-slate-400 hover:text-white shrink-0"
                    >
                      Resolver
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            
            {alerts.some(a => a.error_code === 131042) && (
              <a
                href="https://business.facebook.com/billing_hub/payment_settings"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-red-400 hover:text-red-300 mt-2"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Verificar pagamento no Meta Business
              </a>
            )}
          </div>
        )}

        {/* Stats Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
          </div>
        ) : stats && (
          <>
            {/* Delivery Rate */}
            <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-700/30">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 mb-1">Taxa de Entrega</p>
                  <p className={`text-3xl font-bold ${getDeliveryRateColor(stats.delivery_rate)}`}>
                    {stats.delivery_rate.toFixed(1)}%
                  </p>
                </div>
                {getDeliveryRateIcon(stats.delivery_rate)}
              </div>
              <div className="mt-3 flex items-center gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-green-400" />
                  {stats.total_delivered} entregues
                </span>
                <span className="flex items-center gap-1">
                  <TrendingDown className="w-3 h-3 text-red-400" />
                  {stats.total_failed} falhas
                </span>
              </div>
            </div>

            {/* Error Breakdown */}
            <div>
              <h4 className="text-sm font-medium text-slate-300 mb-3">Detalhamento de Erros</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-900/30 rounded-lg p-3 border border-slate-700/30">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-400">131026</span>
                    <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-400">
                      Inválido
                    </Badge>
                  </div>
                  <p className="text-xl font-semibold text-white">{stats.error_131026}</p>
                </div>
                
                <div className="bg-slate-900/30 rounded-lg p-3 border border-slate-700/30">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-400">131042</span>
                    <Badge variant="outline" className="text-[10px] border-red-500/30 text-red-400">
                      Pagamento
                    </Badge>
                  </div>
                  <p className="text-xl font-semibold text-white">{stats.error_131042}</p>
                </div>
                
                <div className="bg-slate-900/30 rounded-lg p-3 border border-slate-700/30">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-400">131049</span>
                    <Badge variant="outline" className="text-[10px] border-blue-500/30 text-blue-400">
                      Limite
                    </Badge>
                  </div>
                  <p className="text-xl font-semibold text-white">{stats.error_131049}</p>
                </div>
                
                <div className="bg-slate-900/30 rounded-lg p-3 border border-slate-700/30">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-slate-400">Outros</span>
                    <Badge variant="outline" className="text-[10px] border-slate-500/30 text-slate-400">
                      Misc
                    </Badge>
                  </div>
                  <p className="text-xl font-semibold text-white">{stats.error_other}</p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Checklist */}
        <div className="border-t border-slate-700/50 pt-4">
          <h4 className="text-sm font-medium text-slate-300 mb-3">Checklist de Correção</h4>
          <ul className="space-y-2 text-xs text-slate-400">
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 mt-0.5">1.</span>
              <span>Verificar método de pagamento no <a href="https://business.facebook.com/billing_hub" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">Meta Business</a></span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 mt-0.5">2.</span>
              <span>Confirmar que templates estão APPROVED no painel Meta</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 mt-0.5">3.</span>
              <span>Validar qualidade da base de contatos (números sem WhatsApp = 131026)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 mt-0.5">4.</span>
              <span>Respeitar limites de marketing por destinatário (erro 131049)</span>
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};
