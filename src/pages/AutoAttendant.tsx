import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Phone, PhoneOff, Activity, Radio, Power, PowerOff, Volume2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
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

// ── Main Component ──

const AutoAttendant: React.FC = () => {
  const attendant = useWhatsAppAutoAttendant();
  const elevenLabs = useElevenLabsBridge();
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [metaLevel, setMetaLevel] = useState(0);
  const [elLevel, setElLevel] = useState(0);

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
    console.log(`[AutoAttendant] ${msg}`);
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

  // Full termination: end ElevenLabs, terminate Meta call in DB, cleanup WebRTC, reset queue
  const terminateCall = useCallback(async (reason: string) => {
    if (terminatingRef.current) return;
    terminatingRef.current = true;
    const callId = currentCallIdRef.current;
    addLog(`terminateCall (${reason}) — callId: ${callId}`);

    try {
      // 1. End ElevenLabs session
      await elevenLabs.endSession();
    } catch (err) {
      addLog(`Error ending ElevenLabs: ${err}`);
    }

    // 2. Terminate call in DB via edge function
    if (callId) {
      try {
        await supabase.functions.invoke('whatsapp-call-terminate', {
          body: { call_id: callId },
        });
        addLog(`whatsapp-call-terminate sent for ${callId}`);
      } catch (err) {
        addLog(`Error calling whatsapp-call-terminate: ${err}`);
      }
    }

    // 3. Cleanup WebRTC/AudioBridge
    cleanup();

    // 4. Reset attendant queue for next call
    attendant.resetForNext();
    terminatingRef.current = false;
  }, [elevenLabs, cleanup, attendant, addLog]);

  // Unmount cleanup + beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      const callId = currentCallIdRef.current;
      if (callId) {
        // Best-effort: use sendBeacon for reliability
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-call-terminate`;
        navigator.sendBeacon(url, JSON.stringify({ call_id: callId }));
      }
      elevenLabs.endSession();
      cleanup();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Component unmount — full cleanup
      const callId = currentCallIdRef.current;
      elevenLabs.endSession();
      cleanup();
      if (callId) {
        supabase.functions.invoke('whatsapp-call-terminate', {
          body: { call_id: callId },
        }).catch(() => {});
      }
      attendant.deactivate();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Watch ElevenLabs status — when it ends, terminate the Meta call too
  useEffect(() => {
    if (elevenLabs.status === 'ended' && currentCallIdRef.current && !terminatingRef.current) {
      addLog('ElevenLabs session ended — terminating Meta call');
      terminateCall('elevenlabs_ended');
    }
  }, [elevenLabs.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Watch DB call status — detect when contact hangs up (webhook sets status to 'ended')
  useEffect(() => {
    const callId = attendant.currentCall?.id;
    if (!callId || !attendant.isActive) return;

    const channel = supabase
      .channel(`auto-attendant-status-${callId}`)
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [attendant.currentCall?.id, attendant.isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Unlock AudioContext on user interaction
  const handleActivate = useCallback(async () => {
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
      attendant.activate();
      toast.success('Auto-Attendant ativado!');
    } catch (err) {
      console.error('Failed to unlock audio:', err);
      toast.error('Erro ao ativar áudio');
    }
  }, [attendant]);

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

            levelIntervalRef.current = setInterval(() => {
              setMetaLevel(bridge.getMetaInputLevel());
              setElLevel(bridge.getElevenLabsOutputLevel());
            }, 200);

            startElevenLabsSession(call, elevenLabsMicStream);
          }
        };

        pc.onconnectionstatechange = () => {
          addLog(`Meta connection: ${pc.connectionState}`);
          if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
            addLog('Meta connection lost — terminating call');
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

            levelIntervalRef.current = setInterval(() => {
              setMetaLevel(bridge.getMetaInputLevel());
              setElLevel(bridge.getElevenLabsOutputLevel());
            }, 200);

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
          body: {
            contact_id: call.contact_id,
            to_number: call.to_number,
            sdp_offer: fullSdp,
          },
        });

        if (error || !data?.success) {
          throw new Error(data?.error || error?.message || 'Failed to initiate outbound call');
        }

        const channel = supabase
          .channel(`auto-attendant-answer-${call.id}`)
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

    if (call.type === 'inbound') {
      processInbound();
    } else {
      processOutbound();
    }

    return () => {
      cancelled = true;
    };
  }, [attendant.currentCall, audioUnlocked]); // eslint-disable-line react-hooks/exhaustive-deps

  // Start ElevenLabs and wire audio back to Meta
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
          if (pipelineName.includes(key)) {
            produtoInteresse = value;
            break;
          }
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

  // Audio level bar component
  const LevelBar = ({ level, label }: { level: number; label: string }) => (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-400 w-32">{label}</span>
      <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-cyan-400 rounded-full transition-all duration-100"
          style={{ width: `${Math.min(level * 100 * 3, 100)}%` }}
        />
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col items-center justify-center bg-slate-950 p-8">
      <div className="max-w-2xl w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-3">
            <Radio className="w-8 h-8 text-cyan-400" />
            <h1 className="text-3xl font-bold text-white">Auto-Attendant</h1>
          </div>
          <p className="text-slate-400">
            Bridge de áudio Meta WhatsApp ↔ ElevenLabs (Iris)
          </p>
        </div>

        {/* Status Card */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 space-y-6">
          {!attendant.isActive ? (
            <button
              onClick={handleActivate}
              className="w-full flex items-center justify-center gap-3 py-4 px-6 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-semibold transition-colors text-lg"
            >
              <Power className="w-6 h-6" />
              Ativar Auto-Attendant
            </button>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                  <span className="text-green-400 font-semibold">Ativo — Escutando chamadas</span>
                </div>
                <button
                  onClick={() => { terminateCall('manual_deactivate').then(() => attendant.deactivate()); }}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-sm transition-colors"
                >
                  <PowerOff className="w-4 h-4" />
                  Desativar
                </button>
              </div>

              {/* State */}
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <div className="text-xs text-slate-400 mb-1">Estado</div>
                  <div className="text-sm font-mono text-cyan-300">{attendant.state}</div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <div className="text-xs text-slate-400 mb-1">Fila</div>
                  <div className="text-sm font-mono text-cyan-300">{attendant.queueLength}</div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <div className="text-xs text-slate-400 mb-1">ElevenLabs</div>
                  <div className="text-sm font-mono text-cyan-300">{elevenLabs.status}</div>
                </div>
              </div>

              {/* Audio Levels */}
              {attendant.state === 'bridged' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-slate-300">
                    <Volume2 className="w-4 h-4" />
                    Níveis de áudio
                  </div>
                  <LevelBar level={metaLevel} label="Lead → Iris" />
                  <LevelBar level={elLevel} label="Iris → Lead" />
                </div>
              )}

              {/* Current Call */}
              {attendant.currentCall && (
                <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-sm text-white mb-2">
                    <Phone className="w-4 h-4 text-green-400" />
                    Chamada ativa: {attendant.currentCall.type === 'inbound' ? '📞 Recebida' : '📲 Feita'}
                  </div>
                  <div className="text-xs text-slate-400 font-mono">
                    ID: {attendant.currentCall.id}
                    {attendant.currentCall.from_number && <span> | De: {attendant.currentCall.from_number}</span>}
                    {attendant.currentCall.to_number && <span> | Para: {attendant.currentCall.to_number}</span>}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Logs */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-sm text-slate-300 mb-3">
            <Activity className="w-4 h-4" />
            Logs
          </div>
          <div className="h-64 overflow-y-auto font-mono text-xs text-slate-500 space-y-0.5">
            {attendant.logs.length === 0 ? (
              <div className="text-slate-600 italic">Nenhum log ainda...</div>
            ) : (
              attendant.logs.map((log, i) => (
                <div key={i} className="hover:text-slate-300 transition-colors">
                  {log}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-sm text-amber-300/80">
          <strong className="text-amber-300">⚠️ Importante:</strong> Mantenha esta aba aberta para que o Auto-Attendant funcione.
          Todas as chamadas WhatsApp serão automaticamente atendidas pela Iris.
        </div>
      </div>
    </div>
  );
};

export default AutoAttendant;
