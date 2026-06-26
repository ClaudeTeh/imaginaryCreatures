/**
 * Procedural canvas drawing for creature parts.
 * Each function draws in its own local coordinate space (roughly ±40 units).
 * The caller applies translate + scale before invoking.
 *
 * Slot coordinate conventions (facing right):
 *   head      → rightmost, upper
 *   body      → centre
 *   forelimbs → front-lower
 *   hindlimbs → rear-lower
 *   tail      → leftmost
 */

// ─── colour palette per animal ───────────────────────────────────────────────

export interface PartColors {
  fill: string;
  shade: string;   // darker edge / outline
  accent: string;  // highlight / detail colour
}

export const ANIMAL_COLORS: Record<string, PartColors> = {
  ant:      { fill: '#2a1205', shade: '#120800', accent: '#d43010' },
  rabbit:   { fill: '#f0e6dc', shade: '#b89888', accent: '#ff8898' },
  crab:     { fill: '#d44018', shade: '#922808', accent: '#f8a040' },
  gecko:    { fill: '#4a8c20', shade: '#2a5010', accent: '#a8e030' },
  boar:     { fill: '#5c3820', shade: '#301808', accent: '#c09048' },
  wolf:     { fill: '#888070', shade: '#484038', accent: '#d8ccc0' },
  cobra:    { fill: '#2a6c14', shade: '#184008', accent: '#e8d020' },
  scorpion: { fill: '#8c7410', shade: '#504000', accent: '#f0c020' },
  eagle:    { fill: '#5a380c', shade: '#2c1808', accent: '#f8f0d0' },
  gorilla:  { fill: '#1c1c14', shade: '#080808', accent: '#706858' },
  bear:     { fill: '#5c2c0c', shade: '#2c1408', accent: '#c08040' },
  rhino:    { fill: '#707060', shade: '#3c3c30', accent: '#c0b898' },
  eel:      { fill: '#106050', shade: '#083028', accent: '#50e8d0' },
  tiger:    { fill: '#c86008', shade: '#6c2e00', accent: '#f0a828' },
  dragon:   { fill: '#7c1010', shade: '#3c0808', accent: '#ff6030' },
  jellyfish:{ fill: '#3c1870', shade: '#1c0840', accent: '#b060ff' },
  panther:   { fill: '#1a1a2e', shade: '#0d0d18', accent: '#9060e0' },
  mantis:    { fill: '#3a7c20', shade: '#1e4410', accent: '#a0e840' },
  chameleon: { fill: '#4a9c30', shade: '#285018', accent: '#d0f060' },
  octopus:   { fill: '#8c3080', shade: '#4a1840', accent: '#ff80f0' },
  bat:       { fill: '#2c1840', shade: '#140c20', accent: '#9870d0' },
  ox:        { fill: '#4c3018', shade: '#280c00', accent: '#b08040' },
  shark:     { fill: '#384c60', shade: '#1c2c38', accent: '#80d0f8' },
  phoenix:   { fill: '#c04010', shade: '#601800', accent: '#ffd040' },
};

// ─── shared helpers ───────────────────────────────────────────────────────────

/** Parse a #rrggbb hex into [r,g,b]. */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Mix a hex colour toward white (amt>0) or black (amt<0) by amt in [-1,1]. */
function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  const mix = (c: number) => Math.round(c + (t - c) * p);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

/**
 * Volumetric sphere shading. Light comes from the upper-left, so we build a
 * five-stop radial: a hot specular highlight, the base fill, then a darkened
 * core and a near-black rim — giving flat parts a sense of roundness and depth
 * that reads much closer to a lit 3D form than a flat two-stop gradient.
 */
function radial(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, r: number,
  inner: string, outer: string,
): CanvasGradient {
  const lx = cx - r * 0.42;
  const ly = cy - r * 0.42;
  const g = ctx.createRadialGradient(lx, ly, r * 0.04, cx, cy, r * 1.06);
  g.addColorStop(0, shade(inner, 0.55));   // specular hot-spot
  g.addColorStop(0.22, shade(inner, 0.16)); // lit upper surface
  g.addColorStop(0.62, inner);              // base colour
  g.addColorStop(0.88, outer);              // shadowed lower surface
  g.addColorStop(1, shade(outer, -0.35));   // dark rim / occlusion edge
  return g;
}

function ellipse(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, rx: number, ry: number,
  rot = 0,
) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
}

// ─── HEAD drawings ────────────────────────────────────────────────────────────

export function drawHead(
  ctx: CanvasRenderingContext2D,
  animalId: string,
  phase: number,
  atk: number,
) {
  const c = ANIMAL_COLORS[animalId] ?? ANIMAL_COLORS.boar;
  ctx.save();
  switch (animalId) {
    case 'ant':      headAnt(ctx, c, phase); break;
    case 'rabbit':   headRabbit(ctx, c, atk); break;
    case 'crab':     headCrab(ctx, c, atk); break;
    case 'gecko':    headGecko(ctx, c); break;
    case 'boar':     headBoar(ctx, c, atk); break;
    case 'wolf':     headWolf(ctx, c, atk); break;
    case 'cobra':    headCobra(ctx, c, phase); break;
    case 'scorpion': headScorpion(ctx, c); break;
    case 'eagle':    headEagle(ctx, c, atk); break;
    case 'gorilla':  headGorilla(ctx, c, atk); break;
    case 'bear':     headBear(ctx, c); break;
    case 'rhino':    headRhino(ctx, c); break;
    case 'eel':      headEel(ctx, c, atk); break;
    case 'tiger':    headTiger(ctx, c, atk); break;
    default:         headBoar(ctx, c, atk);
  }
  ctx.restore();
}

