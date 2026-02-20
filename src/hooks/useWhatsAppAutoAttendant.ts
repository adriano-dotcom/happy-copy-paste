import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type AutoAttendantState = 
  | 'idle' 
  | 'connecting_meta' 
  | 'connecting_elevenlabs' 
  | 'bridged' 
  | 'ending';

interface CallQueueItem {
  id: string;
  type: 'inbound' | 'outbound';
  sdp_offer?: string;
  contact_id?: string;
  from_number?: string;
  to_number?: string;
  whatsapp_call_id?: string;
  phone_number_id?: string;
}

interface UseWhatsAppAutoAttendantReturn {
  state: AutoAttendantState;
  setState: (s: AutoAttendantState) => void;
  isActive: boolean;
  currentCall: CallQueueItem | null;
  queueLength: number;
  activate: () => void;
  deactivate: () => void;
  resetForNext: () => void;
  logs: string[];
}

export function useWhatsAppAutoAttendant(): UseWhatsAppAutoAttendantReturn {
  const [isActive, setIsActive] = useState(false);
  const [state, setState] = useState<AutoAttendantState>('idle');
  const [currentCall, setCurrentCall] = useState<CallQueueItem | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const queueRef = useRef<CallQueueItem[]>([]);
  const processingRef = useRef(false);
  const channelRef = useRef<any>(null);

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString('pt-BR');
    const entry = `[${ts}] ${msg}`;
    console.log(`[AutoAttendant] ${msg}`);
    setLogs(prev => [...prev.slice(-99), entry]);
  }, []);

  // Subscribe to inbound ringing calls
  useEffect(() => {
    if (!isActive) {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      return;
    }

    addLog('Ativado — escutando chamadas...');

    const channel = supabase
      .channel('auto-attendant-calls')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'whatsapp_calls',
        },
        (payload: any) => {
          const call = payload.new;
          addLog(`Nova chamada detectada: ${call.id} (${call.direction}, status: ${call.status})`);

          if (call.status === 'ringing' && call.direction === 'inbound' && call.sdp_offer) {
            const item: CallQueueItem = {
              id: call.id,
              type: 'inbound',
              sdp_offer: call.sdp_offer,
              contact_id: call.contact_id,
              from_number: call.from_number,
              whatsapp_call_id: call.whatsapp_call_id,
              phone_number_id: call.phone_number_id,
            };
            queueRef.current.push(item);
            addLog(`Chamada inbound adicionada à fila (total: ${queueRef.current.length})`);
          }

          if (call.status === 'pending_bridge' && call.direction === 'outbound') {
            const item: CallQueueItem = {
              id: call.id,
              type: 'outbound',
              contact_id: call.contact_id,
              to_number: call.to_number,
              phone_number_id: call.phone_number_id,
            };
            queueRef.current.push(item);
            addLog(`Chamada outbound adicionada à fila (total: ${queueRef.current.length})`);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'whatsapp_calls',
        },
        (payload: any) => {
          const call = payload.new;
          if (call.status === 'pending_bridge' && call.direction === 'outbound') {
            const alreadyQueued = queueRef.current.some(q => q.id === call.id);
            if (!alreadyQueued) {
              const item: CallQueueItem = {
                id: call.id,
                type: 'outbound',
                contact_id: call.contact_id,
                to_number: call.to_number,
                phone_number_id: call.phone_number_id,
              };
              queueRef.current.push(item);
              addLog(`Chamada outbound (update) adicionada à fila (total: ${queueRef.current.length})`);
            }
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [isActive, addLog]);

  const activate = useCallback(async () => {
    setIsActive(true);
    // Set flag in DB so other hooks know auto-attendant is active
    try {
      const { data: settings } = await supabase
        .from('nina_settings')
        .select('id')
        .limit(1)
        .single();
      if (settings) {
        await supabase
          .from('nina_settings')
          .update({ auto_attendant_active: true } as any)
          .eq('id', settings.id);
      }
    } catch (err) {
      console.error('[AutoAttendant] Failed to set auto_attendant_active flag:', err);
    }
  }, []);

  const deactivate = useCallback(async () => {
    setIsActive(false);
    setState('idle');
    setCurrentCall(null);
    queueRef.current = [];
    processingRef.current = false;
    addLog('Desativado');
    // Clear flag in DB
    try {
      const { data: settings } = await supabase
        .from('nina_settings')
        .select('id')
        .limit(1)
        .single();
      if (settings) {
        await supabase
          .from('nina_settings')
          .update({ auto_attendant_active: false } as any)
          .eq('id', settings.id);
      }
    } catch (err) {
      console.error('[AutoAttendant] Failed to clear auto_attendant_active flag:', err);
    }
  }, [addLog]);

  // Process queue
  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      if (processingRef.current || queueRef.current.length === 0) return;
      if (state !== 'idle') return;

      const next = queueRef.current.shift();
      if (next) {
        processingRef.current = true;
        setCurrentCall(next);
        setState('connecting_meta');
        addLog(`Processando chamada: ${next.id} (${next.type})`);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [isActive, state, addLog]);

  const resetForNext = useCallback(() => {
    addLog('resetForNext — liberando fila para próxima chamada');
    processingRef.current = false;
    setCurrentCall(null);
    setState('idle');
  }, [addLog]);

  return {
    state,
    setState,
    isActive,
    currentCall,
    queueLength: queueRef.current.length,
    activate,
    deactivate,
    resetForNext,
    logs,
  };
}
