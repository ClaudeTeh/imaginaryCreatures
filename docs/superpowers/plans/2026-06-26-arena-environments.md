# Arena Environments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derive the battle arena's visual biome from the player's dominant genome (body slot) — 5 biomes with distinct sky, fog, floor colour, ambient light, and ambient particles.

**Architecture:** A `getBiome(bodyId)` pure function maps body IDs to a `BiomeConfig` object. `initScene3D()` in `arena.ts` calls it with `sa.genome.body` and applies the config to the Three.js scene. A `spawnBiomeParticles()` helper seeds 40 ambient particles; each frame the `step()` loop updates them. All changes are in `src/render/arena.ts` only.

**Tech Stack:** Three.js 0.160.1 (`THREE.Points`, `THREE.BufferGeometry`, `THREE.PointsMaterial`), TypeScript strict, vitest

## Global Constraints

- Never modify `src/combat/` — simulation is separate from renderer
- Never remove the `if (use3D && fighters3D)` guard — 2D fallback must stay intact
- `npm run typecheck` must return 0 errors before any commit
- `npm run test` must pass (46 passed) before any commit
- All changes in `src/render/arena.ts` only — no other files

---

## File Map

| File | Action |
|---|---|
| `src/render/arena.ts` | Modify — add `getBiome()`, `BiomeConfig` interface, biome application in `initScene3D()`, `spawnBiomeParticles()`, per-frame particle update in `step()` |
| `tests/biome.test.ts` | Create — unit tests for `getBiome()` |

---

## Task 1: `getBiome()` pure function + tests

**Files:**
- Modify: `src/render/arena.ts`
- Create: `tests/biome.test.ts`

**Interfaces:**
- Produces:
  - `interface BiomeConfig { skyHex: number; fogHex: number; fogDensity: number; floorHex: number; ambientHex: number; particleColor: string; particleKind: "leaf" | "streak" | "bubble" | "ember" | "dust"; }`
  - `function getBiome(bodyId: string): BiomeConfig` — exported for testing

- [ ] **Step 1: Write the failing tests**

Create `tests/biome.test.ts`:

```typescript
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

  it("ox → volcanic biome", () => {
    expect(getBiome("ox").particleKind).toBe("ember");
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
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd ~/imaginaryCreatures && npm test -- tests/biome.test.ts
```
Expected: `FAIL` — `getBiome` not exported yet.

- [ ] **Step 3: Add `BiomeConfig` interface and `getBiome` to `arena.ts`**

Add this block near the top of the `playBattle` function body, after the `interface Fighter3D` block (around line 145), before `const activeParticles3D`:

```typescript
  interface BiomeConfig {
    skyHex: number;
    fogHex: number;
    fogDensity: number;
    floorHex: number;
    ambientHex: number;
    particleColor: string;
    particleKind: "leaf" | "streak" | "bubble" | "ember" | "dust";
  }
```

Then add `getBiome` as a module-level export (outside `playBattle`, near the top of `arena.ts`, after the imports block):

```typescript
export function getBiome(bodyId: string): BiomeConfig {
  const forest:  BiomeConfig = { skyHex: 0x060e06, fogHex: 0x0a1a0a, fogDensity: 0.014, floorHex: 0x1a2a10, ambientHex: 0x334422, particleColor: "#2d6e2d", particleKind: "leaf" };
  const sky:     BiomeConfig = { skyHex: 0x04080f, fogHex: 0x080f20, fogDensity: 0.010, floorHex: 0x2a2a35, ambientHex: 0x223355, particleColor: "#c8d8ff", particleKind: "streak" };
  const ocean:   BiomeConfig = { skyHex: 0x020a10, fogHex: 0x051520, fogDensity: 0.016, floorHex: 0x0f2530, ambientHex: 0x103040, particleColor: "#20c0a0", particleKind: "bubble" };
  const volcano: BiomeConfig = { skyHex: 0x0f0202, fogHex: 0x1a0505, fogDensity: 0.015, floorHex: 0x2a1008, ambientHex: 0x442010, particleColor: "#ff6020", particleKind: "ember" };
  const desert:  BiomeConfig = { skyHex: 0x0f0a02, fogHex: 0x1a1205, fogDensity: 0.012, floorHex: 0x2a2010, ambientHex: 0x443320, particleColor: "#c0a040", particleKind: "dust" };

  const FOREST_IDS  = new Set(["wolf", "bear", "gorilla", "tiger"]);
  const SKY_IDS     = new Set(["eagle", "dragon"]);
  const OCEAN_IDS   = new Set(["cobra", "eel", "jellyfish"]);
  const VOLCANO_IDS = new Set(["rhino", "boar", "ox"]);

  if (FOREST_IDS.has(bodyId))  return forest;
  if (SKY_IDS.has(bodyId))     return sky;
  if (OCEAN_IDS.has(bodyId))   return ocean;
  if (VOLCANO_IDS.has(bodyId)) return volcano;
  return desert;
}
```

Note: `BiomeConfig` interface must be declared at module scope (outside `playBattle`) so the exported function can reference it. Move the interface declaration outside `playBattle` as well.

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd ~/imaginaryCreatures && npm test -- tests/biome.test.ts
```
Expected: 16 tests pass.

- [ ] **Step 5: Typecheck**

```bash
cd ~/imaginaryCreatures && npm run typecheck
```
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
cd ~/imaginaryCreatures && git add src/render/arena.ts tests/biome.test.ts
git commit -m "feat: add getBiome() — 5 arena biomes derived from body genome"
```

---

## Task 2: Apply biome to scene + ambient particles

**Files:**
- Modify: `src/render/arena.ts`

**Interfaces:**
- Consumes: `getBiome(bodyId: string): BiomeConfig` from Task 1, `sa.genome.body` (already available as `sa` is defined at line ~187)

