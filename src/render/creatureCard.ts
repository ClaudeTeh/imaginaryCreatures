import type { Creature, StatBlock } from "../core/types";
import { ABILITIES, TRAITS } from "../data/abilities";
import { powerRating } from "../genome/genome";
import { el, statColor } from "./dom";

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

  return el("div", { class: "creature-card fadein" }, [
    el("div", { class: "creature-head" }, [
      el("div", { class: "creature-emoji" }, [c.emoji]),
      el("div", {}, [
        el("h3", { class: "creature-name" }, [c.name]),
        el("div", { class: "creature-sub" }, [`Power ${powerRating(c)}`]),
      ]),
    ]),
    bars,
    el("div", { class: "tags" }, [...abilityTags, ...traitTags]),
  ]);
}