function headRoundBase(ctx: CanvasRenderingContext2D, c: PartColors, rx = 22, ry = 20) {
  ellipse(ctx, 0, 0, rx, ry);
  ctx.fillStyle = radial(ctx, 0, 0, rx, c.fill, c.shade);
  ctx.fill();
  ctx.strokeStyle = c.shade;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function eye(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) {
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(x + 1, y, r * 0.55, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2); ctx.fill();
}

function headAnt(ctx: CanvasRenderingContext2D, c: PartColors, phase: number) {
  headRoundBase(ctx, c, 18, 16);
  eye(ctx, 10, -7, 4, c.accent);
  // mandibles
  ctx.strokeStyle = c.shade; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(14, -4); ctx.quadraticCurveTo(26, -1, 24, 8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(14, 4); ctx.quadraticCurveTo(26, 1, 24, -8); ctx.stroke();
  // antennae
  ctx.strokeStyle = c.accent; ctx.lineWidth = 1.5;
  const w = Math.sin(phase) * 5;
  ctx.beginPath(); ctx.moveTo(-3, -16); ctx.quadraticCurveTo(-14, -34 + w, -20, -44 + w * 0.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(4, -16); ctx.quadraticCurveTo(-6, -36 - w, -12, -44 - w * 0.5); ctx.stroke();
  ctx.fillStyle = c.accent;
  ctx.beginPath(); ctx.arc(-20, -44 + w * 0.5, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(-12, -44 - w * 0.5, 2.5, 0, Math.PI * 2); ctx.fill();
}

function headRabbit(ctx: CanvasRenderingContext2D, c: PartColors, atk: number) {
  // ears
  ctx.fillStyle = radial(ctx, -10, -34, 18, c.fill, c.shade);
  ellipse(ctx, -10, -34, 7, 18, -0.2); ctx.fill();
  ctx.strokeStyle = c.shade; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = c.accent;
  ellipse(ctx, -10, -34, 4, 13, -0.2); ctx.fill();
  headRoundBase(ctx, c, 20, 18);
  eye(ctx, 12, -6, 5, c.accent);
  // nose
  ctx.fillStyle = c.accent;
  ctx.beginPath(); ctx.arc(18 + atk * 4, 3, 3, 0, Math.PI * 2); ctx.fill();
}

function headCrab(ctx: CanvasRenderingContext2D, c: PartColors, atk: number) {
  ellipse(ctx, 0, 0, 28, 16); ctx.fillStyle = radial(ctx, 0, 0, 28, c.fill, c.shade); ctx.fill();
  ctx.strokeStyle = c.shade; ctx.lineWidth = 2; ctx.stroke();
  // eyestalks
  ctx.strokeStyle = c.shade; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-12, -14); ctx.lineTo(-14, -24 - atk * 4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(12, -14); ctx.lineTo(14, -24 - atk * 4); ctx.stroke();
  eye(ctx, -14, -26 - atk * 4, 4, c.accent);
  eye(ctx, 14, -26 - atk * 4, 4, c.accent);
  // claw-mouth
  ctx.strokeStyle = c.shade; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(22, -4); ctx.quadraticCurveTo(34, 0, 32, 8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(22, 4); ctx.quadraticCurveTo(34, 0, 32, -8); ctx.stroke();
}

function headGecko(ctx: CanvasRenderingContext2D, c: PartColors) {
  ellipse(ctx, 2, 0, 26, 14, 0); ctx.fillStyle = radial(ctx, 2, 0, 26, c.fill, c.shade); ctx.fill();
  ctx.strokeStyle = c.shade; ctx.lineWidth = 2; ctx.stroke();
  eye(ctx, 14, -6, 6, c.accent);
  // spots
  ctx.fillStyle = c.accent; ctx.globalAlpha = 0.5;
  [[-6, -4], [-12, 2], [-4, 6]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill(); });
  ctx.globalAlpha = 1;
}

function headBoar(ctx: CanvasRenderingContext2D, c: PartColors, atk: number) {
  // ears
  ctx.fillStyle = c.shade;
  ellipse(ctx, -14, -20, 7, 9, -0.3); ctx.fill();
  ctx.fillStyle = c.accent;
  ellipse(ctx, -14, -20, 4, 6, -0.3); ctx.fill();
  headRoundBase(ctx, c, 22, 20);
  eye(ctx, 8, -8, 4, '#f0e000');
  // snout
  ellipse(ctx, 18, 4, 10, 8);
  ctx.fillStyle = c.shade; ctx.fill();
  ctx.strokeStyle = c.shade; ctx.lineWidth = 1.5; ctx.stroke();
  // tusks
  ctx.strokeStyle = '#e0d8b0'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(14, 8 + atk * 2); ctx.quadraticCurveTo(28, 14, 26, 22); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(14, -8 - atk * 2); ctx.quadraticCurveTo(28, -14, 26, -22); ctx.stroke();
}

function headWolf(ctx: CanvasRenderingContext2D, c: PartColors, atk: number) {
  // ears
  ctx.fillStyle = c.fill; ctx.strokeStyle = c.shade; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-12, -18); ctx.lineTo(-6, -36); ctx.lineTo(4, -18); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = c.accent; ctx.globalAlpha = 0.6;
  ctx.beginPath(); ctx.moveTo(-10, -20); ctx.lineTo(-6, -32); ctx.lineTo(2, -20); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = 1;
  ellipse(ctx, 4, 0, 26, 18); ctx.fillStyle = radial(ctx, 4, 0, 26, c.fill, c.shade); ctx.fill();
  ctx.strokeStyle = c.shade; ctx.lineWidth = 2; ctx.stroke();
  eye(ctx, 14, -8, 5, '#f0d040');
  // muzzle
  ellipse(ctx, 20, 4, 10, 8); ctx.fillStyle = c.shade; ctx.fill();
  // jaw open on attack
  if (atk > 0.3) {
    ctx.strokeStyle = '#f0e0c0'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(12, 6); ctx.lineTo(26 + atk * 4, 6 + atk * 10); ctx.stroke();
  }
}

function headCobra(ctx: CanvasRenderingContext2D, c: PartColors, phase: number) {
  // hood
  ctx.fillStyle = radial(ctx, 0, 0, 32, c.fill, c.shade);
  ctx.beginPath();
  ctx.ellipse(0, 0, 32, 26, 0, Math.PI * 0.15, Math.PI * 0.85);
  ctx.quadraticCurveTo(-10, 14, 0, 20);
  ctx.quadraticCurveTo(10, 14, 0, 0);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = c.shade; ctx.lineWidth = 2; ctx.stroke();
  // hood pattern
  ctx.strokeStyle = c.accent; ctx.lineWidth = 2; ctx.globalAlpha = 0.6;
  ctx.beginPath(); ctx.ellipse(0, -4, 18, 14, 0, Math.PI * 0.2, Math.PI * 0.8); ctx.stroke();
  ctx.globalAlpha = 1;
  // head
  ellipse(ctx, 6, 2, 14, 10); ctx.fillStyle = c.fill; ctx.fill();
  ctx.strokeStyle = c.shade; ctx.lineWidth = 2; ctx.stroke();
  eye(ctx, 12, -4, 4, c.accent);
  // tongue
  const flick = Math.sin(phase * 4) * 3;
  ctx.strokeStyle = '#e02020'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(18, 4); ctx.lineTo(26, 4 + flick);
  ctx.moveTo(26, 4 + flick); ctx.lineTo(30, 2 + flick); ctx.moveTo(26, 4 + flick); ctx.lineTo(30, 6 + flick);
  ctx.stroke();
}

function headScorpion(ctx: CanvasRenderingContext2D, c: PartColors) {
  ellipse(ctx, 0, 0, 20, 14); ctx.fillStyle = radial(ctx, 0, 0, 20, c.fill, c.shade); ctx.fill();
  ctx.strokeStyle = c.shade; ctx.lineWidth = 2; ctx.stroke();
  eye(ctx, 12, -6, 3, c.accent);
  eye(ctx, 6, -10, 2.5, c.accent);
  // chelicerae
  ctx.strokeStyle = c.shade; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(16, -4); ctx.quadraticCurveTo(28, -2, 26, 6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(16, 4); ctx.quadraticCurveTo(28, 2, 26, -6); ctx.stroke();
}

function headEagle(ctx: CanvasRenderingContext2D, c: PartColors, atk: number) {
  ellipse(ctx, 0, 0, 22, 20); ctx.fillStyle = radial(ctx, 0, 0, 22, c.fill, c.shade); ctx.fill();
  ctx.strokeStyle = c.shade; ctx.lineWidth = 2; ctx.stroke();
  // white head markings
  ctx.fillStyle = c.accent; ctx.globalAlpha = 0.7;
  ellipse(ctx, 2, -2, 16, 12); ctx.fill();
  ctx.globalAlpha = 1;
  eye(ctx, 10, -6, 5, c.accent);
  // beak
  ctx.fillStyle = '#e0b020'; ctx.strokeStyle = '#a07010'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(16, -2);
  ctx.lineTo(34 + atk * 5, -1 + atk * 3);
  ctx.lineTo(32 + atk * 5, 8 + atk * 4);
  ctx.lineTo(18, 6);
  ctx.closePath(); ctx.fill(); ctx.stroke();
}

function headGorilla(ctx: CanvasRenderingContext2D, c: PartColors, atk: number) {
  headRoundBase(ctx, c, 24, 22);
  // brow ridge
  ctx.fillStyle = c.shade;
  ellipse(ctx, 0, -14, 20, 6); ctx.fill();
  eye(ctx, 10, -8, 4.5, '#b06030');
  // flat nose + mouth
  ellipse(ctx, 12, 6, 9, 7); ctx.fillStyle = c.shade; ctx.fill();
  if (atk > 0.3) {
    ctx.strokeStyle = '#e05020'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(12, 8 + atk * 4, 6, 0.1, Math.PI - 0.1); ctx.stroke();
  }
}

function headBear(ctx: CanvasRenderingContext2D, c: PartColors) {
  ctx.fillStyle = c.shade; ellipse(ctx, -14, -18, 9, 8); ctx.fill();
  ctx.fillStyle = c.fill; ellipse(ctx, -14, -18, 6, 5); ctx.fill();
  headRoundBase(ctx, c, 24, 22);
  eye(ctx, 10, -7, 4.5, '#2a1c08');
  ellipse(ctx, 16, 6, 10, 8); ctx.fillStyle = c.shade; ctx.fill();
  ctx.strokeStyle = c.shade; ctx.lineWidth = 2; ctx.stroke();
}

function headRhino(ctx: CanvasRenderingContext2D, c: PartColors) {
  ellipse(ctx, 0, 2, 26, 22); ctx.fillStyle = radial(ctx, 0, 0, 26, c.fill, c.shade); ctx.fill();
  ctx.strokeStyle = c.shade; ctx.lineWidth = 2.5; ctx.stroke();
  // skin folds
  ctx.strokeStyle = c.shade; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.5;
  [[-16, -12, -10, -8], [-6, -18, 0, -14]].forEach(([x1, y1, x2, y2]) => {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 - 4, x2, y2); ctx.stroke();
  });
  ctx.globalAlpha = 1;
  // horn
  ctx.fillStyle = c.shade;
  ctx.beginPath(); ctx.moveTo(14, -14); ctx.lineTo(22, -36); ctx.lineTo(28, -14); ctx.closePath(); ctx.fill();
  eye(ctx, 10, -4, 4, c.accent);
}

function headEel(ctx: CanvasRenderingContext2D, c: PartColors, atk: number) {
  ellipse(ctx, 4, 0, 24, 12); ctx.fillStyle = radial(ctx, 4, 0, 24, c.fill, c.shade); ctx.fill();
  ctx.strokeStyle = c.shade; ctx.lineWidth = 2; ctx.stroke();
  // glow gills
  ctx.strokeStyle = c.accent; ctx.lineWidth = 2; ctx.globalAlpha = 0.7;
  [-8, -4, 0].forEach((x) => { ctx.beginPath(); ctx.moveTo(x, -10); ctx.lineTo(x, 10); ctx.stroke(); });
  ctx.globalAlpha = 1;
  eye(ctx, 14, -5, 4, c.accent);
  // open jaw on attack
  ctx.fillStyle = atk > 0.2 ? '#400820' : c.shade;
  ctx.strokeStyle = c.shade; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(20, -4);
  ctx.lineTo(36 + atk * 8, -4 + atk * 6);
  ctx.lineTo(36 + atk * 8, 4 - atk * 6);
  ctx.lineTo(20, 4);
  ctx.closePath(); ctx.fill(); ctx.stroke();
}

function headTiger(ctx: CanvasRenderingContext2D, c: PartColors, atk: number) {
  // small round ears
  ctx.fillStyle = c.fill; ctx.strokeStyle = c.shade; ctx.lineWidth = 2;
  ellipse(ctx, -14, -18, 7, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = c.accent; ctx.globalAlpha = 0.5;
  ellipse(ctx, -14, -18, 4, 4); ctx.fill(); ctx.globalAlpha = 1;
  headRoundBase(ctx, c, 22, 20);
  // stripes
  ctx.strokeStyle = '#1c0c00'; ctx.lineWidth = 3; ctx.globalAlpha = 0.6;
  [[-8, -18, -4, 6], [0, -20, 4, 4], [8, -18, 12, 6]].forEach(([x1, y1, x2, y2]) => {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  });
  ctx.globalAlpha = 1;
  eye(ctx, 10, -7, 5, '#f0c040');
  // muzzle
  ellipse(ctx, 16, 4, 8, 7); ctx.fillStyle = c.shade; ctx.fill();
  if (atk > 0.2) {
    ctx.strokeStyle = '#f8e8d0'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(10, 6); ctx.lineTo(24 + atk * 4, 6 + atk * 8); ctx.stroke();
  }
}

// ─── BODY drawings ────────────────────────────────────────────────────────────

export function drawBody(
  ctx: CanvasRenderingContext2D,
  animalId: string,
  breathe: number,
) {
  const c = ANIMAL_COLORS[animalId] ?? ANIMAL_COLORS.boar;
  ctx.save();
  switch (animalId) {
    case 'ant':      bodyAnt(ctx, c); break;
    case 'rabbit':   bodyRabbit(ctx, c, breathe); break;
    case 'crab':     bodyCrab(ctx, c); break;
    case 'gecko':    bodyGecko(ctx, c, breathe); break;
    case 'boar':     bodyBoar(ctx, c, breathe); break;
    case 'wolf':     bodyWolf(ctx, c, breathe); break;
    case 'cobra':    bodyCobra(ctx, c, breathe); break;
    case 'scorpion': bodyScorpion(ctx, c); break;
    case 'eagle':    bodyEagle(ctx, c, breathe); break;
    case 'gorilla':  bodyGorilla(ctx, c, breathe); break;
    case 'bear':     bodyBear(ctx, c, breathe); break;
    case 'rhino':    bodyRhino(ctx, c); break;
    case 'eel':      bodyEel(ctx, c, breathe); break;
    case 'tiger':    bodyTiger(ctx, c, breathe); break;
    default:         bodyBoar(ctx, c, breathe);
  }
  ctx.restore();
}

function bodyAnt(ctx: CanvasRenderingContext2D, c: PartColors) {
  // thorax
  ellipse(ctx, 10, 0, 14, 12); ctx.fillStyle = radial(ctx, 10, 0, 14, c.fill, c.shade); ctx.fill();
  ctx.strokeStyle = c.shade; ctx.lineWidth = 2; ctx.stroke();
  // abdomen (larger oval)
  ellipse(ctx, -12, 4, 18, 14); ctx.fillStyle = radial(ctx, -12, 4, 18, c.fill, c.shade); ctx.fill();
  ctx.strokeStyle = c.shade; ctx.lineWidth = 2; ctx.stroke();
  // segment ring
  ctx.strokeStyle = c.shade; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.6;
  ctx.beginPath(); ctx.ellipse(-12, 4, 14, 10, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 1;
}

function bodyRabbit(ctx: CanvasRenderingContext2D, c: PartColors, breathe: number) {
  const sx = 1 + breathe * 0.02; const sy = 1 - breathe * 0.01;
  ctx.scale(sx, sy);
  ellipse(ctx, 0, 0, 24, 22); ctx.fillStyle = radial(ctx, 0, 0, 24, c.fill, c.shade); ctx.fill();
  ctx.strokeStyle = c.shade; ctx.lineWidth = 2; ctx.stroke();
}

function bodyCrab(ctx: CanvasRenderingContext2D, c: PartColors) {
  // shell
  ellipse(ctx, 0, 0, 30, 20); ctx.fillStyle = radial(ctx, 0, 0, 30, c.fill, c.shade); ctx.fill();
  ctx.strokeStyle = c.shade; ctx.lineWidth = 2.5; ctx.stroke();
  // shell ridges
  ctx.strokeStyle = c.shade; ctx.lineWidth = 2; ctx.globalAlpha = 0.5;
  [[-16, 0, -10, -16], [0, -4, 0, -18], [16, 0, 10, -16]].forEach(([x1, y1, x2, y2]) => {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  });
  ctx.globalAlpha = 1;
}

function bodyGecko(ctx: CanvasRenderingContext2D, c: PartColors, breathe: number) {
  ctx.scale(1 + breathe * 0.015, 1);
  ellipse(ctx, 0, 0, 20, 14); ctx.fillStyle = radial(ctx, 0, 0, 20, c.fill, c.shade); ctx.fill();
  ctx.strokeStyle = c.shade; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = c.accent; ctx.globalAlpha = 0.4;
  [-12, -4, 4, 12].forEach((x) => { ctx.beginPath(); ctx.arc(x, 0, 3, 0, Math.PI * 2); ctx.fill(); });
  ctx.globalAlpha = 1;
}

function bodyBoar(ctx: CanvasRenderingContext2D, c: PartColors, breathe: number) {
  ctx.scale(1 + breathe * 0.02, 1 + breathe * 0.01);
  ellipse(ctx, 0, 2, 26, 22); ctx.fillStyle = radial(ctx, 0, 2, 26, c.fill, c.shade); ctx.fill();
  ctx.strokeStyle = c.shade; ctx.lineWidth = 2.5; ctx.stroke();
  // bristles
  ctx.strokeStyle = c.shade; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.5;
  [-14, -6, 2, 10, 18].forEach((x) => {
    ctx.beginPath(); ctx.moveTo(x, -20); ctx.lineTo(x - 1, -28); ctx.stroke();
  });
  ctx.globalAlpha = 1;
}

function bodyWolf(ctx: CanvasRenderingContext2D, c: PartColors, breathe: number) {
  ctx.scale(1 + breathe * 0.018, 1);
  ellipse(ctx, 0, 0, 22, 18); ctx.fillStyle = radial(ctx, 0, 0, 22, c.fill, c.shade); ctx.fill();
  ctx.strokeStyle = c.shade; ctx.lineWidth = 2; ctx.stroke();
  // chest lighter
  ctx.fillStyle = c.accent; ctx.globalAlpha = 0.25;
  ellipse(ctx, 6, 4, 10, 8); ctx.fill(); ctx.globalAlpha = 1;
}

function bodyCobra(ctx: CanvasRenderingContext2D, c: PartColors, breathe: number) {
  // coiled body
  ctx.strokeStyle = radial(ctx, 0, 4, 20, c.fill, c.shade);
  ctx.lineWidth = 14 + breathe * 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(20, -10); ctx.bezierCurveTo(28, 0, 20, 14, 0, 12);
  ctx.bezierCurveTo(-20, 10, -24, -4, -16, -10);
  ctx.bezierCurveTo(-8, -16, 8, -8, 8, 4);
  ctx.stroke();
  ctx.strokeStyle = c.shade; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(20, -10); ctx.bezierCurveTo(28, 0, 20, 14, 0, 12);
  ctx.bezierCurveTo(-20, 10, -24, -4, -16, -10);
  ctx.stroke();
}

function bodyScorpion(ctx: CanvasRenderingContext2D, c: PartColors) {
  // segmented abdomen + carapace
  ellipse(ctx, 4, 0, 18, 12); ctx.fillStyle = radial(ctx, 4, 0, 18, c.fill, c.shade); ctx.fill();
  ctx.strokeStyle = c.shade; ctx.lineWidth = 2; ctx.stroke();
  // segments
  ctx.strokeStyle = c.shade; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.6;
  [-8, -2, 4, 10].forEach((x) => {
    ctx.beginPath(); ctx.moveTo(x, -10); ctx.lineTo(x, 10); ctx.stroke();
  });
  ctx.globalAlpha = 1;
}

function bodyEagle(ctx: CanvasRenderingContext2D, c: PartColors, breathe: number) {
  ctx.scale(1 + breathe * 0.015, 1);
  ellipse(ctx, 0, 0, 22, 20); ctx.fillStyle = radial(ctx, 0, 0, 22, c.fill, c.shade); ctx.fill();
  ctx.strokeStyle = c.shade; ctx.lineWidth = 2; ctx.stroke();
  // chest white
  ctx.fillStyle = c.accent; ctx.globalAlpha = 0.35;
  ellipse(ctx, 4, 4, 12, 10); ctx.fill(); ctx.globalAlpha = 1;
  // feather lines
  ctx.strokeStyle = c.shade; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.35;
  [[-16, -10, -8, 6], [-8, -14, 0, 8], [0, -16, 8, 8]].forEach(([x1, y1, x2, y2]) => {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  });
  ctx.globalAlpha = 1;
}

function bodyGorilla(ctx: CanvasRenderingContext2D, c: PartColors, breathe: number) {
  ctx.scale(1 + breathe * 0.025, 1 + breathe * 0.015);
  ellipse(ctx, 0, 0, 30, 26); ctx.fillStyle = radial(ctx, 0, 0, 30, c.fill, c.shade); ctx.fill();
  ctx.strokeStyle = c.shade; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = c.accent; ctx.globalAlpha = 0.2;
  ellipse(ctx, 4, 6, 14, 12); ctx.fill(); ctx.globalAlpha = 1;
}

function bodyBear(ctx: CanvasRenderingContext2D, c: PartColors, breathe: number) {
  ctx.scale(1 + breathe * 0.022, 1 + breathe * 0.012);
  ellipse(ctx, 0, 2, 28, 26); ctx.fillStyle = radial(ctx, 0, 2, 28, c.fill, c.shade); ctx.fill();
  ctx.strokeStyle = c.shade; ctx.lineWidth = 2.5; ctx.stroke();
}

function bodyRhino(ctx: CanvasRenderingContext2D, c: PartColors) {
  ellipse(ctx, 0, 2, 32, 24); ctx.fillStyle = radial(ctx, 0, 2, 32, c.fill, c.shade); ctx.fill();
  ctx.strokeStyle = c.shade; ctx.lineWidth = 3; ctx.stroke();
  // armour folds
  ctx.strokeStyle = c.shade; ctx.lineWidth = 2; ctx.globalAlpha = 0.4;
  [[-20, -14, -24, 6], [0, -18, -4, 8], [18, -14, 20, 6]].forEach(([x1, y1, x2, y2]) => {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  });
  ctx.globalAlpha = 1;
}

function bodyEel(ctx: CanvasRenderingContext2D, c: PartColors, breathe: number) {
  // long serpentine body
  ctx.strokeStyle = radial(ctx, 0, 0, 20, c.fill, c.shade);
  ctx.lineWidth = 18 + breathe * 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(22, -6); ctx.bezierCurveTo(10, -4, -10, 4, -24, 2); ctx.stroke();
  ctx.strokeStyle = c.shade; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(22, -6); ctx.bezierCurveTo(10, -4, -10, 4, -24, 2); ctx.stroke();
  // electric stripe
  ctx.strokeStyle = c.accent; ctx.lineWidth = 2; ctx.globalAlpha = 0.6;
  ctx.beginPath(); ctx.moveTo(22, -6); ctx.bezierCurveTo(10, 0, -10, 8, -24, 6); ctx.stroke();
  ctx.globalAlpha = 1;
}

function bodyTiger(ctx: CanvasRenderingContext2D, c: PartColors, breathe: number) {
  ctx.scale(1 + breathe * 0.018, 1);
  ellipse(ctx, 0, 0, 24, 20); ctx.fillStyle = radial(ctx, 0, 0, 24, c.fill, c.shade); ctx.fill();
  ctx.strokeStyle = c.shade; ctx.lineWidth = 2; ctx.stroke();
  // stripes
  ctx.strokeStyle = '#1c0c00'; ctx.lineWidth = 3; ctx.globalAlpha = 0.55;
  [[-14, -18, -10, 14], [-4, -20, 0, 16], [6, -18, 10, 14], [16, -14, 20, 10]].forEach(([x1, y1, x2, y2]) => {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  });
  ctx.globalAlpha = 1;
}

// ─── FORELIMBS drawings ───────────────────────────────────────────────────────

export function drawForelimbs(
  ctx: CanvasRenderingContext2D,
  animalId: string,
  atk: number,
) {
  const c = ANIMAL_COLORS[animalId] ?? ANIMAL_COLORS.boar;
  ctx.save();
  switch (animalId) {
    case 'ant':
    case 'scorpion': foreLegMulti(ctx, c, 3, atk); break;
    case 'crab':     foreCrabClaw(ctx, c, atk); break;
    case 'eagle':    foreWing(ctx, c, atk); break;
    case 'cobra':
    case 'eel':      foreNone(ctx, c); break;
    default:         forePaw(ctx, c, animalId, atk); break;
  }
  ctx.restore();
}

function forePaw(ctx: CanvasRenderingContext2D, c: PartColors, id: string, atk: number) {
  const large = ['gorilla', 'bear', 'rhino'].includes(id);
  const r = large ? 9 : 7;
  const len = large ? 28 : 22;
  // upper arm
  ctx.strokeStyle = c.shade; ctx.lineWidth = r * 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len * 0.5, len * 0.6 - atk * 6); ctx.stroke();
  ctx.strokeStyle = c.fill; ctx.lineWidth = r * 2 - 3;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len * 0.5, len * 0.6 - atk * 6); ctx.stroke();
  // paw
  ctx.fillStyle = c.shade;
  ctx.beginPath(); ctx.arc(len * 0.5, len * 0.6 - atk * 6, r + 1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = c.fill;
  ctx.beginPath(); ctx.arc(len * 0.5, len * 0.6 - atk * 6, r, 0, Math.PI * 2); ctx.fill();
  // claws (predator animals)
  if (['wolf', 'tiger', 'gecko', 'gorilla', 'bear', 'eagle'].includes(id)) {
    ctx.strokeStyle = '#d8c8a0'; ctx.lineWidth = 1.5;
    const cx = len * 0.5; const cy = len * 0.6 - atk * 6;
    [-6, 0, 6].forEach((dx) => {
      ctx.beginPath(); ctx.moveTo(cx + dx, cy + r); ctx.lineTo(cx + dx * 0.6, cy + r + 8); ctx.stroke();
    });
  }
}

function foreCrabClaw(ctx: CanvasRenderingContext2D, c: PartColors, atk: number) {
  // arm
  ctx.strokeStyle = c.shade; ctx.lineWidth = 10; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(18, 18); ctx.stroke();
  ctx.strokeStyle = c.fill; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(18, 18); ctx.stroke();
  // claw
  ctx.fillStyle = radial(ctx, 20, 20, 14, c.fill, c.shade);
  ctx.strokeStyle = c.shade; ctx.lineWidth = 2;
  // upper pincer
  ctx.beginPath(); ctx.moveTo(14, 14); ctx.lineTo(34 + atk * 8, 8 - atk * 4); ctx.lineTo(34 + atk * 8, 16 - atk * 2); ctx.closePath();
  ctx.fill(); ctx.stroke();
  // lower pincer
  ctx.beginPath(); ctx.moveTo(14, 14); ctx.lineTo(28 + atk * 6, 22 + atk * 4); ctx.lineTo(26 + atk * 5, 14 + atk); ctx.closePath();
  ctx.fill(); ctx.stroke();
}

function foreWing(ctx: CanvasRenderingContext2D, c: PartColors, atk: number) {
  const spread = 1 + atk * 0.4;
  ctx.fillStyle = radial(ctx, 0, 0, 30, c.fill, c.shade);
  ctx.strokeStyle = c.shade; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-10, -20 * spread, -30, -28 * spread, -40, -20 * spread);
  ctx.quadraticCurveTo(-28, -8, 0, 12);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // feather lines
  ctx.strokeStyle = c.shade; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.4;
  [[-10, -6], [-20, -10], [-30, -12]].forEach(([tx, ty]) => {
    ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(tx, ty * spread); ctx.stroke();
  });
  ctx.globalAlpha = 1;
}

function foreLegMulti(ctx: CanvasRenderingContext2D, c: PartColors, count: number, atk: number) {
  ctx.strokeStyle = c.shade; ctx.lineWidth = 3; ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    const t = (i / (count - 1)) * 0.8 + 0.1;
    const midX = 8 + i * 8;
    const midY = -8 + t * 20;
    ctx.beginPath();
    ctx.moveTo(i * 4 - 4, 0);
    ctx.quadraticCurveTo(midX + atk * 6, midY, midX + 12 + atk * 8, midY + 16);
    ctx.stroke();
  }
}

function foreNone(ctx: CanvasRenderingContext2D, _c: PartColors) {
  // serpentine — no distinct forelimbs; draw a small coil nub
  ctx.fillStyle = _c.shade; ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
}

// ─── HINDLIMBS drawings ───────────────────────────────────────────────────────

export function drawHindlimbs(
  ctx: CanvasRenderingContext2D,
  animalId: string,
  atk: number,
) {
  const c = ANIMAL_COLORS[animalId] ?? ANIMAL_COLORS.boar;
  ctx.save();
  switch (animalId) {
    case 'ant':
    case 'scorpion': hindLegMulti(ctx, c, 3, atk); break;
    case 'crab':     hindCrabLeg(ctx, c); break;
    case 'cobra':
    case 'eel':      hindNone(ctx); break;
    case 'eagle':    hindTalon(ctx, c, atk); break;
    case 'rhino':
    case 'boar':     hindHoof(ctx, c, atk); break;
    default:         hindHaunch(ctx, c, animalId, atk); break;
  }
  ctx.restore();
}

function hindHaunch(ctx: CanvasRenderingContext2D, c: PartColors, id: string, atk: number) {
  const large = ['gorilla', 'bear'].includes(id);
  const r = large ? 10 : 8;
  // thigh
  ctx.strokeStyle = c.shade; ctx.lineWidth = r * 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-6 - atk * 6, 20 + atk * 4); ctx.stroke();
  ctx.strokeStyle = c.fill; ctx.lineWidth = r * 2 - 4;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-6 - atk * 6, 20 + atk * 4); ctx.stroke();
  // shin + paw
  ctx.strokeStyle = c.shade; ctx.lineWidth = r * 1.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-6 - atk * 6, 20 + atk * 4); ctx.lineTo(-2, 36); ctx.stroke();
  ctx.strokeStyle = c.fill; ctx.lineWidth = r * 1.5 - 3;
  ctx.beginPath(); ctx.moveTo(-6 - atk * 6, 20 + atk * 4); ctx.lineTo(-2, 36); ctx.stroke();
  ctx.fillStyle = c.shade;
  ctx.beginPath(); ctx.arc(-2, 36, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = c.fill;
  ctx.beginPath(); ctx.arc(-2, 36, r - 2, 0, Math.PI * 2); ctx.fill();
}

