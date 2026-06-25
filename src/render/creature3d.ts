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
  return new THREE.Mesh(new THREE.SphereGeometry(r, 22, 18), mat(c, opts));
}
function cone(r: number, h: number, c: string, opts = {}) {
  return new THREE.Mesh(new THREE.ConeGeometry(r, h, 16), mat(c, opts));
}
function cyl(rt: number, rb: number, h: number, c: string, opts = {}) {
  return new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 16), mat(c, opts));
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
      // Rhino double horns
      const noseHorn = cone(0.16, 0.7, c.accent, { rough: 0.4 });
      noseHorn.position.set(0, 0.05, 0.7); noseHorn.rotation.x = 1.35; g.add(noseHorn);
      const smallHorn = cone(0.1, 0.34, c.accent, { rough: 0.4 });
      smallHorn.position.set(0, 0.32, 0.52); smallHorn.rotation.x = 1.25; g.add(smallHorn);
      break;
    }
    case "eagle": {
      const beak = cone(0.18, 0.5, "#f0b020", { rough: 0.3 });
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
      const hood = sphere(0.55, c.fill); hood.scale.set(1.5, 1.4, 0.3); hood.position.set(0, 0.1, -0.2); g.add(hood);
      // fangs
      for (const s of [-1, 1] as const) {
        const fang = cone(0.04, 0.22, "#ffffff");
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

      wingGroup.position.set(s * 0.65, 0.2, -0.15);
      g.add(wingGroup);
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

      const f1 = cone(0.08, 0.36, c.accent, { metal: 0.5, rough: 0.25 });
      f1.position.set(s * 1.15, -0.65, z + 0.36);
      f1.rotation.set(0.4, 0, -s * 0.5);
      legGroup.add(f1);

      const f2 = cone(0.06, 0.3, c.shade, { metal: 0.5, rough: 0.25 });
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

      const f1 = cone(0.06, 0.3, c.accent, { metal: 0.6, rough: 0.25 });
      f1.position.set(s * 1.1, -0.75, z + 0.42);
      f1.rotation.set(0.3, 0, -s * 0.3);
      legGroup.add(f1);

      const f2 = cone(0.05, 0.24, c.shade, { metal: 0.6, rough: 0.25 });
      f2.position.set(s * 0.9, -0.8, z + 0.38);
      f2.rotation.set(0.5, 0, s * 0.1);
      legGroup.add(f2);

      g.add(legGroup);
    }
    return g;
  }

  // Segmented insect legs for ants & scorpions (hindlimbs)
  if (["ant", "scorpion"].includes(animalId)) {
    for (const s of [-1, 1] as const) {
      const legGroup = new THREE.Group();
      
      const coxa = cyl(0.09, 0.09, 0.32, c.shade, { rough: 0.2 });
      coxa.position.set(s * 0.52, -0.4, z);
      coxa.rotation.z = s * 0.82;
      legGroup.add(coxa);

      const femur = cyl(0.065, 0.065, 0.82, c.fill, { rough: 0.2 });
      femur.position.set(s * 0.76, -0.72, z + 0.08);
      femur.rotation.z = s * 0.42;
      legGroup.add(femur);

      const tibia = cyl(0.045, 0.032, 0.92, c.shade, { rough: 0.2 });
      tibia.position.set(s * 0.92, -1.22, z + 0.16);
      tibia.rotation.z = -s * 0.58;
      legGroup.add(tibia);

      g.add(legGroup);
    }
    return g;
  }

  // Hopping thighs for rabbit hindlimbs
  if (!front && animalId === "rabbit") {
    for (const s of [-1, 1] as const) {
      const legGroup = new THREE.Group();
      const thigh = sphere(0.36, c.fill, { rough: 0.78 });
      thigh.scale.set(0.9, 1.25, 0.9);
      thigh.position.set(s * 0.56, -0.42, z);
      legGroup.add(thigh);

      const foot = sphere(0.18, c.shade, { rough: 0.78 });
      foot.scale.set(0.8, 0.38, 1.45);
      foot.position.set(s * 0.56, -0.92, z + 0.22);
      legGroup.add(foot);

      g.add(legGroup);
    }
    return g;
  }

  // Gorilla muscular forelimbs
  if (front && animalId === "gorilla") {
    for (const s of [-1, 1] as const) {
      const leg = cyl(0.24, 0.32, 1.45, c.fill, { rough: 0.85 });
      leg.position.set(s * 0.64, -0.64, z + 0.08);
      leg.rotation.z = s * 0.14;
      leg.castShadow = true;
      g.add(leg);
      
      const fist = sphere(0.38, c.shade, { rough: 0.82 });
      fist.position.set(s * 0.64, -1.42, z + 0.24);
      g.add(fist);
    }
    return g;
  }

  // Default normal quad legs
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

  // Scorpion tail arching over body
  if (animalId === "scorpion") {
    const segments = 8;
    for (let i = 0; i < segments; i++) {
      const t = i / (segments - 1);
      const sz = 0.24 * (1 - t * 0.44);
      const seg = sphere(sz, i % 2 === 0 ? c.fill : c.shade, { rough: 0.35, metal: 0.5 });
      const angle = t * Math.PI * 1.12;
      const ty = Math.sin(angle) * 1.45;
      const tz = -Math.cos(angle) * 1.22 - 0.22;
      seg.position.set(0, 0.25 + ty, tz);
      seg.castShadow = true;
      g.add(seg);
      
      if (i === segments - 1) {
        const poisonBulb = sphere(0.18, c.accent, { rough: 0.22, metal: 0.65, emissive: c.accent, emissiveI: 0.55 });
        poisonBulb.position.set(0, 0.25 + ty + 0.14, tz + 0.14);
        g.add(poisonBulb);

        const needle = cone(0.04, 0.24, "#0f0f0f", { rough: 0.1 });
        needle.rotation.x = -1.25;
        needle.position.set(0, 0.25 + ty + 0.24, tz + 0.24);
        g.add(needle);
      }
    }
    return g;
  }

  // Cobra snake tail
  if (animalId === "cobra") {
    const segments = 8;
    for (let i = 0; i < segments; i++) {
      const t = i / (segments - 1);
      const seg = sphere(0.24 * (1 - t * 0.72), c.fill);
      const angle = Math.sin(t * Math.PI * 1.5) * 0.32;
      seg.position.set(angle, -t * 0.45, -0.8 - t * 1.35);
      seg.castShadow = true;
      g.add(seg);
    }
    return g;
  }

  // Eagle fan tail of feathers
  if (animalId === "eagle") {
    const tailGroup = new THREE.Group();
    for (let i = -2; i <= 2; i++) {
      const f = sphere(0.14, c.fill, { rough: 0.8 });
      f.scale.set(0.6, 0.04, 1.42);
      f.position.set(i * 0.13, 0.08, -1.22);
      f.rotation.set(-0.24, i * 0.11, 0);
      f.castShadow = true;
      tailGroup.add(f);
    }
    return tailGroup;
  }

  // Tiger long striped tail
  if (animalId === "tiger") {
    const segments = 8;
    for (let i = 0; i < segments; i++) {
      const t = i / (segments - 1);
      const seg = sphere(0.18 * (1 - t * 0.42), i % 2 === 0 ? c.fill : "#0d0d0d");
      seg.position.set(0, 0.08 - Math.sin(t * 1.48) * 0.48, -0.85 - t * 1.38);
      seg.castShadow = true;
      g.add(seg);
    }
    return g;
  }

  // Fluffy rabbit tail puff
  if (animalId === "rabbit") {
    const puff = sphere(0.24, c.accent, { rough: 0.85 });
    puff.position.set(0, 0.22, -0.92);
    g.add(puff);
    return g;
  }

  // Default tapered chain tail
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    const t = i / (segs - 1);
    const seg = sphere(0.26 * (1 - t * 0.7), c.fill);
    seg.position.set(0, 0.1 + t * 0.25, -0.9 - t * 1.1);
    g.add(seg);
  }
  // stinger / tuft on the end for some animals
  if (["cobra"].includes(animalId)) {
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
