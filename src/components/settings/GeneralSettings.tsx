import React, { useState, useEffect } from 'react';
import { Bell, Volume2, VolumeX, Facebook, MessageSquare } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { playNotificationSound, isNotificationSoundEnabled, setNotificationSoundEnabled } from '@/utils/notificationSound';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const GeneralSettings: React.FC = () => {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [facebookTemplate, setFacebookTemplate] = useState('lead_facebook_meta');
  const [approvedTemplates, setApprovedTemplates] = useState<{ name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSoundEnabled(isNotificationSoundEnabled());
    fetchSettings();
    fetchTemplates();
  }, []);

  const fetchSettings = async () => {
    const { data } = await supabase
      .from('nina_settings')
      .select('facebook_lead_template')
      .single();
    
    if (data?.facebook_lead_template) {
      setFacebookTemplate(data.facebook_lead_template);
    }
  };

  const fetchTemplates = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('whatsapp_templates')
      .select('name')
      .eq('status', 'APPROVED')
      .order('name');
    
    if (data) {
      setApprovedTemplates(data);
    }
    setLoading(false);
  };

  const handleSoundToggle = (enabled: boolean) => {
    setSoundEnabled(enabled);
    setNotificationSoundEnabled(enabled);
    
    if (enabled) {
      playNotificationSound();
      toast.success('Som de notificação ativado');
    } else {
      toast.info('Som de notificação desativado');
    }
  };

  const handleTestSound = () => {
    if (soundEnabled) {
      playNotificationSound();
    }
  };

  const handleSaveTemplate = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('nina_settings')
        .update({ facebook_lead_template: facebookTemplate })
        .not('id', 'is', null);
      
      if (error) throw error;
      toast.success('Template salvo com sucesso');
    } catch (error) {
      console.error('Error saving template:', error);
      toast.error('Erro ao salvar template');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Notificações */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Bell className="w-5 h-5 text-cyan-400" />
          Notificações
        </h3>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
            <div className="flex items-center gap-3">
              {soundEnabled ? (
                <Volume2 className="w-5 h-5 text-cyan-400" />
              ) : (
                <VolumeX className="w-5 h-5 text-slate-500" />
              )}
              <div>
                <Label htmlFor="notification-sound" className="text-sm font-medium text-white cursor-pointer">
                  Som de notificação
                </Label>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tocar som ao receber novas mensagens de clientes
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {soundEnabled && (
                <button
                  onClick={handleTestSound}
                  className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  Testar
                </button>
              )}
              <Switch
                id="notification-sound"
                checked={soundEnabled}
                onCheckedChange={handleSoundToggle}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Automação Facebook Leads */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Facebook className="w-5 h-5 text-blue-400" />
          Automação Facebook Leads
        </h3>
        
        <div className="space-y-4">
          <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
            <div className="flex items-start gap-3 mb-4">
              <MessageSquare className="w-5 h-5 text-green-400 mt-0.5" />
              <div className="flex-1">
                <Label className="text-sm font-medium text-white">
                  Template WhatsApp para novos leads
                </Label>
                <p className="text-xs text-slate-400 mt-0.5">
                  Enviado automaticamente quando lead do Facebook chega via Zapier
                </p>
              </div>
            </div>
            
            <div className="space-y-3">
              <Select 
                value={facebookTemplate} 
                onValueChange={setFacebookTemplate}
                disabled={loading}
              >
                <SelectTrigger className="bg-slate-900/50 border-slate-700">
                  <SelectValue placeholder="Selecione um template..." />
                </SelectTrigger>
                <SelectContent>
                  {approvedTemplates.map((template) => (
                    <SelectItem key={template.name} value={template.name}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  {approvedTemplates.length} templates aprovados disponíveis
                </p>
                <Button
                  size="sm"
                  onClick={handleSaveTemplate}
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {saving ? 'Salvando...' : 'Salvar'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GeneralSettings;
