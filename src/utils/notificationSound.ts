// Notification sound utility using Web Audio API
const STORAGE_KEY = 'notification_sound_enabled';

let audioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext => {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
};

export const isNotificationSoundEnabled = (): boolean => {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === null ? true : stored === 'true';
};

export const setNotificationSoundEnabled = (enabled: boolean): void => {
  localStorage.setItem(STORAGE_KEY, String(enabled));
};

export const playNotificationSound = () => {
  if (!isNotificationSoundEnabled()) return;

  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();

    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Pleasant notification tone
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    oscillator.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
    gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.2);
  } catch (error) {
    console.warn('Could not play notification sound:', error);
  }
};

// Special sound for qualified leads - more celebratory
export const playQualifiedLeadSound = () => {
  if (!isNotificationSoundEnabled()) return;

  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();

    // Play a triumphant ascending arpeggio
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    const noteDuration = 0.12;

    notes.forEach((freq, i) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.frequency.setValueAtTime(freq, ctx.currentTime + i * noteDuration);
      oscillator.type = 'sine';

      const startTime = ctx.currentTime + i * noteDuration;
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.25, startTime + 0.02);
      gainNode.gain.linearRampToValueAtTime(0.15, startTime + noteDuration * 0.5);
      gainNode.gain.linearRampToValueAtTime(0, startTime + noteDuration);

      oscillator.start(startTime);
      oscillator.stop(startTime + noteDuration);
    });
  } catch (error) {
    console.warn('Could not play qualified lead sound:', error);
  }
};
