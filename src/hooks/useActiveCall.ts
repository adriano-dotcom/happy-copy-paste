import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';

export type CallLog = Tables<'call_logs'>;

const CALL_TIMEOUT_MS = 180000; // 3 minutes timeout for stuck calls (increased from 2)

export const useActiveCall = (conversationId: string | null) => {
  const [activeCall, setActiveCall] = useState<CallLog | null>(null);
  const [callHistory, setCallHistory] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Function to sync and then clear stuck calls
  const syncAndClearStuckCall = useCallback(async (call: CallLog) => {
    console.log('[useActiveCall] Attempting to sync before marking timeout:', call.id);
    
    try {
      // First try to sync with provider to get real status
      const { data, error } = await supabase.functions.invoke('api4com-sync-call', {
        body: { call_log_id: call.id }
      });
      
      if (error) {
        console.error('[useActiveCall] Sync failed:', error);
      } else if (data?.synced && data?.updates?.status) {
        console.log('[useActiveCall] Sync successful, new status:', data.updates.status);
        // The realtime subscription will pick up the update
        return; // Don't mark as timeout - sync updated the status
      }
    } catch (e) {
      console.error('[useActiveCall] Sync error:', e);
    }
    
    // If sync didn't update status, mark as timeout
    console.log('[useActiveCall] Clearing stuck call after failed sync:', call.id);
    
    const { error } = await supabase
      .from('call_logs')
      .update({ 
        status: 'timeout',
        ended_at: new Date().toISOString(),
        hangup_cause: 'timeout_client'
      })
      .eq('id', call.id);

    if (!error) {
      setActiveCall(null);
      setCallHistory(prev => 
        prev.map(c => c.id === call.id ? { ...c, status: 'timeout' } : c)
      );
    }
  }, []);

  // Timeout for stuck calls - now with sync attempt first
  useEffect(() => {
    if (!activeCall) return;
    if (!['dialing', 'ringing'].includes(activeCall.status)) return;

    const startTime = new Date(activeCall.started_at).getTime();
    const elapsed = Date.now() - startTime;
    const remaining = CALL_TIMEOUT_MS - elapsed;

    if (remaining <= 0) {
      syncAndClearStuckCall(activeCall);
      return;
    }

    const timeout = setTimeout(() => {
      syncAndClearStuckCall(activeCall);
    }, remaining);

    return () => clearTimeout(timeout);
  }, [activeCall, syncAndClearStuckCall]);
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
        setLoading(false);
        return;
      }

      // Check for stuck calls and update them
      const now = Date.now();
      const stuckCalls = data?.filter(c => 
        ['dialing', 'ringing'].includes(c.status) &&
        now - new Date(c.started_at).getTime() > CALL_TIMEOUT_MS
      ) || [];

      // Update stuck calls to timeout status in background
      for (const call of stuckCalls) {
        console.log('[useActiveCall] Cleaning up stuck call:', call.id);
        supabase
          .from('call_logs')
          .update({
            status: 'timeout',
            ended_at: new Date().toISOString(),
            hangup_cause: 'timeout_client'
          })
          .eq('id', call.id)
          .then(({ error: updateError }) => {
            if (updateError) {
              console.error('[useActiveCall] Failed to update stuck call:', updateError);
            }
          });
      }

      // Filter out stuck calls from active call consideration
      const updatedData = data?.map(c => 
        stuckCalls.find(sc => sc.id === c.id) 
          ? { ...c, status: 'timeout' } 
          : c
      ) || [];

      setCallHistory(updatedData);
      
      // Check for active call (excluding now-timeout calls)
      const active = updatedData.find(c => 
        ['dialing', 'ringing', 'answered'].includes(c.status)
      );
      setActiveCall(active || null);
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
            } else if (['completed', 'no_answer', 'busy', 'failed', 'cancelled', 'timeout'].includes(updatedCall.status)) {
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

  const dismissActiveCall = useCallback(() => {
    setActiveCall(null);
  }, []);

  return { activeCall, callHistory, loading, dismissActiveCall };
};
