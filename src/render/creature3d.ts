/**
 * 3D creature rendering (WebGL via Three.js).
 *
 * A genome (5 animal-donated slots) is assembled into a real lit 3D model built
 * from primitive meshes, each slot tinted by its donor animal's palette so a
 * hybrid genuinely *mixes* in three dimensions. Used for the Lab "DNA" preview.
 *
 * This module is loaded lazily by the Lab UI only — it is never imported by the
 * deterministic sim or the unit tests, so the test/JSDOM path stays WebGL-free.
 */
import * as THREE from "three";
import { SLOTS, type Genome, type Slot } from "../core/types";
import { ANIMAL_COLORS, type PartColors } from "./creatureParts";
import { ANIMALS } from "../data/animals";
import {
  getModelPart,
  applyToonStyle,
  fitToBox,
  PART_TARGET_SIZE,
  preloadAllModels,
} from "./modelLoader";

export const modelsReady: Promise<void> = preloadAllModels(ANIMALS.map((a) => a.id));

function colorsFor(animalId: string): PartColors {
  return ANIMAL_COLORS[animalId] ?? ANIMAL_COLORS.boar;
}

let currentBuilderAnimalId: string | null = null;

const textureCache = new Map<string, THREE.CanvasTexture>();

function createProceduralTexture(animalId: string, baseHex: string, accentHex: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  // Draw base color
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);

  // 1. Bake a vertical shading gradient (top-down lighting/ambient occlusion)
  const shadGrad = ctx.createLinearGradient(0, 0, 0, 256);
  shadGrad.addColorStop(0, "rgba(255, 255, 255, 0.16)"); // soft highlight at the top
  shadGrad.addColorStop(0.4, "rgba(255, 255, 255, 0)");
  shadGrad.addColorStop(0.7, "rgba(0, 0, 0, 0)");
  shadGrad.addColorStop(1, "rgba(0, 0, 0, 0.22)"); // dark ambient occlusion shadow at the bottom
  ctx.fillStyle = shadGrad;
  ctx.fillRect(0, 0, 256, 256);

  // 2. Add organic watercolor brush strokes for hand-painted look
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = accentHex;
  for (let i = 0; i < 20; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const rx = 15 + Math.random() * 30;
    const ry = 4 + Math.random() * 8;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, Math.random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1.0;

  switch (animalId) {
    case "cobra":
    case "eel": {
      ctx.strokeStyle = accentHex;
      ctx.lineWidth = 3;
      const scaleSize = 32;
      for (let y = -scaleSize; y < 256 + scaleSize; y += scaleSize / 2) {
        const shift = (Math.floor(y / (scaleSize / 2)) % 2) * (scaleSize / 2);
        for (let x = -scaleSize; x < 256 + scaleSize; x += scaleSize) {
          ctx.beginPath();
          ctx.arc(x + shift + scaleSize / 2, y, scaleSize / 2, 0, Math.PI);
          ctx.stroke();
        }
      }
      break;
    }
    case "tiger": {
      ctx.fillStyle = "#121212";
      for (let i = 0; i < 8; i++) {
        const y = 20 + i * 32 + Math.random() * 8;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.quadraticCurveTo(80, y + 15, 120, y + 5);
        ctx.quadraticCurveTo(80, y + 25, 0, y + 30);
        ctx.closePath();
        ctx.fill();
        
        ctx.beginPath();
        ctx.moveTo(256, y + 10);
        ctx.quadraticCurveTo(176, y + 25, 136, y + 15);
        ctx.quadraticCurveTo(176, y + 35, 256, y + 40);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case "ant":
    case "scorpion": {
      for (let y = 0; y < 256; y += 32) {
        const grad = ctx.createLinearGradient(0, y, 0, y + 32);
        grad.addColorStop(0, accentHex);
        grad.addColorStop(0.3, baseHex);
        grad.addColorStop(0.7, baseHex);
        grad.addColorStop(1, accentHex);
        ctx.fillStyle = grad;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(0, y, 256, 28);
        ctx.globalAlpha = 1.0;
      }
      break;
    }
    case "eagle": {
      ctx.fillStyle = accentHex;
      const rowHeight = 24;
      for (let y = 0; y < 256 + rowHeight; y += rowHeight) {
        const offset = (Math.floor(y / rowHeight) % 2) * 20;
        for (let x = -20; x < 256 + 20; x += 40) {
          ctx.beginPath();
          ctx.moveTo(x + offset, y);
          ctx.lineTo(x + offset + 20, y + 15);
          ctx.lineTo(x + offset + 40, y);
          ctx.lineTo(x + offset + 20, y - 5);
          ctx.closePath();
          ctx.fill();
        }
      }
      break;
    }
    case "boar":
    case "rhino": {
      ctx.fillStyle = accentHex;
      for (let i = 0; i < 250; i++) {
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        const r = 1.5 + Math.random() * 2.5;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "wolf":
    case "bear":
    case "rabbit": {
      ctx.strokeStyle = accentHex;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 350; i++) {
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        const len = 4 + Math.random() * 7;
        const angle = Math.PI / 4 + (Math.random() - 0.5) * 0.3;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
        ctx.stroke();
      }
      break;
    }
    case "dragon": {
      ctx.fillStyle = accentHex;
      for (let row = 0; row < 12; row++) {
        const offset = (row % 2) * 22;
        for (let col = 0; col < 8; col++) {
          const sx = col * 44 + offset - 22;
          const sy = row * 24 - 12;
          ctx.beginPath();
          ctx.moveTo(sx + 22, sy);
          ctx.lineTo(sx + 44, sy + 16);
          ctx.lineTo(sx + 22, sy + 24);
          ctx.lineTo(sx, sy + 16);
          ctx.closePath();
          ctx.globalAlpha = 0.35;
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1.0;
      break;
    }
    case "jellyfish": {
      for (let ring = 0; ring < 6; ring++) {
        const r = 20 + ring * 36;
        const grad = ctx.createRadialGradient(128, 128, r - 12, 128, 128, r);
        grad.addColorStop(0, accentHex + "00");
        grad.addColorStop(0.5, accentHex + "55");
        grad.addColorStop(1, accentHex + "00");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 256, 256);
      }
      break;
    }
    case "crab": {
      ctx.strokeStyle = accentHex;
      ctx.lineWidth = 2.5;
      const size = 24;
      const h = size * Math.sqrt(3);
      for (let row = -1; row < 256 / h + 2; row++) {
        const offset = (row % 2) * (size * 1.5);
        for (let col = -1; col < 256 / (size * 3) + 2; col++) {
          const cx = col * (size * 3) + offset;
          const cy = row * (h / 2);
          ctx.beginPath();
          for (let i = 0; i < 6; i++) {
            const angle = (i * Math.PI) / 3;
            const x = cx + Math.cos(angle) * size;
            const y = cy + Math.sin(angle) * size;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }
      break;
    }
    case "gecko":
    case "chameleon": {
      ctx.fillStyle = accentHex;
      const spacing = 10;
      for (let y = 0; y < 256; y += spacing) {
        const offset = (Math.floor(y / spacing) % 2) * (spacing / 2);
        for (let x = -spacing; x < 256 + spacing; x += spacing) {
          ctx.beginPath();
          ctx.arc(x + offset + (Math.random() - 0.5) * 1.5, y + (Math.random() - 0.5) * 1.5, 3 + Math.random() * 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case "mantis": {
      ctx.strokeStyle = accentHex;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const xOffset = 32 + i * 64;
        ctx.beginPath();
        ctx.moveTo(xOffset, 0);
        ctx.lineTo(xOffset, 256);
        ctx.stroke();
        for (let y = 16; y < 256; y += 32) {
          ctx.beginPath();
          ctx.moveTo(xOffset, y);
          ctx.lineTo(xOffset - 24, y + 16);
          ctx.moveTo(xOffset, y);
          ctx.lineTo(xOffset + 24, y + 16);
          ctx.stroke();
        }
      }
      break;
    }
    case "panther": {
      ctx.fillStyle = accentHex;
      for (let i = 0; i < 28; i++) {
        const cx = Math.random() * 256;
        const cy = Math.random() * 256;
        const r = 8 + Math.random() * 6;
        const spots = 4 + Math.floor(Math.random() * 2);
        for (let s = 0; s < spots; s++) {
          const angle = (s / spots) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
          const sx = cx + Math.cos(angle) * r;
          const sy = cy + Math.sin(angle) * r;
          ctx.beginPath();
          ctx.arc(sx, sy, 3.5 + Math.random() * 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case "octopus": {
      ctx.strokeStyle = accentHex;
      ctx.lineWidth = 3;
      for (let i = 0; i < 24; i++) {
        const cx = Math.random() * 256;
        const cy = Math.random() * 256;
        const r = 6 + Math.random() * 6;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    }
    case "bat": {
      ctx.strokeStyle = accentHex;
      ctx.lineWidth = 1.8;
      for (let i = 0; i < 8; i++) {
        const r = 16 + i * 36;
        ctx.beginPath();
        ctx.arc(-20, -20, r, 0, Math.PI / 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(276, 276, r, Math.PI, Math.PI * 1.5);
        ctx.stroke();
      }
      break;
    }
    case "ox": {
      ctx.strokeStyle = accentHex;
      ctx.lineWidth = 1.0;
      const spacing = 16;
      for (let i = 0; i < 256; i += spacing) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 256);
        ctx.moveTo(0, i);
        ctx.lineTo(256, i);
        ctx.stroke();
      }
      ctx.fillStyle = accentHex;
      for (let y = spacing / 2; y < 256; y += spacing) {
        for (let x = spacing / 2; x < 256; x += spacing) {
          ctx.beginPath();
          ctx.arc(x + (Math.random() - 0.5) * 3, y + (Math.random() - 0.5) * 3, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case "shark": {
      ctx.fillStyle = accentHex;
      for (let i = 0; i < 400; i++) {
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        ctx.fillRect(x, y, 3 + Math.random() * 4, 1.0);
      }
      break;
    }
    case "phoenix": {
      ctx.fillStyle = accentHex;
      for (let i = 0; i < 30; i++) {
        const cx = Math.random() * 256;
        const cy = Math.random() * 256;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 8);
        ctx.quadraticCurveTo(cx - 5, cy + 2, cx, cy + 6);
        ctx.quadraticCurveTo(cx + 5, cy + 2, cx, cy - 8);
        ctx.fill();
      }
      ctx.fillStyle = "#ffeedd";
      for (let i = 0; i < 150; i++) {
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        ctx.fillRect(x, y, 1.5, 1.5);
      }
      break;
    }
    case "gorilla": {
      ctx.strokeStyle = accentHex;
      ctx.lineWidth = 1.8;
      for (let i = 0; i < 400; i++) {
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        const len = 6 + Math.random() * 9;
        const angle = Math.PI / 2 + (Math.random() - 0.5) * 0.15;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
        ctx.stroke();
      }
      break;
    }
    default: {
      ctx.fillStyle = accentHex;
      ctx.globalAlpha = 0.15;
      for (let i = 0; i < 100; i++) {
        const x = Math.random() * 256;
        const y = Math.random() * 256;
        const r = 2 + Math.random() * 4;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1.0;
      break;
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function getProceduralTexture(animalId: string, baseHex: string, accentHex: string): THREE.CanvasTexture {
  const key = `${animalId}_${baseHex}_${accentHex}`;
  let tex = textureCache.get(key);
  if (!tex) {
    tex = createProceduralTexture(animalId, baseHex, accentHex);
    textureCache.set(key, tex);
  }
  return tex;
}

function applyToonOutline(mesh: THREE.Mesh, width = 0.02) {
  if (!mesh.geometry) return;
  if (mesh.getObjectByName("toon_outline")) return;
  const outlineGeo = mesh.geometry.clone();
  const outlineMat = new THREE.ShaderMaterial({
    uniforms: {
      outlineThickness: { value: width },
      outlineColor: { value: new THREE.Color(0x0a0a14) },
    },
    vertexShader: `
      uniform float outlineThickness;
      void main() {
        vec3 pos = position + normal * outlineThickness;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 outlineColor;
      void main() {
        gl_FragColor = vec4(outlineColor, 1.0);
      }
    `,
    side: THREE.BackSide,
  });
  const outlineMesh = new THREE.Mesh(outlineGeo, outlineMat);
  outlineMesh.name = "toon_outline";
  mesh.add(outlineMesh);
}

let toonGradientMap: THREE.DataTexture | null = null;
function getToonGradientMap(): THREE.DataTexture {
  if (!toonGradientMap) {
    const colors = new Uint8Array([0, 80, 160, 255]);
    const tex = new THREE.DataTexture(colors, colors.length, 1, THREE.RedFormat);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    toonGradientMap = tex;
  }
  return toonGradientMap;
}

function mat(
  hex: string,
  opts: {
    rough?: number;
    metal?: number;
    emissive?: string;
    emissiveI?: number;
    noTexture?: boolean;
  } = {}
) {
  const params: THREE.MeshToonMaterialParameters = {
    color: new THREE.Color(hex),
    gradientMap: getToonGradientMap(),
    emissive: opts.emissive ? new THREE.Color(opts.emissive) : new THREE.Color(0x000000),
    emissiveIntensity: opts.emissiveI ?? 0,
  };

  const c = colorsFor(currentBuilderAnimalId || "boar");
  const rimColorHex = c.accent || c.shade || "#7aa2ff";

  if (currentBuilderAnimalId && !opts.noTexture) {
    params.map = getProceduralTexture(currentBuilderAnimalId, hex, c.accent || c.shade);
    params.color = new THREE.Color(0xffffff);
  }

  const material = new THREE.MeshToonMaterial(params);

  material.userData = {
    rimColor: { value: new THREE.Color(rimColorHex) },
    rimPower: { value: 3.5 },
    rimIntensity: { value: 0.65 },
  };

  material.onBeforeCompile = (shader) => {
    shader.uniforms.rimColor = material.userData.rimColor;
    shader.uniforms.rimPower = material.userData.rimPower;
    shader.uniforms.rimIntensity = material.userData.rimIntensity;

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

  return material;
}

function sphere(
  r: number,
  c: string,
  opts: {
    rough?: number;
    metal?: number;
    emissive?: string;
    emissiveI?: number;
    noOutline?: boolean;
    noTexture?: boolean;
  } = {}
) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat(c, opts));
  if (!opts.noOutline) {
    applyToonOutline(mesh);
  }
  return mesh;
}

function cone(
  r: number,
  h: number,
  c: string,
  opts: {
    rough?: number;
    metal?: number;
    emissive?: string;
    emissiveI?: number;
    noOutline?: boolean;
    noTexture?: boolean;
  } = {}
) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), mat(c, opts));
  if (!opts.noOutline) {
    applyToonOutline(mesh);
  }
  return mesh;
}

function cyl(
  rt: number,
  rb: number,
  h: number,
  c: string,
  opts: {
    rough?: number;
    metal?: number;
    emissive?: string;
    emissiveI?: number;
    noOutline?: boolean;
    noTexture?: boolean;
  } = {}
) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 8), mat(c, opts));
  if (!opts.noOutline) {
    applyToonOutline(mesh);
  }
  return mesh;
}

export function createSoftShadowMesh(): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(0, 0, 0, 0.75)");
    grad.addColorStop(0.5, "rgba(0, 0, 0, 0.35)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
  }
  const tex = new THREE.CanvasTexture(canvas);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), shadowMat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.19; // Just above pedestal ring
  mesh.name = "shadow";
  return mesh;
}

/** A pair of eyes parented to the head, looking forward (+Z). */
function addEyes(head: THREE.Object3D, y: number, z: number, r = 0.09) {
  for (const s of [-1, 1] as const) {
    const white = sphere(r, "#ffffff", { rough: 0.2, noOutline: true, noTexture: true });
    white.name = `eye_${s === 1 ? "r" : "l"}`;
    white.position.set(s * 0.22, y, z);
    head.add(white);
    const pupil = sphere(r * 0.55, "#0a0a0a", { rough: 0.1, noOutline: true, noTexture: true });
    pupil.name = `pupil_${s === 1 ? "r" : "l"}`;
    pupil.position.set(s * 0.22, y, z + r * 0.7);
    head.add(pupil);
  }
}

/** BODY — central torso, tinted by the body donor; shape varies a little by animal. */
function buildBody(animalId: string): THREE.Group {
  const cached = getModelPart(animalId, "body");
  if (cached) {
    const g = cached.clone();
    const c = colorsFor(animalId);
    applyToonStyle(g, c.fill, getToonGradientMap(), c.accent || c.shade);
    fitToBox(g, PART_TARGET_SIZE.body);
    return g;
  }
  // --- existing procedural code below — do not change ---
  const g = new THREE.Group();
  const c = colorsFor(animalId);

  if (animalId === "ant") {
    // 3 segments: Thorax, Petiole (small waist connector), and Gaster (abdomen)
    const thorax = sphere(0.65, c.fill, { rough: 0.25, metal: 0.2 });
    thorax.scale.set(1.0, 0.9, 1.2);
    thorax.position.set(0, 0, 0.45);
    thorax.castShadow = true;
    g.add(thorax);

    const petiole = cyl(0.12, 0.12, 0.4, c.shade, { rough: 0.3 });
    petiole.rotation.x = Math.PI / 2;
    petiole.position.set(0, -0.1, 0.0);
    g.add(petiole);

    const gaster = sphere(0.82, c.fill, { rough: 0.25, metal: 0.2 });
    gaster.scale.set(1.0, 0.85, 1.55);
    gaster.position.set(0, -0.1, -0.65);
    gaster.castShadow = true;
    g.add(gaster);
  } 
  else if (animalId === "scorpion") {
    // Segmented carapace segments (Mesosoma) tapering backwards
    const cephalothorax = sphere(0.72, c.fill, { rough: 0.35, metal: 0.5 });
    cephalothorax.scale.set(1.1, 0.75, 0.95);
    cephalothorax.position.set(0, 0.05, 0.5);
    cephalothorax.castShadow = true;
    g.add(cephalothorax);

    for (let i = 0; i < 4; i++) {
      const seg = sphere(0.68 - i * 0.05, i % 2 === 0 ? c.fill : c.shade, { rough: 0.35, metal: 0.5 });
      seg.scale.set(1.1 - i * 0.04, 0.7 - i * 0.03, 0.5);
      seg.position.set(0, -0.05 - i * 0.02, 0.1 - i * 0.32);
      seg.castShadow = true;
      g.add(seg);
    }
  } 
  else if (animalId === "crab") {
    // Flattened round shell carapace with defensive side spikes
    const carapace = sphere(1.05, c.fill, { rough: 0.3, metal: 0.4 });
    carapace.scale.set(1.48, 0.56, 1.24);
    carapace.castShadow = true;
    g.add(carapace);

    for (const s of [-1, 1] as const) {
      const spike = cone(0.12, 0.45, c.accent, { rough: 0.25 });
      spike.position.set(s * 1.45, 0.1, -0.1);
      spike.rotation.z = -s * 1.15;
      g.add(spike);
    }
  } 
  else if (animalId === "rhino") {
    // Plated thick leather hide
    const torso = sphere(1.22, c.fill, { rough: 0.88 });
    torso.scale.set(1.22, 1.04, 1.34);
    torso.castShadow = true;
    g.add(torso);

    for (const s of [-1, 1] as const) {
      const armorPlate = sphere(0.92, c.accent, { rough: 0.85 });
      armorPlate.scale.set(0.18, 0.92, 1.12);
      armorPlate.position.set(s * 0.74, 0.05, 0);
      g.add(armorPlate);
    }
  } 
  else if (animalId === "gorilla") {
    // Bulky shoulder mass and a silver grey saddle on the back
    const torso = sphere(1.26, c.fill, { rough: 0.84 });
    torso.scale.set(1.28, 1.18, 1.18);
    torso.castShadow = true;
    g.add(torso);

    const silverSaddle = sphere(0.88, "#b0b6c2", { rough: 0.88 });
    silverSaddle.scale.set(1.04, 0.38, 0.86);
    silverSaddle.position.set(0, 0.72, -0.16);
    g.add(silverSaddle);
  } 
  else if (animalId === "eel") {
    // serptentine elongated body with a dorsal fin running backwards
    const torso = sphere(0.82, c.fill, { rough: 0.36, metal: 0.48 });
    torso.scale.set(0.72, 0.72, 1.84);
    torso.castShadow = true;
    g.add(torso);

    const dorsalFin = cyl(0.01, 0.14, 2.1, c.accent, { emissive: c.accent, emissiveI: 0.65 });
    dorsalFin.position.set(0, 0.54, -0.22);
    dorsalFin.rotation.x = Math.PI / 2 + 0.08;
    g.add(dorsalFin);
  } 
  else if (animalId === "cobra") {
    // slithering snake posture body with scale pattern underbelly
    const torso = sphere(0.84, c.fill, { rough: 0.28 });
    torso.scale.set(0.78, 0.78, 1.62);
    torso.castShadow = true;
    g.add(torso);

    const belly = sphere(0.68, c.accent, { rough: 0.42 });
    belly.scale.set(0.64, 0.32, 1.38);
    belly.position.set(0, -0.42, 0.28);
    g.add(belly);
  } 
  else if (animalId === "tiger") {
    const torso = sphere(1.02, c.fill, { rough: 0.75 });
    torso.scale.set(1.05, 0.92, 1.25);
    torso.castShadow = true;
    g.add(torso);

    // Tiger stripes wrapping the body using thin black capsules
    for (let i = -3; i <= 3; i++) {
      const stripeL = cyl(0.02, 0.02, 1.6, "#121212", { rough: 0.8 });
      stripeL.position.set(-0.95, 0, i * 0.3);
      stripeL.rotation.z = 0.25;
      g.add(stripeL);

      const stripeR = cyl(0.02, 0.02, 1.6, "#121212", { rough: 0.8 });
      stripeR.position.set(0.95, 0, i * 0.3);
      stripeR.rotation.z = -0.25;
      g.add(stripeR);
    }
  } 
  else {
    // Classic mammal torso
    const torso = sphere(1.02, c.fill);
    torso.scale.set(1.05, 0.92, 1.2);
    torso.castShadow = true;
    g.add(torso);

    const belly = sphere(0.7, c.accent, { rough: 0.75 });
    belly.scale.set(0.88, 0.58, 0.98);
    belly.position.set(0, -0.44, 0.24);
    g.add(belly);
  }

  return g;
}

/** HEAD — sits forward+up; per-animal features (ears, horns, beak, hood…). */
function buildHead(animalId: string): THREE.Group {
  const cached = getModelPart(animalId, "head");
  if (cached) {
    const g = cached.clone();
    const c = colorsFor(animalId);
    applyToonStyle(g, c.fill, getToonGradientMap(), c.accent || c.shade);
    fitToBox(g, PART_TARGET_SIZE.head);
    return g;
  }
  // --- existing procedural code below — do not change ---
  const g = new THREE.Group();
  g.scale.setScalar(0.82); // keep head proportional to the torso
  const c = colorsFor(animalId);
  const skull = sphere(0.62, c.fill);
  skull.castShadow = true;
  g.add(skull);
  
  // Custom glowing eyes for visual flair
  let eyeColor = "#ffffff";
  let eyeGlow = 0.5;
  if (animalId === "eel") { eyeColor = "#39ff14"; eyeGlow = 2.0; }
  else if (animalId === "gecko") { eyeColor = "#ffd700"; eyeGlow = 2.2; }
  else if (animalId === "cobra" || animalId === "scorpion") { eyeColor = "#ff3b30"; eyeGlow = 1.8; }
  
  addEyes(g, 0.12, 0.5, 0.09);
  
  // Apply specific colors/lights to eyes
  g.children.forEach(child => {
    if (child instanceof THREE.Mesh && child.position.z > 0.52 && eyeGlow > 1) {
      const childMat = child.material as THREE.MeshStandardMaterial;
      if (childMat.emissive) {
        childMat.emissive.set(new THREE.Color(eyeColor));
        childMat.emissiveIntensity = eyeGlow;
      }
    }
  });

  // Lower jaw segment (grows/moves down during roars/attacks)
  const lowerJaw = sphere(0.22, c.fill);
  lowerJaw.name = "lower_jaw";
  lowerJaw.scale.set(1.0, 0.4, 1.25);
  lowerJaw.position.set(0, -0.28, 0.22);
  lowerJaw.castShadow = true;
  g.add(lowerJaw);

  const ears = (h: number, w: number, tilt: number, col = c.fill) => {
    for (const s of [-1, 1] as const) {
      const ear = cone(w, h, col);
      ear.position.set(s * 0.32, 0.55, -0.05);
      ear.rotation.z = -s * tilt;
      g.add(ear);
    }
  };
  const horns = (len: number, col = c.accent) => {
    for (const s of [-1, 1] as const) {
      const horn = cone(0.1, len, col, { rough: 0.4, noTexture: true });
      horn.position.set(s * 0.3, 0.55, 0.2);
      horn.rotation.z = -s * 0.4;
      g.add(horn);
    }
  };

  switch (animalId) {
    case "rabbit": {
      for (const s of [-1, 1] as const) {
        const side = s === 1 ? "r" : "l";
        const ear0 = cyl(0.14, 0.16, 0.35, c.fill);
        ear0.name = `ear_${side}_0`;
        ear0.position.set(s * 0.32, 0.55, -0.05);
        ear0.rotation.z = -s * 0.05;
        
        const ear1 = cone(0.12, 0.35, c.fill);
        ear1.name = `ear_${side}_1`;
        ear1.position.set(0, 0.35, 0);
        
        ear0.add(ear1);
        g.add(ear0);
      }
      break;
    }
    case "wolf": ears(0.34, 0.2, 0.5); break;
    case "tiger": {
      ears(0.26, 0.22, 0.7); 
      // tiger muzzle
      const muzzle = sphere(0.24, c.accent);
      muzzle.position.set(0, -0.15, 0.5);
      g.add(muzzle);
      break;
    }
    case "bear": {
      for (const s of [-1, 1] as const) {
        const ear = sphere(0.2, c.fill); ear.position.set(s * 0.4, 0.5, -0.1); g.add(ear);
      }
      break;
    }
    case "boar": {
      // tusks (parented to lower jaw so they open/close with it)
      for (const s of [-1, 1] as const) {
        const tusk = cone(0.06, 0.4, "#e8e0c0", { rough: 0.3, noTexture: true });
        tusk.position.set(s * 0.18, 0.12, 0.3);
        tusk.rotation.set(0.6, 0, s * 0.3);
        lowerJaw.add(tusk);
      }
      const snout = sphere(0.32, c.shade); snout.scale.set(1, 0.8, 0.9); snout.position.set(0, -0.1, 0.55); g.add(snout);
      break;
    }
    case "rhino": {
      // Rhino double horns
      const noseHorn = cone(0.16, 0.7, c.accent, { rough: 0.4, noTexture: true });
      noseHorn.position.set(0, 0.05, 0.7); noseHorn.rotation.x = 1.35; g.add(noseHorn);
      const smallHorn = cone(0.1, 0.34, c.accent, { rough: 0.4, noTexture: true });
      smallHorn.position.set(0, 0.32, 0.52); smallHorn.rotation.x = 1.25; g.add(smallHorn);
      break;
    }
    case "eagle": {
      const beak = cone(0.18, 0.5, "#f0b020", { rough: 0.3, noTexture: true });
      beak.position.set(0, -0.05, 0.62); beak.rotation.x = 1.4; g.add(beak);
      
      // Feather crest
      for (let i = -1; i <= 1; i++) {
        const feather = cone(0.04, 0.3, c.accent);
        feather.position.set(i * 0.14, 0.58, -0.18);
        feather.rotation.set(-0.4, 0, i * 0.2);
        g.add(feather);
      }
      break;
    }
    case "cobra": {
      // flared snake hood
      const hood = sphere(0.55, c.fill); hood.name = "hood"; hood.scale.set(1.5, 1.4, 0.3); hood.position.set(0, 0.1, -0.2); g.add(hood);
      // fangs
      for (const s of [-1, 1] as const) {
        const fang = cone(0.04, 0.22, "#ffffff", { noTexture: true });
        fang.position.set(s * 0.15, -0.22, 0.52);
        fang.rotation.x = -0.2;
        g.add(fang);
      }
      break;
    }
    case "ant":
    case "scorpion": {
      // mandibles + antennae
      for (const s of [-1, 1] as const) {
        const m = cyl(0.03, 0.05, 0.4, c.shade, { noTexture: true });
        m.name = `mandible_${s === 1 ? "r" : "l"}`;
        m.position.set(s * 0.18, -0.25, 0.5);
        m.rotation.x = 1.1;
        g.add(m);
      }
      if (animalId === "ant") for (const s of [-1, 1] as const) {
        const ant = cyl(0.02, 0.02, 0.5, c.accent, { noTexture: true }); ant.position.set(s * 0.18, 0.6, 0.2); ant.rotation.z = -s * 0.4; g.add(ant);
      }
      break;
    }
    case "gorilla":
    case "gecko": horns(0.0001); break; // none — keep plain rounded head
    case "eel": {
      const fin = cone(0.12, 0.4, c.accent, { emissive: c.accent, emissiveI: 0.4, noTexture: true });
      fin.position.set(0, 0.6, -0.1); g.add(fin); break;
    }
    case "dragon": {
      // Two curved horns
      for (const s of [-1, 1] as const) {
        const horn = cone(0.1, 0.55, c.accent, { rough: 0.3, noTexture: true });
        horn.position.set(s * 0.32, 0.62, -0.1);
        horn.rotation.set(-0.15, 0, s * 0.45);
        g.add(horn);
      }
      // Snout with nostril ridges
      const snout = sphere(0.35, c.shade); snout.scale.set(1, 0.75, 1.1); snout.position.set(0, -0.08, 0.52); g.add(snout);
      // Fire-glow under chin — plain emissive sphere, no toon shading needed
      const glowMat = new THREE.MeshBasicMaterial({ color: 0xff5020 });
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), glowMat);
      glow.position.set(0, -0.32, 0.38); g.add(glow);
      break;
    }
    case "jellyfish": {
      // Translucent dome bell on top
      const bell = sphere(0.62, c.fill); bell.scale.set(1.2, 0.7, 1.2);
      const bellMat = bell.material as THREE.MeshToonMaterial;
      bellMat.transparent = true;
      bellMat.opacity = 0.72;
      bell.position.set(0, 0.2, 0); g.add(bell);
      // Dangling oral arms
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        const arm = cyl(0.03, 0.02, 0.5, c.accent, { emissive: c.accent, emissiveI: 0.6, noTexture: true });
        arm.position.set(Math.cos(angle) * 0.28, -0.5, Math.sin(angle) * 0.28);
        g.add(arm);
      }
      break;
    }
    case "ox": {
      for (const s of [-1, 1] as const) {
        const horn = cone(0.12, 0.65, "#e5dec9", { rough: 0.4, noTexture: true });
        horn.position.set(s * 0.32, 0.52, 0.15);
        horn.rotation.set(0.2, 0, -s * 0.9);
        g.add(horn);
      }
      ears(0.36, 0.14, 1.25);
      break;
    }
    case "bat": {
      for (const s of [-1, 1] as const) {
        const ear = cone(0.2, 0.55, c.fill);
        ear.name = `bat_ear_${s === 1 ? "r" : "l"}`;
        ear.position.set(s * 0.3, 0.58, -0.05);
        ear.rotation.set(0.1, 0, -s * 0.15);
        g.add(ear);
      }
      const noseLeaf = cone(0.08, 0.22, c.accent, { noTexture: true });
      noseLeaf.position.set(0, 0.05, 0.58);
      noseLeaf.rotation.x = -0.45;
      g.add(noseLeaf);
      break;
    }
    case "shark": {
      const snout = cone(0.32, 0.62, c.fill);
      snout.position.set(0, -0.05, 0.45);
      snout.rotation.x = 1.35;
      g.add(snout);
      for (let i = -2; i <= 2; i++) {
        const tooth = cone(0.03, 0.12, "#ffffff", { noTexture: true });
        tooth.position.set(i * 0.08, 0.14, 0.3);
        tooth.rotation.set(-0.3, 0, 0);
        lowerJaw.add(tooth);
      }
      break;
    }
    case "chameleon": {
      ["eye_r", "eye_l", "pupil_r", "pupil_l"].forEach(name => {
        const obj = g.getObjectByName(name);
        if (obj) g.remove(obj);
      });
      for (const s of [-1, 1] as const) {
        const side = s === 1 ? "r" : "l";
        const turret = cyl(0.18, 0.22, 0.36, c.fill);
        turret.name = `turret_${side}`;
        turret.position.set(s * 0.35, 0.18, 0.3);
        turret.rotation.set(0, s * 0.8, 0);
        g.add(turret);

        const pupil = sphere(0.06, "#0e0e0e", { noTexture: true });
        pupil.name = `chameleon_pupil_${side}`;
        pupil.position.set(0, 0, 0.19);
        turret.add(pupil);
      }
      break;
    }
    default: ears(0.3, 0.16, 0.4);
  }
  return g;
}

/** A limb pair: two angled cylinders + foot spheres, tinted by the donor. */
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
  const g = new THREE.Group();
  const c = colorsFor(animalId);
  const z = front ? 0.45 : -0.5;
  const len = front ? 1.15 : 1.25;

  if (front && animalId === "eagle") {
    // Dynamic feathered wings
    for (const s of [-1, 1] as const) {
      const wingGroup = new THREE.Group();
      wingGroup.name = `wing_${s === 1 ? "r" : "l"}`;
      
      const wingGeo = new THREE.BufferGeometry();
      const vertices = new Float32Array([
        0, 0, 0,
        s * 2.2, 1.2, -0.4,
        s * 1.8, 0, -1.2,
        s * 0.9, -0.2, -0.8,
      ]);
      const indices = [0, 1, 2, 0, 2, 3];
      wingGeo.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
      wingGeo.setIndex(indices);
      wingGeo.computeVertexNormals();
      
      const wingMesh = new THREE.Mesh(wingGeo, mat(c.fill, { rough: 0.3 }));
      wingMesh.material.side = THREE.DoubleSide;
      wingMesh.castShadow = true;
      wingGroup.add(wingMesh);
      applyToonOutline(wingMesh);

      wingGroup.position.set(s * 0.65, 0.2, -0.15);
      g.add(wingGroup);
    }
    return g;
  }

  if (front && animalId === "phoenix") {
    for (const s of [-1, 1] as const) {
      const wingGroup = new THREE.Group();
      wingGroup.name = `wing_${s === 1 ? "r" : "l"}`;
      
      const wingGeo = new THREE.BufferGeometry();
      const vertices = new Float32Array([
        0, 0, 0,
        s * 2.4, 1.3, -0.4,
        s * 1.9, -0.1, -1.2,
        s * 0.9, -0.3, -0.8,
      ]);
      const indices = [0, 1, 2, 0, 2, 3];
      wingGeo.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
      wingGeo.setIndex(indices);
      wingGeo.computeVertexNormals();
      const wingMesh = new THREE.Mesh(wingGeo, mat(c.fill, { emissive: c.accent, emissiveI: 0.9 }));
      wingMesh.material.side = THREE.DoubleSide;
      wingMesh.castShadow = true;
      wingGroup.add(wingMesh);
      applyToonOutline(wingMesh);

      for (let f = 0; f < 4; f++) {
        const plume = cone(0.12, 1.1 - f * 0.15, "#ffbb33", { emissive: "#ff5500", emissiveI: 1.5, noTexture: true });
        plume.position.set(s * (0.8 + f * 0.35), 0.3 - f * 0.1, -0.4 - f * 0.15);
        plume.rotation.set(0.2, 0, -s * (0.8 + f * 0.1));
        wingGroup.add(plume);
      }
      wingGroup.position.set(s * 0.65, 0.2, -0.15);
      g.add(wingGroup);
    }
    return g;
  }

  if (front && animalId === "bat") {
    for (const s of [-1, 1] as const) {
      const wingGroup = new THREE.Group();
      wingGroup.name = `wing_${s === 1 ? "r" : "l"}`;

      const upperArm = cyl(0.08, 0.08, 1.0, c.shade, { rough: 0.4 });
      upperArm.position.set(s * 0.35, 0.3, -0.1);
      upperArm.rotation.set(0.2, 0, -s * 0.8);
      wingGroup.add(upperArm);

      const foreArm = cyl(0.06, 0.06, 1.2, c.shade, { rough: 0.4 });
      foreArm.position.set(s * 0.95, 0.7, -0.2);
      foreArm.rotation.set(-0.2, 0, s * 0.3);
      wingGroup.add(foreArm);

      const membraneGeo = new THREE.BufferGeometry();
      const vertices = new Float32Array([
        s * 0.65, 0.2, -0.15,
        s * 2.2, 1.1, -0.4,
        s * 1.9, -0.6, -1.1,
        s * 1.3, -0.9, -0.9,
        s * 0.7, -0.7, -0.6,
      ]);
      const indices = [
        0, 1, 2,
        0, 2, 3,
        0, 3, 4
      ];
      membraneGeo.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
      membraneGeo.setIndex(indices);
      membraneGeo.computeVertexNormals();
      const membraneMesh = new THREE.Mesh(membraneGeo, mat(c.fill, { rough: 0.8 }));
      membraneMesh.material.side = THREE.DoubleSide;
      membraneMesh.castShadow = true;
      wingGroup.add(membraneMesh);
      applyToonOutline(membraneMesh);

      for (let f = 0; f < 3; f++) {
        const strut = cyl(0.02, 0.02, 1.2, c.shade, { noTexture: true });
        strut.position.set(s * 1.45 - s * f * 0.3, 0.1 - f * 0.1, -0.6 + f * 0.1);
        strut.rotation.set(0.3, 0, -s * (0.5 + f * 0.3));
        wingGroup.add(strut);
      }

      wingGroup.position.set(0, 0, 0);
      g.add(wingGroup);
    }
    return g;
  }

  if (front && animalId === "dragon") {
    for (const s of [-1, 1] as const) {
      const wingGroup = new THREE.Group();
      wingGroup.name = `wing_${s === 1 ? "r" : "l"}`;
      
      const strut1 = cyl(0.1, 0.08, 1.3, c.shade);
      strut1.position.set(s * 0.5, 0.4, -0.2);
      strut1.rotation.set(0.1, 0, -s * 0.9);
      wingGroup.add(strut1);

      const strut2 = cyl(0.07, 0.05, 1.5, c.shade);
      strut2.position.set(s * 1.2, 0.9, -0.4);
      strut2.rotation.set(-0.15, 0, s * 0.4);
      wingGroup.add(strut2);

      const wingGeo = new THREE.BufferGeometry();
      const vertices = new Float32Array([
        0, 0, 0,
        s * 2.3, 1.3, -0.5,
        s * 2.0, -0.4, -1.3,
        s * 1.2, -0.8, -1.0,
        s * 0.6, -0.5, -0.6,
      ]);
      const indices = [
        0, 1, 2,
        0, 2, 3,
        0, 3, 4
      ];
      wingGeo.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
      wingGeo.setIndex(indices);
      wingGeo.computeVertexNormals();
      const wingMesh = new THREE.Mesh(wingGeo, mat(c.fill, { rough: 0.7 }));
      wingMesh.material.side = THREE.DoubleSide;
      wingMesh.castShadow = true;
      wingGroup.add(wingMesh);
      applyToonOutline(wingMesh);

      const claw = cone(0.06, 0.28, c.accent, { noTexture: true });
      claw.position.set(s * 1.8, 1.3, -0.4);
      claw.rotation.set(0.4, 0, -s * 0.5);
      wingGroup.add(claw);

      wingGroup.position.set(s * 0.65, 0.2, -0.15);
      g.add(wingGroup);
    }
    return g;
  }

  if (front && animalId === "mantis") {
    for (const s of [-1, 1] as const) {
      const limbGroup = new THREE.Group();
      limbGroup.name = `mantis_scythe_${s === 1 ? "r" : "l"}`;
      
      const arm = cyl(0.09, 0.08, 0.75, c.fill, { rough: 0.3 });
      arm.position.set(s * 0.58, -0.15, z);
      arm.rotation.set(0.2, 0, s * 0.3);
      arm.castShadow = true;
      limbGroup.add(arm);

      const knee = sphere(0.12, c.shade, { rough: 0.3 });
      knee.position.set(s * 0.66, -0.48, z + 0.1);
      limbGroup.add(knee);

      const tibia = cyl(0.07, 0.04, 0.85, c.fill, { rough: 0.3 });
      tibia.position.set(s * 0.72, -0.85, z + 0.32);
      tibia.rotation.set(0.9, 0, -s * 0.15);
      tibia.castShadow = true;
      limbGroup.add(tibia);

      const bladeGeo = new THREE.BufferGeometry();
      const vertices = new Float32Array([
        s * 0.72, -0.85, z + 0.32,
        s * 0.92, -1.3, z + 0.65,
        s * 0.8, -1.0, z + 0.45,
      ]);
      const indices = [0, 1, 2];
      bladeGeo.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
      bladeGeo.setIndex(indices);
      bladeGeo.computeVertexNormals();
      const bladeMesh = new THREE.Mesh(bladeGeo, mat(c.accent, { rough: 0.1, metal: 0.5, noTexture: true }));
      bladeMesh.material.side = THREE.DoubleSide;
      bladeMesh.castShadow = true;
      limbGroup.add(bladeMesh);
      applyToonOutline(bladeMesh);

      for (let sp = 0; sp < 4; sp++) {
        const spike = cone(0.03, 0.12, c.accent, { noTexture: true });
        spike.position.set(s * (0.7 + sp * 0.02), -0.7 - sp * 0.1, z + 0.2 + sp * 0.08);
        spike.rotation.set(0.6, 0, -s * 0.5);
        limbGroup.add(spike);
      }

      g.add(limbGroup);
    }
    return g;
  }

  // Crab pincers
  if (front && animalId === "crab") {
    for (const s of [-1, 1] as const) {
      const legGroup = new THREE.Group();
      const arm = cyl(0.14, 0.18, 0.8, c.fill, { rough: 0.3 });
      arm.rotation.z = s * 0.45;
      arm.position.set(s * 0.65, -0.3, z);
      arm.castShadow = true;
      legGroup.add(arm);

      const clawBase = sphere(0.38, c.accent, { metal: 0.5, rough: 0.25 });
      clawBase.position.set(s * 0.95, -0.55, z + 0.15);
      clawBase.scale.set(1.2, 0.85, 1.05);
      clawBase.castShadow = true;
      legGroup.add(clawBase);

      const f1 = cone(0.08, 0.36, c.accent, { metal: 0.5, rough: 0.25, noTexture: true });
      f1.position.set(s * 1.15, -0.65, z + 0.36);
      f1.rotation.set(0.4, 0, -s * 0.5);
      legGroup.add(f1);

      const f2 = cone(0.06, 0.3, c.shade, { metal: 0.5, rough: 0.25, noTexture: true });
      f2.position.set(s * 0.95, -0.72, z + 0.3);
      f2.rotation.set(0.6, 0, s * 0.2);
      legGroup.add(f2);

      g.add(legGroup);
    }
    return g;
  }

  // Scorpion pincers
  if (front && animalId === "scorpion") {
    for (const s of [-1, 1] as const) {
      const legGroup = new THREE.Group();
      const arm = cyl(0.1, 0.13, 0.9, c.fill, { rough: 0.35 });
      arm.rotation.z = s * 0.5;
      arm.position.set(s * 0.7, -0.3, z);
      arm.castShadow = true;
      legGroup.add(arm);

      const clawBase = sphere(0.28, c.accent, { metal: 0.6, rough: 0.25 });
      clawBase.position.set(s * 1.0, -0.65, z + 0.25);
      clawBase.scale.set(1.0, 0.7, 1.25);
      legGroup.add(clawBase);

      const f1 = cone(0.06, 0.3, c.accent, { metal: 0.6, rough: 0.25, noTexture: true });
      f1.position.set(s * 1.1, -0.75, z + 0.42);
      f1.rotation.set(0.3, 0, -s * 0.3);
      legGroup.add(f1);

      const f2 = cone(0.05, 0.24, c.shade, { metal: 0.6, rough: 0.25, noTexture: true });
      f2.position.set(s * 0.9, -0.8, z + 0.38);
      f2.rotation.set(0.5, 0, s * 0.1);
      legGroup.add(f2);

      g.add(legGroup);
    }
    return g;
  }

  // Segmented insect legs with capped joint spheres
  if (["ant", "scorpion"].includes(animalId)) {
    for (const s of [-1, 1] as const) {
      const legGroup = new THREE.Group();
      
      const coxaJoint = sphere(0.13, c.shade, { rough: 0.3 });
      coxaJoint.position.set(s * 0.52, -0.4, z);
      legGroup.add(coxaJoint);

      const coxa = cyl(0.09, 0.09, 0.32, c.shade, { rough: 0.2 });
      coxa.position.set(s * 0.52, -0.4, z);
      coxa.rotation.z = s * 0.82;
      coxa.castShadow = true;
      legGroup.add(coxa);

      const femurJoint = sphere(0.11, c.fill, { rough: 0.3 });
      femurJoint.position.set(s * 0.76, -0.72, z + 0.08);
      legGroup.add(femurJoint);

      const femur = cyl(0.065, 0.065, 0.82, c.fill, { rough: 0.2 });
      femur.position.set(s * 0.76, -0.72, z + 0.08);
      femur.rotation.z = s * 0.42;
      femur.castShadow = true;
      legGroup.add(femur);

      const tibiaJoint = sphere(0.08, c.shade, { rough: 0.3 });
      tibiaJoint.position.set(s * 0.92, -1.22, z + 0.16);
      legGroup.add(tibiaJoint);

      const tibia = cyl(0.045, 0.032, 0.92, c.shade, { rough: 0.2 });
      tibia.position.set(s * 0.92, -1.22, z + 0.16);
      tibia.rotation.z = -s * 0.58;
      tibia.castShadow = true;
      legGroup.add(tibia);

      g.add(legGroup);
    }
    return g;
  }

  // Hopping thighs connected via shin Bezier tubes
  if (!front && animalId === "rabbit") {
    for (const s of [-1, 1] as const) {
      const legGroup = new THREE.Group();
      
      const thigh = sphere(0.36, c.fill, { rough: 0.78 });
      thigh.scale.set(0.9, 1.25, 0.9);
      thigh.position.set(s * 0.56, -0.22, z);
      thigh.castShadow = true;
      legGroup.add(thigh);

      // shin Bezier tube connecting thigh to foot
      const start = new THREE.Vector3(s * 0.56, -0.42, z);
      const mid = new THREE.Vector3(s * 0.76, -0.72, z - 0.15);
      const end = new THREE.Vector3(s * 0.56, -0.92, z + 0.15);
      
      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const shinGeo = new THREE.TubeGeometry(curve, 10, 0.12, 8, false);
      const shinMesh = new THREE.Mesh(shinGeo, mat(c.fill, { rough: 0.78 }));
      shinMesh.castShadow = true;
      legGroup.add(shinMesh);
      applyToonOutline(shinMesh);

      const knee = sphere(0.14, c.fill, { rough: 0.78 });
      knee.position.copy(mid);
      legGroup.add(knee);

      const foot = sphere(0.18, c.shade, { rough: 0.78 });
      foot.scale.set(0.8, 0.38, 1.45);
      foot.position.copy(end);
      foot.castShadow = true;
      legGroup.add(foot);

      g.add(legGroup);
    }
    return g;
  }

  // Gorilla muscular forelimbs using curved Bezier tubes
  if (front && animalId === "gorilla") {
    for (const s of [-1, 1] as const) {
      const legGroup = new THREE.Group();
      
      const shoulder = sphere(0.35, c.shade, { rough: 0.82 });
      shoulder.position.set(s * 0.64, 0, z + 0.08);
      legGroup.add(shoulder);

      const start = new THREE.Vector3(s * 0.64, 0, z + 0.08);
      const mid = new THREE.Vector3(s * 0.92, -0.65, z + 0.2);
      const end = new THREE.Vector3(s * 0.68, -1.3, z + 0.24);

      const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      const tubeGeo = new THREE.TubeGeometry(curve, 12, 0.25, 8, false);
      const tubeMesh = new THREE.Mesh(tubeGeo, mat(c.fill, { rough: 0.8 }));
      tubeMesh.castShadow = true;
      legGroup.add(tubeMesh);
      applyToonOutline(tubeMesh);

      const elbow = sphere(0.24, c.fill, { rough: 0.8 });
      elbow.position.copy(mid);
      legGroup.add(elbow);

      const fist = sphere(0.38, c.shade, { rough: 0.82 });
      fist.position.copy(end);
      fist.castShadow = true;
      legGroup.add(fist);
      
      g.add(legGroup);
    }
    return g;
  }

  // Default normal quad legs as Bezier tubes
  for (const s of [-1, 1] as const) {
    const legGroup = new THREE.Group();
    
    const hip = sphere(0.22, c.shade, { rough: 0.6 });
    hip.position.set(s * 0.55, 0, z);
    legGroup.add(hip);

    const startPoint = new THREE.Vector3(s * 0.55, 0, z);
    const midPoint = new THREE.Vector3(s * 0.8, -len * 0.45, z + (front ? 0.15 : -0.15));
    const endPoint = new THREE.Vector3(s * 0.55, -len * 0.9, z + (front ? 0.1 : 0.0));
    
    const curve = new THREE.QuadraticBezierCurve3(startPoint, midPoint, endPoint);
    const tubeGeo = new THREE.TubeGeometry(curve, 12, 0.16, 8, false);
    const tubeMesh = new THREE.Mesh(tubeGeo, mat(c.fill, { rough: 0.6 }));
    tubeMesh.castShadow = true;
    legGroup.add(tubeMesh);
    applyToonOutline(tubeMesh);
    
    const knee = sphere(0.16, c.fill, { rough: 0.6 });
    knee.position.copy(midPoint);
    legGroup.add(knee);

    const foot = sphere(0.2, c.shade);
    foot.scale.set(1, 0.7, 1.3);
    foot.position.copy(endPoint);
    foot.castShadow = true;
    legGroup.add(foot);
    
    // claws for predatory forelimbs
    if (front && ["bear", "tiger", "gorilla", "crab", "scorpion"].includes(animalId)) {
      for (const cl of [-1, 0, 1]) {
        const claw = cone(0.04, 0.18, c.accent, { rough: 0.3, noTexture: true });
        claw.position.set(endPoint.x + cl * 0.07, endPoint.y - 0.05, endPoint.z + 0.28);
        claw.rotation.x = 1.2;
        claw.castShadow = true;
        legGroup.add(claw);
      }
    }
    
    g.add(legGroup);
  }
  return g;
}

/** TAIL — a hierarchical bone chain of segments parented to each other for tail physics. */
function buildTail(animalId: string): THREE.Group {
  const cached = getModelPart(animalId, "tail");
  if (cached) {
    const g = cached.clone();
    applyToonStyle(g, colorsFor(animalId).fill, getToonGradientMap());
    fitToBox(g, PART_TARGET_SIZE.tail);
    return g;
  }
  // --- existing procedural code below — do not change ---
  const root = new THREE.Group();
  root.name = "tail";
  const c = colorsFor(animalId);

  // Eagle tail: fan of feathers (doesn't use a slithering chain)
  if (animalId === "eagle") {
    for (let i = -2; i <= 2; i++) {
      const f = sphere(0.14, c.fill, { rough: 0.8 });
      f.scale.set(0.6, 0.04, 1.42);
      f.position.set(i * 0.13, 0.08, -1.22);
      f.rotation.set(-0.24, i * 0.11, 0);
      f.castShadow = true;
      root.add(f);
    }
    return root;
  }

  // Rabbit tail puff
  if (animalId === "rabbit") {
    const puff = sphere(0.24, c.accent, { rough: 0.85 });
    puff.position.set(0, 0.22, -0.92);
    puff.castShadow = true;
    root.add(puff);
    return root;
  }

  // Chameleon curly tail
  if (animalId === "chameleon") {
    let parent: THREE.Object3D = root;
    const segments = 10;
    for (let i = 0; i < segments; i++) {
      const t = i / (segments - 1);
      const segGroup = new THREE.Group();
      segGroup.name = `tail_seg_${i}`;
      if (i === 0) {
        segGroup.position.set(0, 0.1, -0.9);
      } else {
        segGroup.position.set(0, -0.16, -0.22 + t * 0.05);
        segGroup.rotation.x = -0.45;
      }
      const mesh = sphere(0.24 * (1 - t * 0.72), c.fill);
      mesh.castShadow = true;
      segGroup.add(mesh);
      parent.add(segGroup);
      parent = segGroup;
    }
    return root;
  }

  // Shark tail: vertical caudal fin
  if (animalId === "shark") {
    let parent: THREE.Object3D = root;
    const segments = 6;
    for (let i = 0; i < segments; i++) {
      const t = i / (segments - 1);
      const segGroup = new THREE.Group();
      segGroup.name = `tail_seg_${i}`;
      if (i === 0) {
        segGroup.position.set(0, 0.1, -0.9);
      } else {
        segGroup.position.set(0, 0.05, -0.24);
      }
      const mesh = sphere(0.24 * (1 - t * 0.6), c.fill);
      mesh.castShadow = true;
      segGroup.add(mesh);
      if (i === segments - 1) {
        const upperLobe = cone(0.08, 0.65, c.accent, { noTexture: true });
        upperLobe.position.set(0, 0.28, -0.15);
        upperLobe.rotation.x = -0.6;
        segGroup.add(upperLobe);
        const lowerLobe = cone(0.06, 0.42, c.accent, { noTexture: true });
        lowerLobe.position.set(0, -0.2, -0.1);
        lowerLobe.rotation.x = 0.6;
        segGroup.add(lowerLobe);
      }
      parent.add(segGroup);
      parent = segGroup;
    }
    return root;
  }

  // Phoenix tail: 3 long trail feathers
  if (animalId === "phoenix") {
    for (const offset of [-1, 0, 1] as const) {
      const featherRoot = new THREE.Group();
      featherRoot.name = `tail_feather_${offset + 1}`;
      featherRoot.position.set(offset * 0.18, 0.1, -0.9);
      featherRoot.rotation.set(-0.2, offset * 0.15, 0);
      let parent: THREE.Object3D = featherRoot;
      const segments = 7;
      for (let i = 0; i < segments; i++) {
        const t = i / (segments - 1);
        const segGroup = new THREE.Group();
        segGroup.name = `tail_seg_${offset + 1}_${i}`;
        if (i === 0) {
          segGroup.position.set(0, 0, 0);
        } else {
          segGroup.position.set(0, -0.25 / segments, -1.5 / segments);
        }
        const mesh = sphere(0.16 * (1 - t * 0.5), c.fill, { emissive: c.accent, emissiveI: 0.5 });
        mesh.scale.set(1.0, 0.12, 1.4);
        mesh.castShadow = true;
        segGroup.add(mesh);
        parent.add(segGroup);
        parent = segGroup;
      }
      root.add(featherRoot);
    }
    return root;
  }

  // Standard bone chain tail
  let parent: THREE.Object3D = root;
  const segments = animalId === "scorpion" ? 8 : (animalId === "cobra" ? 8 : (animalId === "tiger" ? 8 : 6));
  
  for (let i = 0; i < segments; i++) {
    const t = i / (segments - 1);
    const segGroup = new THREE.Group();
    segGroup.name = `tail_seg_${i}`;
    
    if (i === 0) {
      segGroup.position.set(0, 0.1, -0.9);
    } else {
      if (animalId === "scorpion") {
        segGroup.position.set(0, 1.45 / segments, -1.22 / segments);
      } else if (animalId === "cobra") {
        segGroup.position.set(0, -0.45 / segments, -1.35 / segments);
      } else if (animalId === "tiger") {
        segGroup.position.set(0, -0.2 / segments, -1.38 / segments);
      } else {
        segGroup.position.set(0, 0.25 / segments, -1.1 / segments);
      }
    }
    
    let mesh: THREE.Mesh;
    if (animalId === "scorpion") {
      const sz = 0.24 * (1 - t * 0.44);
      mesh = sphere(sz, i % 2 === 0 ? c.fill : c.shade, { rough: 0.35, metal: 0.5 });
    } else if (animalId === "cobra") {
      mesh = sphere(0.24 * (1 - t * 0.72), c.fill);
    } else if (animalId === "tiger") {
      mesh = sphere(0.18 * (1 - t * 0.42), i % 2 === 0 ? c.fill : "#0d0d0d");
    } else {
      mesh = sphere(0.26 * (1 - t * 0.7), c.fill);
    }
    mesh.castShadow = true;
    segGroup.add(mesh);
    
    // Add end attachments to last segment
    if (i === segments - 1) {
      if (animalId === "scorpion") {
        const poisonBulb = sphere(0.18, c.accent, { rough: 0.22, metal: 0.65, emissive: c.accent, emissiveI: 0.55 });
        poisonBulb.position.set(0, 0.14, 0.14);
        segGroup.add(poisonBulb);

        const needle = cone(0.04, 0.24, "#0f0f0f", { rough: 0.1 });
        needle.rotation.x = -1.25;
        needle.position.set(0, 0.24, 0.24);
        segGroup.add(needle);
      } else if (animalId === "cobra") {
        const tip = cone(0.12, 0.34, c.accent, { rough: 0.35 });
        tip.rotation.x = -0.6;
        tip.position.set(0, 0.2, -0.4);
        segGroup.add(tip);
      } else if (animalId === "eel" || animalId === "default") {
        const fin = cone(0.25, 0.5, c.accent, { emissive: c.accent, emissiveI: 0.5 });
        fin.rotation.x = -1.4;
        fin.position.set(0, 0.1, -0.4);
        segGroup.add(fin);
      } else if (animalId === "dragon") {
        const spade = cone(0.18, 0.45, c.accent, { rough: 0.3, noTexture: true });
        spade.rotation.x = -Math.PI / 2;
        spade.position.set(0, 0.05, -0.32);
        segGroup.add(spade);
      }
    }
    
    parent.add(segGroup);
    parent = segGroup;
  }
  
  return root;
}


/** Assemble a full 3D creature model from a genome. Pure (no scene side-effects). */
export function buildCreatureModel(genome: Genome): THREE.Group {
  const root = new THREE.Group();

  const placements: Record<Slot, (g: THREE.Object3D) => void> = {
    body: (g) => g.position.set(0, 1.4, 0),
    head: (g) => g.position.set(0, 2.15, 0.95),
    forelimbs: (g) => g.position.set(0, 1.4, 0),
    hindlimbs: (g) => g.position.set(0, 1.4, 0),
    tail: (g) => g.position.set(0, 1.3, -0.3),
  };

  const builders: Record<Slot, () => THREE.Group> = {
    body: () => {
      currentBuilderAnimalId = genome.body;
      const res = buildBody(genome.body);
      currentBuilderAnimalId = null;
      return res;
    },
    head: () => {
      currentBuilderAnimalId = genome.head;
      const res = buildHead(genome.head);
      currentBuilderAnimalId = null;
      return res;
    },
    forelimbs: () => {
      currentBuilderAnimalId = genome.forelimbs;
      const res = buildLimbs(genome.forelimbs, true);
      currentBuilderAnimalId = null;
      return res;
    },
    hindlimbs: () => {
      currentBuilderAnimalId = genome.hindlimbs;
      const res = buildLimbs(genome.hindlimbs, false);
      currentBuilderAnimalId = null;
      return res;
    },
    tail: () => {
      currentBuilderAnimalId = genome.tail;
      const res = buildTail(genome.tail);
      currentBuilderAnimalId = null;
      return res;
    },
  };

  for (const slot of SLOTS) {
    const part = builders[slot]();
    placements[slot](part);
    part.name = slot;
    root.add(part);
  }

  // a neck bridge in the body's colour to tie head to torso
  currentBuilderAnimalId = genome.body;
  const neck = sphere(0.4, colorsFor(genome.body).fill);
  currentBuilderAnimalId = null;
  neck.name = "neck";
  neck.scale.set(0.8, 0.9, 0.8);
  neck.position.set(0, 1.85, 0.55);
  root.add(neck);

  // Dynamic bio-luminescent PointLights inside the model based on genomes!
  // This lights up the creature segments and casts dynamic lights on pedestals.
  if (genome.head === "eel" || genome.body === "eel") {
    const electricLight = new THREE.PointLight(0x00ffff, 1.3, 7);
    electricLight.position.set(0, 1.6, 0.4);
    root.add(electricLight);
  } 
  if (genome.head === "cobra" || genome.head === "scorpion" || genome.tail === "scorpion") {
    const poisonLight = new THREE.PointLight(0x39ff14, 1.1, 6);
    poisonLight.position.set(0, 1.8, 0.8);
    root.add(poisonLight);
  }
  if (genome.head === "eagle" || genome.head === "tiger" || genome.body === "tiger") {
    const holyLight = new THREE.PointLight(0xffdd66, 0.9, 6);
    holyLight.position.set(0, 1.7, 0.6);
    root.add(holyLight);
  }
  if (genome.body === "rhino" || genome.body === "bear" || genome.body === "gorilla") {
    const rageLight = new THREE.PointLight(0xff4411, 0.8, 5);
    rageLight.position.set(0, 1.1, -0.2);
    root.add(rageLight);
  }
  if (genome.head === "dragon" || genome.body === "dragon") {
    const fireLight = new THREE.PointLight(0xff5010, 1.5, 8);
    fireLight.position.set(0, 1.6, 0.5);
    root.add(fireLight);
  }
  if (genome.head === "jellyfish" || genome.body === "jellyfish") {
    const pulseLight = new THREE.PointLight(0x9040ff, 1.2, 7);
    pulseLight.position.set(0, 1.7, 0.3);
    root.add(pulseLight);
  }

  return root;
}

export interface Creature3DHandle {
  dispose: () => void;
  setGenome: (genome: Genome) => void;
}

/**
 * Mount a self-contained WebGL preview into `container`: scene, lights, slow
 * auto-rotate. Returns a handle to swap genomes or tear down. Throws if WebGL
 * is unavailable so callers can fall back to the 2D canvas.
 */
export function mountCreature3D(
  container: HTMLElement,
  genome: Genome,
  size = 220,
): Creature3DHandle {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(size, size);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Elevate lighting aesthetics with ACESFilmic Tone Mapping!
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;

  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 2.2, 7.2);
  camera.lookAt(0, 1.6, 0);

  // Lighting: matches the 2D upper-left key + a violet rim for that 2026 pop.
  scene.add(new THREE.AmbientLight(0x6677aa, 0.7));
  const key = new THREE.DirectionalLight(0xfff1dd, 1.25);
  key.position.set(-4, 6, 5);
  key.castShadow = true;
  key.shadow.mapSize.width = 1024;
  key.shadow.mapSize.height = 1024;
  key.shadow.bias = -0.001;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9b6cff, 0.7);
  rim.position.set(5, 2, -4);
  scene.add(rim);

  // Pedestal
  const pedestalGeo = new THREE.CylinderGeometry(1.6, 1.8, 0.25, 32);
  const pedestalMat = new THREE.MeshStandardMaterial({
    color: 0x1f2937,
    roughness: 0.2,
    metalness: 0.8,
  });
  const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
  pedestal.position.y = 0.05;
  pedestal.receiveShadow = true;
  scene.add(pedestal);

  const ringGeo = new THREE.TorusGeometry(1.6, 0.06, 16, 64);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x9b6cff,
    emissive: 0x9b6cff,
    emissiveIntensity: 1.5,
    roughness: 0.1,
  });
  const pedestalRing = new THREE.Mesh(ringGeo, ringMat);
  pedestalRing.rotation.x = Math.PI / 2;
  pedestalRing.position.y = 0.18;
  scene.add(pedestalRing);

  // Floating particles
  const particleCount = 40;
  const particlesGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const particleSpeeds: number[] = [];
  const particleOffsets: number[] = [];

  for (let i = 0; i < particleCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = 0.2 + Math.random() * 1.3;
    positions[i * 3] = Math.cos(angle) * r;
    positions[i * 3 + 1] = Math.random() * 3.5;
    positions[i * 3 + 2] = Math.sin(angle) * r;
    particleSpeeds.push(0.008 + Math.random() * 0.015);
    particleOffsets.push(Math.random() * Math.PI * 2);
  }

  particlesGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const particlesMat = new THREE.PointsMaterial({
    color: 0x9b6cff,
    size: 0.08,
    transparent: true,
    opacity: 0.6,
  });
  const particleSystem = new THREE.Points(particlesGeo, particlesMat);
  scene.add(particleSystem);

  let activeGenome = genome;
  let model = buildCreatureModel(genome);
  scene.add(model);

  // Soft shadow mesh beneath creature
  const shadowMesh = createSoftShadowMesh();
  scene.add(shadowMesh);

  // Drag controls
  let isDragging = false;
  let previousMousePosition = { x: 0, y: 0 };
  let rotationOffset = { x: 0, y: 0.3 };

  container.style.cursor = "grab";
  
  const onMouseDown = (e: MouseEvent) => {
    isDragging = true;
    previousMousePosition = { x: e.clientX, y: e.clientY };
    container.style.cursor = "grabbing";
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    const deltaMove = {
      x: e.clientX - previousMousePosition.x,
      y: e.clientY - previousMousePosition.y,
    };
    rotationOffset.y += deltaMove.x * 0.01;
    rotationOffset.x += deltaMove.y * 0.01;
    rotationOffset.x = Math.max(-0.6, Math.min(0.6, rotationOffset.x));
    previousMousePosition = { x: e.clientX, y: e.clientY };
  };

  const onMouseUp = () => {
    isDragging = false;
    container.style.cursor = "grab";
  };

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 1) {
      isDragging = true;
      previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const onTouchMove = (e: TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    const deltaMove = {
      x: e.touches[0].clientX - previousMousePosition.x,
      y: e.touches[0].clientY - previousMousePosition.y,
    };
    rotationOffset.y += deltaMove.x * 0.01;
    rotationOffset.x += deltaMove.y * 0.01;
    rotationOffset.x = Math.max(-0.6, Math.min(0.6, rotationOffset.x));
    previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  // Pointer head tracking
  let mouseNormalized = { x: 0, y: 0 };
  const onMouseMoveTracking = (e: MouseEvent) => {
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    mouseNormalized.x = (e.clientX - cx) / (rect.width * 2);
    mouseNormalized.y = (e.clientY - cy) / (rect.height * 2);
    mouseNormalized.x = Math.max(-1.0, Math.min(1.0, mouseNormalized.x));
    mouseNormalized.y = Math.max(-1.0, Math.min(1.0, mouseNormalized.y));
  };

  container.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
  container.addEventListener("touchstart", onTouchStart);
  window.addEventListener("touchmove", onTouchMove);
  window.addEventListener("touchend", onMouseUp);
  window.addEventListener("mousemove", onMouseMoveTracking);

  let raf = 0;
  let t = 0;
  let blinkTimer = 0;
  let disposed = false;

  function frame() {
    if (disposed) return;
    t += 0.016;

    // Apply auto-rotation combined with drag rotation
    if (!isDragging) {
      rotationOffset.y += 0.005;
    }
    model.rotation.y = rotationOffset.y;
    model.rotation.x = rotationOffset.x;
    
    // Breathing & idle motions based on genome stances
    const body = model.getObjectByName("body");
    const neck = model.getObjectByName("neck");
    const head = model.getObjectByName("head");
    const forelimbs = model.getObjectByName("forelimbs");
    const hindlimbs = model.getObjectByName("hindlimbs");

    const isAvian = activeGenome.forelimbs === "eagle" || activeGenome.body === "eagle" || activeGenome.body === "dragon";
    const isSerpentine = activeGenome.body === "cobra" || activeGenome.body === "eel" || activeGenome.body === "jellyfish";
    const isHeavyMammal = ["bear", "rhino", "gorilla", "boar"].includes(activeGenome.body);
    const isInsect = ["ant", "scorpion", "crab"].includes(activeGenome.body);

    // 1. Position hover and body tilt/scale
    if (isAvian) {
      // High-altitude hover flight
      model.position.y = Math.sin(t * 2.2) * 0.15 + 0.35;
      model.position.x = 0;
      if (body) {
        const breathe = Math.sin(t * 3.0) * 0.015;
        body.scale.set(1.04 + breathe, 0.94 - breathe, 1.18 + breathe);
        body.rotation.x = 0.12 + Math.sin(t * 2.2) * 0.04;
        body.rotation.y = 0;
      }
      if (forelimbs) forelimbs.rotation.x = 0.25;
      if (hindlimbs) hindlimbs.rotation.x = 0.4;
    } else if (isSerpentine) {
      // Slithering vertical/horizontal wave motion
      model.position.y = Math.sin(t * 1.8) * 0.03 + 0.1;
      model.position.x = 0;
      if (body) {
        body.rotation.y = Math.sin(t * 2.2) * 0.12;
        body.rotation.x = Math.cos(t * 1.8) * 0.05;
        body.scale.set(1.05, 0.92, 1.2);
      }
      if (neck) {
        neck.rotation.y = -Math.sin(t * 2.2) * 0.08;
      }
    } else if (isHeavyMammal) {
      // Grounded stance, deep heavy breathing, weight shifts
      model.position.y = 0.05;
      if (body) {
        const breathe = Math.sin(t * 1.2) * 0.035;
        body.scale.set(1.1 + breathe, 0.88 - breathe, 1.25 + breathe);
        body.rotation.x = 0.0;
        body.rotation.y = Math.sin(t * 0.8) * 0.04;
      }
      model.position.x = Math.sin(t * 0.8) * 0.05;
    } else if (isInsect) {
      // Low to ground, rapid micro jitters
      model.position.y = 0.02 + Math.sin(t * 4.5) * 0.01;
      model.position.x = 0;
      if (body) {
        const breathe = Math.sin(t * 4.0) * 0.018;
        body.scale.set(1.03 + breathe, 0.94 - breathe, 1.2 + breathe);
        body.rotation.x = 0.02;
        body.rotation.y = 0.0;
      }
      const jitter = Math.sin(t * 15.0) * 0.02;
      if (forelimbs) forelimbs.rotation.z = jitter;
      if (hindlimbs) hindlimbs.rotation.z = -jitter;
    } else {
      // Standard Stance
      model.position.y = Math.sin(t * 1.4) * 0.04 + 0.1;
      model.position.x = 0;
      if (body) {
        const breathe = Math.sin(t * 2.5) * 0.02;
        body.scale.set(1.05 + breathe, 0.92 - breathe, 1.2 + breathe);
        body.rotation.set(0, 0, 0);
      }
    }

    // 2. Head tracking with custom offsets based on stance
    if (head) {
      const targetHeadRotY = mouseNormalized.x * 0.6;
      let targetHeadRotX = mouseNormalized.y * 0.4 + Math.sin(t * 1.2) * 0.03;
      
      if (isAvian) {
        targetHeadRotX -= 0.08; // look down slightly when flying high
      } else if (isSerpentine) {
        // Head sways slightly in opposition to body slither
        const swayOffset = -Math.sin(t * 2.2) * 0.08;
        head.rotation.y += (targetHeadRotY + swayOffset - head.rotation.y) * 0.1;
        head.rotation.x += (targetHeadRotX - head.rotation.x) * 0.1;
      } else if (isInsect) {
        const twitch = (Math.sin(t * 12.0) + Math.cos(t * 19.0)) * 0.018;
        head.rotation.y += (targetHeadRotY + twitch * 1.5 - head.rotation.y) * 0.12;
        head.rotation.x += (targetHeadRotX + twitch - head.rotation.x) * 0.12;
      }

      if (!isSerpentine && !isInsect) {
        head.rotation.y += (targetHeadRotY - head.rotation.y) * 0.1;
        head.rotation.x += (targetHeadRotX - head.rotation.x) * 0.1;
      }
    }

    // Update rabbit ears physics (spring bounce)
    const earL0 = model.getObjectByName("ear_l_0");
    const earL1 = model.getObjectByName("ear_l_1");
    const earR0 = model.getObjectByName("ear_r_0");
    const earR1 = model.getObjectByName("ear_r_1");
    if (earL0 && earR0) {
      const bounceX = Math.sin(t * 4.0) * 0.08;
      const bounceZ = Math.cos(t * 3.0) * 0.05;
      
      earL0.rotation.x = bounceX;
      earL0.rotation.z = -0.05 + bounceZ;
      if (earL1) {
        earL1.rotation.x = bounceX * 1.5;
        earL1.rotation.z = bounceZ * 0.8;
      }

      earR0.rotation.x = bounceX;
      earR0.rotation.z = 0.05 - bounceZ;
      if (earR1) {
        earR1.rotation.x = bounceX * 1.5;
        earR1.rotation.z = -bounceZ * 0.8;
      }
    }

    // Animate lower jaw chew/yawn
    const lowerJaw = model.getObjectByName("lower_jaw");
    if (lowerJaw) {
      const mouthOpen = Math.max(0, Math.sin(t * 1.5) * 0.08);
      lowerJaw.rotation.x = mouthOpen;
    }

    // Eye blinking
    if (Math.random() < 0.008 && blinkTimer === 0) {
      blinkTimer = 10;
    }
    let eyeScaleY = 1.0;
    if (blinkTimer > 0) {
      blinkTimer--;
      if (blinkTimer > 5) {
        eyeScaleY = 0.1 + (blinkTimer - 5) * 0.18;
      } else {
        eyeScaleY = 0.1 + (5 - blinkTimer) * 0.18;
      }
    }
    for (const side of ["_r", "_l"]) {
      const eye = model.getObjectByName(`eye${side}`);
      const pupil = model.getObjectByName(`pupil${side}`);
      if (eye) eye.scale.y = eyeScaleY;
      if (pupil) pupil.scale.y = eyeScaleY;
    }

    // Secondary mesh animations
    const hood = model.getObjectByName("hood");
    if (hood) {
      hood.scale.x = 1.5 + Math.sin(t * 8.0) * 0.15;
    }

    const mandibleR = model.getObjectByName("mandible_r");
    const mandibleL = model.getObjectByName("mandible_l");
    if (mandibleR && mandibleL) {
      const pinch = Math.sin(t * 5.0) * 0.2;
      mandibleR.rotation.z = 0.3 - pinch;
      mandibleL.rotation.z = -0.3 + pinch;
    }

    const turretR = model.getObjectByName("turret_r");
    const turretL = model.getObjectByName("turret_l");
    if (turretR && turretL) {
      turretR.rotation.y = 0.8 + Math.sin(t * 1.5) * 0.25;
      turretR.rotation.x = Math.cos(t * 1.2) * 0.15;
      turretL.rotation.y = -0.8 + Math.sin(t * 0.9) * 0.25;
      turretL.rotation.x = Math.cos(t * 2.1) * 0.15;
    }

    const earR = model.getObjectByName("bat_ear_r");
    const earL = model.getObjectByName("bat_ear_l");
    if (earR && earL) {
      const twitchVal = Math.sin(t * 30.0) * 0.15 * (Math.sin(t * 0.5) > 0.85 ? 1.0 : 0.0);
      earR.rotation.z = -0.15 + twitchVal;
      earL.rotation.z = 0.15 - twitchVal;
    }

    // Chain-link tail physics sway
    const tailSwaySpeed = isSerpentine ? 4.5 : (isHeavyMammal ? 2.0 : 3.2);
    const tailSwayAmp = isSerpentine ? 0.32 : (isHeavyMammal ? 0.08 : 0.15);
    for (let i = 0; i < 10; i++) {
      const seg = model.getObjectByName(`tail_seg_${i}`);
      if (seg) {
        seg.rotation.y = Math.sin(t * tailSwaySpeed - i * 0.32) * tailSwayAmp;
      }
      for (const off of [0, 1, 2]) {
        const segFeather = model.getObjectByName(`tail_seg_${off}_${i}`);
        if (segFeather) {
          segFeather.rotation.y = Math.sin(t * tailSwaySpeed - i * 0.32 + off * 0.25) * tailSwayAmp;
        }
      }
    }
    // Backward compatibility check for unsegmented tail
    const oldTail = model.getObjectByName("tail");
    if (oldTail && !model.getObjectByName("tail_seg_0")) {
      oldTail.rotation.y = Math.sin(t * 3.2) * 0.15;
    }

    const wingR = model.getObjectByName("wing_r");
    const wingL = model.getObjectByName("wing_l");
    if (wingR && wingL) {
      const flap = Math.sin(t * (isAvian ? 10 : 5)) * (isAvian ? 0.45 : 0.25);
      wingR.rotation.z = flap;
      wingL.rotation.z = -flap;
    }

    // Floating particles animation
    const posAttr = particleSystem.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < particleCount; i++) {
      let y = posAttr.getY(i) + particleSpeeds[i];
      if (y > 3.5) {
        y = 0.2;
      }
      posAttr.setY(i, y);

      const angle = particleOffsets[i] + t;
      let x = posAttr.getX(i) + Math.sin(angle) * 0.003;
      let z = posAttr.getZ(i) + Math.cos(angle) * 0.003;
      posAttr.setX(i, x);
      posAttr.setZ(i, z);
    }
    posAttr.needsUpdate = true;

    // Update soft shadow size and opacity based on height
    const shadow = scene.getObjectByName("shadow") as THREE.Mesh | undefined;
    if (shadow) {
      const height = model.position.y;
      const s = Math.max(0.2, 1.2 - height * 0.8);
      shadow.scale.set(s, s, 1);
      (shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.1, 0.55 - height * 0.65);
    }

    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  frame();

  function disposeModel(m: THREE.Object3D) {
    m.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mt = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mt)) mt.forEach((x) => x.dispose());
      else if (mt) mt.dispose();
    });
  }

  return {
    setGenome(next: Genome) {
      activeGenome = next;
      scene.remove(model);
      disposeModel(model);
      model = buildCreatureModel(next);
      scene.add(model);
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      disposeModel(model);
      pedestal.geometry.dispose();
      pedestalMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      particlesGeo.dispose();
      particlesMat.dispose();
      
      shadowMesh.geometry.dispose();
      (shadowMesh.material as THREE.Material).dispose();
      
      container.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      container.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onMouseUp);
      window.removeEventListener("mousemove", onMouseMoveTracking);
      
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
