/**
 * Deterministic, seedable PRNG (mulberry32).
 * Every random decision in the game flows through this so that breeding and
 * combat are fully reproducible — which makes them unit-testable and lets the
 * renderer replay a battle exactly.
 */
export type RNG = () => number;

export function makeRng(seed: number): RNG {
  let a = seed >>> 0;
  return function rng(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Inclusive integer in [min, max]. */
export function randInt(rng: RNG, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function chance(rng: RNG, p: number): boolean {
  return rng() < p;
}

export function pick<T>(rng: RNG, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** A fresh-ish seed for non-deterministic UI moments (new game, etc). */
export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}
