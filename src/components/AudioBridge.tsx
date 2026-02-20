/**
 * AudioBridge - Web Audio API bridge between two WebRTC sessions.
 *
 * Creates audio routing:
 *   Meta remoteStream → ElevenLabs mic input
 *   ElevenLabs output  → Meta localTrack replacement
 *
 * Usage is imperative (not a rendered component):
 *   const bridge = createAudioBridge();
 *   bridge.connect(metaRemoteStream, elevenlabsInputStream);
 *   // bridge.metaOutputTrack → replace the local track sent to Meta
 *   bridge.disconnect();
 */

export interface AudioBridgeInstance {
  /** Connect two streams and start routing audio */
  connect: (metaRemoteStream: MediaStream) => {
    /** Stream to feed into ElevenLabs as "microphone" */
    elevenLabsMicStream: MediaStream;
  };
  /** Get a silent placeholder stream (before ElevenLabs connects) */
  getSilentStream: () => MediaStream;
  /** Route ElevenLabs output back to Meta */
  setElevenLabsOutput: (outputStream: MediaStream) => MediaStream;
  /** Tear down all audio nodes */
  disconnect: () => void;
  /** Get current audio levels for monitoring */
  getMetaInputLevel: () => number;
  getElevenLabsOutputLevel: () => number;
}

export function createAudioBridge(): AudioBridgeInstance {
  let audioContext: AudioContext | null = null;
  
  // Meta → ElevenLabs path
  let metaSource: MediaStreamAudioSourceNode | null = null;
  let metaGain: GainNode | null = null;
  let metaDestination: MediaStreamAudioDestinationNode | null = null;
  let metaAnalyser: AnalyserNode | null = null;
  
  // ElevenLabs → Meta path
  let elSource: MediaStreamAudioSourceNode | null = null;
  let elGain: GainNode | null = null;
  let elDestination: MediaStreamAudioDestinationNode | null = null;
  let elAnalyser: AnalyserNode | null = null;

  function ensureContext() {
    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new AudioContext();
    }
    return audioContext;
  }

  function getLevel(analyser: AnalyserNode | null): number {
    if (!analyser) return 0;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const val = (data[i] - 128) / 128;
      sum += val * val;
    }
    return Math.sqrt(sum / data.length);
  }

  return {
    connect(metaRemoteStream: MediaStream) {
      const ctx = ensureContext();
      
      // Meta remote audio → destination for ElevenLabs mic
      metaSource = ctx.createMediaStreamSource(metaRemoteStream);
      metaGain = ctx.createGain();
      metaGain.gain.value = 1.0;
      metaAnalyser = ctx.createAnalyser();
      metaAnalyser.fftSize = 256;
      metaDestination = ctx.createMediaStreamDestination();
      
      metaSource.connect(metaGain);
      metaGain.connect(metaAnalyser);
      metaAnalyser.connect(metaDestination);

      console.log('[AudioBridge] Meta → ElevenLabs path connected');

      return {
        elevenLabsMicStream: metaDestination.stream,
      };
    },

    getSilentStream() {
      const ctx = ensureContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const dst = ctx.createMediaStreamDestination();
      osc.connect(gain);
      gain.connect(dst);
      osc.start();
      return dst.stream;
    },

    setElevenLabsOutput(outputStream: MediaStream) {
      const ctx = ensureContext();

      // Disconnect previous EL output if exists
      if (elSource) {
        try { elSource.disconnect(); } catch {}
      }

      elSource = ctx.createMediaStreamSource(outputStream);
      elGain = ctx.createGain();
      elGain.gain.value = 1.0;
      elAnalyser = ctx.createAnalyser();
      elAnalyser.fftSize = 256;
      elDestination = ctx.createMediaStreamDestination();

      elSource.connect(elGain);
      elGain.connect(elAnalyser);
      elAnalyser.connect(elDestination);

      console.log('[AudioBridge] ElevenLabs → Meta path connected');

      return elDestination.stream;
    },

    disconnect() {
      console.log('[AudioBridge] Disconnecting all audio nodes');
      try { metaSource?.disconnect(); } catch {}
      try { metaGain?.disconnect(); } catch {}
      try { metaAnalyser?.disconnect(); } catch {}
      try { elSource?.disconnect(); } catch {}
      try { elGain?.disconnect(); } catch {}
      try { elAnalyser?.disconnect(); } catch {}
      
      metaSource = null;
      metaGain = null;
      metaAnalyser = null;
      metaDestination = null;
      elSource = null;
      elGain = null;
      elAnalyser = null;
      elDestination = null;

      if (audioContext && audioContext.state !== 'closed') {
        audioContext.close().catch(() => {});
      }
      audioContext = null;
    },

    getMetaInputLevel() {
      return getLevel(metaAnalyser);
    },

    getElevenLabsOutputLevel() {
      return getLevel(elAnalyser);
    },
  };
}
