import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ProcessingStatus {
  isAggregating: boolean;
  isProcessing: boolean;
  agentName: string | null;
}

export const useNinaProcessingStatus = (conversationId: string | null): ProcessingStatus => {
  const [status, setStatus] = useState<ProcessingStatus>({
    isAggregating: false,
    isProcessing: false,
    agentName: null,
  });
  
  const agentNameCacheRef = useRef<string | null>(null);

  const checkStatus = useCallback(async () => {
    if (!conversationId) {
      setStatus({ isAggregating: false, isProcessing: false, agentName: null });
      return;
    }

    const { data: queueItems } = await supabase
      .from('nina_processing_queue')
      .select('status, scheduled_for, context_data')
      .eq('conversation_id', conversationId)
      .in('status', ['pending', 'processing'])
      .order('created_at', { ascending: false })
      .limit(1);

    if (!queueItems || queueItems.length === 0) {
      setStatus({ isAggregating: false, isProcessing: false, agentName: null });
      return;
    }

    const item = queueItems[0];
    const scheduledFor = item.scheduled_for ? new Date(item.scheduled_for) : null;
    const isScheduledInFuture = scheduledFor && scheduledFor > new Date();

    // Use cached agent name or fetch if not available
    let agentName = agentNameCacheRef.current;
    
    if (!agentName) {
      const { data: conversation } = await supabase
        .from('conversations')
        .select('current_agent_id, agents:current_agent_id(name)')
        .eq('id', conversationId)
        .single();

      agentName = (conversation?.agents as any)?.name || 'Íris';
      agentNameCacheRef.current = agentName;
    }

    setStatus({
      isAggregating: item.status === 'pending' && isScheduledInFuture,
      isProcessing: item.status === 'processing' || (item.status === 'pending' && !isScheduledInFuture),
      agentName,
    });
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) {
      setStatus({ isAggregating: false, isProcessing: false, agentName: null });
      agentNameCacheRef.current = null;
      return;
    }

    // Initial check
    checkStatus();

    // Subscribe to realtime changes instead of polling
    const channel = supabase
      .channel(`nina-processing-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'nina_processing_queue',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          checkStatus();
        }
      )
      .subscribe();

    // Minimal polling only for scheduled_for timing check (every 10s instead of 2s)
    // This handles the edge case where scheduled_for time passes
    const interval = setInterval(() => {
      // Only check if we're currently aggregating (waiting for scheduled time)
      if (status.isAggregating) {
        checkStatus();
      }
    }, 10000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [conversationId, checkStatus, status.isAggregating]);

  return status;
};
