import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';

export type CallLog = Tables<'call_logs'>;

export const useContactCallHistory = (contactId: string | null) => {
  const [callHistory, setCallHistory] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!contactId) {
      setCallHistory([]);
      setLoading(false);
      return;
    }

    const fetchCallHistory = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('call_logs')
        .select('*')
        .eq('contact_id', contactId)
        .order('started_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching contact call history:', error);
      } else {
        setCallHistory(data || []);
      }
      setLoading(false);
    };

    fetchCallHistory();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`contact-call-logs-${contactId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'call_logs',
          filter: `contact_id=eq.${contactId}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newCall = payload.new as CallLog;
            setCallHistory(prev => [newCall, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const updatedCall = payload.new as CallLog;
            setCallHistory(prev => 
              prev.map(c => c.id === updatedCall.id ? updatedCall : c)
            );
          } else if (payload.eventType === 'DELETE') {
            const deletedId = payload.old?.id;
            setCallHistory(prev => prev.filter(c => c.id !== deletedId));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [contactId]);

  return { callHistory, loading };
};
