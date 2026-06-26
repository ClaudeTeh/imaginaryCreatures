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
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns null for uncached part", async () => {
    const { getModelPart } = await import("../src/render/modelLoader");
    expect(getModelPart("wolf", "head")).toBeNull();
  });

  it("populates cache on successful load", async () => {
    const fakeGroup = new THREE.Group();
    const mockLoader = {
      loadAsync: vi.fn().mockResolvedValue({ scene: fakeGroup }),
    };
    const { preloadAllModels, getModelPart } = await import("../src/render/modelLoader");
    await preloadAllModels(["wolf"], mockLoader);
    expect(getModelPart("wolf", "head")).toBe(fakeGroup);
    expect(mockLoader.loadAsync).toHaveBeenCalledWith("/models/wolf/head.glb");
  });

  it("silently skips failed loads (no throw)", async () => {
    const mockLoader = {
      loadAsync: vi.fn().mockRejectedValue(new Error("404")),
    };
    const { preloadAllModels, getModelPart } = await import("../src/render/modelLoader");
    await expect(preloadAllModels(["wolf"], mockLoader)).resolves.toBeUndefined();
    expect(getModelPart("wolf", "head")).toBeNull();
  });
});
