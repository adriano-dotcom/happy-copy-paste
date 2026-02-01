import React from 'react';
import { AlertTriangle, X, ExternalLink, CreditCard } from 'lucide-react';
import { useWhatsAppAlerts, ERROR_CODE_INFO } from '@/hooks/useWhatsAppAlerts';
import { Button } from './ui/button';

interface WhatsAppPaymentAlertBannerProps {
  onDismiss?: () => void;
}

export const WhatsAppPaymentAlertBanner: React.FC<WhatsAppPaymentAlertBannerProps> = ({ onDismiss }) => {
  const { alerts, hasUnresolvedCritical, resolveAlert } = useWhatsAppAlerts();

  // Get the most critical unresolved alert (priority: 131042 > others)
  const criticalAlert = alerts.find(a => a.error_code === 131042);
  const displayAlert = criticalAlert || alerts[0];

  if (!displayAlert || !hasUnresolvedCritical) {
    return null;
  }

  const errorInfo = displayAlert.error_code ? ERROR_CODE_INFO[displayAlert.error_code] : null;
  const severity = errorInfo?.severity || 'high';

  const bgColor = severity === 'critical' 
    ? 'bg-red-500/20 border-red-500/50' 
    : 'bg-amber-500/20 border-amber-500/50';
  
  const textColor = severity === 'critical' ? 'text-red-400' : 'text-amber-400';
  const iconColor = severity === 'critical' ? 'text-red-500' : 'text-amber-500';

  const handleResolve = async () => {
    await resolveAlert(displayAlert.id, 'user_dismissed');
    onDismiss?.();
  };

  return (
    <div className={`${bgColor} border rounded-lg p-4 mb-4 animate-pulse-slow`}>
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-full ${severity === 'critical' ? 'bg-red-500/20' : 'bg-amber-500/20'}`}>
          {displayAlert.error_code === 131042 ? (
            <CreditCard className={`w-5 h-5 ${iconColor}`} />
          ) : (
            <AlertTriangle className={`w-5 h-5 ${iconColor}`} />
          )}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className={`font-semibold ${textColor}`}>
              {displayAlert.title}
            </h4>
            {displayAlert.error_code && (
              <span className="text-xs bg-slate-700 px-2 py-0.5 rounded text-slate-400">
                Código: {displayAlert.error_code}
              </span>
            )}
          </div>
          
          <p className="text-sm text-slate-300 mb-2">
            {displayAlert.description || errorInfo?.description}
          </p>
          
          {displayAlert.details && (
            <p className="text-xs text-slate-400 mb-3">
              {displayAlert.details}
            </p>
          )}
          
          <div className="flex items-center gap-2">
            {displayAlert.error_code === 131042 && (
              <a
                href="https://business.facebook.com/billing_hub/payment_settings"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 px-3 py-1.5 rounded transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Verificar Pagamento Meta
              </a>
            )}
            
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResolve}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Já resolvi isso
            </Button>
          </div>
        </div>
        
        <button
          onClick={handleResolve}
          className="p-1 hover:bg-slate-700 rounded transition-colors text-slate-400 hover:text-slate-200"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
