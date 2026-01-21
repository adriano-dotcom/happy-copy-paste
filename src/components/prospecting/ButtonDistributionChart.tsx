import React from 'react';
import { Card } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Truck, Shield, XCircle } from 'lucide-react';

interface ButtonDistributionChartProps {
  transportador: number;
  outros: number;
  engano: number;
}

const COLORS = {
  transportador: '#22c55e', // emerald-500
  outros: '#3b82f6', // blue-500
  engano: '#ef4444', // red-500
};

export const ButtonDistributionChart: React.FC<ButtonDistributionChartProps> = ({
  transportador,
  outros,
  engano,
}) => {
  const total = transportador + outros + engano;
  
  const data = [
    { name: 'Sou Transportador', value: transportador, color: COLORS.transportador, icon: Truck },
    { name: 'Outros Seguros', value: outros, color: COLORS.outros, icon: Shield },
    { name: 'Foi Engano', value: engano, color: COLORS.engano, icon: XCircle },
  ].filter(item => item.value > 0);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const percentage = total > 0 ? ((data.value / total) * 100).toFixed(1) : 0;
      return (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-lg">
          <p className="text-white font-medium">{data.name}</p>
          <p className="text-slate-300 text-sm">
            {data.value} cliques ({percentage}%)
          </p>
        </div>
      );
    }
    return null;
  };

  if (total === 0) {
    return (
      <Card className="p-6 bg-slate-900/50 border-slate-800/50">
        <h3 className="text-lg font-semibold text-white mb-6">Distribuição de Cliques</h3>
        <div className="h-64 flex items-center justify-center">
          <p className="text-slate-400 text-sm">Nenhum clique registrado no período</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-slate-900/50 border-slate-800/50">
      <h3 className="text-lg font-semibold text-white mb-2">Distribuição de Cliques</h3>
      <p className="text-sm text-slate-400 mb-4">{total} cliques no período</p>
      
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={4}
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.color}
                  stroke="transparent"
                />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="mt-4 space-y-2">
        {[
          { label: 'Sou Transportador', value: transportador, color: COLORS.transportador, Icon: Truck },
          { label: 'Outros Seguros', value: outros, color: COLORS.outros, Icon: Shield },
          { label: 'Foi Engano', value: engano, color: COLORS.engano, Icon: XCircle },
        ].map(item => (
          <div key={item.label} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: item.color }}
              />
              <item.Icon className="w-4 h-4" style={{ color: item.color }} />
              <span className="text-slate-300">{item.label}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white font-medium">{item.value}</span>
              <span className="text-slate-500">
                ({total > 0 ? ((item.value / total) * 100).toFixed(0) : 0}%)
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};
