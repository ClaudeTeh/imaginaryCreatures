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
import { type Genome } from "../core/types";
import { ANIMAL_COLORS, drawHead, drawBody, drawForelimbs, drawHindlimbs, drawTail, type PartColors } from "./creatureParts";
import { ANIMALS } from "../data/animals";
import { preloadAllModels } from "./modelLoader";

export const modelsReady: Promise<void> = preloadAllModels(ANIMALS.map((a) => a.id));

function createCutoutPlane(
  width: number,
  height: number,
  drawFn: (ctx: CanvasRenderingContext2D) => void,
  scale = 4.0
): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.clearRect(0, 0, 512, 512);
    ctx.save();
    ctx.translate(256, 256);
    ctx.scale(scale, scale);
    drawFn(ctx);
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.02,
    side: THREE.DoubleSide,
  });

  const geometry = new THREE.PlaneGeometry(width, height);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = false;
  return mesh;
}

function getPremiumColor(hex: string): string {
  const color = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  
  // Keep colors warm and rich (only desaturate by 10%)
  hsl.s = Math.min(hsl.s * 0.9, 0.85);
  hsl.l = Math.max(Math.min(hsl.l, 0.65), 0.18);
  
  color.setHSL(hsl.h, hsl.s, hsl.l);
  return "#" + color.getHexString();
}