function hindHoof(ctx: CanvasRenderingContext2D, c: PartColors, atk: number) {
  ctx.strokeStyle = c.shade; ctx.lineWidth = 14; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-4 - atk * 5, 22); ctx.stroke();
  ctx.strokeStyle = c.fill; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-4 - atk * 5, 22); ctx.stroke();
  // hoof
  ctx.fillStyle = '#2a2010';
  ctx.beginPath(); ctx.ellipse(-4, 30, 9, 7, 0.2, 0, Math.PI * 2); ctx.fill();
}

function hindTalon(ctx: CanvasRenderingContext2D, c: PartColors, atk: number) {
  ctx.strokeStyle = c.shade; ctx.lineWidth = 10; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-2 - atk * 4, 24); ctx.stroke();
  ctx.strokeStyle = c.fill; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-2 - atk * 4, 24); ctx.stroke();
  // talons
  ctx.strokeStyle = '#d0b030'; ctx.lineWidth = 2.5;
  const ty = 24;
  [[-10, 32], [-2, 36], [6, 32]].forEach(([tx, tye]) => {
    ctx.beginPath(); ctx.moveTo(-2, ty); ctx.lineTo(tx, tye + atk * 4); ctx.stroke();
  });
}

function hindCrabLeg(ctx: CanvasRenderingContext2D, c: PartColors) {
  ctx.strokeStyle = c.shade; ctx.lineWidth = 5; ctx.lineCap = 'round';
  [[-12, 16, -18, 28], [-4, 18, -6, 32], [4, 16, 8, 28]].forEach(([x1, y1, x2, y2]) => {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = c.fill; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.strokeStyle = c.shade; ctx.lineWidth = 5;
  });
}

