import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, Mic, MicOff, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { IncomingWhatsAppCall } from '@/hooks/useIncomingWhatsAppCall';

// ── Debug helpers ──────────────────────────────────────────────

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
  const hasCandidates = lines.some(l => l.startsWith('a=candidate'));
  console.log(`[WebRTC][${ts()}] ${label} has inline ICE candidates: ${hasCandidates} (${hasCandidates ? 'full' : 'trickle'} ICE)`);
}

function logAudioState(audio: HTMLAudioElement | null, track: MediaStreamTrack | null) {
  if (audio) {
    const srcTracks = audio.srcObject instanceof MediaStream ? audio.srcObject.getTracks() : [];
    console.log(`[WebRTC][${ts()}] Audio element — paused: ${audio.paused}, volume: ${audio.volume}, muted: ${audio.muted}, srcObject tracks: ${srcTracks.length}`);
    srcTracks.forEach((t, i) => {
      console.log(`[WebRTC][${ts()}]   srcObject track[${i}]: kind=${t.kind} enabled=${t.enabled} muted=${t.muted} readyState=${t.readyState}`);
    });
  } else {
    console.warn(`[WebRTC][${ts()}] Audio element is null`);
  }
  if (track) {
    console.log(`[WebRTC][${ts()}] Remote track — kind: ${track.kind}, enabled: ${track.enabled}, muted: ${track.muted}, readyState: ${track.readyState}`);
  }
  // AudioContext state
  try {
    const ctx = new AudioContext();
    console.log(`[WebRTC][${ts()}] AudioContext state: ${ctx.state}`);
    ctx.close();
  } catch (e) {
    console.warn(`[WebRTC][${ts()}] AudioContext check failed:`, e);
  }
}

async function logPeerStats(pc: RTCPeerConnection) {
  try {
    const stats = await pc.getStats();
    stats.forEach(report => {
      if (report.type === 'candidate-pair' && report.state === 'succeeded') {
        console.log(`[WebRTC][${ts()}] Active candidate pair — local: ${report.localCandidateId}, remote: ${report.remoteCandidateId}, bytesSent: ${report.bytesSent}, bytesReceived: ${report.bytesReceived}`);
      }
      if (report.type === 'inbound-rtp' && report.kind === 'audio') {
        console.log(`[WebRTC][${ts()}] Inbound audio RTP — packetsReceived: ${report.packetsReceived}, bytesReceived: ${report.bytesReceived}, packetsLost: ${report.packetsLost}, jitter: ${report.jitter}`);
      }
      if (report.type === 'outbound-rtp' && report.kind === 'audio') {
        console.log(`[WebRTC][${ts()}] Outbound audio RTP — packetsSent: ${report.packetsSent}, bytesSent: ${report.bytesSent}`);
      }
      if (report.type === 'codec') {
        console.log(`[WebRTC][${ts()}] Codec — mimeType: ${report.mimeType}, clockRate: ${report.clockRate}, channels: ${report.channels}`);
      }
    });
  } catch (e) {
    console.warn(`[WebRTC][${ts()}] getStats() failed:`, e);
  }
}

// ── SDP fix for Meta ───────────────────────────────────────────

function fixSdpForMeta(sdp: string): string {
  const lines = sdp.split('\r\n');
  const fixed = lines.map(line => {
    if (line.startsWith('a=setup:')) {
      console.log(`[WebRTC][${ts()}] Original SDP setup line: ${line}`);
      return 'a=setup:active';
    }
    return line;
  });
  const result = fixed.join('\r\n');
  console.log(`[WebRTC][${ts()}] Modified SDP (first 5 lines):`, result.split('\r\n').slice(0, 5).join(' | '));
  return result;
}

// ── ICE config ─────────────────────────────────────────────────

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.services.mozilla.com:3478' },
];

// ── Component ──────────────────────────────────────────────────

interface IncomingCallModalProps {
  call: IncomingWhatsAppCall | null;
  onDismiss: () => void;
  onStopRingtone: () => void;
}

