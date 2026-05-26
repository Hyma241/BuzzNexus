type SoundType = 'buzz' | 'lock' | 'correct' | 'wrong' | 'transition' | 'join' | 'countdown';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      audioCtx = new Ctx();
    }
    // Resume if suspended (browser autoplay policy)
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

export const playCyberSound = (type: SoundType): void => {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    const makeOscillator = (freq: number, type: OscillatorType = 'sine') => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      osc.connect(gain);
      gain.connect(ctx.destination);
      return { osc, gain };
    };

    if (type === 'buzz') {
      // Deep heavy bass — the iconic buzz
      const { osc, gain } = makeOscillator(180, 'sawtooth');
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.2);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.6, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);

      // Add distortion layer
      const { osc: osc2, gain: gain2 } = makeOscillator(90, 'square');
      gain2.gain.setValueAtTime(0.2, now);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc2.start(now);
      osc2.stop(now + 0.15);

    } else if (type === 'lock') {
      // Mechanical lock — ascending beeps
      [800, 1200, 1600].forEach((freq, i) => {
        const { osc, gain } = makeOscillator(freq, 'square');
        const t = now + i * 0.06;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.25, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
        osc.start(t);
        osc.stop(t + 0.07);
      });

    } else if (type === 'correct') {
      // Triumphant arpeggio — C major chord
      [523, 659, 784, 1047].forEach((freq, i) => {
        const { osc, gain } = makeOscillator(freq, 'sine');
        const t = now + i * 0.08;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.3, t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.start(t);
        osc.stop(t + 0.35);
      });

    } else if (type === 'wrong') {
      // Harsh descending error
      const { osc, gain } = makeOscillator(300, 'sawtooth');
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.4);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.5, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);

      // Noise layer for harshness
      const { osc: osc2, gain: gain2 } = makeOscillator(150, 'square');
      gain2.gain.setValueAtTime(0.2, now);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc2.start(now);
      osc2.stop(now + 0.3);

    } else if (type === 'transition') {
      // Sweeping whoosh
      const { osc, gain } = makeOscillator(1200, 'sine');
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.3);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);

    } else if (type === 'join') {
      // Short welcome ping
      const { osc, gain } = makeOscillator(880, 'sine');
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1100, now + 0.05);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);

    } else if (type === 'countdown') {
      // Ticking beep
      const { osc, gain } = makeOscillator(440, 'square');
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    }
  } catch (err) {
    console.error('Sound error:', err);
  }
};
