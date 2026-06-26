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
  rimColorHex?: string,
): THREE.Group {
  group.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      const mat = new THREE.MeshToonMaterial({
        color: new THREE.Color(fill),
        gradientMap,
      });

      const rim = rimColorHex || fill;
      mat.userData = {
        rimColor: { value: new THREE.Color(rim) },
        rimPower: { value: 3.5 },
        rimIntensity: { value: 0.65 },
      };

      mat.onBeforeCompile = (shader) => {
        shader.uniforms.rimColor = mat.userData.rimColor;
        shader.uniforms.rimPower = mat.userData.rimPower;
        shader.uniforms.rimIntensity = mat.userData.rimIntensity;

        shader.fragmentShader = `
          uniform vec3 rimColor;
          uniform float rimPower;
          uniform float rimIntensity;
        ` + shader.fragmentShader;

        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <dithering_fragment>',
          `
          #include <dithering_fragment>
          vec3 viewDir = normalize(vViewPosition);
          vec3 normalVal = normalize(vNormal);
          float rimDot = 1.0 - max(dot(normalVal, -viewDir), 0.0);
          float rimIntensityVal = pow(rimDot, rimPower);
          gl_FragColor.rgb += rimColor * rimIntensityVal * rimIntensity;
          `
        );
      };

      node.material = mat;
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
