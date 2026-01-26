import React, { useState, useEffect } from 'react';
import { Tag, Info } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from 'recharts';

interface TagDistributionCardProps {
  period: string;
}

interface TagData {
  key: string;
  label: string;
  color: string;
  category: string;
  count: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  status: '#3b82f6',
  interest: '#22c55e',
  action: '#eab308',
  qualification: '#8b5cf6',
  custom: '#64748b',
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload as TagData;
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl">
        <div className="flex items-center gap-2 mb-1">
          <div 
            className="w-3 h-3 rounded-full" 
            style={{ backgroundColor: data.color }} 
          />
          <span className="text-white font-medium">{data.label}</span>
        </div>
        <div className="text-slate-400 text-sm">
          <span className="text-white font-semibold">{data.count}</span> contatos
        </div>
        <div className="text-slate-500 text-xs mt-1">
          Categoria: {data.category}
        </div>
      </div>
    );
  }
  return null;
};

export const TagDistributionCard: React.FC<TagDistributionCardProps> = ({ period }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TagData[]>([]);
  const [totalTags, setTotalTags] = useState(0);

  const fetchTagData = async () => {
    setLoading(true);
    try {
      const days = parseInt(period);
      const periodStart = new Date();
      periodStart.setDate(periodStart.getDate() - days);
      periodStart.setHours(0, 0, 0, 0);

      // Fetch tag definitions
      const { data: tagDefs, error: tagError } = await supabase
        .from('tag_definitions')
        .select('key, label, color, category')
        .eq('is_active', true);

      if (tagError) throw tagError;

      // Fetch contacts with tags in the period
      const { data: contacts, error: contactsError } = await supabase
        .from('contacts')
        .select('id, tags, updated_at')
        .gte('updated_at', periodStart.toISOString())
        .not('tags', 'eq', '{}');

      if (contactsError) throw contactsError;

      // Count tags
      const tagCounts = new Map<string, number>();
      let total = 0;
      
      contacts?.forEach(c => {
        c.tags?.forEach((tag: string) => {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
          total++;
        });
      });

      setTotalTags(total);

      // Combine with definitions and include tags not in definitions
      const tagDefsMap = new Map(tagDefs?.map(td => [td.key, td]) || []);
      const allTags: TagData[] = [];

      tagCounts.forEach((count, key) => {
        const def = tagDefsMap.get(key);
        allTags.push({
          key,
          label: def?.label || key.charAt(0).toUpperCase() + key.slice(1),
          color: def?.color || CATEGORY_COLORS[def?.category || 'custom'] || CATEGORY_COLORS.custom,
          category: def?.category || 'custom',
          count,
        });
      });

      // Sort by count descending
      allTags.sort((a, b) => b.count - a.count);

      setData(allTags.slice(0, 10)); // Top 10
    } catch (error) {
      console.error('Error fetching tag data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTagData();
  }, [period]);

  const getPeriodLabel = () => {
    switch (period) {
      case '1': return 'hoje';
      case '7': return 'últimos 7 dias';
      case '30': return 'últimos 30 dias';
      default: return `últimos ${period} dias`;
    }
  };

  if (loading) {
    return (
      <Card className="bg-slate-900/50 border-slate-800/50">
        <CardHeader>
          <Skeleton className="h-6 w-40 bg-slate-800" />
          <Skeleton className="h-4 w-60 bg-slate-800 mt-1" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-8 bg-slate-800" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-900/50 border-slate-800/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30">
              <Tag className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <CardTitle className="text-white text-lg">Tags Geradas</CardTitle>
              <p className="text-sm text-slate-400">Classificação automática de contatos</p>
            </div>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Info className="w-4 h-4 text-slate-500 hover:text-slate-400" />
              </TooltipTrigger>
              <TooltipContent className="bg-slate-800 border-slate-700">
                <p className="text-sm">Tags aplicadas automaticamente pela IA durante a triagem</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Tag className="w-12 h-12 text-slate-600 mb-3" />
            <p className="text-slate-400">Nenhuma tag aplicada</p>
            <p className="text-slate-500 text-sm">no período selecionado</p>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={data.length * 40 + 20}>
              <BarChart
                data={data}
                layout="vertical"
                margin={{ left: 10, right: 30, top: 5, bottom: 5 }}
              >
                <XAxis 
                  type="number" 
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  axisLine={{ stroke: '#334155' }}
                  tickLine={{ stroke: '#334155' }}
                />
                <YAxis 
                  type="category" 
                  dataKey="label" 
                  width={90}
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }} />
                <Bar 
                  dataKey="count" 
                  radius={[0, 4, 4, 0]}
                  maxBarSize={24}
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <div className="mt-4 pt-4 border-t border-slate-800/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="bg-slate-800 text-slate-300">
                  {totalTags} tags aplicadas
                </Badge>
                <span className="text-slate-500 text-sm">({getPeriodLabel()})</span>
              </div>
              <div className="flex items-center gap-1">
                {data.slice(0, 3).map((tag, i) => (
                  <div 
                    key={i}
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                    title={tag.label}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
