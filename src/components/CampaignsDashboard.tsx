import React, { useState, useEffect } from 'react';
import { RefreshCw, Target, Users, Megaphone, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import CampaignSourceChart from '@/components/campaigns/CampaignSourceChart';
import TopCampaignsChart from '@/components/campaigns/TopCampaignsChart';
import CampaignsTable from '@/components/campaigns/CampaignsTable';

interface CampaignMetrics {
  totalLeads: number;
  activeSources: number;
  activeCampaigns: number;
  qualificationRate: number;
}

interface SourceData {
  name: string;
  value: number;
  color: string;
}

interface CampaignData {
  name: string;
  leads: number;
  qualified: number;
}

interface TableRow {
  fonte: string;
  campanha: string;
  conteudo: string;
  termo: string;
  leads: number;
  qualificados: number;
  clientes: number;
  taxaConversao: number;
}

const CampaignsDashboard: React.FC = () => {
  const [period, setPeriod] = useState('30');
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<CampaignMetrics>({
    totalLeads: 0,
    activeSources: 0,
    activeCampaigns: 0,
    qualificationRate: 0
  });
  const [sourceData, setSourceData] = useState<SourceData[]>([]);
  const [campaignData, setCampaignData] = useState<CampaignData[]>([]);
  const [tableData, setTableData] = useState<TableRow[]>([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Calculate date filter
      const daysAgo = period === 'all' ? null : parseInt(period);
      const dateFilter = daysAgo 
        ? new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString()
        : null;

      // Fetch contacts with UTM data
      let query = supabase
        .from('contacts')
        .select('utm_source, utm_campaign, utm_content, utm_term, lead_status, created_at')
        .not('utm_source', 'is', null);

      if (dateFilter) {
        query = query.gte('created_at', dateFilter);
      }

      const { data: contacts, error } = await query;

      if (error) throw error;

      if (!contacts || contacts.length === 0) {
        setMetrics({ totalLeads: 0, activeSources: 0, activeCampaigns: 0, qualificationRate: 0 });
        setSourceData([]);
        setCampaignData([]);
        setTableData([]);
        setLoading(false);
        return;
      }

      // Calculate metrics
      const totalLeads = contacts.length;
      const uniqueSources = new Set(contacts.map(c => c.utm_source)).size;
      const uniqueCampaigns = new Set(contacts.map(c => c.utm_campaign).filter(Boolean)).size;
      const qualifiedLeads = contacts.filter(c => 
        c.lead_status === 'qualified' || c.lead_status === 'customer'
      ).length;
      const qualificationRate = totalLeads > 0 ? (qualifiedLeads / totalLeads) * 100 : 0;

      setMetrics({
        totalLeads,
        activeSources: uniqueSources,
        activeCampaigns: uniqueCampaigns,
        qualificationRate
      });

      // Source distribution for pie chart
      const sourceMap = new Map<string, number>();
      contacts.forEach(c => {
        const source = c.utm_source || 'Direto';
        sourceMap.set(source, (sourceMap.get(source) || 0) + 1);
      });
      setSourceData(
        Array.from(sourceMap.entries())
          .map(([name, value]) => ({ name, value, color: '' }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 5)
      );

      // Top campaigns for bar chart
      const campaignMap = new Map<string, { leads: number; qualified: number }>();
      contacts.forEach(c => {
        const campaign = c.utm_campaign || 'Sem Campanha';
        const current = campaignMap.get(campaign) || { leads: 0, qualified: 0 };
        current.leads += 1;
        if (c.lead_status === 'qualified' || c.lead_status === 'customer') {
          current.qualified += 1;
        }
        campaignMap.set(campaign, current);
      });
      setCampaignData(
        Array.from(campaignMap.entries())
          .map(([name, data]) => ({ name, ...data }))
          .sort((a, b) => b.leads - a.leads)
          .slice(0, 5)
      );

      // Detailed table data grouped by source + campaign + content + term
      const tableMap = new Map<string, TableRow>();
      contacts.forEach(c => {
        const key = `${c.utm_source || 'Direto'}|${c.utm_campaign || 'Sem Campanha'}|${c.utm_content || ''}|${c.utm_term || ''}`;
        const current = tableMap.get(key) || {
          fonte: c.utm_source || 'Direto',
          campanha: c.utm_campaign || 'Sem Campanha',
          conteudo: c.utm_content || '',
          termo: c.utm_term || '',
          leads: 0,
          qualificados: 0,
          clientes: 0,
          taxaConversao: 0
        };
        current.leads += 1;
        if (c.lead_status === 'qualified') current.qualificados += 1;
        if (c.lead_status === 'customer') current.clientes += 1;
        tableMap.set(key, current);
      });
      
      const tableRows = Array.from(tableMap.values())
        .map(row => ({
          ...row,
          taxaConversao: row.leads > 0 ? (row.clientes / row.leads) * 100 : 0
        }))
        .sort((a, b) => b.leads - a.leads);
      
      setTableData(tableRows);

    } catch (error) {
      console.error('Error fetching campaign data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [period]);

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Target className="w-7 h-7 text-primary" />
            Dashboard de Campanhas
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Análise de origem e performance das campanhas UTM
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[140px] bg-card border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 dias</SelectItem>
              <SelectItem value="30">30 dias</SelectItem>
              <SelectItem value="90">90 dias</SelectItem>
              <SelectItem value="all">Todos</SelectItem>
            </SelectContent>
          </Select>
          
          <Button 
            variant="outline" 
            size="icon"
            onClick={fetchData}
            disabled={loading}
            className="border-border"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card/50 backdrop-blur-sm border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total de Leads</p>
                <p className="text-3xl font-bold text-foreground">{metrics.totalLeads}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Users className="w-6 h-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Fontes Ativas</p>
                <p className="text-3xl font-bold text-foreground">{metrics.activeSources}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-chart-1/10 flex items-center justify-center">
                <Target className="w-6 h-6 text-chart-1" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Campanhas Ativas</p>
                <p className="text-3xl font-bold text-foreground">{metrics.activeCampaigns}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-chart-2/10 flex items-center justify-center">
                <Megaphone className="w-6 h-6 text-chart-2" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Taxa Qualificação</p>
                <p className="text-3xl font-bold text-foreground">{metrics.qualificationRate.toFixed(1)}%</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-emerald-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card/50 backdrop-blur-sm border-border">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Leads por Fonte</CardTitle>
          </CardHeader>
          <CardContent>
            {sourceData.length > 0 ? (
              <CampaignSourceChart data={sourceData} />
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                Nenhum dado disponível
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">Top 5 Campanhas</CardTitle>
          </CardHeader>
          <CardContent>
            {campaignData.length > 0 ? (
              <TopCampaignsChart data={campaignData} />
            ) : (
              <div className="h-[280px] flex items-center justify-center text-muted-foreground">
                Nenhum dado disponível
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detailed Table */}
      <Card className="bg-card/50 backdrop-blur-sm border-border">
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Detalhamento por Campanha</CardTitle>
        </CardHeader>
        <CardContent>
          <CampaignsTable data={tableData} />
        </CardContent>
      </Card>
    </div>
  );
};

export default CampaignsDashboard;
