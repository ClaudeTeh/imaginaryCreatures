import { describe, expect, it } from "vitest";
import { makeRng } from "../src/core/rng";
import { simulateBattle } from "../src/combat/combat";
import { ANIMALS } from "../src/data/animals";
import { buildCreature, powerRating, pureGenome } from "../src/genome/genome";

/**
 * The "judge": a round-robin tournament of every pure-animal creature against
 * every other, across many seeds. These assertions guard against degenerate
 * balance — a creature that always wins or always loses, coin-flip determinism,
 * or fights that never resolve.
 */
const SEEDS = 9;
const creatures = ANIMALS.map((a) => buildCreature(pureGenome(a.id)));

interface Tally {
  wins: number;
  losses: number;
  draws: number;
}

const byId = new Map(creatures.map((c) => [c.genome.head, c]));

/** Round-robin over a given set of animal ids. */
function roundRobin(ids: string[]) {
  const tally = new Map<string, Tally>();
  for (const id of ids) tally.set(id, { wins: 0, losses: 0, draws: 0 });
  let draws = 0;
  let games = 0;

  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      for (let s = 0; s < SEEDS; s++) {
        const res = simulateBattle(byId.get(ids[i])!, byId.get(ids[j])!, makeRng(s * 131 + 7));
        games++;
        const ti = tally.get(ids[i])!;
        const tj = tally.get(ids[j])!;
        if (res.winner === "a") {
          ti.wins++;
          tj.losses++;
        } else if (res.winner === "b") {
          tj.wins++;
          ti.losses++;
        } else {
          ti.draws++;
          tj.draws++;
          draws++;
        }
      }
    }
  }
  return { tally, draws, games };
}

const allIds = ANIMALS.map((a) => a.id);
const tiers = [1, 2, 3].map((t) => ANIMALS.filter((a) => a.tier === t).map((a) => a.id));

describe("balance (the judge)", () => {
  const global = roundRobin(allIds);
  const { draws, games } = global;
  const tally = global.tally;

  // Animals are tiered on purpose, so degenerate-balance checks are made
  // *within* each tier — where the player faces genuine peer choices.
  it("within each tier, no creature is unkillable", () => {
    for (const ids of tiers) {
      const { tally: t } = roundRobin(ids);
      for (const [id, rec] of t) {
        expect(rec.losses, `${id} never loses within its tier`).toBeGreaterThan(0);
      }
    }
  });

  it("within each tier, no creature is useless", () => {
    for (const ids of tiers) {
      const { tally: t } = roundRobin(ids);
      for (const [id, rec] of t) {
        expect(rec.wins, `${id} never wins within its tier`).toBeGreaterThan(0);
      }
    }
  });

  it("battles are decisive (draws are rare)", () => {
    expect(draws / games).toBeLessThan(0.1);
  });

  it("higher power rating correlates with winning", () => {
    // The single strongest-by-power animal should have a winning record;
    // the weakest should have a losing one.
    const ranked = [...ANIMALS].sort(
      (a, b) =>
        powerRating(buildCreature(pureGenome(b.id))) -
        powerRating(buildCreature(pureGenome(a.id))),
    );
    const top = tally.get(ranked[0].id)!;
    const bottom = tally.get(ranked[ranked.length - 1].id)!;
    expect(top.wins).toBeGreaterThan(top.losses);
    expect(bottom.losses).toBeGreaterThan(bottom.wins);
  });
});
