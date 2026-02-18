import React, { useState, useEffect } from 'react';
import { X, Send, Loader2, MessageSquare, AlertCircle, Phone } from 'lucide-react';
import { Button } from './Button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface WhatsAppTemplate {
  id: string;
  meta_template_id: string;
  name: string;
  language: string;
  category: string | null;
  status: string | null;
  components: any[] | null;
  variables_count: number | null;
}

interface SendWhatsAppTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  contactId: string;
  conversationId: string;
  contactName?: string;
  contactCompany?: string;
  onSent?: () => void;
}

export const SendWhatsAppTemplateModal: React.FC<SendWhatsAppTemplateModalProps> = ({
  isOpen,
  onClose,
  contactId,
  conversationId,
  contactName,
  contactCompany,
  onSent,
}) => {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null);
  const [headerVariables, setHeaderVariables] = useState<string[]>([]);
  const [bodyVariables, setBodyVariables] = useState<string[]>([]);
  const [isProspecting, setIsProspecting] = useState(false);

  // Normalize to first name only, Title Case
  const normalizeFirstName = (name?: string): string => {
    if (!name) return '';
    const first = name.trim().split(/\s+/)[0];
    if (first.length < 3) return first;
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  };

  // Count variables in a text by finding {{N}} patterns
  const countVariables = (text: string | undefined): number => {
    if (!text) return 0;
    const matches = text.match(/\{\{\d+\}\}/g);
    return matches ? matches.length : 0;
  };

  // Get variable counts for selected template
  const getTemplateCounts = (template: WhatsAppTemplate | null) => {
    if (!template?.components) return { headerCount: 0, bodyCount: 0 };
    
    const headerComponent = template.components.find((c: any) => c.type === 'HEADER');
    const bodyComponent = template.components.find((c: any) => c.type === 'BODY');
    
    return {
      headerCount: countVariables(headerComponent?.text),
      bodyCount: countVariables(bodyComponent?.text),
    };
  };

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
    }
  }, [isOpen]);

  // Auto-fill variables when template changes
  useEffect(() => {
    if (selectedTemplate) {
      const { headerCount, bodyCount } = getTemplateCounts(selectedTemplate);
      
      // Initialize header variables
      const initialHeaderVars = Array(headerCount).fill('');
      if (headerCount >= 1 && contactName) {
        initialHeaderVars[0] = normalizeFirstName(contactName);
      }
      setHeaderVariables(initialHeaderVars);
      
      // Initialize body variables
      const initialBodyVars = Array(bodyCount).fill('');
      if (bodyCount >= 1 && contactName && headerCount === 0) {
        initialBodyVars[0] = contactName;
      }
      if (bodyCount >= 1 && contactCompany) {
        const companyIndex = headerCount === 0 ? 1 : 0;
        if (companyIndex < bodyCount) {
          initialBodyVars[companyIndex] = contactCompany;
        }
      }
      setBodyVariables(initialBodyVars);
    } else {
      setHeaderVariables([]);
      setBodyVariables([]);
    }
  }, [selectedTemplate, contactName, contactCompany]);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .eq('status', 'APPROVED')
        .order('name');

      if (error) throw error;
      setTemplates((data || []) as unknown as WhatsAppTemplate[]);
    } catch (error) {
      console.error('Error fetching templates:', error);
      toast.error('Erro ao carregar templates');
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!selectedTemplate) {
      toast.error('Selecione um template');
      return;
    }

    // Validate all variables are filled
    if (headerVariables.some(v => !v.trim()) || bodyVariables.some(v => !v.trim())) {
      toast.error('Preencha todas as variáveis');
      return;
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp-template', {
        body: {
          contact_id: contactId,
          conversation_id: conversationId,
          template_name: selectedTemplate.name,
          language: selectedTemplate.language,
          variables: bodyVariables.map(v => v.trim()),
          header_variables: headerVariables.map(v => v.trim()),
          is_prospecting: isProspecting,
        },
      });

      if (error) throw error;

      if (data.success) {
        toast.success('Template enviado com sucesso!');
        onSent?.();
        onClose();
      } else {
        throw new Error(data.error || 'Erro ao enviar template');
      }
    } catch (error) {
      console.error('Error sending template:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao enviar template');
    } finally {
      setSending(false);
    }
  };

  const renderTemplatePreview = () => {
    if (!selectedTemplate) return null;

    const headerComponent = selectedTemplate.components?.find((c: any) => c.type === 'HEADER');
    const bodyComponent = selectedTemplate.components?.find((c: any) => c.type === 'BODY');
    
    let headerText = headerComponent?.text || '';
    let bodyText = bodyComponent?.text || '';
    
    // Replace header variables
    headerVariables.forEach((v, i) => {
      headerText = headerText.replace(`{{${i + 1}}}`, v || `[Header ${i + 1}]`);
    });
    
    // Replace body variables
    bodyVariables.forEach((v, i) => {
      bodyText = bodyText.replace(`{{${i + 1}}}`, v || `[Variável ${i + 1}]`);
    });

    return (
      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
        <p className="text-xs text-slate-500 mb-2">Preview:</p>
        {headerText && (
          <div className="text-sm font-semibold text-white mb-2">
            {headerText}
          </div>
        )}
        <div className="text-sm text-slate-300 whitespace-pre-wrap">
          {bodyText}
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-xl border border-slate-700/50 w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700/50">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-green-400" />
            <h2 className="text-lg font-semibold text-white">Enviar Template WhatsApp</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="w-10 h-10 text-amber-400 mx-auto mb-2" />
              <p className="text-slate-300 font-medium">Nenhum template aprovado</p>
              <p className="text-sm text-slate-500 mt-1">
                Sincronize seus templates em Configurações → Templates WhatsApp
              </p>
            </div>
          ) : (
            <>
              {/* Template selector */}
              <div>
                <Label className="text-slate-300 mb-2 block">Template</Label>
                <Select
                  value={selectedTemplate?.id || ''}
                  onValueChange={(value) => {
                    const template = templates.find(t => t.id === value);
                    setSelectedTemplate(template || null);
                  }}
                >
                  <SelectTrigger className="bg-slate-800/50 border-slate-700">
                    <SelectValue placeholder="Selecione um template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map(template => (
                      <SelectItem key={template.id} value={template.id}>
                        <div className="flex items-center gap-2">
                          <span>{template.name}</span>
                          <span className="text-xs text-slate-500">
                            ({template.category})
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Prospecting Toggle */}
              <div className="flex items-center justify-between p-3 bg-amber-500/10 rounded-lg border border-amber-500/20">
                <div className="flex items-center gap-3">
                  <Phone className="w-5 h-5 text-amber-400" />
                  <div>
                    <p className="text-sm font-medium text-white">Prospecção Ativa</p>
                    <p className="text-xs text-slate-400">Ativar agente Atlas para qualificação</p>
                  </div>
                </div>
                <Switch
                  checked={isProspecting}
                  onCheckedChange={setIsProspecting}
                />
              </div>

              {/* Header Variables */}
              {selectedTemplate && headerVariables.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-slate-300">Variáveis do Cabeçalho</Label>
                  {headerVariables.map((_, i) => (
                    <div key={`header-${i}`}>
                      <Label className="text-xs text-slate-500 mb-1 block">
                        Header {`{{${i + 1}}}`}
                      </Label>
                      <Input
                        value={headerVariables[i] || ''}
                        onChange={(e) => {
                          const newVars = [...headerVariables];
                          newVars[i] = e.target.value;
                          setHeaderVariables(newVars);
                        }}
                        placeholder="Ex: Nome do cliente"
                        className="bg-slate-800/50 border-slate-700"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Body Variables */}
              {selectedTemplate && bodyVariables.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-slate-300">Variáveis do Corpo</Label>
                  {bodyVariables.map((_, i) => (
                    <div key={`body-${i}`}>
                      <Label className="text-xs text-slate-500 mb-1 block">
                        Body {`{{${i + 1}}}`}
                      </Label>
                      <Input
                        value={bodyVariables[i] || ''}
                        onChange={(e) => {
                          const newVars = [...bodyVariables];
                          newVars[i] = e.target.value;
                          setBodyVariables(newVars);
                        }}
                        placeholder={i === 0 ? 'Ex: Nome do cliente' : i === 1 ? 'Ex: Empresa' : `Valor para variável ${i + 1}`}
                        className="bg-slate-800/50 border-slate-700"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Preview */}
              {selectedTemplate && renderTemplatePreview()}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-700/50">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleSend}
            disabled={!selectedTemplate || sending || templates.length === 0}
            className="gap-2"
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Enviar Template
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
