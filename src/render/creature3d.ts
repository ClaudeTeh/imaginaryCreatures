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

function colorsFor(animalId: string): PartColors {
  return ANIMAL_COLORS[animalId] ?? ANIMAL_COLORS.boar;
}

function mat(hex: string, opts: { rough?: number; metal?: number; emissive?: string; emissiveI?: number } = {}) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex),
    roughness: opts.rough ?? 0.55,
    metalness: opts.metal ?? 0.15,
    emissive: opts.emissive ? new THREE.Color(opts.emissive) : new THREE.Color(0x000000),
    emissiveIntensity: opts.emissiveI ?? 0,
  });
}

function sphere(r: number, c: string, opts = {}) {
  return new THREE.Mesh(new THREE.SphereGeometry(r, 20, 16), mat(c, opts));
}
function cone(r: number, h: number, c: string, opts = {}) {
  return new THREE.Mesh(new THREE.ConeGeometry(r, h, 12), mat(c, opts));
}
function cyl(rt: number, rb: number, h: number, c: string, opts = {}) {
  return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 12), mat(c, opts));
}

/** A pair of eyes parented to the head, looking forward (+Z). */
function addEyes(head: THREE.Object3D, y: number, z: number, r = 0.09) {
  for (const s of [-1, 1] as const) {
    const white = sphere(r, "#ffffff", { rough: 0.2 });
    white.position.set(s * 0.22, y, z);
    head.add(white);
    const pupil = sphere(r * 0.55, "#0a0a0a", { rough: 0.1 });
    pupil.position.set(s * 0.22, y, z + r * 0.7);
    head.add(pupil);
  }
}

/** BODY — central torso, tinted by the body donor; shape varies a little by animal. */
function buildBody(animalId: string): THREE.Group {
  const g = new THREE.Group();
  const c = colorsFor(animalId);
  const torso = sphere(1.0, c.fill);
  // squash/stretch for silhouette variety
  if (["cobra", "eel"].includes(animalId)) torso.scale.set(0.8, 0.8, 1.5);
  else if (["rhino", "gorilla", "bear"].includes(animalId)) torso.scale.set(1.25, 1.05, 1.3);
  else torso.scale.set(1.05, 0.92, 1.2);
  torso.castShadow = true;
  g.add(torso);
  // a lighter belly accent
  const belly = sphere(0.7, c.accent, { rough: 0.7 });
  belly.scale.set(0.9, 0.6, 1.0);
  belly.position.set(0, -0.45, 0.25);
  g.add(belly);
  return g;
}

/** HEAD — sits forward+up; per-animal features (ears, horns, beak, hood…). */
function buildHead(animalId: string): THREE.Group {
  const g = new THREE.Group();
  g.scale.setScalar(0.82); // keep head proportional to the torso
  const c = colorsFor(animalId);
  const skull = sphere(0.62, c.fill);
  skull.castShadow = true;
  g.add(skull);
  addEyes(g, 0.12, 0.5);
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
      const horn = cone(0.1, len, col, { rough: 0.4 });
      horn.position.set(s * 0.3, 0.55, 0.2);
      horn.rotation.z = -s * 0.4;
      g.add(horn);
    }
  };

  switch (animalId) {
    case "rabbit": ears(0.7, 0.16, 0.05, c.fill); break;
    case "wolf": ears(0.34, 0.2, 0.5); break;
    case "tiger": ears(0.26, 0.22, 0.7); break;
    case "bear": {
      for (const s of [-1, 1] as const) {
        const ear = sphere(0.2, c.fill); ear.position.set(s * 0.4, 0.5, -0.1); g.add(ear);
      }
      break;
    }
    case "boar": {
      // tusks
      for (const s of [-1, 1] as const) {
        const tusk = cone(0.06, 0.4, "#e8e0c0", { rough: 0.3 });
        tusk.position.set(s * 0.18, -0.2, 0.55);
        tusk.rotation.set(0.6, 0, s * 0.3);
        g.add(tusk);
      }
      const snout = sphere(0.32, c.shade); snout.scale.set(1, 0.8, 0.9); snout.position.set(0, -0.1, 0.55); g.add(snout);
      break;
    }
    case "rhino": {
      const nose = cone(0.16, 0.7, c.accent, { rough: 0.4 });
      nose.position.set(0, 0.0, 0.7); nose.rotation.x = 1.3; g.add(nose);
      break;
    }
    case "eagle": {
      const beak = cone(0.18, 0.5, "#f0b020", { rough: 0.3 });
      beak.position.set(0, -0.05, 0.62); beak.rotation.x = 1.4; g.add(beak);
      break;
    }
    case "cobra": {
      // hood
      const hood = sphere(0.55, c.fill); hood.scale.set(1.5, 1.4, 0.3); hood.position.set(0, 0.1, -0.2); g.add(hood);
      break;
    }
    case "ant":
    case "scorpion": {
      // mandibles + antennae
      for (const s of [-1, 1] as const) {
        const m = cyl(0.03, 0.05, 0.4, c.shade); m.position.set(s * 0.18, -0.25, 0.5); m.rotation.x = 1.1; g.add(m);
      }
      if (animalId === "ant") for (const s of [-1, 1] as const) {
        const ant = cyl(0.02, 0.02, 0.5, c.accent); ant.position.set(s * 0.18, 0.6, 0.2); ant.rotation.z = -s * 0.4; g.add(ant);
      }
      break;
    }
    case "gorilla":
    case "gecko": horns(0.0001); break; // none — keep plain rounded head
    case "eel": {
      const fin = cone(0.12, 0.4, c.accent, { emissive: c.accent, emissiveI: 0.4 });
      fin.position.set(0, 0.6, -0.1); g.add(fin); break;
    }
    default: ears(0.3, 0.16, 0.4);
  }
  return g;
}

