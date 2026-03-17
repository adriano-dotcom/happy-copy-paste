import React from 'react';
import { Users, Send, MessageSquare, TrendingUp, ExternalLink } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

export interface SellerStats {
  sellerId: string;
  sellerName: string;
  templatesSent: number;
  responsesReceived: number;
  responseRate: number;
  sentToPipedrive: number;
}

interface OutboundSellerStatsProps {
  stats: SellerStats[];
  loading: boolean;
}

export const OutboundSellerStats: React.FC<OutboundSellerStatsProps> = ({ stats, loading }) => {
  const totals = stats.reduce(
    (acc, s) => ({
      sent: acc.sent + s.templatesSent,
      responses: acc.responses + s.responsesReceived,
      pipedrive: acc.pipedrive + s.sentToPipedrive,
    }),
    { sent: 0, responses: 0, pipedrive: 0 }
  );
  const totalRate = totals.sent > 0 ? (totals.responses / totals.sent) * 100 : 0;

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="bg-slate-900/50 border-slate-800">
              <CardContent className="p-4"><Skeleton className="h-16 w-full" /></CardContent>
            </Card>
          ))}
        </div>
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4"><Skeleton className="h-48 w-full" /></CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-violet-500/20 border border-violet-500/30">
                <Users className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <p className="text-xs text-slate-400">Vendedores Ativos</p>
                <p className="text-2xl font-bold text-white">{stats.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-500/20 border border-cyan-500/30">
                <Send className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <p className="text-xs text-slate-400">Templates Enviados</p>
                <p className="text-2xl font-bold text-white">{totals.sent}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/20 border border-emerald-500/30">
                <MessageSquare className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs text-slate-400">Respostas</p>
                <p className="text-2xl font-bold text-white">{totals.responses}</p>
                <p className="text-xs text-slate-500">{totalRate.toFixed(1)}% taxa</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/20 border border-amber-500/30">
                <ExternalLink className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-slate-400">Enviados ao Pipedrive</p>
                <p className="text-2xl font-bold text-white">{totals.pipedrive}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Seller Table */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500/20 to-cyan-500/20 border border-violet-500/30">
              <TrendingUp className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <CardTitle className="text-lg text-white">Performance por Vendedor</CardTitle>
              <p className="text-sm text-slate-400">Métricas de outbound por vendedor atribuído</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {stats.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              Nenhum dado de outbound encontrado no período selecionado
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left py-3 px-4 text-slate-400 font-medium">Vendedor</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-medium">Enviados</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-medium">Respostas</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-medium">Taxa</th>
                    <th className="text-center py-3 px-4 text-slate-400 font-medium">Pipedrive</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.sort((a, b) => b.templatesSent - a.templatesSent).map((s) => (
                    <tr key={s.sellerId} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4">
                        <span className="text-white font-medium">{s.sellerName}</span>
                      </td>
                      <td className="text-center py-3 px-4">
                        <Badge variant="outline" className="border-cyan-500/30 text-cyan-400">
                          {s.templatesSent}
                        </Badge>
                      </td>
                      <td className="text-center py-3 px-4">
                        <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
                          {s.responsesReceived}
                        </Badge>
                      </td>
                      <td className="text-center py-3 px-4">
                        <span className={`font-medium ${s.responseRate >= 30 ? 'text-emerald-400' : s.responseRate >= 15 ? 'text-amber-400' : 'text-red-400'}`}>
                          {s.responseRate.toFixed(1)}%
                        </span>
                      </td>
                      <td className="text-center py-3 px-4">
                        <Badge variant="outline" className="border-amber-500/30 text-amber-400">
                          {s.sentToPipedrive}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
