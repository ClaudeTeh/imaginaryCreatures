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

/** Call from a user-gesture handler to unlock Web Audio (handles suspended state). */
export function initAudio(): void {
  try {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!ctx && Ctor) ctx = new Ctor();
    // Browsers start AudioContext suspended even after a user gesture — must resume.
    if (ctx && ctx.state === "suspended") void ctx.resume();
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
  delayMs = 0,
): void {
  if (muted || !ctx) return;
  const play = () => {
    if (!ctx) return;
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
  };
  if (delayMs > 0) setTimeout(play, delayMs); else play();
}

/** Low-frequency rumble via noise-shaped oscillator. */
function noise(dur: number, gain = 0.08, delayMs = 0): void {
  if (muted || !ctx) return;
  const play = () => {
    if (!ctx) return;
    try {
      const bufSize = ctx.sampleRate * dur;
      const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 220;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      src.connect(filter).connect(g).connect(ctx.destination);
      src.start(ctx.currentTime);
    } catch { /* ignore */ }
  };
  if (delayMs > 0) setTimeout(play, delayMs); else play();
}

export function sfxHit(crit = false): void {
  // Thud impact — low square thump + noise burst
  tone(crit ? 180 : 130, 0.08, "square", crit ? 0.18 : 0.12, crit ? 60 : 50);
  noise(crit ? 0.18 : 0.10, crit ? 0.14 : 0.08);
  if (crit) {
    // Extra crack on crits
    tone(900, 0.04, "square", 0.06, 200, 15);
  }
}

export function sfxAbility(kind?: "shock" | "venom" | "spit" | "leech" | "charge" | "armor" | "frenzy" | "regenerate"): void {
  switch (kind) {
    case "shock":
      // Electric zap — high sawtooth crackle
      tone(1200, 0.05, "sawtooth", 0.12, 80);
      tone(800, 0.12, "square", 0.08, 200, 30);
      noise(0.1, 0.06, 40);
      break;
    case "venom":
      // Wet hiss — sine descending
      tone(600, 0.25, "sine", 0.08, 180);
      noise(0.2, 0.04, 20);
      break;
    case "spit":
      // Fire/acid launch — rising then pop
      tone(300, 0.08, "sawtooth", 0.1, 800);
      tone(400, 0.12, "triangle", 0.08, 100, 80);
      noise(0.12, 0.06, 90);
      break;
    case "leech":
      // Eerie drain — low warble
      tone(220, 0.3, "sine", 0.1, 160);
      tone(330, 0.3, "sine", 0.06, 240, 80);
      break;
    case "charge":
      // Rumble slam — very low thud
      tone(80, 0.25, "sawtooth", 0.15, 40);
      noise(0.3, 0.12);
      break;
    case "armor":
      // Shield clang — metallic
      tone(880, 0.06, "square", 0.1, 440);
      tone(660, 0.12, "triangle", 0.08, 330, 40);
      break;
    case "frenzy":
      // Battle cry — ascending burst
      tone(400, 0.06, "sawtooth", 0.12, 900);
      tone(500, 0.06, "sawtooth", 0.10, 1100, 50);
      tone(600, 0.08, "sawtooth", 0.08, 1300, 100);
      break;
    case "regenerate":
      sfxHeal();
      break;
    default:
      // Generic ability — rising sweep
      tone(420, 0.18, "sawtooth", 0.1, 760);
  }
}

export function sfxHeal(): void {
  // Warm chime — two overlapping sines
  tone(660, 0.22, "sine", 0.09, 990);
  tone(880, 0.18, "sine", 0.06, 1320, 60);
}

export function sfxRoar(): void {
  // Battle-start roar — low growl + noise swell
  noise(0.6, 0.15);
  tone(120, 0.4, "sawtooth", 0.12, 60);
  tone(180, 0.3, "sawtooth", 0.08, 90, 150);
}

