import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface CampaignData {
  name: string;
  leads: number;
  qualified: number;
}

interface TopCampaignsChartProps {
  data: CampaignData[];
}

const TopCampaignsChart: React.FC<TopCampaignsChartProps> = ({ data }) => {
  // Cores vibrantes para as barras
  const COLORS = {
    leads: '#3b82f6',      // Azul vibrante
    qualified: '#22c55e',  // Verde vibrante
  };

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
          <XAxis 
            type="number" 
            stroke="hsl(var(--muted-foreground))" 
            fontSize={12}
            allowDecimals={false}
            tickFormatter={(value) => Math.floor(value).toString()}
          />
          <YAxis 
            dataKey="name" 
            type="category" 
            stroke="hsl(var(--muted-foreground))" 
            fontSize={11}
            width={120}
            tickFormatter={(value) => value.length > 18 ? `${value.substring(0, 18)}...` : value}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              color: 'hsl(var(--foreground))'
            }}
            formatter={(value: number, name: string) => [
              value, 
              name === 'leads' ? 'Total Leads' : 'Qualificados'
            ]}
          />
          <Legend 
            formatter={(value) => (
              <span className="text-sm text-muted-foreground">
                {value === 'leads' ? 'Total Leads' : 'Qualificados'}
              </span>
            )}
          />
          <Bar dataKey="leads" fill={COLORS.leads} radius={[0, 4, 4, 0]} name="leads" />
          <Bar dataKey="qualified" fill={COLORS.qualified} radius={[0, 4, 4, 0]} name="qualified" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default TopCampaignsChart;
