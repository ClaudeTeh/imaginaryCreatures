/**
 * Tiny procedural sound engine (Web Audio, no asset files). All effects are
 * synthesized on the fly. The AudioContext is created lazily on the first user
 * gesture so autoplay policies don't block it, and every call is guarded so the
 * game runs fine in environments without Web Audio (e.g. headless tests).
 */
let ctx: AudioContext | null = null;
let muted = false;

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
}

export function toggleMuted(): boolean {
  muted = !muted;
  return muted;
}

/** Call from a user-gesture handler (e.g. a click) to unlock audio. */
export function initAudio(): void {
  if (ctx) return;
  try {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) ctx = new Ctor();
  } catch {
    ctx = null;
  }
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType,
  gain = 0.12,
  slideTo?: number,
): void {
  if (muted || !ctx) return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(slideTo, now + dur);
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur);
  } catch {
    /* ignore audio failures */
  }
}

export function sfxHit(crit = false): void {
  tone(crit ? 220 : 160, 0.12, "square", crit ? 0.16 : 0.1, crit ? 90 : 70);
}

export function sfxAbility(): void {
  tone(420, 0.18, "sawtooth", 0.1, 760);
}

export function sfxHeal(): void {
  tone(520, 0.22, "sine", 0.09, 880);
}

export function sfxWin(): void {
  [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.18, "triangle", 0.12), i * 110));
}

export function sfxLose(): void {
  [392, 311, 247].forEach((f, i) => setTimeout(() => tone(f, 0.24, "sawtooth", 0.1), i * 140));
}
