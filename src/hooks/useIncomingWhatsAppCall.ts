import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isNotificationSoundEnabled, getNotificationVolume } from '@/utils/notificationSound';

export interface IncomingWhatsAppCall {
  id: string;
  whatsapp_call_id: string | null;
  contact_id: string | null;
  conversation_id: string | null;
  direction: string;
  status: string;
  phone_number_id: string | null;
  from_number: string | null;
  to_number: string | null;
  sdp_offer: string | null;
  started_at: string | null;
  metadata: Record<string, any>;
  // Enriched contact data
  contact_name: string | null;
  contact_photo: string | null;
}

let audioContext: AudioContext | null = null;
let ringtoneInterval: ReturnType<typeof setInterval> | null = null;
let currentOscillator: OscillatorNode | null = null;
let currentGain: GainNode | null = null;

const stopRingtoneAudio = () => {
  if (ringtoneInterval) {
    clearInterval(ringtoneInterval);
    ringtoneInterval = null;
  }
  if (currentOscillator) {
    try { currentOscillator.stop(); } catch (_) {}
    currentOscillator = null;
  }
  if (currentGain) {
    currentGain.disconnect();
    currentGain = null;
  }
};

const playRingtoneLoop = () => {
  if (!isNotificationSoundEnabled()) return;

  try {
    if (!audioContext) audioContext = new AudioContext();
    const ctx = audioContext;
    if (ctx.state === 'suspended') ctx.resume();

    const volume = getNotificationVolume();
    let isHighTone = true;

    const playTone = () => {
      if (currentOscillator) {
        try { currentOscillator.stop(); } catch (_) {}
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(isHighTone ? 440 : 523, ctx.currentTime);
      osc.type = 'sine';

      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.25 * volume, ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.25 * volume, ctx.currentTime + 0.8);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.0);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 1.0);

      currentOscillator = osc;
      currentGain = gain;
      isHighTone = !isHighTone;
    };

    playTone();
    ringtoneInterval = setInterval(playTone, 1200);
  } catch (error) {
    console.warn('Could not play ringtone:', error);
  }
};

export function useIncomingWhatsAppCall() {
  const [incomingCall, setIncomingCall] = useState<IncomingWhatsAppCall | null>(null);
  const callRef = useRef<IncomingWhatsAppCall | null>(null);

  const enrichCallWithContact = useCallback(async (callData: any): Promise<IncomingWhatsAppCall> => {
    let contactName: string | null = null;
    let contactPhoto: string | null = null;

    if (callData.contact_id) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('name, call_name, profile_picture_url, phone_number')
        .eq('id', callData.contact_id)
        .maybeSingle();

      if (contact) {
        contactName = contact.name || contact.call_name || null;
        contactPhoto = contact.profile_picture_url || null;
      }
    }

    return {
      id: callData.id,
      whatsapp_call_id: callData.whatsapp_call_id,
      contact_id: callData.contact_id,
      conversation_id: callData.conversation_id,
      direction: callData.direction,
      status: callData.status,
      phone_number_id: callData.phone_number_id,
      from_number: callData.from_number,
      to_number: callData.to_number,
      sdp_offer: callData.sdp_offer,
      started_at: callData.started_at,
      metadata: callData.metadata || {},
      contact_name: contactName,
      contact_photo: contactPhoto,
    };
  }, []);

  const dismissCall = useCallback(() => {
    stopRingtoneAudio();
    setIncomingCall(null);
    callRef.current = null;
  }, []);

  const stopRingtone = useCallback(() => {
    stopRingtoneAudio();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('whatsapp-calls-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'whatsapp_calls',
          filter: 'direction=eq.inbound',
        },
        async (payload) => {
          const newCall = payload.new as any;
          if (newCall.status === 'ringing') {
            console.log('Incoming WhatsApp call:', newCall.id);
            const enrichedCall = await enrichCallWithContact(newCall);
            callRef.current = enrichedCall;
            setIncomingCall(enrichedCall);
            playRingtoneLoop();
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
        (payload) => {
          const updated = payload.new as any;
          const currentCall = callRef.current;

          if (!currentCall || currentCall.id !== updated.id) return;

          if (['answered', 'ended', 'rejected', 'missed', 'failed'].includes(updated.status)) {
            stopRingtoneAudio();

            if (updated.status === 'answered') {
              // Keep modal open for active call
              setIncomingCall(prev => prev ? { ...prev, status: 'answered' } : null);
            } else {
              // Call ended/rejected/missed — dismiss
              setIncomingCall(null);
              callRef.current = null;
            }
          }
        }
      )
      .subscribe();

    return () => {
      stopRingtoneAudio();
      supabase.removeChannel(channel);
    };
  }, [enrichCallWithContact]);

  return { incomingCall, dismissCall, stopRingtone };
}