/** A limb pair: two angled cylinders + foot spheres, tinted by the donor. */
function buildLimbs(animalId: string, front: boolean): THREE.Group {
  const g = new THREE.Group();
  const c = colorsFor(animalId);
  const z = front ? 0.45 : -0.5;
  const len = front ? 1.15 : 1.25;

  if (front && animalId === "eagle") {
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

      wingGroup.position.set(s * 0.65, 0.2, -0.15);
      g.add(wingGroup);
    }
    return g;
  }

  for (const s of [-1, 1] as const) {
    const leg = cyl(0.14, 0.18, len, c.fill);
    leg.position.set(s * 0.55, -0.55, z);
    leg.castShadow = true;
    g.add(leg);
    const foot = sphere(0.2, c.shade);
    foot.scale.set(1, 0.7, 1.3);
    foot.position.set(s * 0.55, -0.55 - len / 2, z + 0.1);
    g.add(foot);
    // claws for predatory forelimbs
    if (front && ["bear", "tiger", "gorilla", "crab", "scorpion"].includes(animalId)) {
      for (const cl of [-1, 0, 1]) {
        const claw = cone(0.04, 0.18, c.accent, { rough: 0.3 });
        claw.position.set(s * 0.55 + cl * 0.07, -0.55 - len / 2 - 0.05, z + 0.28);
        claw.rotation.x = 1.2;
        g.add(claw);
      }
    }
  }
  return g;
}

/** TAIL — a tapered chain of spheres curving back, tinted by the donor. */
function buildTail(animalId: string): THREE.Group {
  const g = new THREE.Group();
  const c = colorsFor(animalId);
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    const t = i / (segs - 1);
    const seg = sphere(0.26 * (1 - t * 0.7), c.fill);
    seg.position.set(0, 0.1 + t * 0.25, -0.9 - t * 1.1);
    g.add(seg);
  }
  // stinger / tuft on the end for some animals
  if (["scorpion", "cobra"].includes(animalId)) {
    const tip = cone(0.12, 0.34, c.accent, { rough: 0.35 });
    tip.position.set(0, 0.55, -2.0); tip.rotation.x = -0.6; g.add(tip);
  } else if (["eel"].includes(animalId)) {
    const fin = cone(0.25, 0.5, c.accent, { emissive: c.accent, emissiveI: 0.5 });
    fin.position.set(0, 0.35, -2.1); fin.rotation.x = -1.4; g.add(fin);
  }
  return g;
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
    body: () => buildBody(genome.body),
    head: () => buildHead(genome.head),
    forelimbs: () => buildLimbs(genome.forelimbs, true),
    hindlimbs: () => buildLimbs(genome.hindlimbs, false),
    tail: () => buildTail(genome.tail),
  };

  for (const slot of SLOTS) {
    const part = builders[slot]();
    placements[slot](part);
    part.name = slot;
    root.add(part);
  }

  // a neck bridge in the body's colour to tie head to torso
  const neck = sphere(0.4, colorsFor(genome.body).fill);
  neck.name = "neck";
  neck.scale.set(0.8, 0.9, 0.8);
  neck.position.set(0, 1.85, 0.55);
  root.add(neck);

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

  let model = buildCreatureModel(genome);
  scene.add(model);

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

  container.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
  container.addEventListener("touchstart", onTouchStart);
  window.addEventListener("touchmove", onTouchMove);
  window.addEventListener("touchend", onMouseUp);

  let raf = 0;
  let t = 0;
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
    
    // Breathing & idle motions
    const body = model.getObjectByName("body");
    if (body) {
      const breathe = Math.sin(t * 2.5) * 0.02;
      body.scale.set(1.05 + breathe, 0.92 - breathe, 1.2 + breathe);
    }
    
    const head = model.getObjectByName("head");
    if (head) {
      head.rotation.x = Math.sin(t * 1.2) * 0.05;
    }

    const tail = model.getObjectByName("tail");
    if (tail) {
      tail.rotation.y = Math.sin(t * 3.2) * 0.15;
    }

    const wingR = model.getObjectByName("wing_r");
    const wingL = model.getObjectByName("wing_l");
    if (wingR && wingL) {
      const flap = Math.sin(t * 5) * 0.25;
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

    // Gentle hover
    model.position.y = Math.sin(t * 1.4) * 0.04 + 0.1;

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
      
      container.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      container.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onMouseUp);
      
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
