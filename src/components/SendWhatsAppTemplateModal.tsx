import React, { useState, useEffect } from 'react';
import { X, Send, Loader2, MessageSquare, AlertCircle } from 'lucide-react';
import { Button } from './Button';
import { Input } from './ui/input';
import { Label } from './ui/label';
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
  const [variables, setVariables] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
    }
  }, [isOpen]);

  // Auto-fill variables when template changes
  useEffect(() => {
    if (selectedTemplate) {
      const bodyComponent = selectedTemplate.components?.find((c: any) => c.type === 'BODY');
      const variablesCount = selectedTemplate.variables_count || 0;
      
      // Initialize variables with auto-fill values
      const initialVars = Array(variablesCount).fill('');
      
      // Try to auto-fill first variable with contact name
      if (variablesCount >= 1 && contactName) {
        initialVars[0] = contactName;
      }
      // Try to auto-fill second variable with company
      if (variablesCount >= 2 && contactCompany) {
        initialVars[1] = contactCompany;
      }
      
      setVariables(initialVars);
    } else {
      setVariables([]);
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
    if (variables.some(v => !v.trim())) {
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
          variables: variables.map(v => v.trim()),
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

    const bodyComponent = selectedTemplate.components?.find((c: any) => c.type === 'BODY');
    let previewText = bodyComponent?.text || '';
    
    // Replace variables with actual values or placeholders
    variables.forEach((v, i) => {
      previewText = previewText.replace(`{{${i + 1}}}`, v || `[Variável ${i + 1}]`);
    });

    return (
      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
        <p className="text-xs text-slate-500 mb-2">Preview:</p>
        <div className="text-sm text-slate-300 whitespace-pre-wrap">
          {previewText}
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

              {/* Variables */}
              {selectedTemplate && selectedTemplate.variables_count > 0 && (
                <div className="space-y-3">
                  <Label className="text-slate-300">Variáveis</Label>
                  {Array.from({ length: selectedTemplate.variables_count }).map((_, i) => (
                    <div key={i}>
                      <Label className="text-xs text-slate-500 mb-1 block">
                        Variável {i + 1} {`{{${i + 1}}}`}
                      </Label>
                      <Input
                        value={variables[i] || ''}
                        onChange={(e) => {
                          const newVars = [...variables];
                          newVars[i] = e.target.value;
                          setVariables(newVars);
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
