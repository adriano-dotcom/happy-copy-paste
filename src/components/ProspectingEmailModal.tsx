import React, { useState, useEffect } from 'react';
import { X, Send, Loader2, Building2, MapPin, FileText, Sparkles, Search, Save, Eye, Pencil, ChevronDown, RefreshCw, Phone, Mail as MailIcon, Calendar, DollarSign, Truck, Activity, Code } from 'lucide-react';
import { Button } from './ui/button';
import { RichTextEditor } from './ui/rich-text-editor';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { api } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import DOMPurify from 'dompurify';

interface CNPJData {
  razao_social: string;
  nome_fantasia: string;
  cnae_fiscal_descricao: string;
  cnae_fiscal: number;
  porte: string;
  capital_social: number;
  situacao_cadastral: string;
  data_situacao_cadastral: string;
  data_inicio_atividade: string;
  municipio: string;
  uf: string;
  telefone1?: string;
  email?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  cep?: string;
}

interface ProspectingEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: {
    id: string;
    name: string;
    phone: string;
    email?: string;
    company?: string;
    cnpj?: string;
    city?: string;
    state?: string;
  };
  onContactUpdated?: () => void;
}

const EMAIL_TYPES = [
  { value: 'cold-email', label: 'Cold Email', icon: '🎯' },
  { value: 'follow-up', label: 'Follow-up', icon: '📬' },
  { value: 'proposta', label: 'Proposta Comercial', icon: '📋' },
];

const PRODUCT_VERTICALS = [
  { value: 'transporte', label: 'Seguro de Carga', icon: '🚛', description: 'RCTR-C, RC-DC, RC-V' },
  { value: 'frotas', label: 'Seguro de Frota', icon: '🚗', description: 'Auto empresarial, frota' },
  { value: 'ambos', label: 'Ambos Produtos', icon: '🚛🚗', description: 'Carga + Frota' },
  { value: 'prospeccao', label: 'Genérico', icon: '📧', description: 'Prospecção geral' },
];

// Detecta vertical automaticamente baseado no CNAE
const detectVerticalByCNAE = (cnaeDescription: string): 'transporte' | 'frotas' | 'ambos' | 'prospeccao' => {
  if (!cnaeDescription) return 'prospeccao';
  
  const cnaeLower = cnaeDescription.toLowerCase();
  
  // CNAEs de transporte de carga
  if (
    (cnaeLower.includes('transporte') && (cnaeLower.includes('carga') || cnaeLower.includes('rodoviário') || cnaeLower.includes('mudança'))) ||
    cnaeLower.includes('transportador') ||
    cnaeLower.includes('frete') ||
    cnaeLower.includes('logística') ||
    cnaeLower.includes('logistica')
  ) {
    return 'transporte';
  }
  
  // CNAEs de automotores/veículos/frotas
  if (
    cnaeLower.includes('veículos') || 
    cnaeLower.includes('veiculos') ||
    cnaeLower.includes('automóveis') || 
    cnaeLower.includes('automoveis') ||
    cnaeLower.includes('concessionária') ||
    cnaeLower.includes('concessionaria') ||
    cnaeLower.includes('locação de veículos') ||
    cnaeLower.includes('locadora') ||
    cnaeLower.includes('comércio de veículos') ||
    cnaeLower.includes('comercio de veiculos') ||
    cnaeLower.includes('peças automotivas') ||
    cnaeLower.includes('pecas automotivas') ||
    cnaeLower.includes('automotivo') ||
    cnaeLower.includes('oficina mecânica') ||
    cnaeLower.includes('oficina mecanica') ||
    cnaeLower.includes('funilaria') ||
    cnaeLower.includes('retífica') ||
    cnaeLower.includes('retifica')
  ) {
    return 'frotas';
  }
  
  return 'prospeccao';
};

