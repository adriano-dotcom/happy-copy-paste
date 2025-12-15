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
    return '#E4405F'; // Rosa Instagram
  }
  if (normalizedSource.includes('facebook') || normalizedSource === 'fb') {
    return '#1877F2'; // Azul Facebook
  }
  if (normalizedSource.includes('google')) {
    return '#EA4335'; // Vermelho Google
  }
  if (normalizedSource.includes('linkedin')) {
    return '#0A66C2'; // Azul LinkedIn
  }
  if (normalizedSource.includes('tiktok')) {
    return '#000000'; // Preto TikTok
  }
  if (normalizedSource.includes('youtube')) {
    return '#FF0000'; // Vermelho YouTube
  }
  if (normalizedSource.includes('whatsapp') || normalizedSource === 'wa') {
    return '#25D366'; // Verde WhatsApp
  }
  if (normalizedSource.includes('twitter') || normalizedSource === 'x') {
    return '#1DA1F2'; // Azul Twitter
  }
  if (normalizedSource === 'direto' || normalizedSource === 'direct') {
    return '#6366F1'; // Roxo para tráfego direto
  }
  
  // Cores padrão para fontes não identificadas
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

  const renderCustomLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
    if (percent < 0.05) return null; // Não mostra label se < 5%
    
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
            cy="50%"
            innerRadius={50}
            outerRadius={85}
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
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              color: 'hsl(var(--foreground))'
            }}
            formatter={(value: number, name: string) => [
              `${value} leads (${total > 0 ? ((value / total) * 100).toFixed(1) : 0}%)`, 
              name.toUpperCase()
            ]}
          />
          <Legend
            layout="vertical"
            align="right"
            verticalAlign="middle"
            formatter={(value, entry: any) => (
              <span className="text-sm text-foreground">
                {value.toUpperCase()} ({entry.payload?.value || 0})
              </span>
            )}
            wrapperStyle={{ paddingLeft: '20px' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export default CampaignSourceChart;
