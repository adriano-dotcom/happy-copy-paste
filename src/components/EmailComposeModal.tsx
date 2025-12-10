import React, { useState, useEffect } from 'react';
import { X, Send, Loader2, ChevronDown } from 'lucide-react';
import { Button } from './Button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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
}

export const EmailComposeModal: React.FC<EmailComposeModalProps> = ({
  isOpen,
  onClose,
  dealId,
  contactEmail = '',
  contactName = '',
  company = '',
  value = 0,
  onEmailSent
}) => {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [to, setTo] = useState(contactEmail);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

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
      .replace(/\{\{valor\}\}/g, value ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value) : 'A definir');
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
          {/* Para */}
          <div>
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5 block">
              Para
            </label>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="email@exemplo.com"
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:ring-1 focus:ring-violet-500 outline-none"
            />
          </div>

          {/* Template Selector */}
          <div>
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5 block">
              Template
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
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5 block">
              Assunto
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Assunto do email..."
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:ring-1 focus:ring-violet-500 outline-none"
            />
          </div>

          {/* Corpo */}
          <div>
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1.5 block">
              Mensagem
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Escreva sua mensagem..."
              rows={10}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-500 focus:ring-1 focus:ring-violet-500 outline-none resize-none font-mono"
            />
            <p className="text-xs text-slate-500 mt-2">
              💡 Variáveis disponíveis: <code className="bg-slate-800 px-1 rounded">{"{{nome}}"}</code>, 
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
