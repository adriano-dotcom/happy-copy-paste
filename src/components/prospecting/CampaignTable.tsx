import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CampaignData {
  date: string;
  templateName: string;
  sent: number;
  responses: number;
  responseRate: number;
  rejections: number;
  rejectionRate: number;
  conversions: number;
  conversionRate: number;
}

interface CampaignTableProps {
  campaigns: CampaignData[];
  loading: boolean;
}

type SortField = 'date' | 'sent' | 'responseRate' | 'rejectionRate' | 'conversionRate';

export const CampaignTable: React.FC<CampaignTableProps> = ({ campaigns, loading }) => {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const filteredCampaigns = campaigns
    .filter(c => c.templateName.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      let aVal: number | string = a[sortField];
      let bVal: number | string = b[sortField];
      
      if (sortField === 'date') {
        aVal = new Date(a.date).getTime();
        bVal = new Date(b.date).getTime();
      }
      
      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1;
      }
      return aVal < bVal ? 1 : -1;
    });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  if (loading) {
    return (
      <Card className="p-6 bg-slate-900/50 border-slate-800/50">
        <h3 className="text-lg font-semibold text-white mb-4">Últimas Campanhas</h3>
        <Skeleton className="h-64 w-full bg-slate-800" />
      </Card>
    );
  }

  return (
    <Card className="p-6 bg-slate-900/50 border-slate-800/50">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Últimas Campanhas</h3>
        
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar template..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-slate-800/50 border-slate-700"
          />
        </div>
      </div>

      {filteredCampaigns.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          Nenhuma campanha encontrada
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-800 hover:bg-transparent">
                <TableHead 
                  className="text-slate-400 cursor-pointer hover:text-white"
                  onClick={() => handleSort('date')}
                >
                  <div className="flex items-center gap-1">
                    Data
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </TableHead>
                <TableHead className="text-slate-400">Template</TableHead>
                <TableHead 
                  className="text-slate-400 text-right cursor-pointer hover:text-white"
                  onClick={() => handleSort('sent')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Enviados
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </TableHead>
                <TableHead 
                  className="text-slate-400 text-right cursor-pointer hover:text-white"
                  onClick={() => handleSort('responseRate')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Respostas
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </TableHead>
                <TableHead 
                  className="text-slate-400 text-right cursor-pointer hover:text-white"
                  onClick={() => handleSort('rejectionRate')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Rejeições
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </TableHead>
                <TableHead 
                  className="text-slate-400 text-right cursor-pointer hover:text-white"
                  onClick={() => handleSort('conversionRate')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Conversões
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCampaigns.map((campaign, index) => (
                <TableRow 
                  key={`${campaign.date}-${campaign.templateName}-${index}`}
                  className="border-slate-800/50 hover:bg-slate-800/30"
                >
                  <TableCell className="font-medium text-white">
                    {formatDate(campaign.date)}
                  </TableCell>
                  <TableCell className="text-slate-300 max-w-[200px] truncate">
                    {campaign.templateName}
                  </TableCell>
                  <TableCell className="text-right text-slate-300">
                    {campaign.sent}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-cyan-400">{campaign.responses}</span>
                    <span className="text-slate-500 ml-1">
                      ({campaign.responseRate.toFixed(0)}%)
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={cn(
                      campaign.rejections > 0 ? 'text-rose-400' : 'text-slate-500'
                    )}>
                      {campaign.rejections}
                    </span>
                    {campaign.rejections > 0 && (
                      <span className="text-slate-500 ml-1">
                        ({campaign.rejectionRate.toFixed(0)}%)
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={cn(
                      campaign.conversions > 0 ? 'text-emerald-400' : 'text-slate-500'
                    )}>
                      {campaign.conversions}
                    </span>
                    {campaign.conversions > 0 && (
                      <span className="text-slate-500 ml-1">
                        ({campaign.conversionRate.toFixed(0)}%)
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
};
