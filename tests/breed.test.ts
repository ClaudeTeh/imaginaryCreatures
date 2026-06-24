import { describe, expect, it } from "vitest";
import { makeRng } from "../src/core/rng";
import { breed, genomeDistance, randomGenome } from "../src/genome/breed";
import { isValidGenome, pureGenome } from "../src/genome/genome";
import { ANIMALS } from "../src/data/animals";
import { SLOTS } from "../src/core/types";

const VALID_IDS = new Set(ANIMALS.map((a) => a.id));

describe("breeding", () => {
  it("produces a valid genome", () => {
    const child = breed(pureGenome("wolf"), pureGenome("crab"), makeRng(1));
    expect(isValidGenome(child)).toBe(true);
    for (const slot of SLOTS) expect(VALID_IDS.has(child[slot])).toBe(true);
  });

  it("is deterministic for the same seed", () => {
    const a = pureGenome("wolf");
    const b = pureGenome("crab");
    const c1 = breed(a, b, makeRng(99));
    const c2 = breed(a, b, makeRng(99));
    expect(c1).toEqual(c2);
  });

  it("with zero mutation, every slot comes from one of the two parents", () => {
    const a = pureGenome("wolf");
    const b = pureGenome("crab");
    const child = breed(a, b, makeRng(5), { mutationRate: 0 });
    for (const slot of SLOTS) {
      expect([a[slot], b[slot]]).toContain(child[slot]);
    }
  });

  it("high mutation can introduce animals from neither parent", () => {
    const a = pureGenome("wolf");
    const b = pureGenome("crab");
    let introducedNovel = false;
    for (let seed = 0; seed < 50 && !introducedNovel; seed++) {
      const child = breed(a, b, makeRng(seed), { mutationRate: 1 });
      introducedNovel = SLOTS.some(
        (slot) => child[slot] !== "wolf" && child[slot] !== "crab",
      );
    }
    expect(introducedNovel).toBe(true);
  });

  it("randomGenome yields valid genomes", () => {
    const g = randomGenome(makeRng(3));
    expect(isValidGenome(g)).toBe(true);
  });

  it("genomeDistance counts differing slots", () => {
    expect(genomeDistance(pureGenome("wolf"), pureGenome("wolf"))).toBe(0);
    expect(genomeDistance(pureGenome("wolf"), pureGenome("crab"))).toBe(5);
  });
});
