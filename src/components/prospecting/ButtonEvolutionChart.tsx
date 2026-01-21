import React from 'react';
import { Card } from '@/components/ui/card';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

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

interface ButtonEvolutionChartProps {
  data: DailyData[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-lg">
        <p className="text-white font-medium mb-2">{label}</p>
        <div className="space-y-1 text-sm">
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2">
              <div 
                className="w-2 h-2 rounded-full" 
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-slate-300">{entry.name}:</span>
              <span className="text-white font-medium">{entry.value}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export const ButtonEvolutionChart: React.FC<ButtonEvolutionChartProps> = ({ data }) => {
  if (data.length === 0) {
    return (
      <Card className="p-6 bg-slate-900/50 border-slate-800/50">
        <h3 className="text-lg font-semibold text-white mb-6">Evolução por Dia</h3>
        <div className="h-64 flex items-center justify-center">
          <p className="text-slate-400 text-sm">Nenhum dado disponível</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-slate-900/50 border-slate-800/50">
      <h3 className="text-lg font-semibold text-white mb-6">Evolução por Dia</h3>
      
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorTransportador" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorOutros" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorEngano" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis 
              dataKey="displayDate" 
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94a3b8', fontSize: 12 }}
            />
            <YAxis 
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              verticalAlign="top" 
              height={36}
              formatter={(value) => <span className="text-slate-300 text-sm">{value}</span>}
            />
            <Area
              type="monotone"
              dataKey="transportador"
              name="Transportador"
              stroke="#22c55e"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorTransportador)"
            />
            <Area
              type="monotone"
              dataKey="outros"
              name="Outros"
              stroke="#3b82f6"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorOutros)"
            />
            <Area
              type="monotone"
              dataKey="engano"
              name="Engano"
              stroke="#ef4444"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorEngano)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
};