function hindLegMulti(ctx: CanvasRenderingContext2D, c: PartColors, count: number, atk: number) {
  ctx.strokeStyle = c.shade; ctx.lineWidth = 3; ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    ctx.beginPath();
    ctx.moveTo(-i * 6, 0);
    ctx.quadraticCurveTo(-8 - i * 4, 14 + atk * 4, -4 - i * 5, 28);
    ctx.stroke();
  }
}

function hindNone(ctx: CanvasRenderingContext2D) {
  ctx.globalAlpha = 0; ctx.globalAlpha = 1; // no-op
}

// ─── TAIL drawings ────────────────────────────────────────────────────────────

export function drawTail(
  ctx: CanvasRenderingContext2D,
  animalId: string,
  phase: number,
) {
  const c = ANIMAL_COLORS[animalId] ?? ANIMAL_COLORS.boar;
  ctx.save();
  switch (animalId) {
    case 'ant':      tailThin(ctx, c, phase, 'short'); break;
    case 'rabbit':   tailBall(ctx, c); break;
    case 'crab':     tailNone(ctx); break;
    case 'gecko':    tailLong(ctx, c, phase); break;
    case 'boar':     tailCurled(ctx, c, phase); break;
    case 'wolf':     tailBushy(ctx, c, phase); break;
    case 'cobra':    tailSerpent(ctx, c, phase); break;
    case 'scorpion': tailStinger(ctx, c, phase); break;
    case 'eagle':    tailFan(ctx, c, phase); break;
    case 'gorilla':  tailNone(ctx); break;
    case 'bear':     tailNone(ctx); break;
    case 'rhino':    tailThin(ctx, c, phase, 'medium'); break;
    case 'eel':      tailFin(ctx, c, phase); break;
    case 'tiger':    tailBushy(ctx, c, phase); break;
    default:         tailThin(ctx, c, phase, 'medium');
  }
  ctx.restore();
}