export function sfxVocalize(colorHint?: string): void {
  // Creature idle cry — varies by color hint
  if (colorHint === "#ff6030") {
    // Dragon growl
    tone(140, 0.18, "sawtooth", 0.07, 80);
    noise(0.15, 0.04, 50);
  } else if (colorHint === "#b060ff") {
    // Jellyfish chime
    tone(880, 0.15, "sine", 0.05, 660);
    tone(1100, 0.1, "sine", 0.03, 880, 60);
  } else if (colorHint === "#50e8d0") {
    // Eel crackle
    tone(600, 0.08, "square", 0.05, 300);
    noise(0.08, 0.03, 20);
  } else {
    // Generic creature cry
    tone(280, 0.14, "triangle", 0.05, 200);
  }
}

export function sfxDeath(): void {
  // Collapse thud + descending tone
  noise(0.4, 0.12);
  tone(200, 0.5, "sawtooth", 0.1, 40, 80);
}

let battleMusicTempo = 420; // ms between notes — lower = faster

export function setBattleMusicTempo(fast: boolean): void {
  battleMusicTempo = fast ? 280 : 420;
}

export function startBattleMusic(biomeKind: string): () => void {
  if (muted || !ctx) return () => {};

  // Base notes per biome (MIDI-style frequencies)
  const scales: Record<string, number[]> = {
    forest:  [261.6, 293.7, 329.6, 392.0, 440.0],   // C major pentatonic — calm, natural
    sky:     [293.7, 329.6, 392.0, 440.0, 523.3],   // D major pentatonic — bright, airy
    ocean:   [261.6, 311.1, 349.2, 392.0, 466.2],   // C minor pentatonic — mysterious, deep
    volcano: [220.0, 246.9, 293.7, 329.6, 369.9],   // A natural minor — tense, dramatic
    desert:  [246.9, 277.2, 329.6, 369.9, 415.3],   // B minor pentatonic — sparse, eerie
  };

  const notes = scales[biomeKind] ?? scales.forest;
  let stopped = false;
  let noteIdx = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const playNext = () => {
    if (stopped || muted || !ctx) return;
    const note = notes[noteIdx % notes.length];
    // Soft triangle wave arpeggio — low gain so it doesn't overpower SFX
    tone(note, 0.35, "triangle", 0.04);
    // Occasional bass note
    if (noteIdx % 4 === 0) tone(note / 2, 0.6, "sine", 0.03);
    noteIdx++;
    timer = setTimeout(playNext, battleMusicTempo);
  };

  // Start after a 600ms delay so the battle intro sound finishes first
  timer = setTimeout(playNext, 600);

  return () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
  };
}

export function startBiomeAmbient(biomeKind: string): () => void {
  if (muted || !ctx) return () => {};

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const playAmbient = () => {
    if (stopped || muted || !ctx) return;

    switch (biomeKind) {
      case "forest":
        // Occasional bird chirp — high sine blip
        if (Math.random() < 0.6) tone(2200 + Math.random() * 400, 0.06, "sine", 0.02, 2800);
        break;
      case "sky":
        // Wind howl — filtered noise sweep
        noise(0.4, 0.015);
        tone(180, 0.5, "sine", 0.01, 220);
        break;
      case "ocean":
        // Low whoosh — noise swell
        noise(0.8, 0.018);
        tone(80, 0.6, "sine", 0.01, 100);
        break;
      case "volcano":
        // Low rumble — bass noise
        noise(0.5, 0.02);
        if (Math.random() < 0.3) tone(60, 0.4, "sawtooth", 0.015, 40);
        break;
      case "desert":
        // Dry wind — quiet noise with slight pitch
        noise(0.6, 0.01);
        if (Math.random() < 0.2) tone(900 + Math.random() * 200, 0.08, "sine", 0.008, 700);
        break;
    }

    const intervalMs = 1800 + Math.random() * 1200;
    timer = setTimeout(playAmbient, intervalMs);
  };

  timer = setTimeout(playAmbient, 2000 + Math.random() * 1000);

  return () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
  };
}

export function sfxWin(): void {
  [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, "triangle", 0.12, undefined, i * 110));
}

export function sfxLose(): void {
  [392, 311, 247].forEach((f, i) => tone(f, 0.24, "sawtooth", 0.1, undefined, i * 140));
}
