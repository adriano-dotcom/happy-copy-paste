import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useWhatsAppAutoAttendant } from '@/hooks/useWhatsAppAutoAttendant';
import { useElevenLabsBridge } from '@/hooks/useElevenLabsBridge';
import { createAudioBridge, type AudioBridgeInstance } from '@/components/AudioBridge';

// ── WebRTC helpers ──

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

function fixSdpForMeta(sdp: string): string {
  return sdp.split('\r\n').map(line => {
    if (line.startsWith('a=setup:')) return 'a=setup:active';
    return line;
  }).join('\r\n');
}

function fixSdpForMetaOutbound(sdp: string): string {
  return sdp.split('\r\n').map(line => {
    if (line.startsWith('a=setup:')) return 'a=setup:actpass';
    return line;
  }).join('\r\n');
}

function getNowSPFormatted(): string {
  const now = new Date();
  const spString = now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
  const spDate = new Date(spString);
  return spDate.getHours().toString().padStart(2, '0') + ':' + spDate.getMinutes().toString().padStart(2, '0');
}

/**
 * AutoAttendantEngine — headless component that runs the WebRTC ↔ ElevenLabs bridge
 * in the background. Renders nothing visible.
 */
const AutoAttendantEngine: React.FC = () => {
  const attendant = useWhatsAppAutoAttendant();
  const elevenLabs = useElevenLabsBridge();
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const bridgeRef = useRef<AudioBridgeInstance | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const levelIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentCallIdRef = useRef<string | null>(null);
  const terminatingRef = useRef(false);

  // Keep currentCallIdRef in sync
  useEffect(() => {
    currentCallIdRef.current = attendant.currentCall?.id ?? null;
  }, [attendant.currentCall?.id]);

  const addLog = useCallback((msg: string) => {
    console.log(`[AutoAttendantEngine] ${msg}`);
  }, []);

  const cleanup = useCallback(() => {
    if (levelIntervalRef.current) {
      clearInterval(levelIntervalRef.current);
      levelIntervalRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (bridgeRef.current) {
      bridgeRef.current.disconnect();
      bridgeRef.current = null;
    }
  }, []);

  const terminateCall = useCallback(async (reason: string) => {
    if (terminatingRef.current) return;
    terminatingRef.current = true;
    const callId = currentCallIdRef.current;
    addLog(`terminateCall (${reason}) — callId: ${callId}`);

    try { await elevenLabs.endSession(); } catch (err) { addLog(`Error ending ElevenLabs: ${err}`); }

    if (callId) {
      try {
        await supabase.functions.invoke('whatsapp-call-terminate', { body: { call_id: callId } });
        addLog(`whatsapp-call-terminate sent for ${callId}`);
      } catch (err) { addLog(`Error calling whatsapp-call-terminate: ${err}`); }
    }

    cleanup();
    attendant.resetForNext();
    terminatingRef.current = false;
  }, [elevenLabs, cleanup, attendant, addLog]);

  // Activate on mount, unlock audio automatically
  useEffect(() => {
    const unlockAndActivate = async () => {
      try {
        const ctx = new AudioContext();
        if (ctx.state === 'suspended') await ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
        await ctx.close();
        setAudioUnlocked(true);
        addLog('AudioContext unlocked');
      } catch (err) {
        addLog(`AudioContext unlock failed: ${err}`);
      }
      attendant.activate();
    };

    // Try unlock on first user interaction if auto-unlock fails
    const handleInteraction = () => {
      if (!audioUnlocked) {
        unlockAndActivate();
        window.removeEventListener('click', handleInteraction);
        window.removeEventListener('keydown', handleInteraction);
      }
    };

    unlockAndActivate();
    window.addEventListener('click', handleInteraction);
    window.addEventListener('keydown', handleInteraction);

    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // beforeunload + unmount cleanup
  useEffect(() => {
    const handleBeforeUnload = () => {
      const callId = currentCallIdRef.current;
      if (callId) {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-call-terminate`;
        navigator.sendBeacon(url, JSON.stringify({ call_id: callId }));
      }
      elevenLabs.endSession();
      cleanup();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      const callId = currentCallIdRef.current;
      elevenLabs.endSession();
      cleanup();
      if (callId) {
        supabase.functions.invoke('whatsapp-call-terminate', { body: { call_id: callId } }).catch(() => {});
      }
      attendant.deactivate();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Watch ElevenLabs status
  useEffect(() => {
    if (elevenLabs.status === 'ended' && currentCallIdRef.current && !terminatingRef.current) {
      addLog('ElevenLabs session ended — terminating Meta call');
      terminateCall('elevenlabs_ended');
    }
  }, [elevenLabs.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Watch DB call status
  useEffect(() => {
    const callId = attendant.currentCall?.id;
    if (!callId || !attendant.isActive) return;

    const channel = supabase
      .channel(`engine-status-${callId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'whatsapp_calls',
        filter: `id=eq.${callId}`,
      }, (payload: any) => {
        const updated = payload.new;
        if (['ended', 'missed', 'rejected', 'failed'].includes(updated.status)) {
          addLog(`Call status changed to ${updated.status} in DB — terminating`);
          terminateCall('db_status_' + updated.status);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [attendant.currentCall?.id, attendant.isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Start ElevenLabs session
  const startElevenLabsSession = useCallback(async (call: any, _micStream: MediaStream) => {
    try {
      let leadName = 'Cliente';
      let produtoInteresse = 'seguros';

      if (call.contact_id) {
        const { data: contact } = await supabase
          .from('contacts')
          .select('name, call_name')
          .eq('id', call.contact_id)
          .single();

        if (contact) {
          const raw = contact.name || contact.call_name || 'Cliente';
          const first = raw.trim().split(/\s+/)[0] || 'Cliente';
          leadName = first.length < 3 ? first : first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
        }

        const { data: deal } = await supabase
          .from('deals')
          .select('pipeline_id, pipelines(name)')
          .eq('contact_id', call.contact_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const pipelineName = (deal as any)?.pipelines?.name?.toLowerCase() || '';
        const produtoMap: Record<string, string> = {
          'transporte': 'Seguro de Transporte e Carga',
          'saude': 'Plano de Saúde',
          'saúde': 'Plano de Saúde',
          'auto': 'Seguro Auto',
          'empresarial': 'Seguro Empresarial',
          'vida': 'Seguro de Vida',
        };
        for (const [key, value] of Object.entries(produtoMap)) {
          if (pipelineName.includes(key)) { produtoInteresse = value; break; }
        }
      }

      addLog(`Starting ElevenLabs session: lead=${leadName}, produto=${produtoInteresse}`);

      await elevenLabs.startSession({
        lead_name: leadName,
        horario: getNowSPFormatted(),
        produto_interesse: produtoInteresse,
        vq_id: call.id,
        lead_id: call.contact_id || '',
      });
    } catch (err: any) {
      addLog(`Error starting ElevenLabs: ${err.message}`);
    }
  }, [elevenLabs, addLog]);

  // Process current call from queue
  useEffect(() => {
    const call = attendant.currentCall;
    if (!call || !audioUnlocked) return;

    let cancelled = false;

    const processInbound = async () => {
      addLog(`Processing inbound call ${call.id}`);
      try {
        const bridge = createAudioBridge();
        bridgeRef.current = bridge;
        const silentStream = bridge.getSilentStream();
        localStreamRef.current = silentStream;
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pcRef.current = pc;

        silentStream.getTracks().forEach(track => pc.addTrack(track, silentStream));

        pc.ontrack = (event) => {
          if (event.track.kind === 'audio' && !cancelled) {
            addLog('Got remote audio track from Meta');
            const { elevenLabsMicStream } = bridge.connect(event.streams[0]);
            levelIntervalRef.current = setInterval(() => {}, 200);
            startElevenLabsSession(call, elevenLabsMicStream);
          }
        };

        pc.onconnectionstatechange = () => {
          addLog(`Meta connection: ${pc.connectionState}`);
          if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
            terminateCall('meta_disconnected');
          }
        };

        if (!call.sdp_offer) throw new Error('No SDP offer');
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: call.sdp_offer }));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (pc.iceGatheringState !== 'complete') {
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(resolve, 3000);
            pc.addEventListener('icegatheringstatechange', () => {
              if (pc.iceGatheringState === 'complete') { clearTimeout(timeout); resolve(); }
            });
          });
        }

        if (cancelled) return;
        const fullSdp = fixSdpForMeta(pc.localDescription?.sdp || '');

        addLog('Sending pre_accept...');
        const { error: preErr } = await supabase.functions.invoke('whatsapp-call-accept', {
          body: { call_id: call.id, sdp_answer: fullSdp, action: 'pre_accept' },
        });
        if (preErr) throw preErr;

        if (pc.connectionState !== 'connected') {
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(resolve, 10000);
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

        addLog('Sending accept...');
        await supabase.functions.invoke('whatsapp-call-accept', {
          body: { call_id: call.id, sdp_answer: fullSdp, action: 'accept' },
        });

        attendant.setState('bridged');
        addLog('Inbound call accepted and bridged!');
      } catch (err: any) {
        addLog(`Error processing inbound: ${err.message}`);
        cleanup();
        attendant.resetForNext();
        terminatingRef.current = false;
      }
    };

    const processOutbound = async () => {
      addLog(`Processing outbound call ${call.id}`);
      try {
        const bridge = createAudioBridge();
        bridgeRef.current = bridge;
        const silentStream = bridge.getSilentStream();
        localStreamRef.current = silentStream;
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pcRef.current = pc;

        silentStream.getTracks().forEach(track => pc.addTrack(track, silentStream));

        pc.ontrack = (event) => {
          if (event.track.kind === 'audio' && !cancelled) {
            addLog('Got remote audio track from lead (outbound)');
            const { elevenLabsMicStream } = bridge.connect(event.streams[0]);
            levelIntervalRef.current = setInterval(() => {}, 200);
            startElevenLabsSession(call, elevenLabsMicStream);
          }
        };

        pc.onconnectionstatechange = () => {
          addLog(`Outbound Meta connection: ${pc.connectionState}`);
          if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
            terminateCall('meta_disconnected_outbound');
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        if (pc.iceGatheringState !== 'complete') {
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(resolve, 3000);
            pc.addEventListener('icegatheringstatechange', () => {
              if (pc.iceGatheringState === 'complete') { clearTimeout(timeout); resolve(); }
            });
          });
        }

        if (cancelled) return;
        const fullSdp = fixSdpForMetaOutbound(pc.localDescription?.sdp || '');

        addLog('Sending outbound offer...');
        const { data, error } = await supabase.functions.invoke('whatsapp-call-initiate', {
          body: { contact_id: call.contact_id, to_number: call.to_number, sdp_offer: fullSdp },
        });

        if (error || !data?.success) {
          throw new Error(data?.error || error?.message || 'Failed to initiate outbound call');
        }

        const channel = supabase
          .channel(`engine-answer-${call.id}`)
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'whatsapp_calls',
            filter: `id=eq.${call.id}`,
          }, async (payload: any) => {
            const updated = payload.new;
            if (updated.sdp_answer && pc.signalingState === 'have-local-offer') {
              addLog('Got SDP answer from lead');
              await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: updated.sdp_answer }));
              attendant.setState('bridged');
            }
            if (['ended', 'missed', 'rejected', 'failed'].includes(updated.status)) {
              addLog(`Outbound call ended: ${updated.status}`);
              supabase.removeChannel(channel);
              terminateCall('outbound_ended_' + updated.status);
            }
          })
          .subscribe();
      } catch (err: any) {
        addLog(`Error processing outbound: ${err.message}`);
        cleanup();
        attendant.resetForNext();
        terminatingRef.current = false;
      }
    };

    if (call.type === 'inbound') processInbound();
    else processOutbound();

    return () => { cancelled = true; };
  }, [attendant.currentCall, audioUnlocked]); // eslint-disable-line react-hooks/exhaustive-deps

  // Renders nothing — headless component
  return null;
};

export default AutoAttendantEngine;