function tailThin(ctx: CanvasRenderingContext2D, c: PartColors, phase: number, len: string) {
  const L = len === 'short' ? 20 : 30;
  const wave = Math.sin(phase) * 6;
  ctx.strokeStyle = c.shade; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-L * 0.5, wave, -L, wave * 0.6); ctx.stroke();
  ctx.strokeStyle = c.fill; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-L * 0.5, wave, -L, wave * 0.6); ctx.stroke();
}

function tailBall(ctx: CanvasRenderingContext2D, c: PartColors) {
  ctx.fillStyle = c.accent;
  ctx.beginPath(); ctx.arc(-6, 0, 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.globalAlpha = 0.5;
  ctx.beginPath(); ctx.arc(-5, -2, 7, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
}

function tailBushy(ctx: CanvasRenderingContext2D, c: PartColors, phase: number) {
  const wave = Math.sin(phase) * 8;
  ctx.strokeStyle = c.shade; ctx.lineWidth = 12; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-18, wave, -30, wave * 1.2); ctx.stroke();
  ctx.strokeStyle = c.fill; ctx.lineWidth = 9;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-18, wave, -30, wave * 1.2); ctx.stroke();
  ctx.strokeStyle = c.accent; ctx.lineWidth = 5; ctx.globalAlpha = 0.4;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-18, wave, -30, wave * 1.2); ctx.stroke();
  ctx.globalAlpha = 1;
}

