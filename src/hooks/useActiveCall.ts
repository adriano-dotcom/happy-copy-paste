import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';

export type CallLog = Tables<'call_logs'>;

export const useActiveCall = (conversationId: string | null) => {
  const [activeCall, setActiveCall] = useState<CallLog | null>(null);
  const [callHistory, setCallHistory] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch call history for the conversation
  useEffect(() => {
    if (!conversationId) {
      setCallHistory([]);
      setActiveCall(null);
      setLoading(false);
      return;
    }

    const fetchCallHistory = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('call_logs')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('started_at', { ascending: false })
        .limit(20);

      if (error) {
        console.error('Error fetching call history:', error);
      } else {
        setCallHistory(data || []);
        // Check for active call
        const active = data?.find(c => 
          ['dialing', 'ringing', 'answered'].includes(c.status)
        );
        setActiveCall(active || null);
      }
      setLoading(false);
    };

    fetchCallHistory();

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`call-logs-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'call_logs',
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => {
          console.log('[useActiveCall] Realtime update:', payload);
          
          if (payload.eventType === 'INSERT') {
            const newCall = payload.new as CallLog;
            setCallHistory(prev => [newCall, ...prev]);
            if (['dialing', 'ringing', 'answered'].includes(newCall.status)) {
              setActiveCall(newCall);
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedCall = payload.new as CallLog;
            setCallHistory(prev => 
              prev.map(c => c.id === updatedCall.id ? updatedCall : c)
            );
            // Update active call status
            if (['dialing', 'ringing', 'answered'].includes(updatedCall.status)) {
              setActiveCall(updatedCall);
            } else if (['completed', 'no_answer', 'busy', 'failed'].includes(updatedCall.status)) {
              setActiveCall(null);
            }
          } else if (payload.eventType === 'DELETE') {
            const deletedId = payload.old?.id;
            setCallHistory(prev => prev.filter(c => c.id !== deletedId));
            if (activeCall?.id === deletedId) {
              setActiveCall(null);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  return { activeCall, callHistory, loading };
};
