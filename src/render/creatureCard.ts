import type { Creature, StatBlock } from "../core/types";
import { ABILITIES, TRAITS } from "../data/abilities";
import { powerRating } from "../genome/genome";
import { el, statColor } from "./dom";
import { drawHead, drawBody, drawForelimbs, drawHindlimbs, drawTail, ANIMAL_COLORS } from "./creatureParts";

const STAT_MAX: StatBlock = {
  health: 90,
  attack: 70,
  defense: 50,
  speed: 70,
  energy: 50,
};

const STAT_ORDER: (keyof StatBlock)[] = [
  "health",
  "attack",
  "defense",
  "speed",
  "energy",
];

/** A read-only card showing a creature's identity, stat bars, and powers. */
export function creatureCard(c: Creature): HTMLElement {
  const bars = el(
    "div",
    { class: "bars" },
    STAT_ORDER.map((stat) => {
      const value = c.stats[stat];
      const pct = Math.min(100, (value / STAT_MAX[stat]) * 100);
      return el("div", { class: "bar" }, [
        el("span", {}, [stat]),
        el("div", { class: "track" }, [
          el("div", {
            class: "fill",
            style: `width:${pct}%;background:${statColor(stat)}`,
          }),
        ]),
        el("span", { class: "val" }, [String(value)]),
      ]);
    }),
  );

  const abilityTags =
    c.abilities.length > 0
      ? c.abilities.map((id) =>
          el("span", { class: "tag ability", title: ABILITIES[id].description }, [
            ABILITIES[id].name,
          ]),
        )
      : [el("span", { class: "tag empty" }, ["No abilities"])];

  const traitTags = c.traits.map((id) =>
    el("span", { class: "tag trait", title: TRAITS[id].description }, [
      TRAITS[id].name,
    ]),
  );

  // Canvas-drawn creature preview
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const SIZE = 100;
  const canvas = el("canvas", {
    width: String(SIZE * DPR),
    height: String(SIZE * DPR),
    style: `width:${SIZE}px;height:${SIZE}px`,
    "aria-hidden": "true",
    class: "creature-preview-canvas",
  }) as HTMLCanvasElement;

  requestAnimationFrame(() => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(DPR, DPR);
    const cx = SIZE / 2 + 4;
    const cy = SIZE / 2 + 8;
    const p = c.genome;
    const SC = 0.66;
    const col = ANIMAL_COLORS[p.body] ?? ANIMAL_COLORS.boar;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(SC, SC);
    // tail
    ctx.save(); ctx.translate(-34, 0); ctx.rotate(-0.2);
    drawTail(ctx, p.tail, 0); ctx.restore();
    // hindlimbs
    ctx.save(); ctx.translate(-20, 18); ctx.scale(0.92, 0.92);
    drawHindlimbs(ctx, p.hindlimbs, 0); ctx.restore();
    // connector (torso → neck → head) keeps the parts joined
    ctx.save();
    ctx.fillStyle = col.fill; ctx.strokeStyle = col.shade; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-6, 6);
    ctx.quadraticCurveTo(20, -2, 26, -26);
    ctx.quadraticCurveTo(30, -34, 22, -34);
    ctx.quadraticCurveTo(8, -26, 2, -6);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    // body
    ctx.save();
    drawBody(ctx, p.body, 0); ctx.restore();
    // forelimbs
    ctx.save(); ctx.translate(14, 18); ctx.scale(0.92, 0.92);
    drawForelimbs(ctx, p.forelimbs, 0); ctx.restore();
    // head
    ctx.save(); ctx.translate(24, -30);
    drawHead(ctx, p.head, 0, 0); ctx.restore();
    ctx.restore();
  });

  const composite = canvas;

  return el("div", { class: "creature-card fadein" }, [
    el("div", { class: "creature-head" }, [
      composite,
      el("div", {}, [
        el("h3", { class: "creature-name" }, [c.name]),
        el("div", { class: "creature-sub" }, [`Power ${powerRating(c)}`]),
      ]),
    ]),
    bars,
    el("div", { class: "tags" }, [...abilityTags, ...traitTags]),
  ]);
}