function tailCurled(ctx: CanvasRenderingContext2D, c: PartColors, phase: number) {
  const curl = Math.sin(phase) * 3;
  ctx.strokeStyle = c.shade; ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-8, -8 + curl, -18, -14 + curl, -20, -6 + curl); ctx.stroke();
  ctx.strokeStyle = c.fill; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-8, -8 + curl, -18, -14 + curl, -20, -6 + curl); ctx.stroke();
}

function tailLong(ctx: CanvasRenderingContext2D, c: PartColors, phase: number) {
  const wave = Math.sin(phase) * 8;
  ctx.strokeStyle = c.shade; ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-12, wave, -28, -wave, -44, wave * 0.5); ctx.stroke();
  ctx.strokeStyle = c.fill; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-12, wave, -28, -wave, -44, wave * 0.5); ctx.stroke();
}

function tailStinger(ctx: CanvasRenderingContext2D, c: PartColors, phase: number) {
  const bob = Math.sin(phase) * 4;
  // segments
  ctx.strokeStyle = c.shade; ctx.lineWidth = 9; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-16, -4, -28, -24 + bob, -22, -38 + bob); ctx.stroke();
  ctx.strokeStyle = c.fill; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-16, -4, -28, -24 + bob, -22, -38 + bob); ctx.stroke();
  // stinger tip
  ctx.fillStyle = c.accent; ctx.strokeStyle = c.shade; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-24, -38 + bob); ctx.lineTo(-18, -50 + bob); ctx.lineTo(-14, -38 + bob); ctx.closePath();
  ctx.fill(); ctx.stroke();
}

