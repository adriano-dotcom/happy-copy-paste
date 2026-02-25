import { useState, useCallback, useRef } from 'react';
import { useConversation } from '@elevenlabs/react';
import { supabase } from '@/integrations/supabase/client';

export type ElevenLabsBridgeStatus = 'idle' | 'connecting' | 'connected' | 'ended' | 'error';

export type DynamicVariables = Record<string, string>;

interface UseElevenLabsBridgeReturn {
  status: ElevenLabsBridgeStatus;
  isSpeaking: boolean;
  startSession: (dynamicVars: DynamicVariables, micStream?: MediaStream) => Promise<void>;
  endSession: () => Promise<void>;
  error: string | null;
  /** MediaStream carrying the agent's decoded PCM output audio */
  getAgentOutputStream: () => MediaStream | null;
}

// Decode base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Convert PCM16 LE to Float32
function pcm16ToFloat32(pcm16: ArrayBuffer): Float32Array {
  const int16 = new Int16Array(pcm16);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768;
  }
  return float32;
}

export function useElevenLabsBridge(): UseElevenLabsBridgeReturn {
  const [status, setStatus] = useState<ElevenLabsBridgeStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  // Agent output audio pipeline refs
  const outputCtxRef = useRef<AudioContext | null>(null);
  const outputDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const nextPlaybackRef = useRef<number>(0);
  const outputSampleRateRef = useRef<number>(16000); // default, updated by metadata

  // getUserMedia pinning
  const originalGetUserMediaRef = useRef<typeof navigator.mediaDevices.getUserMedia | null>(null);
  const sessionActiveRef = useRef(false);

  // Initialize output audio context + destination
  const ensureOutputPipeline = useCallback(() => {
    if (!outputCtxRef.current || outputCtxRef.current.state === 'closed') {
      const ctx = new AudioContext({ sampleRate: outputSampleRateRef.current });
      outputCtxRef.current = ctx;
      outputDestRef.current = ctx.createMediaStreamDestination();
      nextPlaybackRef.current = 0;
      console.log(`[ElevenLabsBridge] Output pipeline created (sampleRate=${ctx.sampleRate})`);
    }
    return { ctx: outputCtxRef.current!, dest: outputDestRef.current! };
  }, []);

  // Cleanup output pipeline
  const teardownOutputPipeline = useCallback(() => {
    if (outputCtxRef.current && outputCtxRef.current.state !== 'closed') {
      outputCtxRef.current.close().catch(() => {});
    }
    outputCtxRef.current = null;
    outputDestRef.current = null;
    nextPlaybackRef.current = 0;
  }, []);

  // Restore getUserMedia
  const restoreGetUserMedia = useCallback(() => {
    if (originalGetUserMediaRef.current) {
      navigator.mediaDevices.getUserMedia = originalGetUserMediaRef.current;
      originalGetUserMediaRef.current = null;
      console.log('[ElevenLabsBridge] getUserMedia restored');
    }
    sessionActiveRef.current = false;
  }, []);

  const conversation = useConversation({
    onConnect: () => {
      console.log('[ElevenLabsBridge] Connected to agent');
      setStatus('connected');
    },
    onDisconnect: () => {
      console.log('[ElevenLabsBridge] Disconnected from agent');
      setStatus('ended');
      restoreGetUserMedia();
    },
    onError: (err) => {
      console.error('[ElevenLabsBridge] Error:', err);
      setError(String(err));
      setStatus('error');
      restoreGetUserMedia();
    },
    onMessage: (message: any) => {
      // Capture conversation metadata for sample rate
      if (message.type === 'conversation_initiation_metadata') {
        const meta = message as any;
        const format = meta?.conversation_initiation_metadata_event?.agent_output_audio_format;
        if (format) {
          // Format is like "pcm_16000" or "pcm_24000"
          const match = String(format).match(/(\d+)/);
          if (match) {
            outputSampleRateRef.current = parseInt(match[1], 10);
            console.log(`[ElevenLabsBridge] Agent output format: ${format}, sampleRate=${outputSampleRateRef.current}`);
          }
        }
      }

      // Capture audio chunks from agent
      if (message.type === 'audio') {
        const audioMsg = message as any;
        const base64 = audioMsg?.audio_event?.audio_base_64;
        if (base64) {
          try {
            const { ctx, dest } = ensureOutputPipeline();
            const pcmBuffer = base64ToArrayBuffer(base64);
            const float32 = pcm16ToFloat32(pcmBuffer);

            const audioBuffer = ctx.createBuffer(1, float32.length, outputSampleRateRef.current);
            audioBuffer.getChannelData(0).set(float32);

            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(dest);

            // Schedule with monotonic clock to avoid gaps
            const now = ctx.currentTime;
            const startTime = Math.max(now + 0.05, nextPlaybackRef.current);
            source.start(startTime);
            nextPlaybackRef.current = startTime + audioBuffer.duration;
          } catch (e) {
            console.warn('[ElevenLabsBridge] Error processing audio chunk:', e);
          }
        }
      }
    },
  });

  const startSession = useCallback(async (dynamicVars: DynamicVariables, micStream?: MediaStream) => {
    try {
      setStatus('connecting');
      setError(null);
      sessionActiveRef.current = true;

      // Initialize output pipeline before session
      ensureOutputPipeline();

      console.log('[ElevenLabsBridge] Requesting signed URL...');
      const { data, error: fnError } = await supabase.functions.invoke('elevenlabs-conversation-token', {
        body: { dynamic_variables: dynamicVars },
      });

      if (fnError || !data?.signed_url) {
        throw new Error(fnError?.message || 'Failed to get signed URL');
      }

      // Pin getUserMedia for entire session duration
      if (micStream) {
        console.log('[ElevenLabsBridge] Pinning getUserMedia with caller audio stream');
        originalGetUserMediaRef.current = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async () => micStream;
      }

      console.log('[ElevenLabsBridge] Starting session with signed URL...');
      
      await conversation.startSession({
        signedUrl: data.signed_url,
        overrides: {
          agent: {
            firstMessage: undefined,
          },
        },
        dynamicVariables: dynamicVars as Record<string, string>,
      });

      // DO NOT restore getUserMedia here — keep pinned until endSession

    } catch (err: any) {
      console.error('[ElevenLabsBridge] Failed to start session:', err);
      setError(err.message);
      setStatus('error');
      restoreGetUserMedia();
    }
  }, [conversation, ensureOutputPipeline, restoreGetUserMedia]);

  const endSession = useCallback(async () => {
    try {
      await conversation.endSession();
    } catch (err: any) {
      console.error('[ElevenLabsBridge] Failed to end session:', err);
    } finally {
      setStatus('ended');
      restoreGetUserMedia();
      teardownOutputPipeline();
    }
  }, [conversation, restoreGetUserMedia, teardownOutputPipeline]);

  const getAgentOutputStream = useCallback((): MediaStream | null => {
    return outputDestRef.current?.stream ?? null;
  }, []);

  return {
    status,
    isSpeaking: conversation.isSpeaking,
    startSession,
    endSession,
    error,
    getAgentOutputStream,
  };
}
