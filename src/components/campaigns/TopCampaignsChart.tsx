import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface CampaignData {
  name: string;
  leads: number;
  qualified: number;
}

interface TopCampaignsChartProps {
  data: CampaignData[];
}

const TopCampaignsChart: React.FC<TopCampaignsChartProps> = ({ data }) => {
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
          <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
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
          <Bar dataKey="leads" fill="hsl(var(--chart-1))" radius={[0, 4, 4, 0]} />
          <Bar dataKey="qualified" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default TopCampaignsChart;
