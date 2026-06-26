# GLTF Creature Models Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace procedural Three.js primitive geometry with low-poly CC0 GLTF part models for all 16 species, while keeping chimera mixing, toon shading, and procedural fallback intact.

**Architecture:** A new `modelLoader.ts` module holds the GLB cache and preloads all 80 part files in parallel at startup. Each `buildHead/Body/Limbs/Tail` function in `creature3d.ts` checks the cache first; on miss it falls back to the existing procedural code unchanged. `main.ts` shows a loading overlay while preload runs.

**Tech Stack:** Three.js 0.160.1, `GLTFLoader` from `three/examples/jsm/loaders/GLTFLoader.js`, vitest, TypeScript strict

## Global Constraints

- Never modify `src/combat/` — simulation is separate from renderer
- Always preserve the `if (use3D && fighters3D)` guard in `arena.ts` — 2D fallback must exist
- Never recreate the WebGL context — use `setGenome()` to swap models
- All GLTF model files are CC0 (Quaternius "Ultimate Animals Pack" or "Quirky Animals")
- `npm run typecheck` must return 0 errors before any commit
- `npm run e2e` must pass (PLAYTEST PASS) before final commit

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/render/modelLoader.ts` | **Create** | GLB cache, preload, `applyToonStyle`, `fitToBox`, `getModelPart` |
| `src/render/creature3d.ts` | **Modify** | GLTF-first `buildHead/Body/Limbs/Tail`; export `modelsReady` |
| `src/main.ts` | **Modify** | Loading overlay; await `modelsReady` in lazy-import chain |
| `index.html` | **Modify** | Add loading overlay `<div>` |
| `public/models/{id}/{part}.glb` | **Create (manual)** | 80 GLB files — see Task 4 |
| `tests/modelLoader.test.ts` | **Create** | Unit tests for cache + helpers |

---

## Task 1: `src/render/modelLoader.ts` — Cache, preload, and helpers

**Files:**
- Create: `src/render/modelLoader.ts`
- Create: `tests/modelLoader.test.ts`

**Interfaces:**
- Produces:
  - `applyToonStyle(group: THREE.Group, fill: string, gradientMap: THREE.DataTexture): THREE.Group`
  - `fitToBox(group: THREE.Group, targetSize: number): THREE.Group`
  - `preloadAllModels(animalIds: string[], loader?: LoaderLike): Promise<void>`
  - `getModelPart(animalId: string, part: string): THREE.Group | null`
  - `type LoaderLike = { loadAsync(url: string): Promise<{ scene: THREE.Group }> }`

- [ ] **Step 1: Write the failing tests**

Create `tests/modelLoader.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";
// We test only the pure helpers — cache functions use injectable loader
import { fitToBox, applyToonStyle } from "../src/render/modelLoader";
import * as THREE from "three";

describe("fitToBox", () => {
  it("scales a 2-unit group to fit targetSize=1", () => {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    group.add(mesh);
    fitToBox(group, 1.0);
    const box = new THREE.Box3().setFromObject(group);
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(1.0, 2);
  });

  it("translates bottom to Y=0", () => {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    group.add(mesh);
    fitToBox(group, 1.0);
    const box = new THREE.Box3().setFromObject(group);
    expect(box.min.y).toBeCloseTo(0, 2);
  });
});

describe("applyToonStyle", () => {
  it("replaces all mesh materials with MeshToonMaterial", () => {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xff0000 })
    );
    group.add(mesh);
    const colors = new Uint8Array([0, 80, 160, 255]);
    const tex = new THREE.DataTexture(colors, 4, 1, THREE.RedFormat);
    tex.needsUpdate = true;
    applyToonStyle(group, "#aabbcc", tex);
    group.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        expect(node.material).toBeInstanceOf(THREE.MeshToonMaterial);
        expect((node.material as THREE.MeshToonMaterial).color.getHexString()).toBe("aabbcc");
      }
    });
  });
});

