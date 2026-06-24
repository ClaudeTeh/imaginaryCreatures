import { makeRng, type RNG } from "../core/rng";
import type { Creature, Genome } from "../core/types";
import { ANIMALS } from "../data/animals";
import { randomGenome } from "../genome/breed";
import { buildCreature, powerRating } from "../genome/genome";

/**
 * Build an opponent scaled to the player's progress. Difficulty widens the
 * animal pool (tougher animals appear) and nudges the opponent's power toward
 * the player's so fights stay competitive rather than trivial or hopeless.
 */
export function makeOpponent(player: Creature, wins: number, seed: number): Creature {
  const rng = makeRng(seed ^ 0x9e3779b9);
  const maxTier = wins < 3 ? 1 : wins < 7 ? 2 : 3;
  const pool = ANIMALS.filter((a) => a.tier <= maxTier).map((a) => a.id);
  const target = powerRating(player) * (0.85 + Math.min(wins, 12) * 0.02);

  let best: Genome = randomGenome(rng, pool);
  let bestErr = Infinity;
  // sample several genomes, keep the one closest to the target power
  for (let i = 0; i < 12; i++) {
    const g = randomGenome(rng, pool);
    const err = Math.abs(powerRating(buildCreature(g)) - target);
    if (err < bestErr) {
      bestErr = err;
      best = g;
    }
  }
  const c = buildCreature(best);
  return { ...c, name: opponentName(rng, c.name) };
}

function opponentName(rng: RNG, base: string): string {
  const titles = ["Wild", "Feral", "Rogue", "Alpha", "Ravenous", "Ancient", "Savage"];
  return `${titles[Math.floor(rng() * titles.length)]} ${base}`;
}
