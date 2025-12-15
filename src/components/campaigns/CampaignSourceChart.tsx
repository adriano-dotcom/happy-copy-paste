import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

interface SourceData {
  name: string;
  value: number;
}

interface CampaignSourceChartProps {
  data: SourceData[];
}

// Cores específicas por fonte/rede social
const getSourceColor = (source: string): string => {
  const normalizedSource = source.toLowerCase();
  
  if (normalizedSource.includes('instagram') || normalizedSource === 'ig') {
    return '#E4405F';
  }
  if (normalizedSource.includes('facebook') || normalizedSource === 'fb') {
    return '#1877F2';
  }
  if (normalizedSource.includes('google')) {
    return '#EA4335';
  }
  if (normalizedSource.includes('linkedin')) {
    return '#0A66C2';
  }
  if (normalizedSource.includes('tiktok')) {
    return '#000000';
  }
  if (normalizedSource.includes('youtube')) {
    return '#FF0000';
  }
  if (normalizedSource.includes('whatsapp') || normalizedSource === 'wa') {
    return '#25D366';
  }
  if (normalizedSource.includes('twitter') || normalizedSource === 'x') {
    return '#1DA1F2';
  }
  if (normalizedSource === 'direto' || normalizedSource === 'direct') {
    return '#6366F1';
  }
  
  const defaultColors = ['#8B5CF6', '#F59E0B', '#10B981', '#EC4899', '#06B6D4'];
  const hash = source.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return defaultColors[hash % defaultColors.length];
};

const CampaignSourceChart: React.FC<CampaignSourceChartProps> = ({ data }) => {
  const chartData = data.map((item) => ({
    ...item,
    color: getSourceColor(item.name)
  }));

  const total = chartData.reduce((sum, item) => sum + item.value, 0);

  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.05) return null;
    
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text 
        x={x} 
        y={y} 
        fill="white" 
        textAnchor="middle" 
        dominantBaseline="central"
        fontSize={12}
        fontWeight="bold"
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="45%"
            innerRadius={45}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
            label={renderCustomLabel}
            labelLine={false}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} stroke="transparent" />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(222.2 84% 4.9%)',
              border: '1px solid hsl(217.2 32.6% 17.5%)',
              borderRadius: '8px',
              color: '#f8fafc'
            }}
            formatter={(value: number, name: string) => [
              `${value} leads (${total > 0 ? ((value / total) * 100).toFixed(1) : 0}%)`, 
              name.toUpperCase()
            ]}
          />
          <Legend
            layout="horizontal"
            align="center"
            verticalAlign="bottom"
            wrapperStyle={{ paddingTop: '10px' }}
            formatter={(value, entry: any) => (
              <span className="text-sm text-foreground">
                {value.toUpperCase()} ({entry.payload?.value || 0})
              </span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export default CampaignSourceChart;