- [ ] **Step 1: Derive biome at `initScene3D` time**

Find this block (around line 231):
```typescript
    scene3D = new THREE.Scene();
    scene3D.background = new THREE.Color(0x0e1730);
    scene3D.fog = new THREE.FogExp2(0x0e1730, 0.012);
```

Replace with:
```typescript
    const biome = getBiome(sa.genome.body);
    scene3D = new THREE.Scene();
    scene3D.background = new THREE.Color(biome.skyHex);
    scene3D.fog = new THREE.FogExp2(biome.fogHex, biome.fogDensity);
```

- [ ] **Step 2: Apply biome colours to ambient light and floor**

Find the ambient light line (around line 240):
```typescript
    ambientLight = new THREE.AmbientLight(0x445588, 0.9);
```
Replace with:
```typescript
    ambientLight = new THREE.AmbientLight(biome.ambientHex, 0.9);
```

Find the floor material line (around line 282):
```typescript
    platMat = new THREE.MeshStandardMaterial({ color: 0x16223f, metalness: 0.8, roughness: 0.3 });
```
Replace with:
```typescript
    platMat = new THREE.MeshStandardMaterial({ color: biome.floorHex, metalness: 0.8, roughness: 0.3 });
```

- [ ] **Step 3: Add `spawnBiomeParticles` and a biome particles array**

After `const activeParticles3D: Particle3D[] = [];` (around line 174), add:

```typescript
  interface BiomeParticle {
    mesh: THREE.Points;
    velocities: Float32Array;  // [vx, vy, vz] per particle
    count: number;
  }
  let biomeParticleSystem: BiomeParticle | null = null;
```

Then add the `spawnBiomeParticles` function just before the `step()` animation loop starts (search for `function step(` or `const step = `). Place it after all other VFX `const` helpers:

```typescript
  const spawnBiomeParticles = (scene: THREE.Scene, cfg: BiomeConfig): void => {
    const COUNT = 40;
    const positions = new Float32Array(COUNT * 3);
    const velocities = new Float32Array(COUNT * 3);

    for (let i = 0; i < COUNT; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 20;
      positions[i * 3 + 1] = Math.random() * 12;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20;

      const speed = cfg.particleKind === "streak" ? 0.08 : 0.02;
      velocities[i * 3]     = cfg.particleKind === "streak" ? (Math.random() - 0.5) * speed * 4 : (Math.random() - 0.5) * speed;
      velocities[i * 3 + 1] = cfg.particleKind === "bubble" || cfg.particleKind === "ember" ? speed + Math.random() * speed
                             : cfg.particleKind === "leaf"   ? -(speed + Math.random() * speed)
                             : (Math.random() - 0.5) * speed * 0.3;
      velocities[i * 3 + 2] = cfg.particleKind === "streak" ? (Math.random() - 0.5) * speed * 2 : (Math.random() - 0.5) * speed * 0.5;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: new THREE.Color(cfg.particleColor),
      size: cfg.particleKind === "streak" ? 0.08 : 0.12,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });

    const points = new THREE.Points(geo, mat);
    scene.add(points);
    biomeParticleSystem = { mesh: points, velocities, count: COUNT };
  };
```

- [ ] **Step 4: Call `spawnBiomeParticles` after scene init**

After `scene3D.add(arenaGroup);` (around line 297), add:

```typescript
    spawnBiomeParticles(scene3D, biome);
```

- [ ] **Step 5: Update biome particles each frame inside `step()`**

Inside the `step()` function, in the `if (use3D && fighters3D && scene3D)` block, after the existing particle update loop (`for (let i = activeParticles3D.length - 1...`), add:

```typescript
      // Ambient biome particles
      if (biomeParticleSystem) {
        const posAttr = biomeParticleSystem.mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
        const pos = posAttr.array as Float32Array;
        const vel = biomeParticleSystem.velocities;
        for (let i = 0; i < biomeParticleSystem.count; i++) {
          pos[i * 3]     += vel[i * 3];
          pos[i * 3 + 1] += vel[i * 3 + 1];
          pos[i * 3 + 2] += vel[i * 3 + 2];
          // Wrap: reset particles that drift out of bounds
          if (pos[i * 3 + 1] > 13) pos[i * 3 + 1] = -1;
          if (pos[i * 3 + 1] < -1) pos[i * 3 + 1] = 13;
          if (Math.abs(pos[i * 3])     > 11) pos[i * 3]     *= -0.9;
          if (Math.abs(pos[i * 3 + 2]) > 11) pos[i * 3 + 2] *= -0.9;
        }
        posAttr.needsUpdate = true;
      }
```

- [ ] **Step 6: Typecheck**

```bash
cd ~/imaginaryCreatures && npm run typecheck
```
Expected: 0 errors. Watch for: `BiomeConfig` not in scope inside `playBattle` — it must be declared at module scope (outside `playBattle`).

- [ ] **Step 7: Full test suite**

```bash
cd ~/imaginaryCreatures && npm test
```
Expected: 46 passed (0 failures). The biome tests from Task 1 should still pass.

- [ ] **Step 8: Visual smoke test**

```bash
cd ~/imaginaryCreatures && npm run dev
```
Open `http://localhost:5173`. Start a battle with wolf body → arena should be dark green with falling green dots. Start a battle with rhino body → arena should be dark red/volcanic with rising orange embers. Verify 2D fallback still works (disable WebGL in DevTools → GPU → disable hardware acceleration → confirm battle still runs in 2D canvas).

- [ ] **Step 9: Commit**

```bash
cd ~/imaginaryCreatures && git add src/render/arena.ts
git commit -m "feat: apply biome colors + ambient particles to 3D arena scene"
```
