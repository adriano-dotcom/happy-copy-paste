import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, Mic, MicOff, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { IncomingWhatsAppCall } from '@/hooks/useIncomingWhatsAppCall';

interface IncomingCallModalProps {
  call: IncomingWhatsAppCall | null;
  onDismiss: () => void;
  onStopRingtone: () => void;
}

export const IncomingCallModal: React.FC<IncomingCallModalProps> = ({ call, onDismiss, onStopRingtone }) => {
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isAccepting, setIsAccepting] = useState(false);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Duration timer
  useEffect(() => {
    if (call?.status === 'answered') {
      setCallDuration(0);
      durationIntervalRef.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
    };
  }, [call?.status]);

  const cleanup = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    setIsMuted(false);
    setCallDuration(0);
  }, []);

  // Cleanup on unmount or call gone
  useEffect(() => {
    if (!call) cleanup();
    return cleanup;
  }, [call, cleanup]);

  const handleAccept = async () => {
    if (!call || isAccepting) return;
    setIsAccepting(true);
    onStopRingtone();

    try {
      // 1. Get microphone
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      // 2. Create RTCPeerConnection
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      });
      peerConnectionRef.current = pc;

      // Add local audio track
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // Handle remote audio
      pc.ontrack = (event) => {
        const audio = new Audio();
        audio.srcObject = event.streams[0];
        audio.play().catch(console.warn);
      };

      // 3. Set remote SDP offer
      if (call.sdp_offer) {
        await pc.setRemoteDescription(new RTCSessionDescription({
          type: 'offer',
          sdp: call.sdp_offer,
        }));
      }

      // 4. Create SDP answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // 5. Send accept to edge function
      const { error } = await supabase.functions.invoke('whatsapp-call-accept', {
        body: {
          call_id: call.id,
          sdp_answer: answer.sdp,
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to accept call');
      }

      console.log('Call accepted successfully');
    } catch (error: any) {
      console.error('Error accepting call:', error);
      toast.error('Erro ao atender chamada: ' + (error.message || 'Erro desconhecido'));
      cleanup();
      onDismiss();
    } finally {
      setIsAccepting(false);
    }
  };

  const handleReject = async () => {
    if (!call) return;
    onStopRingtone();

    try {
      await supabase.functions.invoke('whatsapp-call-reject', {
        body: { call_id: call.id },
      });
    } catch (error) {
      console.error('Error rejecting call:', error);
    }

    cleanup();
    onDismiss();
  };

  const handleHangup = async () => {
    if (!call) return;

    try {
      await supabase.functions.invoke('whatsapp-call-terminate', {
        body: { call_id: call.id },
      });
    } catch (error) {
      console.error('Error terminating call:', error);
    }

    cleanup();
    onDismiss();
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const displayName = call?.contact_name || call?.from_number || 'Número desconhecido';
  const displayNumber = call?.from_number || '';
  const isRinging = call?.status === 'ringing';
  const isAnswered = call?.status === 'answered';

  return (
    <AnimatePresence>
      {call && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 backdrop-blur-xl"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            className="flex flex-col items-center gap-8 max-w-sm w-full px-6"
          >
            {/* Avatar with pulse ring */}
            <div className="relative">
              {isRinging && (
                <>
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-cyan-400/40"
                    animate={{ scale: [1, 1.6], opacity: [0.6, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
                    style={{ width: 128, height: 128, top: -8, left: -8 }}
                  />
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-cyan-400/20"
                    animate={{ scale: [1, 2], opacity: [0.4, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut', delay: 0.3 }}
                    style={{ width: 128, height: 128, top: -8, left: -8 }}
                  />
                </>
              )}
              <div className="w-28 h-28 rounded-full bg-slate-800 border-2 border-cyan-500/50 flex items-center justify-center overflow-hidden">
                {call.contact_photo ? (
                  <img src={call.contact_photo} alt={displayName} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-12 h-12 text-slate-400" />
                )}
              </div>
            </div>

            {/* Name and number */}
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-white">{displayName}</h2>
              {call.contact_name && displayNumber && (
                <p className="text-slate-400 mt-1">{displayNumber}</p>
              )}
              <p className="text-sm text-cyan-400 mt-2">
                {isRinging && 'Chamada WhatsApp recebida...'}
                {isAnswered && formatDuration(callDuration)}
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-6 mt-4">
              {isRinging && (
                <>
                  {/* Reject */}
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleReject}
                    className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center shadow-lg shadow-red-600/30 transition-colors"
                  >
                    <PhoneOff className="w-7 h-7 text-white" />
                  </motion.button>

                  {/* Accept */}
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleAccept}
                    disabled={isAccepting}
                    className="w-20 h-20 rounded-full bg-green-600 hover:bg-green-500 flex items-center justify-center shadow-lg shadow-green-600/30 transition-colors disabled:opacity-50"
                  >
                    <Phone className="w-8 h-8 text-white" />
                  </motion.button>
                </>
              )}

              {isAnswered && (
                <>
                  {/* Mute */}
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={toggleMute}
                    className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                      isMuted ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-slate-700 hover:bg-slate-600'
                    }`}
                  >
                    {isMuted ? <MicOff className="w-6 h-6 text-white" /> : <Mic className="w-6 h-6 text-white" />}
                  </motion.button>

                  {/* Hangup */}
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleHangup}
                    className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center shadow-lg shadow-red-600/30 transition-colors"
                  >
                    <PhoneOff className="w-7 h-7 text-white" />
                  </motion.button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
