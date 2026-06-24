import { describe, expect, it } from "vitest";
import { ANIMALS } from "../src/data/animals";
import {
  buildCreature,
  generateName,
  isValidGenome,
  powerRating,
  pureGenome,
} from "../src/genome/genome";
import { SLOTS } from "../src/core/types";

describe("genome -> creature", () => {
  it("builds a valid creature from a pure genome", () => {
    const c = buildCreature(pureGenome("wolf"));
    expect(c.stats.health).toBeGreaterThan(0);
    expect(c.stats.attack).toBeGreaterThan(0);
    expect(c.emoji).toBe("🐺");
    expect(c.name.length).toBeGreaterThan(0);
  });

  it("sums stats across the chosen donor parts", () => {
    const mixed = {
      head: "bear",
      body: "rhino",
      forelimbs: "gorilla",
      hindlimbs: "tiger",
      tail: "scorpion",
    };
    expect(isValidGenome(mixed)).toBe(true);
    const c = buildCreature(mixed);
    // big tanky bruiser should clear a healthy threshold
    expect(c.stats.health).toBeGreaterThan(60);
    expect(c.stats.attack).toBeGreaterThan(20);
  });

  it("collects abilities and traits without duplicates", () => {
    const venomy = {
      head: "cobra",
      body: "scorpion",
      forelimbs: "scorpion",
      hindlimbs: "ant",
      tail: "cobra",
    };
    const c = buildCreature(venomy);
    expect(c.abilities).toContain("venom");
    expect(new Set(c.abilities).size).toBe(c.abilities.length);
    expect(new Set(c.traits).size).toBe(c.traits.length);
  });

  it("applies trait multipliers (thickHide raises defense)", () => {
    const withHide = buildCreature(pureGenome("crab"));
    expect(withHide.traits).toContain("thickHide");
    // defense should exceed the raw crab body's flat contribution alone
    expect(withHide.stats.defense).toBeGreaterThan(8);
  });

  it("every animal can fill every slot", () => {
    for (const animal of ANIMALS) {
      for (const slot of SLOTS) {
        expect(animal.parts[slot]).toBeTruthy();
      }
    }
  });

  it("generates a portmanteau name", () => {
    const name = generateName(pureGenome("wolf"));
    expect(typeof name).toBe("string");
    expect(name[0]).toBe(name[0].toUpperCase());
  });

  it("power rating increases with a stronger genome", () => {
    const weak = powerRating(buildCreature(pureGenome("ant")));
    const strong = powerRating(buildCreature(pureGenome("bear")));
    expect(strong).toBeGreaterThan(weak);
  });
});
