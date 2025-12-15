import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface CampaignRow {
  fonte: string;
  campanha: string;
  conteudo: string;
  termo: string;
  leads: number;
  qualificados: number;
  clientes: number;
  taxaConversao: number;
}

interface CampaignsTableProps {
  data: CampaignRow[];
}

const getSourceBadgeColor = (fonte: string) => {
  const colors: Record<string, string> = {
    'instagram': 'bg-gradient-to-r from-purple-500 to-pink-500 text-white',
    'ig': 'bg-gradient-to-r from-purple-500 to-pink-500 text-white',
    'facebook': 'bg-blue-600 text-white',
    'fb': 'bg-blue-600 text-white',
    'google': 'bg-red-500 text-white',
    'tiktok': 'bg-black text-white',
    'linkedin': 'bg-blue-700 text-white',
    'youtube': 'bg-red-600 text-white',
    'direto': 'bg-slate-600 text-white',
  };
  return colors[fonte.toLowerCase()] || 'bg-slate-500 text-white';
};

const CampaignsTable: React.FC<CampaignsTableProps> = ({ data }) => {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead className="font-semibold">Fonte</TableHead>
            <TableHead className="font-semibold">Campanha</TableHead>
            <TableHead className="font-semibold">Conteúdo</TableHead>
            <TableHead className="font-semibold">Termo</TableHead>
            <TableHead className="text-center font-semibold">Leads</TableHead>
            <TableHead className="text-center font-semibold">Qualificados</TableHead>
            <TableHead className="text-center font-semibold">Clientes</TableHead>
            <TableHead className="text-center font-semibold">Taxa Conv.</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                Nenhuma campanha encontrada no período selecionado
              </TableCell>
            </TableRow>
          ) : (
            data.map((row, index) => (
              <TableRow key={index} className="hover:bg-muted/20">
                <TableCell>
                  <Badge className={`${getSourceBadgeColor(row.fonte)} border-0`}>
                    {row.fonte}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium max-w-[200px] truncate" title={row.campanha}>
                  {row.campanha}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-[150px] truncate" title={row.conteudo}>
                  {row.conteudo || '-'}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-[100px] truncate" title={row.termo}>
                  {row.termo || '-'}
                </TableCell>
                <TableCell className="text-center font-semibold">{row.leads}</TableCell>
                <TableCell className="text-center">
                  <span className="text-amber-400 font-medium">{row.qualificados}</span>
                </TableCell>
                <TableCell className="text-center">
                  <span className="text-emerald-400 font-medium">{row.clientes}</span>
                </TableCell>
                <TableCell className="text-center">
                  <Badge 
                    variant="outline" 
                    className={row.taxaConversao >= 20 
                      ? 'border-emerald-500/50 text-emerald-400' 
                      : row.taxaConversao >= 10 
                        ? 'border-amber-500/50 text-amber-400'
                        : 'border-slate-500/50 text-slate-400'
                    }
                  >
                    {row.taxaConversao.toFixed(1)}%
                  </Badge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default CampaignsTable;
