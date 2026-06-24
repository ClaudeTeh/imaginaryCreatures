import { describe, expect, it } from "vitest";
import { pureGenome } from "../src/genome/genome";
import {
  ROSTER_LIMIT,
  addToRoster,
  genomeKey,
  isInRoster,
  removeFromRoster,
  type SavedCreature,
} from "../src/game/roster";

const entry = (id: string): SavedCreature => ({ name: id, genome: pureGenome(id) });

describe("roster", () => {
  it("adds newest first", () => {
    let r: SavedCreature[] = [];
    r = addToRoster(r, entry("ant"));
    r = addToRoster(r, entry("wolf"));
    expect(r.map((x) => x.name)).toEqual(["wolf", "ant"]);
  });

  it("does not mutate the input array", () => {
    const r0: SavedCreature[] = [];
    const r1 = addToRoster(r0, entry("ant"));
    expect(r0).toHaveLength(0);
    expect(r1).toHaveLength(1);
  });

  it("dedupes identical genomes, moving them to the front", () => {
    let r: SavedCreature[] = [];
    r = addToRoster(r, entry("ant"));
    r = addToRoster(r, entry("wolf"));
    r = addToRoster(r, entry("ant")); // re-save ant
    expect(r).toHaveLength(2);
    expect(r[0].name).toBe("ant");
  });

  it("caps at ROSTER_LIMIT, dropping the oldest", () => {
    let r: SavedCreature[] = [];
    const ids = ["ant", "rabbit", "crab", "gecko", "boar", "wolf", "cobra"];
    for (const id of ids) r = addToRoster(r, entry(id));
    expect(r).toHaveLength(ROSTER_LIMIT);
    // the first-added ("ant") should have been dropped
    expect(r.some((x) => x.name === "ant")).toBe(false);
    expect(r[0].name).toBe("cobra");
  });

  it("removes by index without mutating", () => {
    const r = [entry("ant"), entry("wolf")];
    const r2 = removeFromRoster(r, 0);
    expect(r2.map((x) => x.name)).toEqual(["wolf"]);
    expect(r).toHaveLength(2);
  });

  it("isInRoster detects saved genomes", () => {
    const r = [entry("ant")];
    expect(isInRoster(r, pureGenome("ant"))).toBe(true);
    expect(isInRoster(r, pureGenome("wolf"))).toBe(false);
  });

  it("genomeKey is order-stable and distinct per genome", () => {
    expect(genomeKey(pureGenome("ant"))).toBe(genomeKey(pureGenome("ant")));
    expect(genomeKey(pureGenome("ant"))).not.toBe(genomeKey(pureGenome("wolf")));
  });
});
