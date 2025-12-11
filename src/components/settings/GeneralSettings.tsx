import React, { useState, useEffect } from 'react';
import { Bell, Volume2, VolumeX } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { playNotificationSound, isNotificationSoundEnabled, setNotificationSoundEnabled } from '@/utils/notificationSound';
import { toast } from 'sonner';

const GeneralSettings: React.FC = () => {
  const [soundEnabled, setSoundEnabled] = useState(true);

  useEffect(() => {
    setSoundEnabled(isNotificationSoundEnabled());
  }, []);

  const handleSoundToggle = (enabled: boolean) => {
    setSoundEnabled(enabled);
    setNotificationSoundEnabled(enabled);
    
    if (enabled) {
      // Play a test sound when enabling
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

  return (
    <div className="space-y-6">
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
    </div>
  );
};

export default GeneralSettings;
