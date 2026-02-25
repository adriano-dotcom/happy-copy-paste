import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, Mic, MicOff, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

// ── Debug helpers (same as IncomingCallModal) ──

function ts() {
  return new Date().toISOString();
}

function logSdpDetails(label: string, sdp: string | undefined) {
  if (!sdp) { console.warn(`[WebRTC][${ts()}] ${label}: SDP is empty/undefined`); return; }
  const lines = sdp.split('\r\n');
  const interesting = lines.filter(l =>
    l.startsWith('m=audio') ||
    l.startsWith('a=rtpmap') ||
    l.startsWith('a=setup') ||
    l.startsWith('a=candidate') ||
    l.startsWith('a=ice-ufrag') ||
    l.startsWith('a=ice-pwd')
  );
  console.log(`[WebRTC][${ts()}] ${label} SDP details:`, interesting);
}

async function logPeerStats(pc: RTCPeerConnection) {
  try {
    const stats = await pc.getStats();
    stats.forEach(report => {
      if (report.type === 'candidate-pair' && report.state === 'succeeded') {
        console.log(`[WebRTC][${ts()}] Active pair — bytesSent: ${report.bytesSent}, bytesReceived: ${report.bytesReceived}`);
      }
      if (report.type === 'inbound-rtp' && report.kind === 'audio') {
        console.log(`[WebRTC][${ts()}] Inbound audio — packets: ${report.packetsReceived}, lost: ${report.packetsLost}`);
      }
    });
  } catch (e) {
    console.warn(`[WebRTC][${ts()}] getStats() failed:`, e);
  }
}

function fixSdpForMeta(sdp: string): string {
  return sdp.split('\r\n').map(line => {
    if (line.startsWith('a=setup:')) return 'a=setup:actpass';
    return line;
  }).join('\r\n');
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.services.mozilla.com:3478' },
];

// ── Component ──

interface OutboundCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: {
    id: string;
    name: string;
    phone: string;
    avatar?: string | null;
  };
  conversationId?: string;
}