function tailSerpent(ctx: CanvasRenderingContext2D, c: PartColors, phase: number) {
  const wave = Math.sin(phase) * 10;
  ctx.strokeStyle = c.shade; ctx.lineWidth = 11; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.bezierCurveTo(-12, wave, -28, -wave * 0.6, -40, wave * 0.4);
  ctx.stroke();
  ctx.strokeStyle = c.fill; ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.bezierCurveTo(-12, wave, -28, -wave * 0.6, -40, wave * 0.4);
  ctx.stroke();
  ctx.strokeStyle = c.accent; ctx.lineWidth = 2; ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.bezierCurveTo(-12, wave + 2, -28, -wave * 0.6 + 2, -40, wave * 0.4 + 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function tailFan(ctx: CanvasRenderingContext2D, c: PartColors, phase: number) {
  const wave = Math.sin(phase) * 4;
  [-20, -12, -4, 4, 12].forEach((angle, i) => {
    const len = i === 2 ? 32 : 26;
    const rad = ((angle + wave) * Math.PI) / 180;
    const ex = -Math.cos(rad) * len;
    const ey = Math.sin(rad) * len;
    ctx.strokeStyle = c.shade; ctx.lineWidth = 4 + (i === 2 ? 2 : 0); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = c.fill; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ex, ey); ctx.stroke();
  });
  // fan webbing
  ctx.fillStyle = c.fill; ctx.globalAlpha = 0.3;
  ctx.beginPath(); ctx.moveTo(0, 0);
  [-20, -12, -4, 4, 12].forEach((angle) => {
    const rad = ((angle + wave) * Math.PI) / 180;
    ctx.lineTo(-Math.cos(rad) * 28, Math.sin(rad) * 28);
  });
  ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
}

function tailNone(ctx: CanvasRenderingContext2D) {
  void ctx;
}

function tailFin(ctx: CanvasRenderingContext2D, c: PartColors, phase: number) {
  const wave = Math.sin(phase) * 6;
  ctx.fillStyle = radial(ctx, -16, wave * 0.5, 16, c.fill, c.shade);
  ctx.strokeStyle = c.shade; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-10, -12 + wave, -28, -18 + wave * 0.6, -32, wave * 0.4);
  ctx.bezierCurveTo(-28, 18 + wave * 0.4, -10, 12 + wave, 0, 0);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = c.accent; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.4;
  [-10, -18, -26].forEach((tx) => {
    ctx.beginPath(); ctx.moveTo(tx, -8 + wave * 0.5); ctx.lineTo(tx - 4, 8 + wave * 0.3); ctx.stroke();
  });
  ctx.globalAlpha = 1;
}
