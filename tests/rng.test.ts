import { describe, expect, it } from "vitest";
import { makeRng, randInt, pick } from "../src/core/rng";

describe("rng", () => {
  it("is deterministic for a given seed", () => {
    const a = makeRng(123);
    const b = makeRng(123);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different seeds", () => {
    const a = makeRng(1)();
    const b = makeRng(2)();
    expect(a).not.toEqual(b);
  });

  it("returns values in [0,1)", () => {
    const r = makeRng(42);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("randInt stays within inclusive bounds", () => {
    const r = makeRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = randInt(r, 3, 9);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(9);
    }
  });

  it("pick never returns out-of-range", () => {
    const r = makeRng(7);
    const arr = ["x", "y", "z"];
    for (let i = 0; i < 100; i++) {
      expect(arr).toContain(pick(r, arr));
    }
  });
});
