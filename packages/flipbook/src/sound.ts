const STORAGE_KEY = "vgf:sound";

/** The user's saved choice, or `fallback` when nothing is stored or storage is unavailable. */
export function readSoundPreference(fallback: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === null ? fallback : stored === "on";
  } catch {
    return fallback;
  }
}

export function writeSoundPreference(on: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    // Private mode / blocked storage: the choice just lasts for this visit.
  }
}

export interface PageSound {
  /** Create/resume the AudioContext. Call from a user gesture (required by iOS Safari). */
  unlock(): void;
  /** Play one page turn. Safe to call anywhere; does nothing without Web Audio. */
  play(): void;
  dispose(): void;
}

type AudioContextCtor = typeof AudioContext;

const between = (min: number, max: number): number => min + Math.random() * (max - min);

/**
 * Page-turn sound synthesised with the Web Audio API: a short band-passed noise burst
 * (paper swish) whose pitch, length and level vary a little each time. No audio file.
 * The AudioContext is created lazily, on the first user interaction with the reader
 * (`unlock()`) or the first page turn, as browsers require.
 */
export function createPageSound(): PageSound {
  let context: AudioContext | null = null;
  let noise: AudioBuffer | null = null;

  const ensureContext = (): AudioContext | null => {
    if (context) return context;
    const Ctor: AudioContextCtor | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
    if (!Ctor) return null;
    context = new Ctor();
    const length = Math.floor(context.sampleRate * 0.5);
    noise = context.createBuffer(1, length, context.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return context;
  };

  return {
    unlock() {
      try {
        const ctx = ensureContext();
        if (ctx?.state === "suspended") void ctx.resume();
      } catch {
        // No audio: the reader stays silent.
      }
    },
    play() {
      try {
        const ctx = ensureContext();
        if (!ctx || !noise) return;
        if (ctx.state === "suspended") void ctx.resume();

        const now = ctx.currentTime;
        const duration = between(0.22, 0.32);
        const source = ctx.createBufferSource();
        source.buffer = noise;
        source.playbackRate.value = between(0.85, 1.2);

        // Swish: the band slides down as the page lands.
        const band = ctx.createBiquadFilter();
        band.type = "bandpass";
        band.Q.value = 0.9;
        band.frequency.setValueAtTime(between(2200, 3200), now);
        band.frequency.exponentialRampToValueAtTime(between(600, 900), now + duration);

        const highpass = ctx.createBiquadFilter();
        highpass.type = "highpass";
        highpass.frequency.value = 250;

        const gain = ctx.createGain();
        const peak = between(0.16, 0.24);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(peak, now + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        source.connect(band).connect(highpass).connect(gain).connect(ctx.destination);
        source.start(now, between(0, 0.15), duration + 0.05);
      } catch {
        // Sound is a nicety: never break the reader over it.
      }
    },
    dispose() {
      void context?.close().catch(() => undefined);
      context = null;
      noise = null;
    },
  };
}
