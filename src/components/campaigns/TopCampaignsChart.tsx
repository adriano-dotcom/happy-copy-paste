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
  const COLORS = {
    leads: '#3b82f6',
    qualified: '#22c55e',
  };

  // Calculate max value for proper Y axis domain
  const maxValue = Math.max(...data.flatMap(d => [d.leads, d.qualified]), 1);
  const yAxisMax = Math.ceil(maxValue * 1.2);

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 10, right: 20, left: 0, bottom: 60 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
          <XAxis 
            dataKey="name" 
            stroke="#9ca3af"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            angle={-25}
            textAnchor="end"
            height={60}
            interval={0}
            tickFormatter={(value) => value.length > 20 ? `${value.substring(0, 20)}...` : value}
          />
          <YAxis 
            stroke="#9ca3af"
            fontSize={12}
            tickLine={false}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            allowDecimals={false}
            domain={[0, yAxisMax]}
            tickFormatter={(value) => Math.floor(value).toString()}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(222.2 84% 4.9%)',
              border: '1px solid hsl(217.2 32.6% 17.5%)',
              borderRadius: '8px',
              color: '#f8fafc'
            }}
            formatter={(value: number, name: string) => [
              value, 
              name === 'leads' ? 'Total Leads' : 'Qualificados'
            ]}
            labelStyle={{ color: '#f8fafc', fontWeight: 600, marginBottom: 4 }}
          />
          <Legend 
            verticalAlign="top"
            height={36}
            formatter={(value) => (
              <span className="text-sm text-muted-foreground">
                {value === 'leads' ? 'Total Leads' : 'Qualificados'}
              </span>
            )}
          />
          <Bar dataKey="leads" fill={COLORS.leads} radius={[4, 4, 0, 0]} name="leads" />
          <Bar dataKey="qualified" fill={COLORS.qualified} radius={[4, 4, 0, 0]} name="qualified" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default TopCampaignsChart;
