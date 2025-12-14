import React, { useState, useEffect } from 'react';
import { X, Send, Loader2, ChevronDown, Sparkles, User, Building2, MapPin, Package, FileText, TrendingUp } from 'lucide-react';
import { Button } from './Button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ClientMemory } from '@/types';

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  category: string;
}

interface EmailComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  dealId: string;
  contactEmail?: string;
  contactName?: string;
  company?: string;
  value?: number;
  onEmailSent?: () => void;
  // Context props for AI assistant
  ninaContext?: Record<string, any> | null;
  clientMemory?: ClientMemory | null;
  conversationHistory?: string;
  agentSlug?: string | null;
  contactPhone?: string;
  contactCnpj?: string | null;
}

const EMAIL_TYPES = [
  { value: 'follow-up', label: 'Follow-up', icon: '📬' },
  { value: 'proposta', label: 'Proposta Comercial', icon: '📋' },
  { value: 'cotacao', label: 'Envio de Cotação', icon: '💰' },
  { value: 'boas-vindas', label: 'Boas-vindas', icon: '🎉' },
  { value: 'renewal', label: 'Renovação', icon: '🔄' },
];

export const EmailComposeModal: React.FC<EmailComposeModalProps> = ({
  isOpen,
  onClose,
  dealId,
  contactEmail = '',
  contactName = '',
  company = '',
  value = 0,
  onEmailSent,
  ninaContext,
  clientMemory,
  conversationHistory,
  agentSlug,
  contactPhone,
  contactCnpj,
}) => {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [to, setTo] = useState(contactEmail);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  
  // AI Assistant state
  const [selectedEmailType, setSelectedEmailType] = useState('follow-up');
  const [customContext, setCustomContext] = useState('');
  const [generatingAI, setGeneratingAI] = useState(false);
  const [showAIAssistant, setShowAIAssistant] = useState(true);

  // Extract qualification data
  const qualificationAnswers = ninaContext?.qualification_answers || {};
  const qualificationScore = clientMemory?.lead_profile?.qualification_score || 0;
  const interests = clientMemory?.lead_profile?.interests || [];
  const painPoints = clientMemory?.sales_intelligence?.pain_points || [];

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
      setTo(contactEmail);
    }
  }, [isOpen, contactEmail]);

  const loadTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Erro ao carregar templates:', error);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const replaceVariables = (text: string): string => {
    return text
      .replace(/\{\{nome\}\}/g, contactName || 'Cliente')
      .replace(/\{\{empresa\}\}/g, company || 'Empresa')
      .replace(/\{\{valor\}\}/g, value ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value) : 'A definir')
      .replace(/\{\{email\}\}/g, contactEmail || '')
      .replace(/\{\{telefone\}\}/g, contactPhone || '');
  };

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    
    if (templateId === '') {
      setSubject('');
      setBody('');
      return;
    }

    const template = templates.find(t => t.id === templateId);
    if (template) {
      setSubject(replaceVariables(template.subject));
      setBody(replaceVariables(template.body_html));
    }
  };

  const getVertical = () => {
    if (agentSlug === 'barbara') return 'saude';
    if (agentSlug === 'leonardo') return 'prospeccao';
    return 'transporte';
  };

  const handleGenerateWithAI = async () => {
    setGeneratingAI(true);
    try {
      const leadContext = {
        name: contactName,
        company: company,
        cnpj: contactCnpj,
        phone: contactPhone,
        email: contactEmail,
        qualification_score: qualificationScore,
        qualification_answers: qualificationAnswers,
        interests: interests,
        pain_points: painPoints,
        conversation_summary: conversationHistory,
      };

      // Build a detailed briefing from lead context
      let briefingParts: string[] = [];
      
      if (customContext) {
        briefingParts.push(`Contexto adicional do operador: ${customContext}`);
      }
      
      if (contactName) briefingParts.push(`Nome do lead: ${contactName}`);
      if (company) briefingParts.push(`Empresa: ${company}`);
      if (contactCnpj) briefingParts.push(`CNPJ: ${contactCnpj}`);
      
      // Add qualification answers
      const qaLabels: Record<string, string> = {
        contratacao: 'Tipo de contratação',
        tipo_carga: 'Tipo de carga',
        estados: 'Estados atendidos',
        viagens_mes: 'Viagens por mês',
        valor_medio: 'Valor médio por carga',
        maior_valor: 'Maior valor transportado',
        tipo_frota: 'Tipo de frota',
        antt: 'ANTT',
        cte: 'CT-e',
      };
      
      Object.entries(qualificationAnswers).forEach(([key, val]) => {
        if (val && qaLabels[key]) {
          briefingParts.push(`${qaLabels[key]}: ${val}`);
        }
      });
      
      if (qualificationScore > 0) {
        briefingParts.push(`Score de qualificação: ${qualificationScore}%`);
      }
      
      if (interests.length > 0) {
        briefingParts.push(`Interesses do lead: ${interests.join(', ')}`);
      }
      
      if (painPoints.length > 0) {
        briefingParts.push(`Dores identificadas: ${painPoints.join(', ')}`);
      }
      
      if (conversationHistory) {
        briefingParts.push(`\nResumo da conversa:\n${conversationHistory}`);
      }

      const { data, error } = await supabase.functions.invoke('generate-email-copy', {
        body: {
          vertical: getVertical(),
          emailType: selectedEmailType,
          briefing: briefingParts.join('\n'),
          leadContext,
        }
      });

      if (error) throw error;

      if (data?.subject) {
        setSubject(replaceVariables(data.subject));
      }
      if (data?.body_html) {
        setBody(replaceVariables(data.body_html));
      }
      
      setSelectedTemplateId(''); // Clear template selection
      toast.success('Email gerado com sucesso!');
    } catch (error: any) {
      console.error('Erro ao gerar email com IA:', error);
      toast.error(error.message || 'Erro ao gerar email com IA');
    } finally {
      setGeneratingAI(false);
    }
  };

  const handleSend = async () => {
    if (!to || !subject || !body) {
      toast.error('Preencha todos os campos');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      toast.error('Email inválido');
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: { to, subject, html: body }
      });

      if (error) throw error;

      // Registrar atividade no deal
      const { error: activityError } = await supabase
        .from('deal_activities')
        .insert({
          deal_id: dealId,
          type: 'email',
          title: `Email enviado: ${subject}`,
          description: `Para: ${to}`
        });

      if (activityError) {
        console.error('Erro ao registrar atividade:', activityError);
      }

      toast.success('Email enviado com sucesso!');
      onEmailSent?.();
      onClose();
      
      // Reset form
      setSubject('');
      setBody('');
      setSelectedTemplateId('');
    } catch (error: any) {
      console.error('Erro ao enviar email:', error);
      toast.error(error.message || 'Erro ao enviar email');
    } finally {
      setSending(false);
    }
  };

  // Get visible lead data for preview
  const getLeadDataPreview = () => {
    const items: { icon: React.ReactNode; label: string; value: string }[] = [];
    
    if (company) items.push({ icon: <Building2 className="w-3.5 h-3.5" />, label: 'Empresa', value: company });
    if (contactCnpj) items.push({ icon: <FileText className="w-3.5 h-3.5" />, label: 'CNPJ', value: contactCnpj });
    if (qualificationAnswers.tipo_carga) items.push({ icon: <Package className="w-3.5 h-3.5" />, label: 'Carga', value: String(qualificationAnswers.tipo_carga) });
    if (qualificationAnswers.estados) items.push({ icon: <MapPin className="w-3.5 h-3.5" />, label: 'Estados', value: String(qualificationAnswers.estados) });
    
    return items;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Send className="w-5 h-5 text-violet-500" />
            Enviar Email
          </h2>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          
          {/* AI Assistant Section */}
          <div className="bg-gradient-to-br from-violet-900/30 to-purple-900/20 border border-violet-500/30 rounded-xl p-4 space-y-3">
            <button
              onClick={() => setShowAIAssistant(!showAIAssistant)}
              className="w-full flex items-center justify-between text-left"
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-violet-400" />
                <span className="font-semibold text-white">Assistente de Copywriting</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showAIAssistant ? 'rotate-180' : ''}`} />
            </button>
            
            {showAIAssistant && (
              <div className="space-y-3 pt-2">
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
                
                {/* Custom Context */}
                <div>
                  <label className="text-xs font-medium text-slate-300 uppercase tracking-wide mb-1.5 block">
                    Contexto Adicional (opcional)
                  </label>
                  <input
                    type="text"
                    value={customContext}
                    onChange={(e) => setCustomContext(e.target.value)}
                    placeholder="Ex: Mencionar que ele tem frota própria..."
                    className="w-full px-4 py-2.5 bg-slate-800/80 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:ring-1 focus:ring-violet-500 outline-none"
                  />
                </div>
                
                {/* Lead Data Preview */}
                {(getLeadDataPreview().length > 0 || qualificationScore > 0) && (
                  <div className="bg-slate-800/50 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-400 uppercase">
                      <User className="w-3.5 h-3.5" />
                      Dados do Lead (detectados)
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {getLeadDataPreview().map((item, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 bg-slate-700/50 px-2 py-1 rounded text-xs">
                          <span className="text-slate-400">{item.icon}</span>
                          <span className="text-slate-300">{item.value}</span>
                        </div>
                      ))}
                      {qualificationScore > 0 && (
                        <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${
                          qualificationScore >= 70 ? 'bg-emerald-500/20 text-emerald-400' :
                          qualificationScore >= 40 ? 'bg-amber-500/20 text-amber-400' :
                          'bg-slate-700/50 text-slate-400'
                        }`}>
                          <TrendingUp className="w-3.5 h-3.5" />
                          <span>{qualificationScore}%</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Generate Button */}
                <Button
                  onClick={handleGenerateWithAI}
                  disabled={generatingAI}
                  className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white"
                >
                  {generatingAI ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Gerar Email Personalizado
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* Para */}
          <div>
            <label className="text-xs font-medium text-slate-300 uppercase tracking-wide mb-1.5 block">
              Para
            </label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="email@exemplo.com"
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-400 focus:ring-1 focus:ring-violet-500 outline-none"
            />
          </div>

          {/* Template Selector */}
          <div>
            <label className="text-xs font-medium text-slate-300 uppercase tracking-wide mb-1.5 block">
              Ou escolha um Template
            </label>
            <div className="relative">
              <select
                value={selectedTemplateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
                disabled={loadingTemplates}
                className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white appearance-none focus:ring-1 focus:ring-violet-500 outline-none cursor-pointer"
              >
                <option value="">📝 Sem template (personalizado)</option>
                {templates.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.category === 'follow-up' ? '📬' : 
                     template.category === 'proposal' ? '📋' : 
                     template.category === 'welcome' ? '🎉' : '📧'} {template.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Assunto */}
          <div>
            <label className="text-xs font-medium text-slate-300 uppercase tracking-wide mb-1.5 block">
              Assunto
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Assunto do email..."
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-400 focus:ring-1 focus:ring-violet-500 outline-none"
            />
          </div>

          {/* Corpo */}
          <div>
            <label className="text-xs font-medium text-slate-300 uppercase tracking-wide mb-1.5 block">
              Mensagem
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Escreva sua mensagem..."
              rows={10}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-400 focus:ring-1 focus:ring-violet-500 outline-none resize-none font-mono"
            />
            <p className="text-xs text-slate-400 mt-2">
              Variáveis disponíveis: <code className="bg-slate-800 px-1 rounded">{"{{nome}}"}</code>, 
              <code className="bg-slate-800 px-1 rounded ml-1">{"{{empresa}}"}</code>, 
              <code className="bg-slate-800 px-1 rounded ml-1">{"{{valor}}"}</code>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex justify-end gap-3">
          <Button 
            variant="outline" 
            onClick={onClose}
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Cancelar
          </Button>
          <Button 
            onClick={handleSend}
            disabled={sending || !to || !subject || !body}
            className="bg-violet-600 hover:bg-violet-700"
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
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
