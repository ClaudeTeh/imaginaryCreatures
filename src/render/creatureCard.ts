import type { Creature, StatBlock } from "../core/types";
import { ABILITIES, TRAITS } from "../data/abilities";
import { powerRating } from "../genome/genome";
import { el, statColor } from "./dom";
import { drawHead, drawBody, drawForelimbs, drawHindlimbs, drawTail } from "./creatureParts";

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
    const SC = 0.48;

    ctx.save();
    ctx.translate(cx, cy);
    // tail
    ctx.save(); ctx.translate(-22, -2); ctx.rotate(-0.2); ctx.scale(SC, SC);
    drawTail(ctx, p.tail, 0); ctx.restore();
    // hindlimbs
    ctx.save(); ctx.translate(-8, 10); ctx.scale(SC * 0.85, SC * 0.85);
    drawHindlimbs(ctx, p.hindlimbs, 0); ctx.restore();
    // body
    ctx.save(); ctx.scale(SC, SC);
    drawBody(ctx, p.body, 0); ctx.restore();
    // forelimbs
    ctx.save(); ctx.translate(10, 10); ctx.scale(SC * 0.85, SC * 0.85);
    drawForelimbs(ctx, p.forelimbs, 0); ctx.restore();
    // head
    ctx.save(); ctx.translate(16, -18); ctx.scale(SC, SC);
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