export const IncomingCallModal: React.FC<IncomingCallModalProps> = ({ call, onDismiss, onStopRingtone }) => {
  const [isMuted, setIsMuted] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isAccepting, setIsAccepting] = useState(false);
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const [localCallData, setLocalCallData] = useState<IncomingWhatsAppCall | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const remoteTrackRef = useRef<MediaStreamTrack | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioMonitorRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const acceptStartRef = useRef<number>(0);
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ICE candidate counters
  const iceCandidateCountRef = useRef<Record<string, number>>({ host: 0, srflx: 0, relay: 0, prflx: 0, unknown: 0 });

  // Sync localStatus when call.status changes externally
  useEffect(() => {
    if (call?.status && call.status !== 'ringing') {
      setLocalStatus(call.status);
    }
  }, [call?.status]);

  // Reset localStatus when call disappears
  useEffect(() => {
    if (!call) setLocalStatus(null);
  }, [call]);

  // Use localCallData as fallback when hook dismisses the call
  const activeCall = call || localCallData;
  const effectiveStatus = localStatus || activeCall?.status;

  // Duration timer
  useEffect(() => {
    if (effectiveStatus === 'answered') {
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
  }, [effectiveStatus]);


  const cleanup = useCallback(() => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }
    if (audioMonitorRef.current) {
      clearInterval(audioMonitorRef.current);
      audioMonitorRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current = null;
    }
    remoteTrackRef.current = null;
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    setIsMuted(false);
    setCallDuration(0);
    iceCandidateCountRef.current = { host: 0, srflx: 0, relay: 0, prflx: 0, unknown: 0 };
  }, []);

  // Cleanup on unmount or call gone (but NOT if we're in an active answered call)
  useEffect(() => {
    if (!call && localStatus !== 'answered') cleanup();
    return () => {
      // Only cleanup on unmount if not answered
      if (localStatus !== 'answered') cleanup();
    };
  }, [call, cleanup, localStatus]);

  // Safety polling: check DB status every 3s for ANY active call
  useEffect(() => {
    const callId = call?.id || localCallData?.id;
    if (!callId) return;

    const terminalStatuses = ['ended', 'rejected', 'missed', 'failed'];
    const pollId = setInterval(async () => {
      try {
        const { data, error } = await supabase
          .from('whatsapp_calls')
          .select('id, status')
          .eq('id', callId)
          .single();

        if (error) {
          console.error(`[WebRTC][Polling] Error fetching call status:`, error);
          return;
        }
        if (!data) return;

        // Terminal status → close modal
        if (terminalStatuses.includes(data.status)) {
          console.log(`[WebRTC][Polling] Call ${callId} ended with status: ${data.status}. Closing modal.`);
          setLocalCallData(null);
          setLocalStatus(null);
          cleanup();
          onDismiss();
          return;
        }

        // DB says answered but frontend still ringing → answered elsewhere
        if (data.status === 'answered' && !localStatus) {
          console.log(`[WebRTC][Polling] Call ${callId} answered elsewhere. Closing modal.`);
          setLocalCallData(null);
          cleanup();
          onDismiss();
        }
      } catch (err) {
        console.error(`[WebRTC][Polling] Unexpected error:`, err);
      }
    }, 3000);

    return () => clearInterval(pollId);
  }, [call?.id, localCallData?.id, localStatus, cleanup, onDismiss]);

  // Absolute timeout: auto-dismiss modal after 60s regardless of status
  useEffect(() => {
    if (!call?.id) return;
    const timeout = setTimeout(() => {
      console.warn(`[WebRTC][${ts()}] Absolute 60s timeout reached — auto-closing modal for call ${call.id}`);
      cleanup();
      onDismiss();
    }, 60000);
    return () => clearTimeout(timeout);
  }, [call?.id, cleanup, onDismiss]);

  const handleAccept = async () => {
    if (!call || isAccepting) return;
    setIsAccepting(true);
    setLocalStatus('answered'); // Optimistic UI update
    setLocalCallData(call); // Persist call data locally so modal survives hook dismissal
    acceptStartRef.current = performance.now();
    console.log(`[WebRTC][${ts()}] ▶ Accept clicked — starting call flow (optimistic UI set to answered)`);
    onStopRingtone();

    // Total timeout: if handleAccept takes longer than 20s, cleanup
    const totalTimeoutId = setTimeout(() => {
      console.warn(`[WebRTC][${ts()}] handleAccept total timeout (20s) — cleaning up`);
      cleanup();
      onDismiss();
    }, 20000);

    // Unlock audio pipeline in user gesture context
    const audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    // Create silent oscillator to fully unlock audio output
    const silentOsc = audioCtx.createOscillator();
    const silentGain = audioCtx.createGain();
    silentGain.gain.value = 0;
    silentOsc.connect(silentGain);
    silentGain.connect(audioCtx.destination);
    silentOsc.start();
    silentOsc.stop(audioCtx.currentTime + 0.1);

    const audio = new Audio();
    audio.autoplay = true;
    audio.volume = 1;
    audio.muted = false;
    remoteAudioRef.current = audio;

    try {
      // 1. Get microphone (with listen-only fallback)
      console.log(`[WebRTC][${ts()}] Requesting microphone...`);
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        console.log(`[WebRTC][${ts()}] Microphone acquired — tracks: ${stream.getAudioTracks().length}`);
      } catch (micError: any) {
        console.warn(`[WebRTC][${ts()}] Microphone unavailable: ${micError.message}. Using silent track (listen-only).`);
        toast.warning('Microfone indisponível. Você pode ouvir, mas não falar.');
        const ctx = new AudioContext();
        const oscillator = ctx.createOscillator();
        const dst = ctx.createMediaStreamDestination();
        oscillator.connect(dst);
        oscillator.start();
        stream = dst.stream;
        oscillator.frequency.setValueAtTime(0, ctx.currentTime);
      }
      localStreamRef.current = stream;

      // 2. Create RTCPeerConnection
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peerConnectionRef.current = pc;

      // Add local audio track
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // ── Event handlers ──

      // Signaling state
      pc.onsignalingstatechange = () => {
        console.log(`[WebRTC][${ts()}] Signaling state: ${pc.signalingState}`);
      };

      // ICE candidate errors
      (pc as any).onicecandidateerror = (event: any) => {
        console.warn(`[WebRTC][${ts()}] ICE candidate error — code: ${event.errorCode}, text: ${event.errorText}, url: ${event.url}`);
      };

      // ICE candidates with counting
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const type = event.candidate.type || 'unknown';
          iceCandidateCountRef.current[type] = (iceCandidateCountRef.current[type] || 0) + 1;
          console.log(`[WebRTC][${ts()}] ICE candidate: type=${event.candidate.type} protocol=${event.candidate.protocol} address=${event.candidate.address}`);
        } else {
          console.log(`[WebRTC][${ts()}] ICE gathering done (null candidate). Summary:`, { ...iceCandidateCountRef.current });
        }
      };

      // ICE gathering state
      pc.onicegatheringstatechange = () => {
        console.log(`[WebRTC][${ts()}] ICE gathering state: ${pc.iceGatheringState}`);
      };

      // Connection state
      pc.onconnectionstatechange = () => {
        console.log(`[WebRTC][${ts()}] Connection state: ${pc.connectionState}`);
        if (pc.connectionState === 'connected') {
          const elapsed = (performance.now() - acceptStartRef.current).toFixed(0);
          console.log(`[WebRTC][${ts()}] ✓ Connected! Time since accept click: ${elapsed}ms`);
          setTimeout(() => logPeerStats(pc), 2000);
        }
        // Auto-dismiss on WebRTC disconnection (with 2s grace period)
        if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
          console.warn(`[WebRTC][${ts()}] Connection ${pc.connectionState} — starting 2s grace period`);
          setTimeout(() => {
            if (peerConnectionRef.current && ['disconnected', 'failed', 'closed'].includes(peerConnectionRef.current.connectionState)) {
              console.log(`[WebRTC][${ts()}] Connection still ${peerConnectionRef.current.connectionState} after grace period — closing modal`);
              cleanup();
              onDismiss();
            } else {
              console.log(`[WebRTC][${ts()}] Connection recovered after grace period`);
            }
          }, 2000);
        }
      };

      // ICE connection state
      pc.oniceconnectionstatechange = () => {
        console.log(`[WebRTC][${ts()}] ICE connection state: ${pc.iceConnectionState}`);
      };

      // Remote audio track
      pc.ontrack = (event) => {
        console.log(`[WebRTC][${ts()}] ontrack — kind: ${event.track.kind}, readyState: ${event.track.readyState}, streams: ${event.streams.length}`);
        if (event.track.kind === 'audio') {
          remoteTrackRef.current = event.track;
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = event.streams[0];
            remoteAudioRef.current.volume = 1;
            remoteAudioRef.current.muted = false;
            const tryPlay = () => {
              remoteAudioRef.current?.play()
                .then(() => {
                  const elapsed = (performance.now() - acceptStartRef.current).toFixed(0);
                  console.log(`[WebRTC][${ts()}] ✓ Audio playing successfully! Time since accept: ${elapsed}ms`);
                  logAudioState(remoteAudioRef.current, event.track);
                })
                .catch(err => {
                  console.warn(`[WebRTC][${ts()}] Audio play failed, retrying in 500ms:`, err);
                  setTimeout(tryPlay, 500);
                });
            };
            tryPlay();
          }
          event.track.onunmute = () => console.log(`[WebRTC][${ts()}] Remote audio track unmuted`);
          event.track.onended = () => console.log(`[WebRTC][${ts()}] Remote audio track ended`);
          event.track.onmute = () => console.log(`[WebRTC][${ts()}] Remote audio track muted`);

          // Start audio monitor: log state every 1s for 5 iterations
          let monitorCount = 0;
          if (audioMonitorRef.current) clearInterval(audioMonitorRef.current);
          audioMonitorRef.current = setInterval(() => {
            monitorCount++;
            console.log(`[WebRTC][${ts()}] Audio monitor [${monitorCount}/5]:`);
            logAudioState(remoteAudioRef.current, remoteTrackRef.current);
            if (monitorCount >= 5) {
              clearInterval(audioMonitorRef.current!);
              audioMonitorRef.current = null;
              console.log(`[WebRTC][${ts()}] Audio monitor finished`);
            }
          }, 1000);
        }
      };

      // 3. Log and set remote SDP offer
      if (call.sdp_offer) {
        console.log(`[WebRTC][${ts()}] Setting remote SDP offer...`);
        logSdpDetails('OFFER', call.sdp_offer);
        await pc.setRemoteDescription(new RTCSessionDescription({
          type: 'offer',
          sdp: call.sdp_offer,
        }));
        console.log(`[WebRTC][${ts()}] Remote description set`);
      }

      // 4. Create SDP answer
      const answer = await pc.createAnswer();
      console.log(`[WebRTC][${ts()}] Answer created`);
      logSdpDetails('ANSWER (before fix)', answer.sdp);
      await pc.setLocalDescription(answer);
      console.log(`[WebRTC][${ts()}] Local description set, ICE gathering state: ${pc.iceGatheringState}`);

      // 4b. Wait for ICE gathering to complete (max 3s) so SDP includes a=candidate lines
      if (pc.iceGatheringState !== 'complete') {
        console.log(`[WebRTC][${ts()}] Waiting for ICE gathering to complete...`);
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            console.warn(`[WebRTC][${ts()}] ICE gathering timeout (3s), sending with available candidates`);
            resolve();
          }, 3000);
          pc.addEventListener('icegatheringstatechange', () => {
            if (pc.iceGatheringState === 'complete') {
              console.log(`[WebRTC][${ts()}] ICE gathering complete`);
              clearTimeout(timeout);
              resolve();
            }
          });
        });
      }

      // 5. Send pre_accept with full SDP (including ICE candidates)
      const fullSdp = fixSdpForMeta(pc.localDescription?.sdp || '');
      console.log(`[WebRTC][${ts()}] Sending pre_accept with full SDP...`);
      logSdpDetails('ANSWER (with ICE candidates)', fullSdp);

      const { data: preAcceptData, error: preAcceptError } = await supabase.functions.invoke('whatsapp-call-accept', {
        body: {
          call_id: call.id,
          sdp_answer: fullSdp,
          action: 'pre_accept',
        },
      });

      if (preAcceptError) {
        throw new Error(preAcceptError.message || 'pre_accept failed');
      }

      console.log(`[WebRTC][${ts()}] pre_accept completed:`, preAcceptData);

      // 6. Wait for connectionState === 'connected' before sending accept
      if (pc.connectionState !== 'connected') {
        console.log(`[WebRTC][${ts()}] Waiting for connectionState === 'connected' before accept...`);
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            console.warn(`[WebRTC][${ts()}] Connection timeout (10s) — sending accept anyway`);
            resolve();
          }, 10000);
          const handler = () => {
            if (pc.connectionState === 'connected' || pc.connectionState === 'failed') {
              clearTimeout(timeout);
              pc.removeEventListener('connectionstatechange', handler);
              resolve();
            }
          };
          pc.addEventListener('connectionstatechange', handler);
        });
      }
      console.log(`[WebRTC][${ts()}] Connection state before accept: ${pc.connectionState}`);

      // 7. Send accept with same SDP to formally accept the call
      console.log(`[WebRTC][${ts()}] Sending accept with same SDP...`);
      const { data: acceptData, error: acceptError } = await supabase.functions.invoke('whatsapp-call-accept', {
        body: {
          call_id: call.id,
          sdp_answer: fullSdp,
          action: 'accept',
        },
      });

      if (acceptError) {
        console.warn(`[WebRTC][${ts()}] accept error (non-fatal):`, acceptError.message);
      } else {
        console.log(`[WebRTC][${ts()}] accept completed:`, acceptData);
      }

      const totalElapsed = (performance.now() - acceptStartRef.current).toFixed(0);
      console.log(`[WebRTC][${ts()}] ✓ pre_accept + connection + accept completed in ${totalElapsed}ms`);

      setLocalStatus('answered');

      // Start periodic WebRTC stats logging every 5s
      if (peerConnectionRef.current) {
        const pc = peerConnectionRef.current;
        statsIntervalRef.current = setInterval(() => {
          if (pc.connectionState === 'closed') {
            clearInterval(statsIntervalRef.current!);
            statsIntervalRef.current = null;
            return;
          }
          logPeerStats(pc);
        }, 5000);
      }

      clearTimeout(totalTimeoutId);
    } catch (error: any) {
      console.error(`[WebRTC][${ts()}] ✗ Error accepting call:`, error);

      let userMessage = error.message || 'Erro desconhecido';
      if (error.name === 'NotFoundError' || error.message?.includes('Requested device not found')) {
        userMessage = 'Microfone não encontrado. Conecte um microfone e tente novamente.';
      } else if (error.name === 'NotAllowedError') {
        userMessage = 'Permissão de microfone negada. Libere o acesso nas configurações do navegador.';
      }

      toast.error('Erro ao atender chamada: ' + userMessage);
      setLocalStatus(null);
      clearTimeout(totalTimeoutId);
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
    const callId = call?.id || localCallData?.id;
    if (!callId) return;

    try {
      await supabase.functions.invoke('whatsapp-call-terminate', {
        body: { call_id: callId },
      });
    } catch (error) {
      console.error('Error terminating call:', error);
    }

    setLocalCallData(null);
    setLocalStatus(null);
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

  const displayName = activeCall?.contact_name || activeCall?.from_number || 'Número desconhecido';
  const displayNumber = activeCall?.from_number || '';
  const isRinging = effectiveStatus === 'ringing';
  const isAnswered = effectiveStatus === 'answered';

  return (
    <AnimatePresence>
      {activeCall && (
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
                {activeCall.contact_photo ? (
                  <img src={activeCall.contact_photo} alt={displayName} className="w-full h-full object-cover" />
                ) : (
                  <User className="w-12 h-12 text-slate-400" />
                )}
              </div>
            </div>

            {/* Name and number */}
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-white">{displayName}</h2>
              {activeCall.contact_name && displayNumber && (
                <p className="text-slate-400 mt-1">{displayNumber}</p>
              )}
              <p className="text-sm text-cyan-400 mt-2">
                {isRinging && !isAccepting && 'Chamada WhatsApp recebida...'}
                {isAnswered && formatDuration(callDuration)}
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-6 mt-4">
              {isRinging && (
                <>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleReject}
                    className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center shadow-lg shadow-red-600/30 transition-colors"
                  >
                    <PhoneOff className="w-7 h-7 text-white" />
                  </motion.button>

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