describe("getModelPart / preloadAllModels", () => {
  it("returns null for uncached part", async () => {
    // Dynamically import to get fresh module state
    const { getModelPart } = await import("../src/render/modelLoader?t=1");
    expect(getModelPart("wolf", "head")).toBeNull();
  });

  it("populates cache on successful load", async () => {
    const fakeGroup = new THREE.Group();
    const mockLoader = {
      loadAsync: vi.fn().mockResolvedValue({ scene: fakeGroup }),
    };
    const { preloadAllModels, getModelPart } = await import("../src/render/modelLoader?t=2");
    await preloadAllModels(["wolf"], mockLoader);
    expect(getModelPart("wolf", "head")).toBe(fakeGroup);
    expect(mockLoader.loadAsync).toHaveBeenCalledWith("/models/wolf/head.glb");
  });

  it("silently skips failed loads (no throw)", async () => {
    const mockLoader = {
      loadAsync: vi.fn().mockRejectedValue(new Error("404")),
    };
    const { preloadAllModels, getModelPart } = await import("../src/render/modelLoader?t=3");
    await expect(preloadAllModels(["wolf"], mockLoader)).resolves.toBeUndefined();
    expect(getModelPart("wolf", "head")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd ~/imaginaryCreatures && npm test -- tests/modelLoader.test.ts
```
Expected: `FAIL` — module does not exist yet.

- [ ] **Step 3: Create `src/render/modelLoader.ts`**

```typescript
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

export type LoaderLike = { loadAsync(url: string): Promise<{ scene: THREE.Group }> };

const PARTS = ["head", "body", "forelimbs", "hindlimbs", "tail"] as const;
type Part = typeof PARTS[number];

export const PART_TARGET_SIZE: Record<Part, number> = {
  head: 1.0,
  body: 1.6,
  forelimbs: 0.9,
  hindlimbs: 0.9,
  tail: 1.2,
};

const cache = new Map<string, THREE.Group>();
let _preloadPromise: Promise<void> | null = null;

export function applyToonStyle(
  group: THREE.Group,
  fill: string,
  gradientMap: THREE.DataTexture,
): THREE.Group {
  group.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.material = new THREE.MeshToonMaterial({
        color: new THREE.Color(fill),
        gradientMap,
      });
      node.castShadow = true;
    }
  });
  return group;
}

export function fitToBox(group: THREE.Group, targetSize: number): THREE.Group {
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 0) group.scale.setScalar(targetSize / maxDim);
  // Translate so bounding-box bottom sits at Y=0
  const shifted = new THREE.Box3().setFromObject(group);
  group.position.y -= shifted.min.y;
  return group;
}

async function loadOne(loader: LoaderLike, animalId: string, part: Part): Promise<void> {
  const key = `${animalId}/${part}`;
  try {
    const gltf = await loader.loadAsync(`/models/${animalId}/${part}.glb`);
    cache.set(key, gltf.scene);
  } catch {
    // intentional silent fail — procedural fallback takes over
  }
}

export async function preloadAllModels(
  animalIds: string[],
  loader: LoaderLike = new GLTFLoader(),
): Promise<void> {
  if (_preloadPromise) return _preloadPromise;
  const promises: Promise<void>[] = [];
  for (const id of animalIds) {
    for (const part of PARTS) {
      promises.push(loadOne(loader, id, part));
    }
  }
  _preloadPromise = Promise.all(promises).then(() => undefined);
  return _preloadPromise;
}

export function getModelPart(animalId: string, part: string): THREE.Group | null {
  return cache.get(`${animalId}/${part}`) ?? null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/imaginaryCreatures && npm test -- tests/modelLoader.test.ts
```
Expected: all tests pass. If the dynamic import cache-busting (`?t=N`) causes vitest issues, use `vi.resetModules()` + `vi.isolateModules()` instead.

- [ ] **Step 5: Typecheck**

```bash
cd ~/imaginaryCreatures && npm run typecheck
```
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
cd ~/imaginaryCreatures && git add src/render/modelLoader.ts tests/modelLoader.test.ts
git commit -m "feat: add modelLoader — GLB cache, preload, applyToonStyle, fitToBox"
```

---

## Task 2: Integrate GLTF lookup into `creature3d.ts`

**Files:**
- Modify: `src/render/creature3d.ts`

**Interfaces:**
- Consumes: `getModelPart`, `applyToonStyle`, `fitToBox`, `PART_TARGET_SIZE`, `preloadAllModels` from `./modelLoader`
- Produces: `export const modelsReady: Promise<void>` (consumed by Task 3)

- [ ] **Step 1: Add imports and `modelsReady` export at top of `creature3d.ts`**

After the existing imports block, add:

```typescript
import { ANIMALS } from "../data/animals";
import {
  getModelPart,
  applyToonStyle,
  fitToBox,
  PART_TARGET_SIZE,
  preloadAllModels,
} from "./modelLoader";

export const modelsReady: Promise<void> = preloadAllModels(ANIMALS.map((a) => a.id));
```

- [ ] **Step 2: Add GLTF-first path to `buildHead`**

`buildHead` starts at line ~511. Add these lines as the very first thing inside the function body, before the `const g = new THREE.Group()` line:

```typescript
function buildHead(animalId: string): THREE.Group {
  const cached = getModelPart(animalId, "head");
  if (cached) {
    const g = cached.clone();
    applyToonStyle(g, colorsFor(animalId).fill, getToonGradientMap());
    fitToBox(g, PART_TARGET_SIZE.head);
    return g;
  }
  // --- existing procedural code below — do not change ---
  const g = new THREE.Group();
  // ... rest of existing function unchanged
```

- [ ] **Step 3: Add GLTF-first path to `buildBody`**

`buildBody` starts at line ~372. Same pattern:

```typescript
function buildBody(animalId: string): THREE.Group {
  const cached = getModelPart(animalId, "body");
  if (cached) {
    const g = cached.clone();
    applyToonStyle(g, colorsFor(animalId).fill, getToonGradientMap());
    fitToBox(g, PART_TARGET_SIZE.body);
    return g;
  }
  // --- existing procedural code below — do not change ---
```

- [ ] **Step 4: Add GLTF-first path to `buildLimbs`**

`buildLimbs` starts at line ~696. Takes `(animalId: string, front: boolean)`. Cache key is same regardless of `front` — the same GLB is used for both forelimbs and hindlimbs, and positioned differently by `buildCreatureModel`. Use `front ? "forelimbs" : "hindlimbs"` as the part key:

```typescript
function buildLimbs(animalId: string, front: boolean): THREE.Group {
  const part = front ? "forelimbs" : "hindlimbs";
  const cached = getModelPart(animalId, part);
  if (cached) {
    const g = cached.clone();
    applyToonStyle(g, colorsFor(animalId).fill, getToonGradientMap());
    fitToBox(g, PART_TARGET_SIZE[part]);
    return g;
  }
  // --- existing procedural code below — do not change ---
```

- [ ] **Step 5: Add GLTF-first path to `buildTail`**

`buildTail` starts at line ~951:

```typescript
function buildTail(animalId: string): THREE.Group {
  const cached = getModelPart(animalId, "tail");
  if (cached) {
    const g = cached.clone();
    applyToonStyle(g, colorsFor(animalId).fill, getToonGradientMap());
    fitToBox(g, PART_TARGET_SIZE.tail);
    return g;
  }
  // --- existing procedural code below — do not change ---
```

- [ ] **Step 6: Typecheck**

```bash
cd ~/imaginaryCreatures && npm run typecheck
```
Expected: 0 errors. Common error to watch for: `THREE.Group | null` not narrowed — the `if (cached)` guard handles this.

- [ ] **Step 7: Smoke test in browser**

```bash
cd ~/imaginaryCreatures && npm run dev
```
Open `http://localhost:5173`. Go to the Lab. Creatures should render identically to before (all procedural, since no GLBs exist yet). No console errors.

- [ ] **Step 8: Commit**

```bash
cd ~/imaginaryCreatures && git add src/render/creature3d.ts
git commit -m "feat: GLTF-first buildHead/Body/Limbs/Tail with procedural fallback"
```

---

## Task 3: Loading overlay in `index.html` and `main.ts`

**Files:**
- Modify: `index.html`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `modelsReady: Promise<void>` exported from `./render/creature3d`

- [ ] **Step 1: Add loading overlay to `index.html`**

Inside `<body>`, before `<div id="app">`:

```html
<div id="models-loading-overlay" style="
  display:none;
  position:fixed;inset:0;
  background:rgba(10,8,20,0.85);
  z-index:9999;
  align-items:center;justify-content:center;
  flex-direction:column;gap:12px;
  color:#c8a84b;font-family:monospace;font-size:16px;letter-spacing:0.08em;
">
  <div style="font-size:32px">🧬</div>
  <div>LOADING CREATURES…</div>
</div>
```

- [ ] **Step 2: Await `modelsReady` in the `creature3d` lazy import in `main.ts`**

Find the existing lazy-import block in `main.ts` (around line 37):

```typescript
import("./render/creature3d")
  .then(({ mountCreature3D }) => {
    if (!preview3dHost) return;
    try {
      creature3d = mountCreature3D(preview3dHost, genome, 240);
    } catch {
      creature3dFailed = true;
      preview3dHost?.remove();
      preview3dHost = null;
    }
  })
  .catch(() => {
    creature3dFailed = true;
  });
```

Replace with:

```typescript
import("./render/creature3d")
  .then(({ mountCreature3D, modelsReady }) => {
    const overlay = document.getElementById("models-loading-overlay") as HTMLElement | null;
    if (overlay) overlay.style.display = "flex";
    return modelsReady.then(() => {
      if (overlay) overlay.style.display = "none";
      if (!preview3dHost) return;
      try {
        creature3d = mountCreature3D(preview3dHost, genome, 240);
      } catch {
        creature3dFailed = true;
        preview3dHost?.remove();
        preview3dHost = null;
      }
    });
  })
  .catch(() => {
    const overlay = document.getElementById("models-loading-overlay") as HTMLElement | null;
    if (overlay) overlay.style.display = "none";
    creature3dFailed = true;
  });
```

- [ ] **Step 3: Typecheck**

```bash
cd ~/imaginaryCreatures && npm run typecheck
```
Expected: 0 errors.

- [ ] **Step 4: Visual check of loading overlay**

```bash
cd ~/imaginaryCreatures && npm run dev
```
Open `http://localhost:5173`. Open DevTools → Network → set throttle to "Slow 3G". Refresh. Navigate to Lab. The `🧬 LOADING CREATURES…` overlay should appear briefly, then disappear when preload resolves (fast — no GLBs exist yet so all 80 fetch attempts 404 silently and resolve immediately). Confirm no console errors.

- [ ] **Step 5: Commit**

```bash
cd ~/imaginaryCreatures && git add index.html src/main.ts
git commit -m "feat: show loading overlay while GLTF models preload"
```

---

## Task 4: Pilot GLB files — wolf, eagle, cobra, bear (4 × 5 = 20 files)

> **This task is manual Blender work.** Code from Tasks 1–3 is already live. Until GLBs exist at `public/models/{id}/{part}.glb`, all species render procedurally — no regression.

**Files:**
- Create: `public/models/wolf/{head,body,forelimbs,hindlimbs,tail}.glb`
- Create: `public/models/eagle/{head,body,forelimbs,hindlimbs,tail}.glb`
- Create: `public/models/cobra/{head,body,forelimbs,hindlimbs,tail}.glb`
- Create: `public/models/bear/{head,body,forelimbs,hindlimbs,tail}.glb`

**Model sources (CC0):**
- Quaternius "Ultimate Animals Pack" — `https://quaternius.com/packs/ultimateanimals.html`
- Quaternius "Quirky Animals" — `https://quaternius.com/packs/quirkyanimals.html`

**Blender workflow (repeat per animal):**

- [ ] **Step 1: Download and import**

Download the relevant Quaternius pack (ZIP). Open Blender. `File → Import → FBX` or OBJ. Select the animal file (e.g. `Wolf.fbx`).

- [ ] **Step 2: Separate into 5 parts**

In Edit Mode, select faces for each part and use `P → Selection` to separate:
- `head` — skull, snout, ears, eyes
- `body` — torso, chest, neck base
- `forelimbs` — front legs/arms/wings
- `hindlimbs` — back legs
- `tail` — tail (or stub cube if species has none)

Name each object in the Outliner: `head`, `body`, `forelimbs`, `hindlimbs`, `tail`.

- [ ] **Step 3: Set origins to geometry**

Select each object → `Object → Set Origin → Origin to Geometry`.

- [ ] **Step 4: Export each part as GLB**

For each named object, select it alone, then:
`File → Export → glTF 2.0`
- Format: GLB
- Check: "Apply Modifiers"
- Check: "Selected Objects" only
- Uncheck: "Materials" (we replace at runtime)
- Save to: `public/models/{animalId}/{part}.glb`

- [ ] **Step 5: Visual verification in browser**

```bash
cd ~/imaginaryCreatures && npm run dev
```
Open Lab. Select "wolf" for all 5 slots. The creature should now render with GLTF geometry (recognisable wolf head, body etc.) tinted gold/brown in toon shading. Chimera test: wolf head + eagle body + cobra tail — each part should be recognisable.

- [ ] **Step 6: Typecheck + E2E**

```bash
cd ~/imaginaryCreatures && npm run typecheck && npm run e2e
```
Expected: 0 typecheck errors, `PLAYTEST PASS`.

- [ ] **Step 7: Commit**

```bash
cd ~/imaginaryCreatures && git add public/models/
git commit -m "feat: add pilot GLTF parts for wolf, eagle, cobra, bear"
```

---

## Task 5: Remaining 12 species GLBs

Follow identical Blender workflow from Task 4 for:
`boar`, `rhino`, `rabbit`, `ant`, `scorpion`, `crab`, `eel`, `gorilla`, `tiger`, `ox`, `dragon`, `jellyfish`

**Special cases:**
- `ant`, `scorpion`, `crab` — Quaternius "Quirky Animals" pack
- `eel`, `jellyfish` — no standard CC0 pack; hand-model in Blender from primitives (elongated capsule for eel, bell + tentacles for jellyfish)
- `dragon` — hand-model or adapt from lizard base + add wings and horns

- [ ] **Step 1: Process boar, rhino, rabbit, gorilla, tiger, ox** (from Ultimate Animals Pack)

Follow Task 4 Steps 1–4 for each.

- [ ] **Step 2: Process ant, scorpion, crab** (from Quirky Animals Pack)

Follow Task 4 Steps 1–4 for each.

- [ ] **Step 3: Hand-model eel, jellyfish, dragon**

Create from scratch in Blender:
- `eel`: elongated CapsuleMesh body (body), flat-fin forelimbs, no hindlimbs stub, tapering tail, small sphere head with fin-gills
- `jellyfish`: dome bell (body), oral arm clusters (forelimbs), stub hindlimbs, trailing tentacle tail, dome head
- `dragon`: lizard base reshaped — horned head, broad chest body, wing-shaped forelimbs, clawed hindlimbs, barbed tail

- [ ] **Step 4: Final E2E with all 16 species**

```bash
cd ~/imaginaryCreatures && npm run e2e
```
Expected: `PLAYTEST PASS`.

- [ ] **Step 5: Commit**

```bash
cd ~/imaginaryCreatures && git add public/models/
git commit -m "feat: add GLTF parts for all 16 species — full model set complete"
```

---

## Self-Review

**Spec coverage check:**
- ✅ `src/render/modelLoader.ts` — Task 1
- ✅ `preloadAllModels(animalIds)` parallel fetch — Task 1
- ✅ `getModelPart()` sync cache lookup — Task 1
- ✅ `applyToonStyle` — Task 1
- ✅ `fitToBox` with per-part target sizes — Task 1
- ✅ `buildHead/Body/Limbs/Tail` GLTF-first with procedural fallback — Task 2
- ✅ `modelsReady` exported — Task 2
- ✅ Loading overlay — Task 3
- ✅ Await `modelsReady` in main.ts lazy import — Task 3
- ✅ 404/network error silent fail — Task 1 (catch block)
- ✅ WebGL fallback / headless E2E — all tasks: `getModelPart` returns null → procedural runs, no GLTFLoader call needed
- ✅ Pilot 4 species — Task 4
- ✅ All 16 species — Task 5

**Type consistency check:**
- `applyToonStyle(group, fill: string, gradientMap)` — consistent across Task 1 definition and Task 2 usage ✅
- `fitToBox(group, targetSize: number)` — consistent ✅
- `PART_TARGET_SIZE.head/body/forelimbs/hindlimbs/tail` — consistent ✅
- `modelsReady: Promise<void>` — exported in Task 2, consumed in Task 3 ✅
