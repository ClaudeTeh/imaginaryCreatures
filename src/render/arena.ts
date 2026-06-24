import type { BattleEvent, BattleResult, Side } from "../combat/combat";
import { sfxAbility, sfxHeal, sfxHit } from "./sound";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface FighterView {
  side: Side;
  name: string;
  emoji: string;
  partEmojis: Record<string, string>;
  maxHp: number;
  displayHp: number;
  targetHp: number;
  x: number;
  baseX: number;
  shake: number;
  lunge: number;
  flash: number;
}

interface FloatText {
  x: number;
  y: number;
  vy: number;
  life: number;
  text: string;
  color: string;
  size: number;
}

const W = 960;
const H = 420;
const GROUND_Y = 300;

/**
 * Replay a simulated battle on the canvas. Pure presentation — it consumes the
 * deterministic event log produced by the simulator, so what you see is exactly
 * what was computed.
 */
export function playBattle(
  canvas: HTMLCanvasElement,
  result: BattleResult,
  onDone: (winner: Side | "draw") => void,
): () => void {
  // High-DPI: render at device pixel ratio for a crisp image, but keep drawing
  // in logical W×H coordinates by scaling the context.
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);

  const starts = result.events.filter((e) => e.kind === "start") as Extract<
    BattleEvent,
    { kind: "start" }
  >[];
  const sa = starts.find((s) => s.side === "a")!;
  const sb = starts.find((s) => s.side === "b")!;

  const fighters: Record<Side, FighterView> = {
    a: mkView("a", sa, 250),
    b: mkView("b", sb, W - 250),
  };

  const reduceMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

  const floats: FloatText[] = [];
  const particles: Particle[] = [];
  let camShake = 0;
  const ordered = [...result.events].sort((x, y) => x.t - y.t);
  let cursor = 0;
  let currentTick = 0;
  // Reduced motion: resolve the battle near-instantly with no shake/particles.
  const durationFrames = reduceMotion
    ? clamp(result.ticks, 20, 50)
    : clamp(result.ticks, 200, 460);
  const ticksPerFrame = result.ticks / durationFrames;
  let raf = 0;
  let frame = 0;
  let finished = false;

  function step() {
    frame++;
    currentTick += ticksPerFrame;

    while (cursor < ordered.length && ordered[cursor].t <= currentTick) {
      applyEvent(ordered[cursor]);
      cursor++;
    }

    for (const side of ["a", "b"] as Side[]) {
      const f = fighters[side];
      f.displayHp += (f.targetHp - f.displayHp) * 0.25;
      f.shake *= 0.8;
      f.lunge *= 0.82;
      f.flash *= 0.85;
      const dir = side === "a" ? 1 : -1;
      f.x = f.baseX + f.lunge * dir;
    }
    for (let i = floats.length - 1; i >= 0; i--) {
      const ft = floats[i];
      ft.y += ft.vy;
      ft.vy += 0.06;
      ft.life -= 1;
      if (ft.life <= 0) floats.splice(i, 1);
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.18;
      p.vx *= 0.98;
      p.life -= 1;
      if (p.life <= 0) particles.splice(i, 1);
    }
    camShake *= 0.85;

    draw();

    const done = cursor >= ordered.length && frame > durationFrames;
    if (done && floats.length === 0) {
      if (!finished) {
        finished = true;
        onDone(result.winner);
      }
      return;
    }
    raf = requestAnimationFrame(step);
  }

  function applyEvent(e: BattleEvent) {
    switch (e.kind) {
      case "attack": {
        const atk = fighters[e.by];
        const foe = fighters[other(e.by)];
        atk.lunge = 46;
        foe.shake = e.crit ? 16 : 9;
        foe.flash = 1;
        foe.targetHp = e.targetHp;
        camShake = Math.max(camShake, e.crit ? 10 : 5);
        spawnBurst(foe, e.crit ? "#ffce6b" : "#ff8f6b", e.crit ? 16 : 9, e.crit ? 5 : 3.4);
        sfxHit(e.crit);
        addFloat(foe, e.crit ? `${e.dmg}!` : `${e.dmg}`, e.crit ? "#ffce6b" : "#ff8f6b", e.crit ? 34 : 26);
        break;
      }
      case "ability": {
        const atk = fighters[e.by];
        const foe = fighters[other(e.by)];
        atk.flash = 0.6;
        sfxAbility();
        const heals = e.value < 0;
        if (!heals && (e.ability === "venom" || e.ability === "armor" || e.ability === "frenzy")) {
          spawnBurst(atk, "#7aa2ff", 8, 2.6);
          addFloat(atk, abilityTag(e.ability), "#7aa2ff", 20);
        } else if (e.ability !== "regenerate") {
          foe.shake = 12;
          foe.flash = 1;
          foe.targetHp = e.targetHp;
          camShake = Math.max(camShake, 8);
          spawnBurst(foe, "#c39bff", 12, 4);
          addFloat(foe, `${abilityTag(e.ability)} ${e.value}`, "#c39bff", 24);
        }
        break;
      }
      case "poison": {
        const f = fighters[e.on];
        f.targetHp = e.hp;
        f.flash = Math.max(f.flash, 0.5);
        spawnBurst(f, "#9be86c", 5, 2);
        addFloat(f, `☠ ${e.dmg}`, "#9be86c", 20);
        break;
      }
      case "heal": {
        const f = fighters[e.on];
        f.targetHp = e.hp;
        sfxHeal();
        spawnBurst(f, "#6ce5b1", 8, 2.4);
        addFloat(f, `+${e.amount}`, "#6ce5b1", 24);
        break;
      }
      case "death": {
        fighters[e.side].flash = 1;
        break;
      }
    }
  }

  function addFloat(f: FighterView, text: string, color: string, size: number) {
    floats.push({
      x: f.baseX + (Math.random() * 40 - 20),
      y: GROUND_Y - 110,
      vy: -2.2,
      life: 55,
      text,
      color,
      size,
    });
  }

  function spawnBurst(f: FighterView, color: string, count: number, power: number) {
    if (reduceMotion) return;
    const cx = f.baseX;
    const cy = GROUND_Y - 60;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = power * (0.4 + Math.random());
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 1.5,
        life: 22 + Math.random() * 14,
        maxLife: 36,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawBackground();

    const shakeAmt = reduceMotion ? 0 : camShake;
    const sx = (Math.random() * 2 - 1) * shakeAmt;
    const sy = (Math.random() * 2 - 1) * shakeAmt;
    ctx.save();
    ctx.translate(sx, sy);

    drawFighter(fighters.a);
    drawFighter(fighters.b);

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const ft of floats) {
      ctx.globalAlpha = Math.min(1, ft.life / 30);
      ctx.fillStyle = ft.color;
      ctx.font = `700 ${ft.size}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // HUD (HP bars) stays fixed, unaffected by camera shake
    drawHpBars();
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0e1730");
    g.addColorStop(1, "#0a1120");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // arena floor
    const fg = ctx.createLinearGradient(0, GROUND_Y, 0, H);
    fg.addColorStop(0, "#16223f");
    fg.addColorStop(1, "#0c1426");
    ctx.fillStyle = fg;
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.strokeStyle = "rgba(122,162,255,0.25)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(W, GROUND_Y);
    ctx.stroke();
  }

  function drawFighter(f: FighterView) {
    const bob = Math.sin(frame * 0.12 + (f.side === "a" ? 0 : Math.PI)) * 6;
    const shakeX = (Math.random() * 2 - 1) * f.shake;
    const cx = f.x + shakeX;
    const baseY = GROUND_Y - 70 + bob;
    const alive = f.displayHp > 0.5;

    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(f.x, GROUND_Y + 6, 58, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(cx, baseY);
    if (f.side === "b") ctx.scale(-1, 1);
    if (!alive) {
      ctx.globalAlpha = 0.4;
      ctx.rotate(0.45);
    }

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const p = f.partEmojis;

    // Row 1: head (small, top)
    ctx.font = "38px serif";
    ctx.fillText(p.head, 0, -66);

    // Row 2: forelimbs | body | hindlimbs (body is the centrepiece)
    ctx.font = "58px serif";
    ctx.fillText(p.body, 0, -14);
    ctx.font = "32px serif";
    ctx.fillText(p.forelimbs, -40, -10);
    ctx.fillText(p.hindlimbs, 40, -10);

    // Row 3: tail (small, bottom)
    ctx.font = "30px serif";
    ctx.fillText(p.tail, 0, 32);

    ctx.restore();

    if (f.flash > 0.02) {
      const flashY = baseY - 20;
      ctx.globalAlpha = f.flash * 0.45;
      ctx.fillStyle = "#ff4d6d";
      ctx.beginPath();
      ctx.arc(f.x, flashY, 74, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawHpBars() {
    drawHpBar(fighters.a, 40, "left");
    drawHpBar(fighters.b, W - 360, "right");
  }

  function drawHpBar(f: FighterView, x: number, align: "left" | "right") {
    const barW = 320;
    const y = 32;
    const pct = Math.max(0, f.displayHp) / f.maxHp;
    ctx.fillStyle = "#0c1222";
    roundRect(x, y, barW, 18, 9);
    ctx.fill();
    const grad = ctx.createLinearGradient(x, 0, x + barW, 0);
    grad.addColorStop(0, pct > 0.3 ? "#36c08a" : "#ff6b81");
    grad.addColorStop(1, pct > 0.3 ? "#6ce5b1" : "#ff97a6");
    ctx.fillStyle = grad;
    const fillW = barW * pct;
    if (fillW > 0) {
      roundRect(align === "left" ? x : x + barW - fillW, y, fillW, 18, 9);
      ctx.fill();
    }
    ctx.fillStyle = "#e7ecf7";
    ctx.font = "700 15px Inter, system-ui, sans-serif";
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = align;
    ctx.fillText(
      `${f.name}  ${Math.max(0, Math.round(f.displayHp))}/${f.maxHp}`,
      align === "left" ? x : x + barW,
      y - 8,
    );
  }

  function roundRect(x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

function mkView(side: Side, s: { name: string; emoji: string; partEmojis: Record<string, string>; maxHp: number }, x: number): FighterView {
  return {
    side,
    name: s.name,
    emoji: s.emoji,
    partEmojis: s.partEmojis,
    maxHp: s.maxHp,
    displayHp: s.maxHp,
    targetHp: s.maxHp,
    x,
    baseX: x,
    shake: 0,
    lunge: 0,
    flash: 0,
  };
}

function other(s: Side): Side {
  return s === "a" ? "b" : "a";
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function abilityTag(id: string): string {
  return (
    {
      venom: "Venom",
      regenerate: "Regen",
      spit: "Spit",
      charge: "Charge",
      armor: "Armor",
      frenzy: "Frenzy",
      shock: "Shock",
      leech: "Leech",
    }[id] ?? id
  );
}
