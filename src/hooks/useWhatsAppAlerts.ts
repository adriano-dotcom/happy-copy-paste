import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface WhatsAppAlert {
  id: string;
  alert_type: string;
  error_code: number | null;
  title: string;
  description: string | null;
  details: string | null;
  phone_number_id: string | null;
  is_resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}

// Error code info for display
export const ERROR_CODE_INFO: Record<number, { title: string; description: string; severity: 'critical' | 'high' | 'medium' }> = {
  131042: {
    title: 'Problema de Pagamento',
    description: 'Há um problema com o método de pagamento da conta WhatsApp Business. Templates não serão entregues até regularizar.',
    severity: 'critical'
  },
  131047: {
    title: 'Reengajamento Necessário',
    description: 'O usuário não respondeu nos últimos 24h. Use um template aprovado para reiniciar a conversa.',
    severity: 'medium'
  },
  131026: {
    title: 'Destinatário Inválido',
    description: 'O número de destino não possui WhatsApp ou é inválido.',
    severity: 'medium'
  },
  131049: {
    title: 'Limite de Marketing',
    description: 'O destinatário já recebeu muitas mensagens de marketing (Healthy Ecosystem).',
    severity: 'medium'
  }
};

export function useWhatsAppAlerts() {
  const [alerts, setAlerts] = useState<WhatsAppAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasUnresolvedCritical, setHasUnresolvedCritical] = useState(false);

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('whatsapp_alerts')
        .select('*')
        .eq('is_resolved', false)
        .order('created_at', { ascending: false })
        .limit(50);

      if (fetchError) throw fetchError;
      
      const typedData = (data || []) as WhatsAppAlert[];
      setAlerts(typedData);
      
      // Check for critical unresolved alerts (131042)
      const hasCritical = typedData.some(a => 
        a.error_code === 131042 && !a.is_resolved
      );
      setHasUnresolvedCritical(hasCritical);
      
      setError(null);
    } catch (err) {
      console.error('Error fetching WhatsApp alerts:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch alerts');
    } finally {
      setLoading(false);
    }
  }, []);

  const resolveAlert = useCallback(async (alertId: string, resolvedBy?: string) => {
    try {
      const { error: updateError } = await supabase
        .from('whatsapp_alerts')
        .update({
          is_resolved: true,
          resolved_at: new Date().toISOString(),
          resolved_by: resolvedBy || 'user'
        })
        .eq('id', alertId);

      if (updateError) throw updateError;
      
      await fetchAlerts();
      return true;
    } catch (err) {
      console.error('Error resolving alert:', err);
      return false;
    }
  }, [fetchAlerts]);

  // Subscribe to realtime changes
  useEffect(() => {
    fetchAlerts();

    const channel = supabase
      .channel('whatsapp-alerts-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_alerts'
        },
        () => {
          fetchAlerts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchAlerts]);

  return {
    alerts,
    loading,
    error,
    hasUnresolvedCritical,
    fetchAlerts,
    resolveAlert
  };
}
