import { describe, expect, it } from "vitest";
import { getBiome } from "../src/render/arena";

describe("getBiome", () => {
  it("wolf → forest biome", () => {
    const b = getBiome("wolf");
    expect(b.skyHex).toBe(0x060e06);
    expect(b.particleKind).toBe("leaf");
    expect(b.fogDensity).toBe(0.014);
  });

  it("bear → forest biome", () => {
    expect(getBiome("bear").particleKind).toBe("leaf");
  });

  it("gorilla → forest biome", () => {
    expect(getBiome("gorilla").particleKind).toBe("leaf");
  });

  it("tiger → forest biome", () => {
    expect(getBiome("tiger").particleKind).toBe("leaf");
  });

  it("eagle → sky peak biome", () => {
    const b = getBiome("eagle");
    expect(b.skyHex).toBe(0x04080f);
    expect(b.particleKind).toBe("streak");
    expect(b.fogDensity).toBe(0.010);
  });

  it("dragon → sky peak biome", () => {
    expect(getBiome("dragon").particleKind).toBe("streak");
  });

  it("cobra → deep ocean biome", () => {
    const b = getBiome("cobra");
    expect(b.skyHex).toBe(0x020a10);
    expect(b.particleKind).toBe("bubble");
    expect(b.fogDensity).toBe(0.016);
  });

  it("eel → deep ocean biome", () => {
    expect(getBiome("eel").particleKind).toBe("bubble");
  });

  it("jellyfish → deep ocean biome", () => {
    expect(getBiome("jellyfish").particleKind).toBe("bubble");
  });

  it("rhino → volcanic biome", () => {
    const b = getBiome("rhino");
    expect(b.skyHex).toBe(0x0f0202);
    expect(b.particleKind).toBe("ember");
    expect(b.fogDensity).toBe(0.015);
  });

  it("boar → volcanic biome", () => {
    expect(getBiome("boar").particleKind).toBe("ember");
  });

  it("scorpion → volcanic biome", () => {
    expect(getBiome("scorpion").particleKind).toBe("ember");
  });

  it("ant → desert biome", () => {
    const b = getBiome("ant");
    expect(b.skyHex).toBe(0x0f0a02);
    expect(b.particleKind).toBe("dust");
    expect(b.fogDensity).toBe(0.012);
  });

  it("unknown body → desert fallback", () => {
    expect(getBiome("unicorn").particleKind).toBe("dust");
  });

  it("all biomes have required fields", () => {
    for (const id of ["wolf", "eagle", "cobra", "rhino", "ant"]) {
      const b = getBiome(id);
      expect(typeof b.skyHex).toBe("number");
      expect(typeof b.fogHex).toBe("number");
      expect(typeof b.fogDensity).toBe("number");
      expect(typeof b.floorHex).toBe("number");
      expect(typeof b.ambientHex).toBe("number");
      expect(typeof b.particleColor).toBe("string");
      expect(["leaf", "streak", "bubble", "ember", "dust"]).toContain(b.particleKind);
    }
  });
});
