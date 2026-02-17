import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { User, Building2, MapPin, Phone, Mail, FileText, Calendar, Edit, MessageSquare, Target, Pencil, Check, X, Loader2, MessageCircle, Mic } from 'lucide-react';
import { displayPhoneInternational } from '@/utils/phoneFormatter';
import { CallHistoryPanel } from './CallHistoryPanel';
import { useContactCallHistory } from '@/hooks/useContactCallHistory';
import VoiceQualificationSection from './VoiceQualificationSection';
import { api } from '@/services/api';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

interface ContactData {
  id: string;
  name: string;
  phone: string;
  email: string;
  company?: string;
  cnpj?: string;
  fleet_size?: number;
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
  utm_source?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

interface ContactDetailsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: ContactData | null;
  onEdit?: () => void;
  onConverse?: () => void;
  onContactUpdate?: (updatedContact: ContactData) => void;
}

const getWhatsAppLink = (phone: string, name?: string) => {
  const cleanPhone = phone.replace(/\D/g, '');
  const firstName = name?.split(' ')[0] || '';
  const message = encodeURIComponent(`Olá ${firstName}! Tudo bem?`.trim());
  return `https://wa.me/${cleanPhone}?text=${message}`;
};

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

const ContactDetailsDrawer: React.FC<ContactDetailsDrawerProps> = ({ open, onOpenChange, contact, onEdit, onConverse, onContactUpdate }) => {
  const { callHistory, loading: callsLoading } = useContactCallHistory(contact?.id || null);
  const queryClient = useQueryClient();
  
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isCallingIris, setIsCallingIris] = useState(false);

  // Reset editing state when contact changes or drawer closes
  useEffect(() => {
    if (!open) {
      setIsEditingName(false);
      setEditedName('');
      setIsCallingIris(false);
    }
  }, [open, contact?.id]);

  const handleCallIris = async () => {
    if (!contact?.id) return;
    setIsCallingIris(true);
    try {
      const { error } = await supabase.functions.invoke('trigger-elevenlabs-call', {
        body: { contact_id: contact.id, force: true }
      });
      if (error) throw error;
      toast.success('Ligação da Iris disparada com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['voice-qualification', contact.id] });
      queryClient.invalidateQueries({ queryKey: ['contact-voice-qualifications', contact.id] });
    } catch (error: any) {
      console.error('Error calling Iris:', error);
      toast.error(error?.message || 'Erro ao disparar ligação da Iris');
    } finally {
      setIsCallingIris(false);
    }
  };

  const handleStartEditing = () => {
    setEditedName(contact?.name || '');
    setIsEditingName(true);
  };

  const handleCancelEditing = () => {
    setIsEditingName(false);
    setEditedName('');
  };

  const handleSaveName = async () => {
    if (!editedName.trim() || !contact?.id) return;
    if (editedName.trim() === contact.name) {
      handleCancelEditing();
      return;
    }
    
    setIsSaving(true);
    try {
      await api.updateContact(contact.id, { name: editedName.trim() });
      toast.success('Nome atualizado com sucesso!');
      setIsEditingName(false);
      onContactUpdate?.({ ...contact, name: editedName.trim() });
    } catch (error) {
      console.error('Error updating name:', error);
      toast.error('Erro ao atualizar nome');
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveName();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEditing();
    }
  };

  if (!contact) return null;

  const getStatusBadge = (status: string | undefined) => {
    switch (status) {
      case 'customer': return { label: 'Cliente Ativo', gradient: 'from-emerald-500/20 to-green-500/20', text: 'text-emerald-300', border: 'border-emerald-400/30', glow: 'shadow-emerald-500/20' };
      case 'lead': return { label: 'Lead', gradient: 'from-cyan-500/20 to-teal-500/20', text: 'text-cyan-300', border: 'border-cyan-400/30', glow: 'shadow-cyan-500/20' };
      default: return { label: 'Novo Lead', gradient: 'from-slate-500/20 to-gray-500/20', text: 'text-slate-300', border: 'border-slate-400/30', glow: 'shadow-slate-500/20' };
    }
  };

  const statusBadge = getStatusBadge(contact.status);

  const hasAddress = contact.street || contact.city || contact.state;

  // Section header component with iOS 26 style
  const SectionHeader = ({ icon: Icon, title }: { icon: React.ElementType; title: string }) => (
    <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2 mb-4">
      <span className="p-1.5 rounded-lg bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-white/5">
        <Icon className="w-3.5 h-3.5 text-cyan-400" />
      </span>
      {title}
    </h3>
  );

  // Info row component with iOS 26 style
  const InfoRow = ({ icon: Icon, label, value, isLink }: { icon: React.ElementType; label: string; value: string; isLink?: boolean }) => (
    <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.03] hover:border-cyan-500/20 transition-all duration-300 group">
      <div className="p-2 rounded-lg bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-white/5 group-hover:border-cyan-500/20 transition-all">
        <Icon className="w-4 h-4 text-slate-400 group-hover:text-cyan-400 transition-colors" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-xs text-slate-500 block">{label}</span>
        <p className={`font-medium truncate ${isLink ? 'text-cyan-400 hover:text-cyan-300' : 'text-slate-200'}`}>
          {value || '-'}
        </p>
      </div>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg bg-gradient-to-b from-slate-950/98 via-slate-900/95 to-slate-950/98 backdrop-blur-2xl border-l border-white/[0.06] overflow-y-auto shadow-2xl">
        {/* Header with glassmorphism */}
        <SheetHeader className="pb-6">
          {/* Avatar section with glow */}
          <div className="flex flex-col items-center text-center pt-4 pb-6">
            <div className="relative mb-4">
              {/* Glow effect behind avatar */}
              <div className="absolute inset-0 bg-gradient-to-tr from-cyan-500/20 to-teal-500/20 blur-2xl rounded-full scale-150 opacity-60" />
              {/* Avatar ring */}
              <div className="relative w-24 h-24 rounded-full p-1 bg-gradient-to-tr from-cyan-400 via-teal-400 to-cyan-500 shadow-lg shadow-cyan-500/30">
                <div className="w-full h-full rounded-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center text-3xl font-bold text-cyan-300 shadow-inner">
                  {contact.name?.substring(0, 2).toUpperCase() || '??'}
                </div>
              </div>
            </div>
            
            {isEditingName ? (
              <div className="flex items-center gap-2 w-full max-w-xs">
                <Input
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoFocus
                  disabled={isSaving}
                  className="text-center text-lg font-bold bg-white/5 border-cyan-500/30 text-white focus:border-cyan-400"
                  placeholder="Nome do lead"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleSaveName}
                  disabled={isSaving || !editedName.trim()}
                  className="h-8 w-8 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20"
                >
                  {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={handleCancelEditing}
                  disabled={isSaving}
                  className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/20"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <SheetTitle className="text-2xl font-bold bg-gradient-to-r from-white via-white to-slate-300 bg-clip-text text-transparent">
                <span
                  className="inline-flex items-center gap-2 cursor-pointer group"
                  onClick={handleStartEditing}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && handleStartEditing()}
                >
                  {contact.name}
                  <Pencil className="w-4 h-4 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                </span>
              </SheetTitle>
            )}
            
            <span className={`inline-flex px-3 py-1 rounded-full text-xs font-semibold border mt-2 bg-gradient-to-r ${statusBadge.gradient} ${statusBadge.text} ${statusBadge.border} shadow-lg ${statusBadge.glow} backdrop-blur-sm`}>
              {statusBadge.label}
            </span>
          </div>

          {/* Action buttons with iOS 26 style */}
          <div className="flex gap-3">
            <Button 
              onClick={onEdit} 
              className="flex-1 bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-white shadow-lg shadow-cyan-500/30 border-0 transition-all duration-300 hover:scale-[1.02]"
            >
              <Edit className="w-4 h-4 mr-2" />
              Editar
            </Button>
            <Button 
              onClick={onConverse} 
              variant="outline" 
              className="flex-1 bg-white/[0.03] border-white/10 hover:bg-white/[0.06] hover:border-cyan-500/30 text-slate-200 transition-all duration-300 hover:scale-[1.02]"
            >
              <MessageSquare className="w-4 h-4 mr-2" />
              Conversar
            </Button>
          </div>
          <Button 
            onClick={handleCallIris}
            disabled={isCallingIris}
            className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-lg shadow-violet-500/30 border-0 transition-all duration-300 hover:scale-[1.02] disabled:opacity-50"
          >
            {isCallingIris ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mic className="w-4 h-4 mr-2" />}
            {isCallingIris ? 'Disparando...' : 'Ligar com Iris'}
          </Button>
        </SheetHeader>

        {/* Gradient divider */}
        <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-6" />

        <div className="space-y-6 pb-6">
          {/* Dados de Contato */}
          <section>
            <SectionHeader icon={User} title="Dados de Contato" />
            <div className="space-y-2">
              {/* Phone row with WhatsApp button */}
              <div className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.03] hover:border-cyan-500/20 transition-all duration-300 group">
                <div className="p-2 rounded-lg bg-gradient-to-br from-slate-800/80 to-slate-900/80 border border-white/5 group-hover:border-cyan-500/20 transition-all">
                  <Phone className="w-4 h-4 text-slate-400 group-hover:text-cyan-400 transition-colors" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-slate-500 block">Telefone</span>
                  <p className="font-medium text-slate-200">{displayPhoneInternational(contact.phone)}</p>
                </div>
                {contact.phone && (
                  <a
                    href={getWhatsAppLink(contact.phone, contact.name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg bg-gradient-to-br from-emerald-500/20 to-green-500/20 border border-emerald-500/30 hover:from-emerald-500/30 hover:to-green-500/30 hover:border-emerald-400/50 transition-all group/whatsapp"
                    title="Abrir WhatsApp"
                  >
                    <MessageCircle className="w-4 h-4 text-emerald-400 group-hover/whatsapp:text-emerald-300" />
                  </a>
                )}</div>
              {(contact.city || contact.state) && (
                <InfoRow icon={MapPin} label="Região" value={[contact.city, contact.state].filter(Boolean).join(' - ')} />
              )}
              <InfoRow icon={Mail} label="Email" value={contact.email || '-'} isLink={!!contact.email} />
              {contact.cnpj && (
                <InfoRow icon={FileText} label="CNPJ" value={formatCNPJ(contact.cnpj)} />
              )}
              {contact.company && (
                <InfoRow icon={Building2} label="Empresa" value={contact.company} />
              )}
            </div>
          </section>

          {/* Gradient divider */}
          <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

          {/* Histórico de Chamadas */}
          <section>
            <SectionHeader icon={Phone} title="Histórico de Ligações" />
            <div className="bg-white/[0.02] rounded-xl border border-white/[0.03] p-3">
              <CallHistoryPanel 
                calls={callHistory} 
                loading={callsLoading} 
                compact
                contactId={contact?.id}
                contactName={contact?.name}
              />
            </div>
          </section>

          {/* Qualificação por Voz (ElevenLabs) */}
          <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <section>
            <SectionHeader icon={Mic} title="Qualificação por Voz" />
            <div className="bg-white/[0.02] rounded-xl border border-white/[0.03] p-3">
              <VoiceQualificationSection 
                contactId={contact?.id || null}
                contactName={contact?.name}
              />
            </div>
          </section>
          {contact.fleet_size && (
            <>
              <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              <section>
                <SectionHeader icon={Building2} title="Dados da Frota" />
                <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 to-transparent border border-emerald-500/20 backdrop-blur-sm">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-gradient-to-br from-emerald-500/20 to-green-500/20 border border-emerald-400/30">
                      <Target className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <span className="text-xs text-slate-500 block">Tamanho da Frota</span>
                      <p className="text-xl font-bold text-emerald-300">{contact.fleet_size} veículos</p>
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* Endereço Completo */}
          {hasAddress && contact.street && (
            <>
              <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              <section>
                <SectionHeader icon={MapPin} title="Endereço Completo" />
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.03] space-y-2">
                  {contact.cep && (
                    <p className="text-xs text-slate-500">CEP: <span className="text-slate-400 font-mono">{formatCEP(contact.cep)}</span></p>
                  )}
                  <p className="text-slate-200">
                    {contact.street}
                    {contact.number && `, ${contact.number}`}
                    {contact.complement && ` - ${contact.complement}`}
                  </p>
                  {contact.neighborhood && <p className="text-slate-400">{contact.neighborhood}</p>}
                </div>
              </section>
            </>
          )}

          {/* Notas */}
          {contact.notes && (
            <>
              <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              <section>
                <SectionHeader icon={FileText} title="Notas" />
                <p className="text-slate-300 text-sm whitespace-pre-wrap bg-white/[0.02] p-4 rounded-xl border border-white/[0.03]">
                  {contact.notes}
                </p>
              </section>
            </>
          )}

          {/* Origem da Campanha (UTMs) */}
          {(contact.utm_source || contact.utm_campaign || contact.utm_content || contact.utm_term) && (
            <>
              <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              <section>
                <SectionHeader icon={Target} title="Origem da Campanha" />
                <div className="space-y-2 text-sm bg-white/[0.02] p-4 rounded-xl border border-white/[0.03]">
                  {contact.utm_source && (
                    <div className="flex justify-between items-center p-2 rounded-lg hover:bg-white/[0.02] transition-colors">
                      <span className="text-slate-500">Fonte</span>
                      <span className="font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-md">{contact.utm_source}</span>
                    </div>
                  )}
                  {contact.utm_campaign && (
                    <div className="flex justify-between items-center p-2 rounded-lg hover:bg-white/[0.02] transition-colors">
                      <span className="text-slate-500">Campanha</span>
                      <span className="font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-md">{contact.utm_campaign}</span>
                    </div>
                  )}
                  {contact.utm_content && (
                    <div className="flex justify-between items-center p-2 rounded-lg hover:bg-white/[0.02] transition-colors">
                      <span className="text-slate-500">Conteúdo</span>
                      <span className="font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-md">{contact.utm_content}</span>
                    </div>
                  )}
                  {contact.utm_term && (
                    <div className="flex justify-between items-center p-2 rounded-lg hover:bg-white/[0.02] transition-colors">
                      <span className="text-slate-500">Termo</span>
                      <span className="font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-md">{contact.utm_term}</span>
                    </div>
                  )}
                </div>
              </section>
            </>
          )}

          {/* Última Interação */}
          <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <section>
            <SectionHeader icon={Calendar} title="Estágio do Negócio" />
            <div className="p-4 rounded-xl bg-gradient-to-r from-violet-500/10 to-transparent border border-violet-500/20 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-gradient-to-br from-violet-500/20 to-purple-500/20 border border-violet-400/30">
                  <Calendar className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Última interação</span>
                  <p className="font-medium text-violet-300">{contact.lastContact || 'Qualificação IA'}</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ContactDetailsDrawer;
