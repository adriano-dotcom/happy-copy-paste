import React, { useState, useEffect } from 'react';
import { RefreshCw, Loader2, Check, Clock, X, AlertCircle, MessageSquare, FileText } from 'lucide-react';
import { Button } from '../Button';
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
  last_synced_at: string | null;
}

const WhatsAppTemplatesSettings: React.FC = () => {
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<WhatsAppTemplate | null>(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_templates')
        .select('*')
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

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-whatsapp-templates');

      if (error) throw error;

      if (data.success) {
        toast.success(`Sincronização concluída: ${data.synced} templates`);
        await fetchTemplates();
      } else {
        throw new Error(data.error || 'Sync failed');
      }
    } catch (error) {
      console.error('Error syncing templates:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao sincronizar templates');
    } finally {
      setSyncing(false);
    }
  };

  const getStatusBadge = (status: string | null) => {
    const configs: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
      APPROVED: { icon: <Check className="w-3 h-3" />, color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', label: 'Aprovado' },
      PENDING: { icon: <Clock className="w-3 h-3" />, color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', label: 'Pendente' },
      REJECTED: { icon: <X className="w-3 h-3" />, color: 'bg-red-500/20 text-red-400 border-red-500/30', label: 'Rejeitado' },
      DISABLED: { icon: <AlertCircle className="w-3 h-3" />, color: 'bg-slate-500/20 text-slate-400 border-slate-500/30', label: 'Desativado' },
    };
    const config = configs[status || 'PENDING'] || configs.PENDING;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${config.color}`}>
        {config.icon}
        {config.label}
      </span>
    );
  };

  const getCategoryBadge = (category: string | null) => {
    const configs: Record<string, { color: string; label: string }> = {
      MARKETING: { color: 'bg-purple-500/20 text-purple-400', label: 'Marketing' },
      UTILITY: { color: 'bg-blue-500/20 text-blue-400', label: 'Utilitário' },
      AUTHENTICATION: { color: 'bg-cyan-500/20 text-cyan-400', label: 'Autenticação' },
    };
    const config = configs[category || 'UTILITY'] || { color: 'bg-slate-500/20 text-slate-400', label: category || 'Outro' };
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  const renderTemplatePreview = (template: WhatsAppTemplate) => {
    const header = template.components?.find((c: any) => c.type === 'HEADER');
    const body = template.components?.find((c: any) => c.type === 'BODY');
    const footer = template.components?.find((c: any) => c.type === 'FOOTER');
    const buttons = template.components?.find((c: any) => c.type === 'BUTTONS');

    return (
      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50 max-w-sm">
        {/* Header */}
        {header && (
          <div className="mb-2 font-medium text-slate-200">
            {header.format === 'TEXT' && header.text}
            {header.format === 'IMAGE' && (
              <div className="bg-slate-700/50 rounded h-32 flex items-center justify-center text-slate-500">
                [Imagem]
              </div>
            )}
          </div>
        )}
        
        {/* Body */}
        {body && (
          <div className="text-sm text-slate-300 whitespace-pre-wrap">
            {body.text}
          </div>
        )}
        
        {/* Footer */}
        {footer && (
          <div className="mt-2 text-xs text-slate-500">
            {footer.text}
          </div>
        )}
        
        {/* Buttons */}
        {buttons && buttons.buttons && (
          <div className="mt-3 flex flex-col gap-1">
            {buttons.buttons.map((btn: any, i: number) => (
              <div key={i} className="text-center py-1.5 text-sm text-cyan-400 border border-cyan-500/30 rounded">
                {btn.text}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-green-400" />
            Templates WhatsApp
          </h3>
          <p className="text-sm text-slate-400 mt-1">
            Gerencie templates de mensagem aprovados pela Meta para campanhas ativas
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={handleSync}
          disabled={syncing}
          className="gap-2"
        >
          {syncing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          Sincronizar com Meta
        </Button>
      </div>

      {/* Info Card */}
      <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20 rounded-lg p-4">
        <div className="flex gap-3">
          <FileText className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
          <div className="text-sm text-slate-300">
            <p className="font-medium text-green-400 mb-1">Como funciona</p>
            <p>
              Os templates são criados e aprovados no{' '}
              <a 
                href="https://business.facebook.com/wa/manage/message-templates" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-cyan-400 hover:underline"
              >
                WhatsApp Manager da Meta
              </a>
              . Clique em "Sincronizar" para importar os templates aprovados e usá-los no chat.
            </p>
          </div>
        </div>
      </div>

      {/* Templates Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12 bg-slate-800/30 rounded-lg border border-slate-700/50">
          <MessageSquare className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-slate-300 mb-1">Nenhum template encontrado</h3>
          <p className="text-sm text-slate-500 mb-4">
            Clique em "Sincronizar com Meta" para importar seus templates
          </p>
          <Button variant="secondary" onClick={handleSync} disabled={syncing}>
            {syncing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Sincronizar
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {templates.map(template => (
            <div
              key={template.id}
              className={`bg-slate-800/50 border rounded-lg p-4 cursor-pointer transition-all hover:border-cyan-500/50 ${
                selectedTemplate?.id === template.id ? 'border-cyan-500' : 'border-slate-700/50'
              }`}
              onClick={() => setSelectedTemplate(selectedTemplate?.id === template.id ? null : template)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-medium text-white">{template.name}</h4>
                    {getStatusBadge(template.status)}
                    {getCategoryBadge(template.category)}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500">
                    <span>Idioma: {template.language}</span>
                    <span>Variáveis: {template.variables_count}</span>
                    {template.last_synced_at && (
                      <span>
                        Sincronizado: {new Date(template.last_synced_at).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Expanded preview */}
              {selectedTemplate?.id === template.id && (
                <div className="mt-4 pt-4 border-t border-slate-700/50">
                  <p className="text-xs text-slate-500 mb-2">Preview do template:</p>
                  {renderTemplatePreview(template)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Stats */}
      {templates.length > 0 && (
        <div className="flex gap-4 text-sm text-slate-400">
          <span>Total: {templates.length}</span>
          <span>Aprovados: {templates.filter(t => t.status === 'APPROVED').length}</span>
          <span>Pendentes: {templates.filter(t => t.status === 'PENDING').length}</span>
        </div>
      )}
    </div>
  );
};

export default WhatsAppTemplatesSettings;
