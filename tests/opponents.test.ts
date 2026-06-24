import { describe, expect, it } from "vitest";
import { makeOpponent } from "../src/game/opponents";
import { getAnimal } from "../src/data/animals";
import { buildCreature, pureGenome } from "../src/genome/genome";
import { SLOTS } from "../src/core/types";

const player = buildCreature(pureGenome("wolf"));

function maxTierOf(genome: Record<string, string>): number {
  return Math.max(...SLOTS.map((s) => getAnimal(genome[s]).tier));
}

describe("opponent generation", () => {
  it("is deterministic for the same (player, wins, seed)", () => {
    const a = makeOpponent(player, 2, 12345);
    const b = makeOpponent(player, 2, 12345);
    expect(a.genome).toEqual(b.genome);
    expect(a.name).toBe(b.name);
  });

  it("varies with the seed", () => {
    const a = makeOpponent(player, 2, 1);
    const b = makeOpponent(player, 2, 2);
    // extremely unlikely to be identical across genome + name
    expect(a.genome).not.toEqual(b.genome);
  });

  it("keeps early opponents to tier 1", () => {
    for (let seed = 0; seed < 30; seed++) {
      const o = makeOpponent(player, 0, seed * 17 + 1);
      expect(maxTierOf(o.genome)).toBe(1);
    }
  });

  it("introduces tougher tiers as wins climb", () => {
    let sawTier3 = false;
    for (let seed = 0; seed < 30 && !sawTier3; seed++) {
      const o = makeOpponent(player, 10, seed * 17 + 1);
      if (maxTierOf(o.genome) === 3) sawTier3 = true;
    }
    expect(sawTier3).toBe(true);
  });

  it("produces a titled name", () => {
    const o = makeOpponent(player, 3, 99);
    expect(o.name.split(" ").length).toBeGreaterThanOrEqual(2);
  });
});