export const OutboundCallModal: React.FC<OutboundCallModalProps> = ({
  isOpen,
  onClose,
  contact,
  conversationId,
}) => {
  const [callStatus, setCallStatus] = useState<'initializing' | 'calling' | 'ringing' | 'answered' | 'ended'>('initializing');
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [callDbId, setCallDbId] = useState<string | null>(null);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const realtimeChannelRef = useRef<any>(null);
  const startTimeRef = useRef<number>(0);

  const cleanup = useCallback(() => {
    if (statsIntervalRef.current) { clearInterval(statsIntervalRef.current); statsIntervalRef.current = null; }
    if (durationIntervalRef.current) { clearInterval(durationIntervalRef.current); durationIntervalRef.current = null; }
    if (realtimeChannelRef.current) { supabase.removeChannel(realtimeChannelRef.current); realtimeChannelRef.current = null; }
    if (peerConnectionRef.current) { peerConnectionRef.current.close(); peerConnectionRef.current = null; }
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
    if (remoteAudioRef.current) { remoteAudioRef.current.pause(); remoteAudioRef.current.srcObject = null; remoteAudioRef.current = null; }
    setIsMuted(false);
    setCallDuration(0);
    setCallDbId(null);
  }, []);

  // Duration timer
  useEffect(() => {
    if (callStatus === 'answered') {
      setCallDuration(0);
      durationIntervalRef.current = setInterval(() => setCallDuration(prev => prev + 1), 1000);
    }
    return () => {
      if (durationIntervalRef.current) { clearInterval(durationIntervalRef.current); durationIntervalRef.current = null; }
    };
  }, [callStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  // Main call initiation flow
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    const initiateCall = async () => {
      setCallStatus('initializing');
      startTimeRef.current = performance.now();

      // Unlock audio context in user gesture context
      const audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      audioCtx.close();

      const audio = new Audio();
      audio.autoplay = true;
      audio.volume = 1;
      remoteAudioRef.current = audio;

      try {
        // 1. Get microphone
        console.log(`[WebRTC][${ts()}] Outbound: requesting microphone...`);
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          console.log(`[WebRTC][${ts()}] Microphone acquired`);
        } catch (micError: any) {
          console.warn(`[WebRTC][${ts()}] Mic unavailable: ${micError.message}. Using silent track.`);
          toast.warning('Microfone indisponível. Você pode ouvir, mas não falar.');
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          const dst = ctx.createMediaStreamDestination();
          osc.connect(dst);
          osc.start();
          osc.frequency.setValueAtTime(0, ctx.currentTime);
          stream = dst.stream;
        }
        localStreamRef.current = stream;
        if (cancelled) return;

        // 2. Create RTCPeerConnection
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        peerConnectionRef.current = pc;

        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        // Remote audio track handler
        pc.ontrack = (event) => {
          console.log(`[WebRTC][${ts()}] Outbound: ontrack — kind: ${event.track.kind}`);
          if (event.track.kind === 'audio' && remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = event.streams[0];
            remoteAudioRef.current.play().catch(err => {
              console.warn(`[WebRTC][${ts()}] Audio play failed:`, err);
            });
          }
        };

        pc.onconnectionstatechange = () => {
          console.log(`[WebRTC][${ts()}] Outbound connection state: ${pc.connectionState}`);
          if (pc.connectionState === 'connected') {
            const elapsed = (performance.now() - startTimeRef.current).toFixed(0);
            console.log(`[WebRTC][${ts()}] ✓ Outbound connected! ${elapsed}ms`);
            if (!cancelled) setCallStatus('answered');
            // Start stats logging
            statsIntervalRef.current = setInterval(() => {
              if (pc.connectionState === 'closed') { clearInterval(statsIntervalRef.current!); return; }
              logPeerStats(pc);
            }, 5000);
          }
          if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
            setTimeout(() => {
              if (peerConnectionRef.current && ['disconnected', 'failed', 'closed'].includes(peerConnectionRef.current.connectionState)) {
                console.log(`[WebRTC][${ts()}] Outbound connection lost — closing`);
                if (!cancelled) { setCallStatus('ended'); cleanup(); onClose(); }
              }
            }, 2000);
          }
        };

        // 3. Create SDP offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        console.log(`[WebRTC][${ts()}] Outbound: offer created, waiting for ICE...`);

        // Wait for ICE gathering (max 3s)
        if (pc.iceGatheringState !== 'complete') {
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => { console.warn(`[WebRTC][${ts()}] ICE timeout 3s`); resolve(); }, 3000);
            pc.addEventListener('icegatheringstatechange', () => {
              if (pc.iceGatheringState === 'complete') { clearTimeout(timeout); resolve(); }
            });
          });
        }

        if (cancelled) return;

        const fullSdp = fixSdpForMeta(pc.localDescription?.sdp || '');
        logSdpDetails('OUTBOUND OFFER', fullSdp);

        // 4. Send to edge function
        setCallStatus('calling');
        console.log(`[WebRTC][${ts()}] Sending offer to whatsapp-call-initiate...`);

        const { data, error } = await supabase.functions.invoke('whatsapp-call-initiate', {
          body: {
            contact_id: contact.id,
            to_number: contact.phone,
            sdp_offer: fullSdp,
            conversation_id: conversationId,
          },
        });

        if (error || !data?.success) {
          let errorMsg = data?.error || error?.message || 'Failed to initiate call';
          let errorCode = data?.error_code;
          
          // Extract error details from FunctionsHttpError context (Response object)
          if (!errorCode && error?.context) {
            try {
              const ctx = error.context;
              if (typeof ctx.json === 'function') {
                const body = await ctx.json();
                errorCode = body?.error_code;
                errorMsg = body?.error || errorMsg;
              }
            } catch { /* fallback to generic */ }
          }
          console.error(`[WebRTC][${ts()}] Initiate error (code=${errorCode}):`, errorMsg);

          // Handle specific Meta error codes - send permission request message
          if (errorCode === 138021 || errorCode === 138000 || errorCode === 138006) {
            toast.error('O lead não habilitou chamadas WhatsApp. Enviando mensagem pedindo autorização...');
            // Send a WhatsApp message asking the lead to enable calls
            try {
              await supabase.functions.invoke('whatsapp-sender', {
                body: {
                  to: contact.phone,
                  message: '📞 Tentamos ligar para você pelo WhatsApp, mas as chamadas não estão habilitadas.\n\nPara ativar, acesse:\n*Configurações > Privacidade > Chamadas* e permita chamadas de empresas.\n\nAssim poderemos conversar por voz! 😊',
                  conversation_id: conversationId,
                  contact_id: contact.id,
                },
              });
              toast.success('Mensagem de solicitação de permissão enviada ao lead.');
            } catch (msgErr) {
              console.error('Failed to send call permission request:', msgErr);
            }
          } else {
            toast.error(`Erro ao iniciar chamada: ${errorMsg}`);
          }

          cleanup();
          onClose();
          return;
        }

        const dbCallId = data.call_id;
        setCallDbId(dbCallId);
        console.log(`[WebRTC][${ts()}] Call initiated: db_id=${dbCallId}`);

        // 5. Listen for SDP answer via Realtime
        const channel = supabase
          .channel(`outbound-call-${dbCallId}`)
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'whatsapp_calls',
              filter: `id=eq.${dbCallId}`,
            },
            async (payload: any) => {
              const updatedCall = payload.new;
              console.log(`[WebRTC][${ts()}] Realtime update: status=${updatedCall.status}, has_sdp_answer=${!!updatedCall.sdp_answer}`);

              if (updatedCall.sdp_answer && pc.signalingState === 'have-local-offer') {
                console.log(`[WebRTC][${ts()}] Received SDP answer from lead, setting remote description...`);
                logSdpDetails('REMOTE ANSWER', updatedCall.sdp_answer);

                try {
                  await pc.setRemoteDescription(new RTCSessionDescription({
                    type: 'answer',
                    sdp: updatedCall.sdp_answer,
                  }));
                  console.log(`[WebRTC][${ts()}] Remote description set successfully`);
                  if (!cancelled) setCallStatus('ringing');
                } catch (err) {
                  console.error(`[WebRTC][${ts()}] Failed to set remote description:`, err);
                  toast.error('Erro na negociação WebRTC');
                  cleanup();
                  onClose();
                }
              }

              // Handle terminal statuses from webhook
              if (['ended', 'missed', 'rejected', 'failed'].includes(updatedCall.status)) {
                console.log(`[WebRTC][${ts()}] Call ended: ${updatedCall.status}`);
                if (updatedCall.status === 'missed') {
                  toast.info('O lead não atendeu a chamada');
                }
                if (!cancelled) { setCallStatus('ended'); cleanup(); onClose(); }
              }
            }
          )
          .subscribe();

        realtimeChannelRef.current = channel;

        // 6. Timeout: auto-dismiss after 60s if no answer
        setTimeout(() => {
          if (!cancelled && callStatus !== 'answered') {
            console.warn(`[WebRTC][${ts()}] Outbound call timeout 60s`);
            toast.info('Chamada não atendida');
            cleanup();
            onClose();
          }
        }, 60000);

      } catch (err: any) {
        console.error(`[WebRTC][${ts()}] Outbound call error:`, err);

        // Extract Meta error code from Supabase error context (non-2xx responses)
        let errorCode: number | undefined;
        let errorMsg = err.message || 'Erro desconhecido';
        try {
          const ctx = err?.context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            errorCode = body?.error_code;
            errorMsg = body?.error || errorMsg;
            console.log(`[WebRTC][${ts()}] Extracted error from context: code=${errorCode}, msg=${errorMsg}`);
          }
        } catch { /* fallback to generic message */ }

        if (errorCode === 138021 || errorCode === 138000 || errorCode === 138006) {
          toast.error('O lead não habilitou chamadas WhatsApp. Enviando mensagem pedindo autorização...');
          try {
            await supabase.functions.invoke('whatsapp-sender', {
              body: {
                to: contact.phone,
                message: '📞 Tentamos ligar para você pelo WhatsApp, mas as chamadas não estão habilitadas.\n\nPara ativar, acesse:\n*Configurações > Privacidade > Chamadas* e permita chamadas de empresas.\n\nAssim poderemos conversar por voz! 😊',
                conversation_id: conversationId,
                contact_id: contact.id,
              },
            });
            toast.success('Mensagem de solicitação de permissão enviada ao lead.');
          } catch (msgErr) {
            console.error('Failed to send call permission request:', msgErr);
          }
        } else {
          toast.error(`Erro ao iniciar chamada: ${errorMsg}`);
        }

        cleanup();
        onClose();
      }
    };

    initiateCall();

    return () => {
      cancelled = true;
    };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleHangup = async () => {
    if (callDbId) {
      try {
        await supabase.functions.invoke('whatsapp-call-terminate', {
          body: { call_id: callDbId },
        });
      } catch (error) {
        console.error('Error terminating outbound call:', error);
      }
    }
    cleanup();
    onClose();
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

  const getStatusText = () => {
    switch (callStatus) {
      case 'initializing': return 'Preparando chamada...';
      case 'calling': return 'Chamando...';
      case 'ringing': return 'Tocando...';
      case 'answered': return formatDuration(callDuration);
      case 'ended': return 'Chamada encerrada';
    }
  };

  const isCalling = ['initializing', 'calling', 'ringing'].includes(callStatus);

  return (
    <AnimatePresence>
      {isOpen && (
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
              {isCalling && (
                <>
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-green-400/40"
                    animate={{ scale: [1, 1.6], opacity: [0.6, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
                    style={{ width: 128, height: 128, top: -8, left: -8 }}
                  />
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-green-400/20"
                    animate={{ scale: [1, 2], opacity: [0.4, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut', delay: 0.3 }}
                    style={{ width: 128, height: 128, top: -8, left: -8 }}
                  />
                </>
              )}
              <div className="w-28 h-28 rounded-full bg-slate-800 border-2 border-green-500/50 flex items-center justify-center overflow-hidden">
                {contact.avatar ? (
                  <img src={contact.avatar} alt={contact.name} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-12 h-12 text-slate-400" />
                )}
              </div>
            </div>

            {/* Name and status */}
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-white">{contact.name || contact.phone}</h2>
              {contact.name && (
                <p className="text-slate-400 mt-1">{contact.phone}</p>
              )}
              <p className="text-sm text-green-400 mt-2 flex items-center justify-center gap-2">
                <Phone className="w-4 h-4" />
                {getStatusText()}
              </p>
              <p className="text-xs text-slate-500 mt-1">Chamada WhatsApp</p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-6 mt-4">
              {callStatus === 'answered' && (
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
              )}

              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleHangup}
                className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center shadow-lg shadow-red-600/30 transition-colors"
              >
                <PhoneOff className="w-7 h-7 text-white" />
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
