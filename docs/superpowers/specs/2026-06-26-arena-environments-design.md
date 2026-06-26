# Arena Environments Design
**Date:** 2026-06-26
**Scope:** Derive battle arena biome from the player's dominant genome (body slot). 5 biomes, fully procedural — no asset files required.

---

## Goal

The arena currently shows one static dark-blue scene for every battle. Biomes make each fight feel different and reinforce creature identity — a dragon fight should feel volcanic, an eel fight should feel deep-ocean.

## Biome Table

Dominant body (player side A `sa.genome.body`) determines biome:

| Body IDs | Biome | Sky hex | Fog hex | Fog density | Floor hex | Ambient hex | Particle |
|---|---|---|---|---|---|---|---|
| wolf, bear, gorilla, tiger | **Forest** | `#060e06` | `#0a1a0a` | 0.014 | `#1a2a10` | `#334422` | Falling leaves (green) |
| eagle, dragon | **Sky Peak** | `#04080f` | `#080f20` | 0.010 | `#2a2a35` | `#223355` | Wind streaks (white) |
| cobra, eel, jellyfish | **Deep Ocean** | `#020a10` | `#051520` | 0.016 | `#0f2530` | `#103040` | Bubbles rising (teal) |
| rhino, boar, ox | **Volcanic** | `#0f0202` | `#1a0505` | 0.015 | `#2a1008` | `#442010` | Embers rising (orange) |
| ant, scorpion, crab, rabbit, gecko, ox (fallback) | **Desert** | `#0f0a02` | `#1a1205` | 0.012 | `#2a2010` | `#443320` | Dust swirl (amber) |

(ox appears in Volcanic if matched first; Desert is the fallback for any unmatched body)

## Architecture

**New function in `src/render/arena.ts`:**

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

function getBiome(bodyId: string): BiomeConfig
```

Called at `initScene3D()` time with `sa.genome.body`. Returns a `BiomeConfig`.

**`initScene3D()` changes (minimal):**
- `scene3D.background = new THREE.Color(biome.skyHex)`
- `scene3D.fog = new THREE.FogExp2(biome.fogHex, biome.fogDensity)`
- `platMat.color = new THREE.Color(biome.floorHex)`
- `ambientLight.color = new THREE.Color(biome.ambientHex)`

**New function `spawnBiomeParticles(scene, biome)`:**
- Creates 40 `THREE.Sprite` or `THREE.Points` particles appropriate to the biome kind
- Each particle has a random starting position above/around the arena and a drift velocity
- Updated each frame inside the `step()` loop — particles wrap when they fall below floor

## Particle Behaviours

| Kind | Motion | Shape |
|---|---|---|
| leaf | Slow fall + gentle x-drift | Small flat quad, random green tints |
| streak | Fast sideways drift, fade in/out | Thin white line sprite |
| bubble | Slow rise, slight x-wobble | Tiny sphere sprite, teal tint |
| ember | Rise + random x-jitter, fade | Tiny orange point |
| dust | Slow orbit around arena center | Amber point |

All particles use `THREE.Points` with `THREE.BufferGeometry` — no sprite textures, just coloured `THREE.PointsMaterial`. Limit: 40 particles per battle (no performance impact).

## Edge Cases

| Case | Behaviour |
|---|---|
| 2D canvas fallback (no WebGL) | `getBiome()` still returns config; only the 3D branch uses it. No 2D changes. |
| Body ID not in any biome map | Desert fallback |
| Opponent's body differs | Biome derived from side-A (player) only — consistent with "your arena" feel |

## Out of Scope

- Dynamic weather changes mid-battle
- Different arenas per opponent tier
- Skybox images / HDRI lighting
