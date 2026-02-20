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
}

export function useElevenLabsBridge(): UseElevenLabsBridgeReturn {
  const [status, setStatus] = useState<ElevenLabsBridgeStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const conversation = useConversation({
    onConnect: () => {
      console.log('[ElevenLabsBridge] Connected to agent');
      setStatus('connected');
    },
    onDisconnect: () => {
      console.log('[ElevenLabsBridge] Disconnected from agent');
      setStatus('ended');
    },
    onError: (err) => {
      console.error('[ElevenLabsBridge] Error:', err);
      setError(String(err));
      setStatus('error');
    },
    onMessage: (message) => {
      console.log('[ElevenLabsBridge] Message:', message);
    },
  });

  const startSession = useCallback(async (dynamicVars: DynamicVariables, micStream?: MediaStream) => {
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    try {
      setStatus('connecting');
      setError(null);

      console.log('[ElevenLabsBridge] Requesting signed URL...');
      const { data, error: fnError } = await supabase.functions.invoke('elevenlabs-conversation-token', {
        body: { dynamic_variables: dynamicVars },
      });

      if (fnError || !data?.signed_url) {
        throw new Error(fnError?.message || 'Failed to get signed URL');
      }

      // Patch getUserMedia to inject caller audio instead of operator mic
      if (micStream) {
        console.log('[ElevenLabsBridge] Patching getUserMedia with caller audio stream');
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

    } catch (err: any) {
      console.error('[ElevenLabsBridge] Failed to start session:', err);
      setError(err.message);
      setStatus('error');
    } finally {
      // Always restore original getUserMedia
      navigator.mediaDevices.getUserMedia = originalGetUserMedia;
      console.log('[ElevenLabsBridge] getUserMedia restored');
    }
  }, [conversation]);

  const endSession = useCallback(async () => {
    try {
      await conversation.endSession();
      setStatus('ended');
    } catch (err: any) {
      console.error('[ElevenLabsBridge] Failed to end session:', err);
    }
  }, [conversation]);

  return {
    status,
    isSpeaking: conversation.isSpeaking,
    startSession,
    endSession,
    error,
  };
}