function colorsFor(animalId: string): PartColors {
  const c = ANIMAL_COLORS[animalId] ?? ANIMAL_COLORS.boar;
  return {
    fill: getPremiumColor(c.fill),
    shade: getPremiumColor(c.shade),
    accent: getPremiumColor(c.accent),
  };
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

  // 1. Bake a vertical shading gradient (underbelly shadow only, no white top-highlight to prevent washing out)
  const shadGrad = ctx.createLinearGradient(0, 0, 0, 256);
  shadGrad.addColorStop(0, "rgba(0, 0, 0, 0)"); 
  shadGrad.addColorStop(0.5, "rgba(0, 0, 0, 0)");
  shadGrad.addColorStop(1, "rgba(0, 0, 0, 0.4)"); // dark ambient occlusion shadow at the bottom
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
      ctx.fillStyle = "#111116";
      for (let i = 0; i < 10; i++) {
        const y = 15 + i * 26 + Math.random() * 6;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.quadraticCurveTo(90, y + 12, 130, y + 2);
        ctx.quadraticCurveTo(90, y + 22, 0, y + 28);
        ctx.closePath();
        ctx.fill();
        
        ctx.beginPath();
        ctx.moveTo(256, y + 8);
        ctx.quadraticCurveTo(166, y + 20, 126, y + 10);
        ctx.quadraticCurveTo(166, y + 30, 256, y + 36);
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
        // Expand vertices along view-space normals to maintain scale independence
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vec3 viewNormal = normalize(normalMatrix * normal);
        mvPosition.xyz += viewNormal * outlineThickness;
        gl_Position = projectionMatrix * mvPosition;
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
  (material as any).flatShading = true; // Forces flat shading for crisp facets

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
      #ifdef FLAT_SHADED
        vec3 normalVal = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
      #else
        vec3 normalVal = normalize(vNormal);
      #endif
      float rimDot = 1.0 - max(dot(normalVal, -viewDir), 0.0);
      float rimIntensityVal = pow(rimDot, rimPower);
      gl_FragColor.rgb += rimColor * rimIntensityVal * rimIntensity;
      `
    );
  };

  return material;
}

export function sphere(
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
  // Extremely blocky sphere: 6 radial, 5 height segments
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 5), mat(c, opts));
  if (!opts.noOutline) {
    applyToonOutline(mesh);
  }
  return mesh;
}

export function cone(
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
): THREE.Mesh {
  // 4-segment pyramid (low-poly cone) — kept for potential future use
  void r; void h; void c;
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, h, 4), mat(c, opts));
  if (!opts.noOutline) {
    applyToonOutline(mesh);
  }
  return mesh;
}

export function cyl(
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
): THREE.Mesh {
  // 5-segment prism — kept for potential future use
  void rt; void rb; void h; void c;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 5), mat(c, opts));
  if (!opts.noOutline) {
    applyToonOutline(mesh);
  }
  return mesh;
}

export function box(
  w: number,
  h: number,
  d: number,
  c: string,
  opts: {
    rough?: number;
    metal?: number;
    emissive?: string;
    emissiveI?: number;
    noOutline?: boolean;
    noTexture?: boolean;
  } = {}
): THREE.Mesh {
  // Box helper — kept for potential future use
  void w; void h; void d; void c;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, opts));
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

/** BODY — central torso, tinted by the body donor; shape varies a little by animal. */
export function buildBody(animalId: string): THREE.Group {
  const g = new THREE.Group();
  g.name = "body";

  const bodyMesh = createCutoutPlane(2.2, 2.2, (ctx) => {
    drawBody(ctx, animalId, 0);
  }, 8);
  bodyMesh.name = "body_mesh";
  g.add(bodyMesh);

  return g;
}

export function buildHead(animalId: string): THREE.Group {
  const g = new THREE.Group();
  g.name = "head";

  const headMesh = createCutoutPlane(1.4, 1.4, (ctx) => {
    drawHead(ctx, animalId, 0, 0);
  }, 6);
  headMesh.name = "head_mesh";
  g.add(headMesh);

  return g;
}

/** A limb pair: two angled cylinders + foot spheres, tinted by the donor. */
export function buildLimbs(animalId: string, front: boolean): THREE.Group {
  const g = new THREE.Group();
  const namePrefix = front ? "fore" : "hind";
  g.name = namePrefix + "limbs";

  const isWing = front && ["eagle", "phoenix", "bat"].includes(animalId);
  const isClaw = front && ["crab", "scorpion"].includes(animalId);

  const drawFn = (ctx: CanvasRenderingContext2D) => {
    if (front) {
      drawForelimbs(ctx, animalId, 0);
    } else {
      drawHindlimbs(ctx, animalId, 0);
    }
  };

  const w = isWing ? 2.5 : 1.4;
  const h = isWing ? 2.5 : 1.4;

  // Left limb
  const leftLimb = createCutoutPlane(w, h, drawFn, 5);
  leftLimb.scale.x = -1; // Mirror
  leftLimb.position.set(isWing ? -0.75 : -0.45, isWing ? 0.35 : -0.28, -0.08);
  leftLimb.name = isWing ? "wing_l" : (isClaw ? "claw_l" : namePrefix + "leg_l");
  g.add(leftLimb);

  // Right limb
  const rightLimb = createCutoutPlane(w, h, drawFn, 5);
  rightLimb.position.set(isWing ? 0.75 : 0.45, isWing ? 0.35 : -0.28, 0.08);
  rightLimb.name = isWing ? "wing_r" : (isClaw ? "claw_r" : namePrefix + "leg_r");
  g.add(rightLimb);

  return g;
}

/** TAIL — a hierarchical bone chain of segments parented to each other for tail physics. */
export function buildTail(animalId: string): THREE.Group {
  const g = new THREE.Group();
  g.name = "tail";

  const tailMesh = createCutoutPlane(1.8, 1.8, (ctx) => {
    drawTail(ctx, animalId, 0);
  }, 5);
  tailMesh.name = "tail_mesh";
  tailMesh.position.set(-0.35, 0.05, -0.15);
  g.add(tailMesh);

  return g;
}


/** Assemble a full 3D creature model from a genome. Pure (no scene side-effects). */
export function buildCreatureModel(genome: Genome): THREE.Group {
  const root = new THREE.Group();

  // Draw all 5 parts onto a single high-res canvas composite billboard.
  // Parts are laid out using the 2D coordinate conventions from creatureParts.ts:
  //   tail→ left, hindlimbs→ rear-lower, body→ centre, forelimbs→ front-lower, head→ right
  const S = 4; // canvas scale: 1 unit in 2D coords = S pixels
  const W = 512, H = 512;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);

  // Centre of creature in canvas pixels (shift right/up to centre the body)
  const cx = W * 0.50;
  const cy = H * 0.48;

  // Draw order: tail → hindlimbs → body → forelimbs → head (back-to-front)
  const drawPart = (drawFn: () => void, offX: number, offY: number) => {
    ctx.save();
    ctx.translate(cx + offX * S, cy + offY * S);
    ctx.scale(S, S);
    drawFn();
    ctx.restore();
  };

  // Tail: leftmost
  currentBuilderAnimalId = genome.tail;
  drawPart(() => drawTail(ctx, genome.tail, 0), -38, 10);
  currentBuilderAnimalId = null;

  // Hindlimbs: rear-lower
  currentBuilderAnimalId = genome.hindlimbs;
  drawPart(() => drawHindlimbs(ctx, genome.hindlimbs, 0), -18, 22);
  currentBuilderAnimalId = null;

  // Body: centre
  currentBuilderAnimalId = genome.body;
  drawPart(() => drawBody(ctx, genome.body, 0), 0, 8);
  currentBuilderAnimalId = null;

  // Forelimbs: front-lower
  currentBuilderAnimalId = genome.forelimbs;
  drawPart(() => drawForelimbs(ctx, genome.forelimbs, 0), 18, 22);
  currentBuilderAnimalId = null;

  // Head: rightmost, upper
  currentBuilderAnimalId = genome.head;
  drawPart(() => drawHead(ctx, genome.head, 0, 0), 35, -10);
  currentBuilderAnimalId = null;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mat2d = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.02,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  // Billboard plane sized to fit the creature (~3 units wide, 3 units tall)
  const billboard = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), mat2d);
  billboard.name = "creature_billboard";
  // Position to sit above pedestal centred on the creature
  billboard.position.set(0, 1.7, 0);
  // Tilt slightly toward camera (camera is at y=2.2, z=7.2 looking at origin)
  billboard.rotation.x = -0.05;
  root.add(billboard);
  root.name = "creature_composite";

  // Dynamic bio-luminescent PointLights
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
  renderer.toneMappingExposure = 1.0;

  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 2.2, 7.2);
  camera.lookAt(0, 1.6, 0);

  // Lighting: matches the 2D upper-left key + a violet rim for that 2026 pop.
  scene.add(new THREE.AmbientLight(0x6677aa, 0.45));
  const key = new THREE.DirectionalLight(0xfff1dd, 1.1);
  key.position.set(-4, 6, 5);
  key.castShadow = true;
  key.shadow.mapSize.width = 1024;
  key.shadow.mapSize.height = 1024;
  key.shadow.bias = -0.001;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9b6cff, 0.6);
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

    // Billboard: always face the camera so the flat 2D sprite stays visible
    const billboard = model.getObjectByName("creature_billboard") as THREE.Mesh | undefined;
    if (billboard) {
      billboard.lookAt(camera.position);
    }
    
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
