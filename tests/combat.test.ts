import { describe, expect, it } from "vitest";
import { makeRng } from "../src/core/rng";
import { simulateBattle } from "../src/combat/combat";
import { buildCreature, pureGenome } from "../src/genome/genome";

describe("combat simulation", () => {
  it("terminates and declares a winner", () => {
    const a = buildCreature(pureGenome("wolf"));
    const b = buildCreature(pureGenome("rabbit"));
    const res = simulateBattle(a, b, makeRng(1));
    expect(["a", "b", "draw"]).toContain(res.winner);
    expect(res.ticks).toBeGreaterThan(0);
    expect(res.events.length).toBeGreaterThan(2);
  });

  it("is deterministic for the same seed", () => {
    const a = buildCreature(pureGenome("tiger"));
    const b = buildCreature(pureGenome("rhino"));
    const r1 = simulateBattle(a, b, makeRng(7));
    const r2 = simulateBattle(a, b, makeRng(7));
    expect(r1.winner).toBe(r2.winner);
    expect(r1.ticks).toBe(r2.ticks);
    expect(r1.events.length).toBe(r2.events.length);
  });

  it("a strong creature reliably beats a weak one", () => {
    const strong = buildCreature(pureGenome("bear"));
    const weak = buildCreature(pureGenome("ant"));
    let strongWins = 0;
    for (let seed = 0; seed < 20; seed++) {
      const res = simulateBattle(strong, weak, makeRng(seed));
      if (res.winner === "a") strongWins++;
    }
    expect(strongWins).toBeGreaterThanOrEqual(18);
  });

  it("never lets hp events report negative hp", () => {
    const a = buildCreature(pureGenome("scorpion"));
    const b = buildCreature(pureGenome("gorilla"));
    const res = simulateBattle(a, b, makeRng(3));
    for (const e of res.events) {
      if ("targetHp" in e) expect(e.targetHp).toBeGreaterThanOrEqual(0);
      if ("hp" in e) expect(e.hp).toBeGreaterThanOrEqual(0);
    }
  });

  it("emits start events for both sides", () => {
    const a = buildCreature(pureGenome("wolf"));
    const b = buildCreature(pureGenome("crab"));
    const res = simulateBattle(a, b, makeRng(1));
    const starts = res.events.filter((e) => e.kind === "start");
    expect(starts.length).toBe(2);
  });

  it("mirror match is close (both identical creatures)", () => {
    const a = buildCreature(pureGenome("wolf"));
    const b = buildCreature(pureGenome("wolf"));
    const res = simulateBattle(a, b, makeRng(11));
    expect(["a", "b", "draw"]).toContain(res.winner);
  });
});