export const ProspectingEmailModal: React.FC<ProspectingEmailModalProps> = ({
  isOpen,
  onClose,
  contact,
  onContactUpdated,
}) => {
  const { user } = useAuth();
  
  // CNPJ Enrichment state
  const [cnpjInput, setCnpjInput] = useState(contact.cnpj || '');
  const [cnpjData, setCnpjData] = useState<CNPJData | null>(null);
  const [searchingCNPJ, setSearchingCNPJ] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  
  // Email generation state
  const [selectedEmailType, setSelectedEmailType] = useState('cold-email');
  const [selectedVertical, setSelectedVertical] = useState<'transporte' | 'frotas' | 'ambos' | 'prospeccao'>('prospeccao');
  const [customContext, setCustomContext] = useState('');
  const [generatingEmail, setGeneratingEmail] = useState(false);
  
  // Email content state
  const [toEmail, setToEmail] = useState(contact.email || '');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [viewMode, setViewMode] = useState<'visual' | 'code' | 'preview'>('visual');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [senderName, setSenderName] = useState('');

  useEffect(() => {
    if (isOpen) {
      setCnpjInput(contact.cnpj || '');
      setToEmail(contact.email || '');
      setCnpjData(null);
      setSubject('');
      setBodyHtml('');
      setSelectedVertical('prospeccao');
      loadSenderName();
    }
  }, [isOpen, contact]);

  // Auto-detect vertical when CNPJ data is loaded
  useEffect(() => {
    if (cnpjData?.cnae_fiscal_descricao) {
      const detectedVertical = detectVerticalByCNAE(cnpjData.cnae_fiscal_descricao);
      setSelectedVertical(detectedVertical);
      
      if (detectedVertical !== 'prospeccao') {
        const verticalInfo = PRODUCT_VERTICALS.find(v => v.value === detectedVertical);
        toast.success(`Produto sugerido: ${verticalInfo?.label}`, {
          description: `Baseado no CNAE: ${cnpjData.cnae_fiscal_descricao.substring(0, 40)}...`
        });
      }
    }
  }, [cnpjData?.cnae_fiscal_descricao]);

  const loadSenderName = async () => {
    if (!user?.email) return;
    
    try {
      const { data } = await supabase
        .from('team_members')
        .select('name')
        .eq('email', user.email)
        .single();
      
      if (data?.name) {
        setSenderName(data.name);
      } else {
        const namePart = user.email.split('@')[0];
        const formattedName = namePart
          .split('.')
          .map(part => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' ');
        setSenderName(formattedName);
      }
    } catch (error) {
      console.error('Erro ao buscar nome do operador:', error);
    }
  };

  const formatCNPJ = (value: string) => {
    const digits = value.replace(/\D/g, '').substring(0, 14);
    return digits
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  };

  const handleCNPJChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCnpjInput(formatCNPJ(e.target.value));
  };

  const searchCNPJ = async () => {
    const cleanCNPJ = cnpjInput.replace(/\D/g, '');
    if (cleanCNPJ.length !== 14) {
      toast.error('CNPJ deve ter 14 dígitos');
      return;
    }

    setSearchingCNPJ(true);
    try {
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCNPJ}`);
      if (!response.ok) {
        throw new Error('CNPJ não encontrado');
      }
      const data = await response.json();
      setCnpjData(data);
      
      // Auto-fill email if found
      if (data.email && !toEmail) {
        setToEmail(data.email);
      }
      
      toast.success('Dados da empresa encontrados!');
    } catch (error) {
      console.error('Erro ao buscar CNPJ:', error);
      toast.error('Erro ao buscar CNPJ. Verifique se está correto.');
    } finally {
      setSearchingCNPJ(false);
    }
  };

  const saveToContact = async () => {
    if (!cnpjData) return;

    setSavingContact(true);
    try {
      await api.updateContact(contact.id, {
        company: cnpjData.nome_fantasia || cnpjData.razao_social,
        cnpj: cnpjInput,
        city: cnpjData.municipio,
        state: cnpjData.uf,
        street: cnpjData.logradouro,
        number: cnpjData.numero,
        neighborhood: cnpjData.bairro,
        cep: cnpjData.cep,
        email: cnpjData.email || contact.email,
        vertical: selectedVertical !== 'prospeccao' ? selectedVertical : undefined,
      });
      
      toast.success('Dados salvos no contato!');
      onContactUpdated?.();
    } catch (error) {
      console.error('Erro ao salvar contato:', error);
      toast.error('Erro ao salvar dados no contato');
    } finally {
      setSavingContact(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const generateEmail = async () => {
    setGeneratingEmail(true);
    try {
      // Build lead context with all available data
      const leadContext: Record<string, any> = {
        name: contact.name,
        company: cnpjData?.nome_fantasia || cnpjData?.razao_social || contact.company,
        cnpj: cnpjInput || contact.cnpj,
        phone: contact.phone,
        email: toEmail || contact.email,
      };

      // Add CNPJ enrichment data
      if (cnpjData) {
        leadContext.cnae = cnpjData.cnae_fiscal_descricao;
        leadContext.cnae_code = cnpjData.cnae_fiscal;
        leadContext.porte = cnpjData.porte;
        leadContext.capital_social = formatCurrency(cnpjData.capital_social);
        leadContext.situacao_cadastral = cnpjData.situacao_cadastral;
        leadContext.data_abertura = cnpjData.data_inicio_atividade;
        leadContext.cidade = `${cnpjData.municipio}/${cnpjData.uf}`;
      } else {
        leadContext.cidade = contact.city && contact.state ? `${contact.city}/${contact.state}` : undefined;
      }

      // Build briefing
      let briefingParts: string[] = [];
      if (customContext) {
        briefingParts.push(`Contexto do operador: ${customContext}`);
      }
      
      if (cnpjData?.cnae_fiscal_descricao) {
        briefingParts.push(`Atividade principal (CNAE): ${cnpjData.cnae_fiscal_descricao}`);
      }
      
      if (cnpjData?.porte) {
        briefingParts.push(`Porte da empresa: ${cnpjData.porte}`);
      }

      const { data, error } = await supabase.functions.invoke('generate-email-copy', {
        body: {
          vertical: selectedVertical,
          emailType: selectedEmailType,
          briefing: briefingParts.join('\n'),
          leadContext,
        }
      });

      if (error) throw error;

      if (data?.subject) {
        setSubject(data.subject);
      }
      if (data?.body_html) {
        setBodyHtml(data.body_html);
      }
      
      toast.success('Email gerado com sucesso!');
    } catch (error: any) {
      console.error('Erro ao gerar email:', error);
      toast.error(error.message || 'Erro ao gerar email com IA');
    } finally {
      setGeneratingEmail(false);
    }
  };

  const addSignature = (html: string): string => {
    const signature = `
<br/><br/>
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
  <tr>
    <td style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.7;">
      <p style="margin: 0 0 12px 0; font-weight: 500; color: #475569;">Atenciosamente,</p>
      <strong style="font-size: 15px; color: #1e293b; display: block;">${senderName || 'Adriano Jacometo'}</strong>
      <span style="color: #64748b; display: block; margin-bottom: 4px;">Corretor de Seguros</span>
      <strong style="color: #334155; display: block; margin-bottom: 16px;">Jacometo Corretora de Seguros</strong>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📱 WhatsApp: <a href="https://wa.me/5543991434002" style="color: #25D366; text-decoration: none;">+55 43 9 9143 4002</a></span>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📞 Telefone: (43) 3321‑5007</span>
      <span style="display: block; margin-bottom: 6px; color: #475569;">📍 Rua Souza Naves, 612 – Sala 51 – Centro – Londrina/PR</span>
      <span style="display: block; margin-top: 10px;">🌐 <a href="https://jacometoseguros.com.br" style="color: #6366f1; text-decoration: none;">jacometoseguros.com.br</a></span>
    </td>
  </tr>
</table>`;
    return html + signature;
  };

  const sendEmail = async () => {
    if (!toEmail || !subject || !bodyHtml) {
      toast.error('Preencha todos os campos do email');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(toEmail)) {
      toast.error('Email inválido');
      return;
    }

    setSendingEmail(true);
    try {
      const bodyWithSignature = addSignature(bodyHtml);
      
      const bccList = ['adriano@jacometo.com.br'];
      if (user?.email && user.email !== 'adriano@jacometo.com.br') {
        bccList.push(user.email);
      }

      const { error } = await supabase.functions.invoke('send-email', {
        body: { 
          to: toEmail, 
          subject, 
          html: bodyWithSignature,
          bcc: bccList
        }
      });

      if (error) throw error;

      toast.success('Email enviado com sucesso!');
      onClose();
    } catch (error: any) {
      console.error('Erro ao enviar email:', error);
      toast.error(error.message || 'Erro ao enviar email');
    } finally {
      setSendingEmail(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <MailIcon className="w-5 h-5 text-violet-500" />
              Preparar Email de Prospecção
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {contact.name} {contact.company && `• ${contact.company}`}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          
          {/* CNPJ Enrichment Section */}
          <div className="bg-gradient-to-br from-cyan-900/30 to-blue-900/20 border border-cyan-500/30 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Building2 className="w-5 h-5 text-cyan-400" />
              <span className="font-semibold text-white">Dados da Empresa</span>
            </div>
            
            {/* CNPJ Input */}
            <div className="flex gap-2">
              <div className="flex-1">
                <input
                  type="text"
                  value={cnpjInput}
                  onChange={handleCNPJChange}
                  placeholder="00.000.000/0000-00"
                  className="w-full px-4 py-2.5 bg-slate-800/80 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:ring-1 focus:ring-cyan-500 outline-none font-mono"
                />
              </div>
              <Button
                onClick={searchCNPJ}
                disabled={searchingCNPJ || cnpjInput.replace(/\D/g, '').length !== 14}
                className="bg-cyan-600 hover:bg-cyan-700 text-white"
              >
                {searchingCNPJ ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Buscar
                  </>
                )}
              </Button>
            </div>

            {/* CNPJ Data Display */}
            {cnpjData && (
              <div className="mt-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-cyan-400 uppercase tracking-wide">Dados Encontrados</span>
                  <Button
                    size="sm"
                    onClick={saveToContact}
                    disabled={savingContact}
                    className="h-7 text-xs bg-cyan-600/20 text-cyan-400 hover:bg-cyan-600/30 border border-cyan-500/30"
                  >
                    {savingContact ? (
                      <Loader2 className="w-3 h-3 animate-spin mr-1" />
                    ) : (
                      <Save className="w-3 h-3 mr-1" />
                    )}
                    Salvar no Contato
                  </Button>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-start gap-2">
                    <Building2 className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-slate-400 text-xs">Empresa</p>
                      <p className="text-white font-medium">{cnpjData.nome_fantasia || cnpjData.razao_social}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-2">
                    <Truck className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-slate-400 text-xs">CNAE</p>
                      <p className="text-white">{cnpjData.cnae_fiscal_descricao}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-slate-400 text-xs">Cidade</p>
                      <p className="text-white">{cnpjData.municipio}/{cnpjData.uf}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-2">
                    <FileText className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-slate-400 text-xs">Porte</p>
                      <p className="text-white">{cnpjData.porte}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-2">
                    <DollarSign className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-slate-400 text-xs">Capital Social</p>
                      <p className="text-white">{formatCurrency(cnpjData.capital_social)}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-2">
                    <Activity className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-slate-400 text-xs">Situação</p>
                      <p className={`font-medium ${cnpjData.situacao_cadastral === 'ATIVA' ? 'text-green-400' : 'text-yellow-400'}`}>
                        {cnpjData.situacao_cadastral}
                      </p>
                    </div>
                  </div>
                </div>

                {cnpjData.email && (
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-700">
                    <MailIcon className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs text-slate-400">Email encontrado:</span>
                    <span className="text-xs text-cyan-400">{cnpjData.email}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* AI Email Generation Section */}
          <div className="bg-gradient-to-br from-violet-900/30 to-purple-900/20 border border-violet-500/30 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-violet-400" />
              <span className="font-semibold text-white">Gerar Email com IA</span>
            </div>
            
            {/* Email Type Selector */}
            <div>
              <label className="text-xs font-medium text-slate-300 uppercase tracking-wide mb-1.5 block">
                Tipo de Email
              </label>
              <div className="relative">
                <select
                  value={selectedEmailType}
                  onChange={(e) => setSelectedEmailType(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-800/80 border border-slate-700 rounded-lg text-sm text-white appearance-none focus:ring-1 focus:ring-violet-500 outline-none cursor-pointer"
                >
                  {EMAIL_TYPES.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.icon} {type.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
            
            {/* Product/Vertical Selector */}
            <div>
              <label className="text-xs font-medium text-slate-300 uppercase tracking-wide mb-1.5 block">
                Produto a Oferecer
              </label>
              <div className="flex gap-2">
                {PRODUCT_VERTICALS.map(vertical => (
                  <button
                    key={vertical.value}
                    onClick={() => setSelectedVertical(vertical.value as 'transporte' | 'frotas' | 'ambos' | 'prospeccao')}
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm transition-all ${
                      selectedVertical === vertical.value
                        ? vertical.value === 'transporte'
                          ? 'bg-orange-500/20 border-orange-500/50 text-orange-300'
                          : vertical.value === 'frotas'
                            ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                            : vertical.value === 'ambos'
                              ? 'bg-purple-500/20 border-purple-500/50 text-purple-300'
                              : 'bg-slate-600/30 border-slate-500/50 text-slate-300'
                        : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-700/50 hover:border-slate-600'
                    }`}
                  >
                    <span className="text-base">{vertical.icon}</span>
                    <span className="block text-xs font-medium mt-0.5">{vertical.label}</span>
                  </button>
                ))}
              </div>
              {selectedVertical !== 'prospeccao' && cnpjData?.cnae_fiscal_descricao && (
                <p className="text-xs text-slate-500 mt-1.5 flex items-center gap-1">
                  <span className="text-green-400">✓</span>
                  Detectado automaticamente pelo CNAE
                </p>
              )}
            </div>
            
            {/* Custom Context */}
            <div>
              <label className="text-xs font-medium text-slate-300 uppercase tracking-wide mb-1.5 block">
                Contexto Adicional (opcional)
              </label>
              <input
                type="text"
                value={customContext}
                onChange={(e) => setCustomContext(e.target.value)}
                placeholder="Ex: Empresa de transporte de alimentos refrigerados..."
                className="w-full px-4 py-2.5 bg-slate-800/80 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:ring-1 focus:ring-violet-500 outline-none"
              />
            </div>

            {/* Data Preview */}
            <div className="p-2 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <p className="text-xs text-slate-400 mb-2">📊 Dados disponíveis para IA:</p>
              <div className="flex flex-wrap gap-1.5">
                <span className="px-2 py-0.5 bg-slate-700/50 rounded text-xs text-slate-300">
                  👤 {contact.name}
                </span>
                {(cnpjData?.nome_fantasia || cnpjData?.razao_social || contact.company) && (
                  <span className="px-2 py-0.5 bg-slate-700/50 rounded text-xs text-slate-300">
                    🏢 {cnpjData?.nome_fantasia || cnpjData?.razao_social || contact.company}
                  </span>
                )}
                <span className={`px-2 py-0.5 rounded text-xs ${
                  selectedVertical === 'transporte'
                    ? 'bg-green-500/20 text-green-300'
                    : selectedVertical === 'frotas'
                      ? 'bg-blue-500/20 text-blue-300'
                      : selectedVertical === 'ambos'
                        ? 'bg-purple-500/20 text-purple-300'
                        : 'bg-violet-500/20 text-violet-300'
                }`}>
                  {selectedVertical === 'transporte' 
                    ? '🚛 Transporte' 
                    : selectedVertical === 'frotas' 
                      ? '🚗 Automotores' 
                      : selectedVertical === 'ambos'
                        ? '🚛🚗 Carga + Frota'
                        : '📧 Genérico'}
                </span>
                {cnpjData?.cnae_fiscal_descricao && (
                  <span className="px-2 py-0.5 bg-violet-500/20 text-violet-300 rounded text-xs">
                    🎯 {cnpjData.cnae_fiscal_descricao.substring(0, 30)}...
                  </span>
                )}
                {(cnpjData?.municipio || contact.city) && (
                  <span className="px-2 py-0.5 bg-slate-700/50 rounded text-xs text-slate-300">
                    📍 {cnpjData?.municipio || contact.city}/{cnpjData?.uf || contact.state}
                  </span>
                )}
              </div>
            </div>

            {/* Generate Button */}
            <Button
              onClick={generateEmail}
              disabled={generatingEmail}
              className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white shadow-lg shadow-violet-500/20"
            >
              {generatingEmail ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Gerando...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Gerar Email com IA
                </>
              )}
            </Button>
          </div>

          {/* Email Preview/Edit Section */}
          {(subject || bodyHtml) && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Send className="w-5 h-5 text-emerald-400" />
                  <span className="font-semibold text-white">Preview do Email</span>
                </div>
                <div className="flex items-center gap-1 bg-slate-700/50 rounded-lg p-0.5">
                  <button
                    onClick={() => setViewMode('visual')}
                    className={`p-1.5 rounded flex items-center gap-1 text-xs ${viewMode === 'visual' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    title="Editor Visual"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('code')}
                    className={`p-1.5 rounded flex items-center gap-1 text-xs ${viewMode === 'code' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    title="Código HTML"
                  >
                    <Code className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('preview')}
                    className={`p-1.5 rounded flex items-center gap-1 text-xs ${viewMode === 'preview' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    title="Visualizar"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* To */}
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1 block">Para</label>
                <input
                  type="email"
                  value={toEmail}
                  onChange={(e) => setToEmail(e.target.value)}
                  placeholder="email@empresa.com.br"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              </div>

              {/* Subject */}
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1 block">Assunto</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:ring-1 focus:ring-emerald-500 outline-none"
                />
              </div>

              {/* Body */}
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1 block">Corpo</label>
                {viewMode === 'visual' ? (
                  <RichTextEditor
                    value={bodyHtml}
                    onChange={setBodyHtml}
                    placeholder="Escreva o corpo do email..."
                    minHeight="200px"
                    className="bg-white text-slate-900"
                  />
                ) : viewMode === 'code' ? (
                  <textarea
                    value={bodyHtml}
                    onChange={(e) => setBodyHtml(e.target.value)}
                    rows={10}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none font-mono text-xs"
                  />
                ) : (
                  <div 
                    className="w-full px-4 py-3 bg-white rounded-lg text-sm text-slate-900 min-h-[200px] overflow-auto prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(bodyHtml) }}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-end gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Cancelar
          </Button>
          <Button
            onClick={sendEmail}
            disabled={sendingEmail || !subject || !bodyHtml || !toEmail}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {sendingEmail ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Enviar Email
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
