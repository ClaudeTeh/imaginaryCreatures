# GLTF Creature Models Design
**Date:** 2026-06-26  
**Scope:** Replace procedural Three.js primitive geometry with low-poly CC0 GLTF part models for all 16 species. Full chimera mixing preserved — each genome slot loads its own GLB.

---

## Goal

Make creatures look like recognisable real animals rather than assembled primitives. Keep chimera mixing, toon shading, and the procedural fallback intact.

## Architecture

**New file:** `src/render/modelLoader.ts` — GLB cache + preload  
**Modified:** `src/render/creature3d.ts` — `buildHead/Body/Limbs/Tail` try cache first, fall back to procedural  
**Modified:** `src/main.ts` — await preload at startup, show loading screen  
**New directory:** `public/models/{animalId}/{part}.glb` — 80 model files (16 species × 5 parts)

## Model File Layout

```
public/models/
  wolf/     head.glb  body.glb  forelimbs.glb  hindlimbs.glb  tail.glb
  eagle/    ...
  cobra/    ...
  bear/     ...
  boar/     ...
  rhino/    ...
  rabbit/   ...
  ant/      ...
  scorpion/ ...
  crab/     ...
  eel/      ...
  gorilla/  ...
  tiger/    ...
  ox/       ...
  dragon/   ...
  jellyfish/...
```

~50 KB per GLB × 80 = ~4 MB total. Loaded once at startup via `Promise.all`.

## modelLoader.ts

```typescript
const cache = new Map<string, THREE.Group>(); // key: "wolf/head"

export async function preloadAllModels(): Promise<void>
export function getModelPart(animalId: string, part: string): THREE.Group | null
```

- `preloadAllModels()` fires all 80 fetches in parallel. Per-model errors are caught silently — missing entry stays `null` (triggers procedural fallback).
- `getModelPart()` is synchronous — pure cache lookup. Returns `null` if model not loaded.
- Uses `THREE.GLTFLoader`. If loader unavailable (headless E2E), skips preload entirely.

## creature3d.ts Changes

Each `buildXxx(animalId)` function:

```
1. Call getModelPart(animalId, part)
2. If hit → applyToonStyle(clone, colorsFor(animalId)) → fitToBox(group, targetSize) → return
3. If null → existing procedural code (unchanged)
```

No signature changes. Stays synchronous.

### applyToonStyle(group, colors)
Traverses every `THREE.Mesh` in the group. Replaces material with `MeshToonMaterial`:
- `color`: `colors.fill`
- `gradientMap`: existing 4-step `DataTexture` (already in creature3d.ts)
- `castShadow = true`

### fitToBox(group, targetSize)
Computes bounding box. Scales group so longest dimension = `targetSize`. Translates so bounding box bottom sits at Y = 0.

| Part | Target size |
|---|---|
| head | 1.0 |
| body | 1.6 |
| forelimbs | 0.9 |
| hindlimbs | 0.9 |
| tail | 1.2 |

## main.ts Changes

Before showing game UI:
1. Show `"Loading models…"` text overlay
2. Await `preloadAllModels()`
3. Remove overlay, show normal UI

## Edge Cases

| Case | Behaviour |
|---|---|
| GLB file missing | `getModelPart()` returns `null` → procedural fallback |
| GLB fetch 404/network error | Caught silently in preload, missing entry stays `null` |
| Unusual anatomy (jellyfish forelimbs, eel hindlimbs) | Use minimal stub mesh (flat disc, single tube) |
| Dragon / jellyfish (not in standard packs) | Hand-model in Blender or adapt from closest CC0 base |
| WebGL fallback / headless E2E | Preload skipped if GLTFLoader unavailable — all procedural |

## Blender Workflow (Per Animal)

1. Import CC0 base model (Quaternius OBJ/FBX → Blender)
2. Separate mesh into 5 named objects: `head`, `body`, `forelimbs`, `hindlimbs`, `tail`
3. Set each object's origin to geometry centre
4. Export each as GLB: `File → Export → glTF 2.0`, "Apply Modifiers" on, "Materials" off
5. Place at `public/models/{animalId}/{part}.glb`

**Recommended CC0 sources:**
- Quaternius "Ultimate Animals Pack" — mammals, birds
- Quaternius "Quirky Animals" — insects, reptiles
- Dragon / jellyfish: hand-model or adapt nearest base

## Out of Scope

- Custom rigging or skeletal animation — parts are static meshes, animations remain procedural (rotation, translation in arena.ts)
- Texture maps / UV painting — toon material applied at runtime, no texture assets needed
- Lab UI card grid (separate spec: 2026-06-26-lab-ui-card-grid-design.md)
- Arena environments and progression (future specs)
