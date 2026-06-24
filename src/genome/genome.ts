import {
  SLOTS,
  ZERO_STATS,
  type AbilityId,
  type Creature,
  type Genome,
  type Slot,
  type StatBlock,
  type TraitId,
} from "../core/types";
import { getAnimal } from "../data/animals";

/** Build a full creature (stats + powers + name) from a genome. Pure. */
export function buildCreature(genome: Genome, name?: string): Creature {
  const stats: StatBlock = { ...ZERO_STATS };
  const abilities = new Set<AbilityId>();
  const traits = new Set<TraitId>();

  for (const slot of SLOTS) {
    const animal = getAnimal(genome[slot]);
    const part = animal.parts[slot];
    for (const key of Object.keys(part.stats) as (keyof StatBlock)[]) {
      stats[key] += part.stats[key] ?? 0;
    }
    if (part.ability) abilities.add(part.ability);
    if (part.trait) traits.add(part.trait);
  }

  // Passive trait multipliers, applied after summing parts.
  if (traits.has("thickHide")) stats.defense = Math.round(stats.defense * 1.2);
  if (traits.has("swift")) stats.speed = Math.round(stats.speed * 1.15);
  if (traits.has("predator")) stats.attack = Math.round(stats.attack * 1.15);
  if (traits.has("hardy")) stats.health = Math.round(stats.health * 1.15);

  return {
    name: name ?? generateName(genome),
    genome,
    emoji: getAnimal(genome.head).emoji,
    stats,
    abilities: [...abilities],
    traits: [...traits],
  };
}

/** Deterministic portmanteau of the head and body donors, e.g. Wolf+Crab -> "Wolab". */
export function generateName(genome: Genome): string {
  const head = getAnimal(genome.head).name;
  const body = getAnimal(genome.body).name;
  const a = head.slice(0, Math.ceil(head.length / 2));
  const b = body.slice(Math.floor(body.length / 2));
  const raw = (a + b).toLowerCase();
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** A single-number power estimate, used for matchmaking and judging balance. */
export function powerRating(c: Creature): number {
  const s = c.stats;
  return Math.round(
    s.health * 0.5 +
      s.attack * 2 +
      s.defense * 1.5 +
      s.speed * 1 +
      s.energy * 0.4 +
      c.abilities.length * 6 +
      c.traits.length * 4,
  );
}

/** A genome where every slot is the same animal (a "pure" creature). */
export function pureGenome(animalId: string): Genome {
  return SLOTS.reduce((g, slot) => {
    g[slot] = animalId;
    return g;
  }, {} as Genome);
}

export function isValidGenome(genome: Partial<Genome>): genome is Genome {
  return SLOTS.every((slot) => typeof genome[slot] === "string" && !!genome[slot]);
}

export function slotLabel(slot: Slot): string {
  return {
    head: "Head",
    body: "Body",
    forelimbs: "Forelimbs",
    hindlimbs: "Hindlimbs",
    tail: "Tail",
  }[slot];
}
