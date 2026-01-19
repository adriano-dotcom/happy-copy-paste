import React, { useState, useEffect } from 'react';
import { Activity, Phone, Loader2, RefreshCw, CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronRight, Play, Mic } from 'lucide-react';
import { Button } from '../Button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface CallLog {
  id: string;
  phone_number: string;
  status: string;
  duration_seconds: number | null;
  hangup_cause: string | null;
  record_url: string | null;
  transcription_status: string | null;
  created_at: string;
  api4com_call_id: string | null;
  metadata: any;
}

interface WebhookLog {
  id: string;
  call_id: string | null;
  event_type: string;
  processing_result: string | null;
  error_message: string | null;
  created_at: string;
  raw_payload: any;
  client_ip: string | null;
}

const Api4ComDiagnostics: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([]);
  const [expandedPayload, setExpandedPayload] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [configStatus, setConfigStatus] = useState<{
    token: boolean;
    extension: string | null;
    enabled: boolean;
  } | null>(null);

  // KPI calculations
  const todayCalls = callLogs.filter(c => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return new Date(c.created_at) >= today;
  }).length;
  
  const stuckCalls = callLogs.filter(c => 
    ['dialing', 'ringing', 'timeout'].includes(c.status)
  ).length;
  
  const callsWithoutRecording = callLogs.filter(c => 
    ['completed', 'answered'].includes(c.status) && !c.record_url
  ).length;

  const recentWebhooks = webhookLogs.length;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load call logs
      const { data: calls, error: callsError } = await supabase
        .from('call_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (callsError) throw callsError;
      setCallLogs(calls || []);

      // Load webhook logs
      const { data: webhooks, error: webhooksError } = await supabase
        .from('api4com_webhook_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (!webhooksError) {
        setWebhookLogs(webhooks || []);
      }

      // Load config status
      const { data: settings } = await supabase
        .from('nina_settings')
        .select('api4com_api_token, api4com_default_extension, api4com_enabled')
        .maybeSingle();

      if (settings) {
        setConfigStatus({
          token: !!settings.api4com_api_token,
          extension: settings.api4com_default_extension,
          enabled: settings.api4com_enabled || false,
        });
      }
    } catch (error) {
      console.error('Error loading diagnostics:', error);
      toast.error('Erro ao carregar diagnóstico');
    } finally {
      setLoading(false);
    }
  };

  const syncCall = async (callLogId: string) => {
    setSyncing(callLogId);
    try {
      const { data, error } = await supabase.functions.invoke('api4com-sync-call', {
        body: { call_log_id: callLogId }
      });

      if (error) throw error;

      if (data?.success) {
        toast.success('Chamada sincronizada!', {
          description: data.updated ? 'Status atualizado' : 'Sem alterações'
        });
        loadData();
      } else {
        throw new Error(data?.error || 'Erro ao sincronizar');
      }
    } catch (error) {
      console.error('Error syncing call:', error);
      toast.error('Erro ao sincronizar chamada');
    } finally {
      setSyncing(null);
    }
  };

  const syncAllStuck = async () => {
    setSyncingAll(true);
    try {
      const { data, error } = await supabase.functions.invoke('api4com-sync-stuck-calls');

      if (error) throw error;

      if (data?.success) {
        toast.success(`${data.processed || 0} chamadas processadas`, {
          description: `${data.updated || 0} atualizadas`
        });
        loadData();
      } else {
        throw new Error(data?.error || 'Erro ao sincronizar');
      }
    } catch (error) {
      console.error('Error syncing stuck calls:', error);
      toast.error('Erro ao sincronizar chamadas');
    } finally {
      setSyncingAll(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      completed: 'bg-green-500/20 text-green-400',
      answered: 'bg-blue-500/20 text-blue-400',
      dialing: 'bg-amber-500/20 text-amber-400',
      ringing: 'bg-amber-500/20 text-amber-400',
      cancelled: 'bg-slate-500/20 text-slate-400',
      timeout: 'bg-red-500/20 text-red-400',
      no_answer: 'bg-orange-500/20 text-orange-400',
      busy: 'bg-purple-500/20 text-purple-400',
      failed: 'bg-red-500/20 text-red-400',
    };
    return styles[status] || 'bg-slate-500/20 text-slate-400';
  };

  const getResultIcon = (result: string | null) => {
    if (result === 'success') return <CheckCircle className="w-4 h-4 text-green-400" />;
    if (result === 'ignored') return <AlertTriangle className="w-4 h-4 text-amber-400" />;
    if (result === 'error') return <XCircle className="w-4 h-4 text-red-400" />;
    return <Activity className="w-4 h-4 text-slate-400" />;
  };

  const filteredCalls = statusFilter === 'all' 
    ? callLogs 
    : callLogs.filter(c => c.status === statusFilter);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-green-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
          <div className="text-2xl font-bold text-white">{todayCalls}</div>
          <div className="text-xs text-slate-400">Chamadas Hoje</div>
        </div>
        <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
          <div className={`text-2xl font-bold ${stuckCalls > 0 ? 'text-amber-400' : 'text-white'}`}>
            {stuckCalls}
          </div>
          <div className="text-xs text-slate-400">Travadas</div>
        </div>
        <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
          <div className={`text-2xl font-bold ${callsWithoutRecording > 0 ? 'text-orange-400' : 'text-white'}`}>
            {callsWithoutRecording}
          </div>
          <div className="text-xs text-slate-400">Sem Gravação</div>
        </div>
        <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
          <div className="text-2xl font-bold text-white">{recentWebhooks}</div>
          <div className="text-xs text-slate-400">Webhooks Recentes</div>
        </div>
      </div>

      {/* Config Status */}
      {configStatus && (
        <div className="p-4 bg-slate-800/30 rounded-lg border border-slate-700">
          <h4 className="text-sm font-medium text-white mb-3">Status da Configuração</h4>
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              {configStatus.token ? (
                <CheckCircle className="w-4 h-4 text-green-400" />
              ) : (
                <XCircle className="w-4 h-4 text-red-400" />
              )}
              <span className="text-sm text-slate-300">Token</span>
            </div>
            <div className="flex items-center gap-2">
              {configStatus.extension ? (
                <CheckCircle className="w-4 h-4 text-green-400" />
              ) : (
                <XCircle className="w-4 h-4 text-red-400" />
              )}
              <span className="text-sm text-slate-300">
                Ramal: {configStatus.extension || 'Não configurado'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {configStatus.enabled ? (
                <CheckCircle className="w-4 h-4 text-green-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              )}
              <span className="text-sm text-slate-300">
                {configStatus.enabled ? 'Ativo' : 'Desativado'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          onClick={loadData}
          variant="ghost"
          size="sm"
          className="text-slate-400 hover:text-white"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar
        </Button>
        {stuckCalls > 0 && (
          <Button
            onClick={syncAllStuck}
            disabled={syncingAll}
            size="sm"
            className="bg-amber-600 hover:bg-amber-700"
          >
            {syncingAll ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Sincronizar {stuckCalls} Travadas
          </Button>
        )}
      </div>

      {/* Call Logs Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-white">Chamadas Recentes</h4>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-300"
          >
            <option value="all">Todos os status</option>
            <option value="completed">Completada</option>
            <option value="answered">Atendida</option>
            <option value="dialing">Discando</option>
            <option value="ringing">Tocando</option>
            <option value="cancelled">Cancelada</option>
            <option value="timeout">Timeout</option>
            <option value="no_answer">Não Atendida</option>
            <option value="busy">Ocupado</option>
            <option value="failed">Falha</option>
          </select>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-700">
                <th className="pb-2 pr-4">ID</th>
                <th className="pb-2 pr-4">Telefone</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Dur.</th>
                <th className="pb-2 pr-4">Hangup</th>
                <th className="pb-2 pr-4">Gravação</th>
                <th className="pb-2 pr-4">Data</th>
                <th className="pb-2">Ação</th>
              </tr>
            </thead>
            <tbody>
              {filteredCalls.map((call) => (
                <tr key={call.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                  <td className="py-2 pr-4 font-mono text-xs text-slate-400">
                    {call.id.substring(0, 8)}...
                  </td>
                  <td className="py-2 pr-4 text-slate-300">{call.phone_number}</td>
                  <td className="py-2 pr-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${getStatusBadge(call.status)}`}>
                      {call.status}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-slate-400">
                    {call.duration_seconds ? `${call.duration_seconds}s` : '-'}
                  </td>
                  <td className="py-2 pr-4 text-xs text-slate-500 max-w-[120px] truncate">
                    {call.hangup_cause || '-'}
                  </td>
                  <td className="py-2 pr-4">
                    {call.record_url ? (
                      <div className="flex items-center gap-1">
                        <Mic className="w-3 h-3 text-green-400" />
                        {call.transcription_status === 'completed' && (
                          <CheckCircle className="w-3 h-3 text-blue-400" />
                        )}
                        {call.transcription_status === 'pending' && (
                          <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-500">-</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-xs text-slate-400">
                    {format(new Date(call.created_at), 'dd/MM HH:mm')}
                  </td>
                  <td className="py-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => syncCall(call.id)}
                      disabled={syncing === call.id}
                      className="h-7 w-7 p-0"
                    >
                      {syncing === call.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3 h-3" />
                      )}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {filteredCalls.length === 0 && (
            <div className="text-center py-8 text-slate-500">
              Nenhuma chamada encontrada
            </div>
          )}
        </div>
      </div>

      {/* Webhook Logs Table */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-white">Logs do Webhook</h4>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-slate-700">
                <th className="pb-2 pr-4">Horário</th>
                <th className="pb-2 pr-4">Evento</th>
                <th className="pb-2 pr-4">Call ID</th>
                <th className="pb-2 pr-4">Resultado</th>
                <th className="pb-2 pr-4">IP</th>
                <th className="pb-2">Payload</th>
              </tr>
            </thead>
            <tbody>
              {webhookLogs.map((log) => (
                <React.Fragment key={log.id}>
                  <tr className="border-b border-slate-800 hover:bg-slate-800/30">
                    <td className="py-2 pr-4 text-xs text-slate-400">
                      {format(new Date(log.created_at), 'HH:mm:ss')}
                    </td>
                    <td className="py-2 pr-4 text-slate-300">{log.event_type}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-slate-400">
                      {log.call_id ? `${log.call_id.substring(0, 8)}...` : '-'}
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-1">
                        {getResultIcon(log.processing_result)}
                        <span className="text-xs text-slate-400">{log.processing_result || '-'}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-4 text-xs text-slate-500">{log.client_ip || '-'}</td>
                    <td className="py-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedPayload(expandedPayload === log.id ? null : log.id)}
                        className="h-6 px-2 text-xs"
                      >
                        {expandedPayload === log.id ? (
                          <ChevronDown className="w-3 h-3" />
                        ) : (
                          <ChevronRight className="w-3 h-3" />
                        )}
                        JSON
                      </Button>
                    </td>
                  </tr>
                  {expandedPayload === log.id && (
                    <tr className="bg-slate-900">
                      <td colSpan={6} className="p-3">
                        <pre className="text-xs text-slate-400 overflow-x-auto max-h-48 overflow-y-auto">
                          {JSON.stringify(log.raw_payload, null, 2)}
                        </pre>
                        {log.error_message && (
                          <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-xs text-red-400">
                            Erro: {log.error_message}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          
          {webhookLogs.length === 0 && (
            <div className="text-center py-8 text-slate-500">
              Nenhum log de webhook encontrado
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Api4ComDiagnostics;
