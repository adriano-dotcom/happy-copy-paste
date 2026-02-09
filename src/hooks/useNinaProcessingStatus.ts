import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface ProcessingStatus {
  isAggregating: boolean;
  isProcessing: boolean;
  agentName: string | null;
  hasFailed: boolean;
  failedCount: number;
  failedError: string | null;
  failedItemIds: string[];
}

export const useNinaProcessingStatus = (conversationId: string | null): ProcessingStatus => {
  const [status, setStatus] = useState<ProcessingStatus>({
    isAggregating: false,
    isProcessing: false,
    agentName: null,
    hasFailed: false,
    failedCount: 0,
    failedError: null,
    failedItemIds: [],
  });
  
  // Cache the agent name to prevent flickering
  const agentNameRef = useRef<string | null>(null);
  
  const checkStatus = useCallback(async () => {
    if (!conversationId) {
      setStatus({
        isAggregating: false,
        isProcessing: false,
        agentName: null,
        hasFailed: false,
        failedCount: 0,
        failedError: null,
        failedItemIds: [],
      });
      return;
    }
    
    try {
      // Check for pending/processing items
      const { data: queueItems, error: queueError } = await supabase
        .from('nina_processing_queue')
        .select('id, status, scheduled_for')
        .eq('conversation_id', conversationId)
        .in('status', ['pending', 'processing'])
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (queueError) {
        console.error('[ProcessingStatus] Error checking queue:', queueError);
        return;
      }

      // Check for failed items
      const { data: failedItems, error: failedError } = await supabase
        .from('nina_processing_queue')
        .select('id, error_message')
        .eq('conversation_id', conversationId)
        .eq('status', 'failed')
        .order('processed_at', { ascending: false })
        .limit(10);

      if (failedError) {
        console.error('[ProcessingStatus] Error checking failed items:', failedError);
      }

      const hasFailed = failedItems && failedItems.length > 0;
      const failedIds = failedItems?.map(item => item.id) || [];
      const firstError = failedItems?.[0]?.error_message || null;
      
      // Get agent name from conversation if we're processing
      if (queueItems && queueItems.length > 0) {
        const { data: convData } = await supabase
          .from('conversations')
          .select('agents(name)')
          .eq('id', conversationId)
          .single();
        
        if (convData?.agents) {
          agentNameRef.current = (convData.agents as any).name;
        }
      }
      
      const item = queueItems?.[0];
      let isAggregating = false;
      let isProcessing = false;
      
      if (item) {
        if (item.status === 'processing') {
          isProcessing = true;
        } else if (item.status === 'pending') {
          // Check if scheduled_for is in the future
          const scheduledFor = item.scheduled_for ? new Date(item.scheduled_for) : null;
          if (scheduledFor && scheduledFor > new Date()) {
            isAggregating = true;
          } else {
            isProcessing = true;
          }
        }
      }
      
      setStatus({
        isAggregating,
        isProcessing,
        agentName: agentNameRef.current,
        hasFailed: hasFailed ?? false,
        failedCount: failedIds.length,
        failedError: firstError,
        failedItemIds: failedIds,
      });
    } catch (err) {
      console.error('[ProcessingStatus] Unexpected error:', err);
    }
  }, [conversationId]);
  
  useEffect(() => {
    // Check immediately
    checkStatus();
    
    // Subscribe to changes
    const channel = supabase
      .channel(`nina-status-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'nina_processing_queue',
          filter: conversationId ? `conversation_id=eq.${conversationId}` : undefined,
        },
        () => {
          checkStatus();
        }
      )
      .subscribe();
    
    // Also poll occasionally since scheduled_for time passes while in aggregating state
    const pollInterval = setInterval(() => {
      if (status.isAggregating) {
        checkStatus();
      }
    }, 1000);
    
    return () => {
      channel.unsubscribe();
      clearInterval(pollInterval);
    };
  }, [conversationId, checkStatus, status.isAggregating]);
  
  return status;
};
