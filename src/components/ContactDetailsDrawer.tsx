import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';
import { Button } from './ui/button';
import { User, Building2, MapPin, Phone, Mail, FileText, Calendar, Edit, MessageSquare } from 'lucide-react';
import { displayPhoneInternational } from '@/utils/phoneFormatter';
import { CallHistoryPanel } from './CallHistoryPanel';
import { useContactCallHistory } from '@/hooks/useContactCallHistory';

interface ContactData {
  id: string;
  name: string;
  phone: string;
  email: string;
  company?: string;
  cnpj?: string;
  cep?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  notes?: string;
  lastContact?: string;
  status?: string;
}

interface ContactDetailsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: ContactData | null;
  onEdit?: () => void;
  onConverse?: () => void;
}

const formatCNPJ = (cnpj: string | undefined) => {
  if (!cnpj) return '-';
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return cnpj;
  return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5,8)}/${digits.slice(8,12)}-${digits.slice(12,14)}`;
};

const formatCEP = (cep: string | undefined) => {
  if (!cep) return '-';
  const digits = cep.replace(/\D/g, '');
  if (digits.length !== 8) return cep;
  return `${digits.slice(0,5)}-${digits.slice(5,8)}`;
};

const ContactDetailsDrawer: React.FC<ContactDetailsDrawerProps> = ({ open, onOpenChange, contact, onEdit, onConverse }) => {
  const { callHistory, loading: callsLoading } = useContactCallHistory(contact?.id || null);

  if (!contact) return null;

  const getStatusBadge = (status: string | undefined) => {
    switch (status) {
      case 'customer': return { label: 'Cliente Ativo', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
      case 'lead': return { label: 'Lead', className: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' };
      default: return { label: 'Novo', className: 'bg-slate-800 text-slate-400 border-slate-700' };
    }
  };

  const statusBadge = getStatusBadge(contact.status);

  const hasAddress = contact.street || contact.city || contact.state;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg bg-slate-900 border-slate-800 overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-slate-800">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-700 flex items-center justify-center text-xl font-bold text-cyan-400 shadow-inner">
                {contact.name?.substring(0, 2).toUpperCase() || '??'}
              </div>
              <div>
                <SheetTitle className="text-xl text-slate-100">{contact.name}</SheetTitle>
                <span className={`inline-flex px-2.5 py-0.5 rounded-md text-xs font-semibold border mt-1 ${statusBadge.className}`}>
                  {statusBadge.label}
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button onClick={onEdit} variant="default" className="flex-1 bg-cyan-600 hover:bg-cyan-700">
              <Edit className="w-4 h-4 mr-2" />
              Editar
            </Button>
            <Button onClick={onConverse} variant="outline" className="flex-1 border-slate-700 hover:bg-slate-800">
              <MessageSquare className="w-4 h-4 mr-2" />
              Conversar
            </Button>
          </div>
        </SheetHeader>

        <div className="py-6 space-y-6">
          {/* Dados Pessoais */}
          <section>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2 mb-4">
              <User className="w-4 h-4" /> Dados Pessoais
            </h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-slate-300">
                <Phone className="w-4 h-4 text-slate-500" />
                <span>{displayPhoneInternational(contact.phone)}</span>
              </div>
              <div className="flex items-center gap-3 text-slate-300">
                <Mail className="w-4 h-4 text-slate-500" />
                <span>{contact.email || '-'}</span>
              </div>
            </div>
          </section>

          {/* Dados da Empresa */}
          {(contact.company || contact.cnpj) && (
            <section>
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2 mb-4">
                <Building2 className="w-4 h-4" /> Empresa
              </h3>
              <div className="space-y-3">
                {contact.company && (
                  <div className="text-slate-300">
                    <span className="text-slate-500 text-sm">Razão Social</span>
                    <p className="font-medium">{contact.company}</p>
                  </div>
                )}
                {contact.cnpj && (
                  <div className="text-slate-300">
                    <span className="text-slate-500 text-sm">CNPJ</span>
                    <p className="font-mono">{formatCNPJ(contact.cnpj)}</p>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Endereço */}
          {hasAddress && (
            <section>
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2 mb-4">
                <MapPin className="w-4 h-4" /> Endereço
              </h3>
              <div className="space-y-2 text-slate-300">
                {contact.cep && (
                  <p className="text-sm text-slate-500">CEP: {formatCEP(contact.cep)}</p>
                )}
                {contact.street && (
                  <p>
                    {contact.street}
                    {contact.number && `, ${contact.number}`}
                    {contact.complement && ` - ${contact.complement}`}
                  </p>
                )}
                {contact.neighborhood && <p>{contact.neighborhood}</p>}
                {(contact.city || contact.state) && (
                  <p>{[contact.city, contact.state].filter(Boolean).join(' - ')}</p>
                )}
              </div>
            </section>
          )}

          {/* Histórico de Chamadas */}
          <section>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2 mb-4">
              <Phone className="w-4 h-4" /> Histórico de Chamadas
            </h3>
            <CallHistoryPanel calls={callHistory} loading={callsLoading} compact />
          </section>

          {/* Notas */}
          {contact.notes && (
            <section>
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2 mb-4">
                <FileText className="w-4 h-4" /> Notas
              </h3>
              <p className="text-slate-300 text-sm whitespace-pre-wrap bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                {contact.notes}
              </p>
            </section>
          )}

          {/* Última Interação */}
          <section>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2 mb-4">
              <Calendar className="w-4 h-4" /> Histórico
            </h3>
            <div className="text-slate-300">
              <span className="text-slate-500 text-sm">Última interação</span>
              <p>{contact.lastContact || 'Sem interações registradas'}</p>
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ContactDetailsDrawer;
