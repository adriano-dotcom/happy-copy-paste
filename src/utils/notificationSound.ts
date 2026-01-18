// Notification sound utility using Web Audio API
const STORAGE_KEY = 'notification_sound_enabled';
const VOLUME_KEY = 'notification_sound_volume';

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

// Volume control (0.0 to 1.0, default 0.5)
export const getNotificationVolume = (): number => {
  const stored = localStorage.getItem(VOLUME_KEY);
  return stored ? parseFloat(stored) : 0.5;
};

export const setNotificationVolume = (volume: number): void => {
  localStorage.setItem(VOLUME_KEY, String(Math.max(0, Math.min(1, volume))));
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
    
    const volume = getNotificationVolume();
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3 * volume, ctx.currentTime + 0.05);
    gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.2);
  } catch (error) {
    console.warn('Could not play notification sound:', error);
  }
};

// Sound for new leads awaiting attention - more attention-grabbing
export const playNewLeadSound = () => {
  if (!isNotificationSoundEnabled()) return;

  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();

    // Three-note alert pattern: E5 → C5 → E5
    const notes = [659.25, 523.25, 659.25];
    const noteDuration = 0.15;
    const volume = getNotificationVolume();

    notes.forEach((freq, i) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.frequency.setValueAtTime(freq, ctx.currentTime + i * noteDuration);
      oscillator.type = 'triangle';

      const startTime = ctx.currentTime + i * noteDuration;
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.3 * volume, startTime + 0.03);
      gainNode.gain.linearRampToValueAtTime(0, startTime + noteDuration);

      oscillator.start(startTime);
      oscillator.stop(startTime + noteDuration);
    });
  } catch (error) {
    console.warn('Could not play new lead sound:', error);
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
    const volume = getNotificationVolume();

    notes.forEach((freq, i) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.frequency.setValueAtTime(freq, ctx.currentTime + i * noteDuration);
      oscillator.type = 'sine';

      const startTime = ctx.currentTime + i * noteDuration;
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(0.25 * volume, startTime + 0.02);
      gainNode.gain.linearRampToValueAtTime(0.15 * volume, startTime + noteDuration * 0.5);
      gainNode.gain.linearRampToValueAtTime(0, startTime + noteDuration);

      oscillator.start(startTime);
      oscillator.stop(startTime + noteDuration);
    });
  } catch (error) {
    console.warn('Could not play qualified lead sound:', error);
  }
};
