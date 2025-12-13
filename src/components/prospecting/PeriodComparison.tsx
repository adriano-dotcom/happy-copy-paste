import React from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface TrendData {
  date: string;
  name: string;
  sent: number;
  responses: number;
  conversions: number;
}

interface PeriodComparisonProps {
  data: TrendData[];
  loading: boolean;
}

export const PeriodComparison: React.FC<PeriodComparisonProps> = ({ data, loading }) => {
  if (loading) {
    return (
      <Card className="p-6 bg-slate-900/50 border-slate-800/50">
        <h3 className="text-lg font-semibold text-white mb-4">Performance por Período</h3>
        <Skeleton className="h-64 w-full bg-slate-800" />
      </Card>
    );
  }

  const totalSent = data.reduce((acc, d) => acc + d.sent, 0);
  const totalResponses = data.reduce((acc, d) => acc + d.responses, 0);
  const avgResponseRate = totalSent > 0 ? ((totalResponses / totalSent) * 100).toFixed(1) : 0;

  return (
    <Card className="p-6 bg-slate-900/50 border-slate-800/50">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white">Performance por Período</h3>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-violet-500" />
            <span className="text-slate-400">Enviados</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-cyan-500" />
            <span className="text-slate-400">Respostas</span>
          </div>
          <span className="text-slate-500">|</span>
          <span className="text-slate-400">
            Taxa média: <span className="text-cyan-400 font-medium">{avgResponseRate}%</span>
          </span>
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis 
              dataKey="name" 
              stroke="#64748b"
              fontSize={12}
              tickLine={false}
            />
            <YAxis 
              stroke="#64748b"
              fontSize={12}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '8px',
                boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
              }}
              labelStyle={{ color: '#f8fafc', fontWeight: 600 }}
              itemStyle={{ color: '#94a3b8' }}
              formatter={(value: number, name: string) => {
                const labels: Record<string, string> = {
                  sent: 'Enviados',
                  responses: 'Respostas',
                };
                return [value, labels[name] || name];
              }}
            />
            <Line
              type="monotone"
              dataKey="sent"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={{ fill: '#8b5cf6', strokeWidth: 0, r: 4 }}
              activeDot={{ r: 6, fill: '#8b5cf6' }}
            />
            <Line
              type="monotone"
              dataKey="responses"
              stroke="#06b6d4"
              strokeWidth={2}
              dot={{ fill: '#06b6d4', strokeWidth: 0, r: 4 }}
              activeDot={{ r: 6, fill: '#06b6d4' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};
