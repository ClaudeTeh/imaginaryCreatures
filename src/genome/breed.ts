import { chance, pick, type RNG } from "../core/rng";
import { SLOTS, type Genome } from "../core/types";
import { ANIMALS } from "../data/animals";

export const DEFAULT_MUTATION_RATE = 0.12;

/**
 * Splice two genomes into an offspring. Each slot is inherited 50/50 from a
 * parent, with a per-slot mutation chance that instead grafts a random animal —
 * the "DNA" surprise that produces creatures neither parent had.
 */
export function breed(
  a: Genome,
  b: Genome,
  rng: RNG,
  opts: { mutationRate?: number; pool?: readonly string[] } = {},
): Genome {
  const mutationRate = opts.mutationRate ?? DEFAULT_MUTATION_RATE;
  const pool = opts.pool ?? ANIMALS.map((x) => x.id);
  const child = {} as Genome;
  for (const slot of SLOTS) {
    if (chance(rng, mutationRate)) {
      child[slot] = pick(rng, pool);
    } else {
      child[slot] = chance(rng, 0.5) ? a[slot] : b[slot];
    }
  }
  return child;
}

/** A fully random genome drawn from a pool of animal ids. */
export function randomGenome(
  rng: RNG,
  pool: readonly string[] = ANIMALS.map((x) => x.id),
): Genome {
  const g = {} as Genome;
  for (const slot of SLOTS) {
    g[slot] = pick(rng, pool);
  }
  return g;
}

/** How many slots differ between two genomes (genetic distance). */
export function genomeDistance(a: Genome, b: Genome): number {
  return SLOTS.reduce((n, slot) => n + (a[slot] === b[slot] ? 0 : 1), 0);
}
