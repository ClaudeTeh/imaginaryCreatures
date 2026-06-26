import type { BattleEvent, BattleResult, Side } from "../combat/combat";
import { sfxAbility, sfxDeath, sfxHeal, sfxHit, sfxRoar, sfxVocalize, startBattleMusic, startBiomeAmbient } from "./sound";
import { drawHead, drawBody, drawForelimbs, drawHindlimbs, drawTail } from "./creatureParts";
import * as THREE from "three";
import { buildCreatureModel, createSoftShadowMesh } from "./creature3d";
import type { Genome } from "../core/types";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

/** A short-lived line effect: jagged lightning, or a wavy leech tether. */
interface Beam {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  maxLife: number;
  color: string;
  width: number;
  kind: "lightning" | "tether";
}

/** A travelling shot (acid spit) that bursts on arrival. */
interface Projectile {
  x: number;
  y: number;
  tx: number;
  ty: number;
  vx: number;
  vy: number;
  color: string;
  trail: string;
  size: number;
  onHit: () => void;
}

interface FighterView {
  side: Side;
  name: string;
  emoji: string;
  partEmojis: Record<string, string>;
  genome: Record<string, string>;
  maxHp: number;
  displayHp: number;
  targetHp: number;
  x: number;
  baseX: number;
  shake: number;
  lunge: number;
  flash: number;
  /** 0→1: strike in progress — drives forelimb/head thrust */
  attackAnim: number;
  /** 0→1: just took damage — drives recoil lean */
  hitAnim: number;
}

interface FloatText {
  x: number;
  y: number;
  vy: number;
  life: number;
  text: string;
  color: string;
  size: number;
}

export interface BiomeConfig {
  skyHex: number;
  fogHex: number;
  fogDensity: number;
  floorHex: number;
  ambientHex: number;
  particleColor: string;
  particleKind: "leaf" | "streak" | "bubble" | "ember" | "dust";
}

const W = 960;
const H = 420;
const GROUND_Y = 300;

export function getBiome(bodyId: string): BiomeConfig {
  const forest: BiomeConfig = {
    skyHex: 0x060e06,
    fogHex: 0x0a1a0a,
    fogDensity: 0.014,
    floorHex: 0x1a2a10,
    ambientHex: 0x334422,
    particleColor: "#2d6e2d",
    particleKind: "leaf",
  };
  const sky: BiomeConfig = {
    skyHex: 0x04080f,
    fogHex: 0x080f20,
    fogDensity: 0.010,
    floorHex: 0x2a2a35,
    ambientHex: 0x223355,
    particleColor: "#c8d8ff",
    particleKind: "streak",
  };
  const ocean: BiomeConfig = {
    skyHex: 0x020a10,
    fogHex: 0x051520,
    fogDensity: 0.016,
    floorHex: 0x0f2530,
    ambientHex: 0x103040,
    particleColor: "#20c0a0",
    particleKind: "bubble",
  };
  const volcano: BiomeConfig = {
    skyHex: 0x0f0202,
    fogHex: 0x1a0505,
    fogDensity: 0.015,
    floorHex: 0x2a1008,
    ambientHex: 0x442010,
    particleColor: "#ff6020",
    particleKind: "ember",
  };
  const desert: BiomeConfig = {
    skyHex: 0x0f0a02,
    fogHex: 0x1a1205,
    fogDensity: 0.012,
    floorHex: 0x2a2010,
    ambientHex: 0x443320,
    particleColor: "#c0a040",
    particleKind: "dust",
  };

  const FOREST_IDS = new Set(["wolf", "bear", "gorilla", "tiger"]);
  const SKY_IDS = new Set(["eagle", "dragon"]);
  const OCEAN_IDS = new Set(["cobra", "eel", "jellyfish"]);
  const VOLCANO_IDS = new Set(["rhino", "boar", "scorpion"]);

  if (FOREST_IDS.has(bodyId)) return forest;
  if (SKY_IDS.has(bodyId)) return sky;
  if (OCEAN_IDS.has(bodyId)) return ocean;
  if (VOLCANO_IDS.has(bodyId)) return volcano;
  return desert;
}

/**
 * Replay a simulated battle on the canvas. Pure presentation — it consumes the
 * deterministic event log produced by the simulator, so what you see is exactly
 * what was computed.
 */
/** speedMult > 1 = faster, < 1 = slower, 0 = instant. */
export function playBattle(
  canvas: HTMLCanvasElement,
  result: BattleResult,
  onDone: (winner: Side | "draw") => void,
  speedMult = 1,
): () => void {
  const reduceMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  const instant = speedMult === 0 || reduceMotion;

  if (instant) {
    setTimeout(() => onDone(result.winner), 20);
    return () => {};
  }

  let ctx: CanvasRenderingContext2D | null = null;
  // Try to initialize WebGL for Three.js 3D rendering
  let use3D = false;
  let renderer3D: THREE.WebGLRenderer | null = null;
  let scene3D: THREE.Scene | null = null;
  let camera3D: THREE.PerspectiveCamera | null = null;
  let fighters3D: Record<Side, Fighter3D> | null = null;
  let arenaGroup: THREE.Group | null = null;
  let platform: THREE.Mesh | null = null;
  let platMat: THREE.MeshStandardMaterial | null = null;
  let ringGeo: THREE.TorusGeometry | null = null;
  let ringMat: THREE.MeshStandardMaterial | null = null;
  let flashWhiteMaterial: THREE.MeshBasicMaterial | null = null;
  let slowMoTimer = 0;
  let victoryTimer = 0;
  let stopMusic: () => void = () => {};
  let stopAmbient: () => void = () => {};

  let ambientLight: THREE.AmbientLight | null = null;
  let keyLight: THREE.DirectionalLight | null = null;
  let rimLight: THREE.DirectionalLight | null = null;
  let spotlight: THREE.SpotLight | null = null;

  interface Fighter3D {
    model: THREE.Group;
    shadow: THREE.Mesh;
    basePos: THREE.Vector3;
    shake: number;
    lunge: number;
    dodgeOffset: number;
    flash: number;
    time: number;
    actionState: "idle" | "windup" | "strike" | "recover" | "dodge";
    actionTimer: number;
    actionDuration: number;
    dodgeDir: number;
    blinkTimer: number;
    deathTimer: number;
    actionTimerAccumulator: number;
    vocalTimer: number;
    onHitCallback?: () => void;
  }

  interface Particle3D {
    mesh: THREE.Mesh;
    velocity: THREE.Vector3;
    life: number;
    decay: number;
  }

  interface Projectile3D {
    mesh: THREE.Mesh;
    start: THREE.Vector3;
    end: THREE.Vector3;
    progress: number;
    speed: number;
    colorHex: string;
    onHit: () => void;
  }

  interface Beam3D {
    line: THREE.Line;
    life: number;
    maxLife: number;
    kind: "lightning" | "tether" | "tether_1" | "tether_2";
    x1: number; y1: number; z1: number;
    x2: number; y2: number; z2: number;
  }

  interface Float3D {
    sprite: THREE.Sprite;
    velocity: THREE.Vector3;
    life: number;
    decay: number;
  }

  const activeParticles3D: Particle3D[] = [];

  interface BiomeParticle {
    mesh: THREE.Points;
    velocities: Float32Array;  // [vx, vy, vz] per particle
    count: number;
  }
  let biomeParticleSystem: BiomeParticle | null = null;

  const activeProjectiles3D: Projectile3D[] = [];
  const activeBeams3D: Beam3D[] = [];
  const activeFloats3D: Float3D[] = [];

  let hudOverlay: HTMLElement | null = null;
  let speedLinesCanvas: HTMLCanvasElement | null = null;

  const starts = result.events.filter((e) => e.kind === "start") as Extract<
    BattleEvent,
    { kind: "start" }
  >[];
  const sa = starts.find((s) => s.side === "a")!;
  const sb = starts.find((s) => s.side === "b")!;

  const fighters: Record<Side, FighterView> = {
    a: mkView("a", sa, 250),
    b: mkView("b", sb, W - 250),
  };

  const floats: FloatText[] = [];
  const particles: Particle[] = [];
  const beams: Beam[] = [];
  const projectiles: Projectile[] = [];
  let camShake = 0;
  const ordered = [...result.events].sort((x, y) => x.t - y.t);
  let cursor = 0;
  let currentTick = 0;
  const durationFrames = clamp(Math.round(clamp(result.ticks, 450, 950) / speedMult), 1, 2400);
  const ticksPerFrame = result.ticks / durationFrames;
  let raf = 0;
  let frame = 0;
  let finished = false;

  interface CinematicState {
    active: boolean;
    casterSide: Side;
    timer: number;
    duration: number;
    ability: string;
    value: number;
    targetHp?: number;
    onComplete?: () => void;
  }
  let cinematic: CinematicState = { active: false, casterSide: "a", timer: 0, duration: 0, ability: "", value: 0 };

  const introDuration = 60; // frames for camera fly-in

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

  try {
    renderer3D = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer3D.setSize(W, H);
    renderer3D.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer3D.shadowMap.enabled = true;
    renderer3D.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer3D.toneMapping = THREE.ACESFilmicToneMapping;
    renderer3D.toneMappingExposure = 1.25;

    const biome = getBiome(sa.genome.body);
    scene3D = new THREE.Scene();
    scene3D.background = new THREE.Color(biome.skyHex);
    scene3D.fog = new THREE.FogExp2(biome.fogHex, biome.fogDensity);

    camera3D = new THREE.PerspectiveCamera(38, W / H, 0.1, 100);
    camera3D.position.set(0, 14, 22); // Start back for intro fly-in
    camera3D.lookAt(0, 1.2, 0);

    ambientLight = new THREE.AmbientLight(biome.ambientHex, 0.9);
    scene3D.add(ambientLight);

    keyLight = new THREE.DirectionalLight(0xffedd5, 1.5);
    keyLight.position.set(-6, 12, 8);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    scene3D.add(keyLight);

    rimLight = new THREE.DirectionalLight(0x9b6cff, 0.8);
    rimLight.position.set(6, 4, -6);
    scene3D.add(rimLight);

    spotlight = new THREE.SpotLight(0xffffff, 0, 18, Math.PI / 4, 0.5, 1);
    spotlight.position.set(0, 10, 0);
    spotlight.castShadow = true;
    scene3D.add(spotlight);

    // Volumetric Stadium Light Rays
    const rayCount = 3;
    const rayGeo = new THREE.CylinderGeometry(0.3, 1.2, 14, 16, 1, true);
    const rayMat = new THREE.MeshBasicMaterial({
      color: 0x7aa2ff,
      transparent: true,
      opacity: 0.12,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    for (let i = 0; i < rayCount; i++) {
      const ray = new THREE.Mesh(rayGeo, rayMat);
      ray.position.set(-6 + i * 6 + (Math.random() - 0.5) * 2, 7, -3 + (Math.random() - 0.5) * 2);
      ray.rotation.z = (Math.random() - 0.5) * 0.15;
      ray.rotation.x = (Math.random() - 0.5) * 0.15;
      ray.name = `light_ray_${i}`;
      scene3D.add(ray);
    }

    // Arena Floor
    arenaGroup = new THREE.Group();
    const platGeo = new THREE.CylinderGeometry(10, 10.5, 0.8, 64);
    platMat = new THREE.MeshStandardMaterial({ color: biome.floorHex, metalness: 0.8, roughness: 0.3 });
    platform = new THREE.Mesh(platGeo, platMat);
    platform.position.y = -0.4;
    platform.receiveShadow = true;
    arenaGroup.add(platform);

    ringGeo = new THREE.TorusGeometry(10.2, 0.1, 16, 64);
    ringMat = new THREE.MeshStandardMaterial({
      color: 0x7aa2ff,
      emissive: 0x7aa2ff,
      emissiveIntensity: 1.2,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.01;
    arenaGroup.add(ring);
    scene3D.add(arenaGroup);
    spawnBiomeParticles(scene3D, biome);

    const biomeName =
      biome.particleKind === "leaf"    ? "forest" :
      biome.particleKind === "streak"  ? "sky" :
      biome.particleKind === "bubble"  ? "ocean" :
      biome.particleKind === "ember"   ? "volcano" : "desert";
    stopMusic = startBattleMusic(biomeName);
    stopAmbient = startBiomeAmbient(biomeName);

    // Build 3D models from genomes
    const shadowA = createSoftShadowMesh();
    const shadowB = createSoftShadowMesh();
    scene3D.add(shadowA);
    scene3D.add(shadowB);

    fighters3D = {
      a: {
        model: buildCreatureModel(sa.genome as unknown as Genome),
        shadow: shadowA,
        basePos: new THREE.Vector3(-4, 0, 0.5),
        shake: 0,
        lunge: 0,
        dodgeOffset: 0,
        flash: 0,
        time: 0,
        actionState: "idle",
        actionTimer: 0,
        actionDuration: 0,
        dodgeDir: 0,
        blinkTimer: 0,
        deathTimer: 0,
        actionTimerAccumulator: 0,
        vocalTimer: Math.floor(Math.random() * 300 + 200),
      },
      b: {
        model: buildCreatureModel(sb.genome as unknown as Genome),
        shadow: shadowB,
        basePos: new THREE.Vector3(4, 0, -0.5),
        shake: 0,
        lunge: 0,
        dodgeOffset: 0,
        flash: 0,
        time: Math.PI,
        actionState: "idle",
        actionTimer: 0,
        actionDuration: 0,
        dodgeDir: 0,
        blinkTimer: 0,
        deathTimer: 0,
        actionTimerAccumulator: 0,
        vocalTimer: Math.floor(Math.random() * 300 + 350),
      },
    };

    fighters3D.a.model.position.copy(fighters3D.a.basePos);
    fighters3D.a.model.rotation.y = Math.PI / 2 - 0.4;
    scene3D.add(fighters3D.a.model);

    fighters3D.b.model.position.copy(fighters3D.b.basePos);
    fighters3D.b.model.rotation.y = -Math.PI / 2 + 0.4;
    scene3D.add(fighters3D.b.model);

    // Setup HUD HTML Overlay
    hudOverlay = document.createElement("div");
    hudOverlay.className = "arena-hud-overlay";
    hudOverlay.style.position = "absolute";
    hudOverlay.style.top = "20px";
    hudOverlay.style.left = "0";
    hudOverlay.style.right = "0";
    hudOverlay.style.pointerEvents = "none";
    hudOverlay.style.display = "flex";
    hudOverlay.style.justifyContent = "space-between";
    hudOverlay.style.padding = "0 40px";
    hudOverlay.style.fontFamily = "Inter, system-ui, sans-serif";
    
    hudOverlay.innerHTML = `
      <div class="hud-bar player-hud" style="background: rgba(12,18,34,0.85); border: 1px solid rgba(122,162,255,0.25); border-radius: 12px; padding: 12px 20px; width: 320px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); backdrop-filter: blur(8px);">
        <div class="hud-name" style="font-weight: 700; font-size: 15px; color: #e7ecf7; margin-bottom: 6px;">${sa.name}</div>
        <div class="hud-hp-bg" style="background: #0c1222; border-radius: 9px; height: 18px; overflow: hidden; width: 100%;">
          <div class="hud-hp-fill" style="background: linear-gradient(90deg, #36c08a, #6ce5b1); height: 100%; width: 100%; transition: width 0.2s ease;"></div>
        </div>
        <div class="hud-text" style="font-size: 12px; color: #93a0bd; margin-top: 4px; text-align: right;">${sa.maxHp}/${sa.maxHp}</div>
      </div>
      <div class="hud-bar opponent-hud" style="background: rgba(12,18,34,0.85); border: 1px solid rgba(122,162,255,0.25); border-radius: 12px; padding: 12px 20px; width: 320px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); backdrop-filter: blur(8px);">
        <div class="hud-name" style="font-weight: 700; font-size: 15px; color: #e7ecf7; margin-bottom: 6px; text-align: right;">${sb.name}</div>
        <div class="hud-hp-bg" style="background: #0c1222; border-radius: 9px; height: 18px; overflow: hidden; width: 100%;">
          <div class="hud-hp-fill" style="background: linear-gradient(90deg, #36c08a, #6ce5b1); height: 100%; width: 100%; transition: width 0.2s ease;"></div>
        </div>
        <div class="hud-text" style="font-size: 12px; color: #93a0bd; margin-top: 4px; text-align: left;">${sb.maxHp}/${sb.maxHp}</div>
      </div>
    `;
    canvas.parentElement?.style.setProperty("position", "relative");
    canvas.parentElement?.appendChild(hudOverlay);

    speedLinesCanvas = document.createElement("canvas");
    speedLinesCanvas.width = W;
    speedLinesCanvas.height = H;
    speedLinesCanvas.style.position = "absolute";
    speedLinesCanvas.style.top = "0";
    speedLinesCanvas.style.left = "0";
    speedLinesCanvas.style.pointerEvents = "none";
    speedLinesCanvas.style.display = "none";
    canvas.parentElement?.appendChild(speedLinesCanvas);

    use3D = true;
  } catch (e) {
    console.warn("WebGL not supported, falling back to 2D canvas:", e);
    use3D = false;
    ctx = canvas.getContext("2d");
    if (ctx) {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.scale(dpr, dpr);
    }
  }

  function step() {
    frame++;

    let timeScale = 1.0;
    if (use3D && slowMoTimer > 0) {
      slowMoTimer--;
      timeScale = 0.28;
    }

    if (use3D && fighters3D && scene3D && victoryTimer > 0 && victoryTimer <= 60) {
      victoryTimer++;
      const winningSide = result.winner as Side;
      const winner3D = fighters3D[winningSide];
      winner3D.model.position.y = Math.abs(Math.sin(victoryTimer * 0.25)) * 0.8;
      if (victoryTimer === 5) {
        spawnBurst3D(winner3D.model.position, "#ffd700", 25, 0.18);
        spawnImpactRing3D(winner3D.model.position, "#ffd700");
      }
      if (victoryTimer === 20) {
        spawnBurst3D(winner3D.model.position, "#c8a84b", 15, 0.14);
      }
      if (victoryTimer === 61) {
        winner3D.model.position.y = 0;
        victoryTimer = 0;
        if (!finished) {
          finished = true;
          if (hudOverlay) {
            hudOverlay.remove();
            hudOverlay = null;
          }
          onDone(result.winner);
        }
      }
    }

    if (use3D && cinematic.active) {
      // Pause simulation progress during cinematic animations, but let frame advance
    } else {
      currentTick += ticksPerFrame * timeScale;
      while (cursor < ordered.length && ordered[cursor].t <= currentTick) {
        applyEvent(ordered[cursor]);
        cursor++;
      }
    }

    if (use3D && fighters3D && renderer3D && scene3D && camera3D) {
      // 3D Rendering Update step
      
      // Interpolate HP display values
      for (const side of ["a", "b"] as Side[]) {
        fighters[side].displayHp += (fighters[side].targetHp - fighters[side].displayHp) * 0.25;
      }

      // Camera Intro & Cinematic state updates
      if (frame < introDuration) {
        const tIntro = frame / introDuration;
        const ease = tIntro * (2 - tIntro);
        camera3D.position.set(0, 14 - ease * 6.5, 22 - ease * 7.5);
        camera3D.lookAt(0, 1.2, 0);
        if (speedLinesCanvas) speedLinesCanvas.style.display = "none";
      } else if (cinematic.active) {
        cinematic.timer++;
        const progress = cinematic.timer / cinematic.duration;
        const caster = fighters3D[cinematic.casterSide];
        
        // 1. Camera Zoom close-up on caster
        const targetCamPos = caster.basePos.clone().add(new THREE.Vector3(cinematic.casterSide === "a" ? 2.5 : -2.5, 2.2, 5.0));
        const targetLookAt = caster.basePos.clone().add(new THREE.Vector3(0, 1.4, 0));
        
        camera3D.position.lerp(targetCamPos, 0.12);
        camera3D.lookAt(new THREE.Vector3(0, 1.2, 0).lerp(targetLookAt, 0.5));

        // Draw radial speed lines to amplify velocity
        if (speedLinesCanvas) {
          speedLinesCanvas.style.display = "block";
          drawSpeedLines(speedLinesCanvas);
        }
        
        // 2. Dim background, raise caster spotlight
        spotlight!.target = caster.model;
        ambientLight!.intensity = 0.9 * (1.0 - Math.sin(progress * Math.PI) * 0.85);
        keyLight!.intensity = 1.5 * (1.0 - Math.sin(progress * Math.PI) * 0.9);
        rimLight!.intensity = 0.8 * (1.0 - Math.sin(progress * Math.PI) * 0.8);
        spotlight!.intensity = Math.sin(progress * Math.PI) * 4.5;

        // Swirl charge particles on caster
        if (cinematic.timer % 3 === 0 && progress < 0.8) {
          const col = cinematic.ability === "spit" ? "#39ff14" : (cinematic.ability === "shock" ? "#c39bff" : (cinematic.ability === "leech" ? "#ff3b30" : "#ffae19"));
          spawnSwirlParticle3D(caster.model.position, col);
        }

        if (cinematic.timer >= cinematic.duration) {
          cinematic.active = false;
          if (cinematic.onComplete) {
            cinematic.onComplete();
          }
          spotlight!.intensity = 0;
        }
      } else {
        if (speedLinesCanvas) speedLinesCanvas.style.display = "none";

        // Dynamic Combat Camera: pan slightly based on active lunges
        const targetCamPos = new THREE.Vector3(0, 7.5, 14.5);
        const targetLookAt = new THREE.Vector3(0, 1.2, 0);

        const actA = fighters3D.a.actionState;
        const actB = fighters3D.b.actionState;

        if (actA === "windup" || actA === "strike") {
          targetCamPos.add(new THREE.Vector3(0.8, -0.4, -0.6));
          targetLookAt.add(new THREE.Vector3(0.5, 0, 0));
        } else if (actB === "windup" || actB === "strike") {
          targetCamPos.add(new THREE.Vector3(-0.8, -0.4, -0.6));
          targetLookAt.add(new THREE.Vector3(-0.5, 0, 0));
        }

        camera3D.position.lerp(targetCamPos, 0.08);
        camera3D.lookAt(targetLookAt);

        // Restore lighting
        ambientLight!.intensity += (0.9 - ambientLight!.intensity) * 0.1;
        keyLight!.intensity += (1.5 - keyLight!.intensity) * 0.1;
        rimLight!.intensity += (0.8 - rimLight!.intensity) * 0.1;
        spotlight!.intensity += (0 - spotlight!.intensity) * 0.1;

        if (camShake > 0.01) {
          camShake *= 0.85;
          const sx = (Math.random() - 0.5) * camShake;
          const sy = (Math.random() - 0.5) * camShake * 0.5;
          camera3D.position.add(new THREE.Vector3(sx, sy, 0));
        }
      }

      // Update active 3D projectiles
      for (let i = activeProjectiles3D.length - 1; i >= 0; i--) {
        const pr = activeProjectiles3D[i];
        pr.progress += pr.speed * timeScale;
        if (pr.progress >= 1.0) {
          scene3D.remove(pr.mesh);
          pr.mesh.geometry.dispose();
          (pr.mesh.material as THREE.Material).dispose();
          pr.onHit();
          activeProjectiles3D.splice(i, 1);
        } else {
          const current = new THREE.Vector3().lerpVectors(pr.start, pr.end, pr.progress);
          current.y += Math.sin(pr.progress * Math.PI) * 1.5;
          pr.mesh.position.copy(current);
          
          // Emit trail particles
          const trailGeo = new THREE.SphereGeometry(0.04, 4, 4);
          const trailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(pr.colorHex), transparent: true, opacity: 0.7 });
          const trailMesh = new THREE.Mesh(trailGeo, trailMat);
          trailMesh.position.copy(current);
          scene3D.add(trailMesh);
          activeParticles3D.push({
            mesh: trailMesh,
            velocity: new THREE.Vector3((Math.random() - 0.5) * 0.01, 0.01, (Math.random() - 0.5) * 0.01),
            life: 0.4,
            decay: 0.04 * timeScale,
          });
        }
      }

      // Update active 3D particles
      for (let i = activeParticles3D.length - 1; i >= 0; i--) {
        const p = activeParticles3D[i];
        p.mesh.position.addScaledVector(p.velocity, timeScale);
        if (p.mesh.geometry.type === "RingGeometry") {
          p.mesh.scale.addScalar(0.14 * timeScale);
        } else if (p.mesh.geometry.type === "IcosahedronGeometry") {
          p.mesh.scale.addScalar(0.015 * timeScale);
        } else if (p.mesh.geometry.type === "BoxGeometry") {
          p.velocity.y -= 0.005 * timeScale; // gravity for debris
          p.mesh.rotation.x += 0.04 * timeScale;
          p.mesh.rotation.y += 0.06 * timeScale;
          if (p.mesh.position.y < 0.05 && p.velocity.y < 0) {
            p.mesh.position.y = 0.05;
            p.velocity.y = -p.velocity.y * 0.45; // bounce!
            p.velocity.x *= 0.6;
            p.velocity.z *= 0.6;
          }
        } else {
          if ((p.mesh.material as THREE.MeshBasicMaterial).color.getHexString() === "b0b6c2") {
            p.mesh.scale.addScalar(0.06 * timeScale);
          }
          p.velocity.y -= 0.003 * timeScale; // gravity
        }
        p.life -= p.decay * timeScale;
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, p.life);
        if (p.life <= 0) {
          scene3D.remove(p.mesh);
          p.mesh.geometry.dispose();
          (p.mesh.material as THREE.Material).dispose();
          activeParticles3D.splice(i, 1);
        }
      }

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

      // Update active 3D beams
      for (let i = activeBeams3D.length - 1; i >= 0; i--) {
        const b = activeBeams3D[i];
        b.life--;
        if (b.life <= 0) {
          scene3D.remove(b.line);
          b.line.geometry.dispose();
          (b.line.material as THREE.Material).dispose();
          activeBeams3D.splice(i, 1);
          continue;
        }
        
        const posAttr = b.line.geometry.attributes.position as THREE.BufferAttribute;
        const segs = 10;
        const dx = b.x2 - b.x1;
        const dy = b.y2 - b.y1;
        const dz = b.z2 - b.z1;
        
        if (b.kind === "tether_1" || b.kind === "tether_2") {
          const D = new THREE.Vector3(dx, dy, dz);
          D.normalize();
          const U = new THREE.Vector3(0, 1, 0).cross(D);
          if (U.lengthSq() < 0.001) {
            U.copy(new THREE.Vector3(1, 0, 0).cross(D));
          }
          U.normalize();
          const V = new THREE.Vector3().crossVectors(D, U).normalize();
          
          for (let j = 0; j <= segs; j++) {
            const tt = j / segs;
            const coreX = b.x1 + dx * tt;
            const coreY = b.y1 + dy * tt;
            const coreZ = b.z1 + dz * tt;
            const angle = tt * Math.PI * 5.5 + frame * 0.24 + (b.kind === "tether_2" ? Math.PI : 0);
            const rad = 0.25 * Math.sin(tt * Math.PI);
            const px = coreX + (U.x * Math.cos(angle) + V.x * Math.sin(angle)) * rad;
            const py = coreY + (U.y * Math.cos(angle) + V.y * Math.sin(angle)) * rad;
            const pz = coreZ + (U.z * Math.cos(angle) + V.z * Math.sin(angle)) * rad;
            posAttr.setXYZ(j, px, py, pz);
          }
        } else {
          const len = Math.hypot(dx, dy, dz) || 1;
          const nx = -dy / len;
          const ny = dx / len;
          for (let j = 0; j <= segs; j++) {
            const tt = j / segs;
            const px = b.x1 + dx * tt;
            const py = b.y1 + dy * tt;
            const pz = b.z1 + dz * tt;
            let off = 0;
            if (b.kind === "lightning") {
              off = (Math.random() - 0.5) * 0.5 * Math.sin(tt * Math.PI);
            } else {
              off = Math.sin(tt * Math.PI * 3 + frame * 0.4) * 0.2 * Math.sin(tt * Math.PI);
            }
            posAttr.setXYZ(j, px + nx * off, py + ny * off, pz);
          }
        }
        posAttr.needsUpdate = true;
      }

      // Update active 3D floats
      for (let i = activeFloats3D.length - 1; i >= 0; i--) {
        const f = activeFloats3D[i];
        f.sprite.position.add(f.velocity);
        f.velocity.y -= 0.001;
        f.life -= f.decay;
        f.sprite.material.opacity = f.life;
        if (f.life <= 0) {
          scene3D.remove(f.sprite);
          f.sprite.material.map?.dispose();
          f.sprite.material.dispose();
          activeFloats3D.splice(i, 1);
        }
      }

      // Pulse arena platform ring
      if (arenaGroup) {
        const pulse = 0.5 + Math.sin(frame * 0.08) * 0.3;
        arenaGroup.children.forEach(child => {
          if (child instanceof THREE.Mesh) {
            const mat = child.material as THREE.MeshStandardMaterial;
            if (mat && mat.emissiveIntensity !== undefined) {
              mat.emissiveIntensity = pulse * 1.5;
            }
          }
        });
      }

      // Animate volumetric light rays
      for (let i = 0; i < 3; i++) {
        const ray = scene3D.getObjectByName(`light_ray_${i}`);
        if (ray instanceof THREE.Mesh) {
          ray.rotation.y += 0.003;
          (ray.material as THREE.MeshBasicMaterial).opacity = 0.1 + Math.sin(frame * 0.02 + i) * 0.04;
        }
      }

      // Intro drop-in landing check & shake
      if (frame === introDuration) {
        camShake = 1.8;
        spawnDustCloud3D(fighters3D.a.model.position, 18);
        spawnDustCloud3D(fighters3D.b.model.position, 18);
        spawnGroundCrack3D(fighters3D.a.model.position, 1.2);
        spawnGroundCrack3D(fighters3D.b.model.position, 1.2);
        spawnDebris3D(fighters3D.a.model.position, 8);
        spawnDebris3D(fighters3D.b.model.position, 8);
        sfxRoar();
      }

      // Soundwave cries from mouths during roar
      if (frame >= introDuration && frame < introDuration + 30 && frame % 10 === 0) {
        for (const sName of ["a", "b"] as Side[]) {
          const fObj = fighters3D[sName];
          const headPart = fObj.model.getObjectByName("head");
          if (headPart) {
            const mouthPos = new THREE.Vector3();
            headPart.getWorldPosition(mouthPos);
            mouthPos.z += sName === "a" ? 0.5 : -0.5;
            spawnSoundwaveRing3D(mouthPos, "#c39bff");
          }
        }
      }

      // Update 3D fighter models
      for (const side of ["a", "b"] as Side[]) {
        const f = fighters3D[side];
        const fView = fighters[side];
        const otherSide = side === "a" ? "b" : "a";
        const targetF = fighters3D[otherSide];

        f.time += 0.016 * timeScale;

        // Idle vocalization — random soundwave rings every 8-15 seconds
        if (fView.displayHp > 0.5 && frame > introDuration + 60 && f.actionState === "idle") {
          f.vocalTimer -= timeScale;
          if (f.vocalTimer <= 0) {
            const headPart = f.model.getObjectByName("head");
            if (headPart) {
              const mouthPos = new THREE.Vector3();
              headPart.getWorldPosition(mouthPos);
              mouthPos.z += side === "a" ? 0.5 : -0.5;
              const vocalColor = fView.genome.body === "eel" ? "#50e8d0"
                : fView.genome.body === "cobra" ? "#a8e030"
                : fView.genome.body === "dragon" ? "#ff6030"
                : fView.genome.body === "jellyfish" ? "#b060ff"
                : "#e8d8a0";
              spawnSoundwaveRing3D(mouthPos, vocalColor);
              sfxVocalize(vocalColor);
            }
            f.vocalTimer = Math.floor(Math.random() * 300 + 480);
          }
        }

        // Action State machine transitions (tick-based)
        f.actionTimerAccumulator += timeScale;
        let elapsedTicks = 0;
        if (f.actionTimerAccumulator >= 1.0) {
          elapsedTicks = Math.floor(f.actionTimerAccumulator);
          f.actionTimerAccumulator -= elapsedTicks;
        }

        for (let tick = 0; tick < elapsedTicks; tick++) {
          if (f.actionState === "windup") {
            f.actionTimer++;
            if (f.actionTimer >= f.actionDuration) {
              f.actionState = "strike";
              f.actionTimer = 0;
              f.actionDuration = 5;
              // Takeoff lunge dust cloud!
              spawnDustCloud3D(f.model.position, 8);
            }
          } else if (f.actionState === "strike") {
            f.actionTimer++;

            // --- Genome-specific mid-strike VFX trails ---
            const fvStrike = fView;
            const isAvianStrike   = fvStrike.genome.forelimbs === "eagle" || fvStrike.genome.body === "eagle" || fvStrike.genome.body === "dragon";
            const isClawStrike    = ["crab", "scorpion", "eagle"].includes(fvStrike.genome.forelimbs);
            const isGorillaStrike = fvStrike.genome.forelimbs === "gorilla";
            const isSerpStrike    = ["cobra", "eel", "jellyfish"].includes(fvStrike.genome.body);

            if (isAvianStrike && Math.random() < 0.7) {
              spawnSpeedLine3D(f.model.position, side);
            }
            if (isGorillaStrike && f.actionTimer === 1) {
              spawnDustCloud3D(f.model.position, 18);
            }
            if (isSerpStrike && Math.random() < 0.4) {
              spawnBurst3D(f.model.position.clone().add(new THREE.Vector3(0, 0.4, 0)), "#39ff14", 3, 0.07);
            }

            if (f.actionTimer >= f.actionDuration) {
              if (f.onHitCallback) {
                f.onHitCallback();
                f.onHitCallback = undefined;
              }
              // Spawn claw slash on hit frame
              if (isClawStrike) {
                spawnClawSlash3D(f.model.position, side);
              }
              f.actionState = "recover";
              f.actionTimer = 0;
              f.actionDuration = 18;
            }
          } else if (f.actionState === "recover") {
            f.actionTimer++;
            if (f.actionTimer >= f.actionDuration) {
              f.actionState = "idle";
              f.actionTimer = 0;
            }
          } else if (f.actionState === "dodge") {
            f.actionTimer++;
            if (f.actionTimer >= f.actionDuration) {
              f.actionState = "idle";
              f.actionTimer = 0;
            }
          } else {
            // Random idle side-steps/dodges
            if (Math.random() < 0.003 && fView.displayHp > 0.5) {
              f.actionState = "dodge";
              f.actionTimer = 0;
              f.actionDuration = 24;
              f.dodgeDir = Math.random() < 0.5 ? 1 : -1;
            }
          }
        }

        // Sub-frame interpolated positioning and rotations
        const smoothActionTimer = f.actionTimer + f.actionTimerAccumulator;
        if (f.actionState === "windup") {
          const progress = Math.min(1.0, smoothActionTimer / f.actionDuration);
          f.lunge = -0.4 * progress;
          f.model.rotation.z = side === "a" ? -0.12 : 0.12;
        } else if (f.actionState === "strike") {
          const progress = Math.min(1.0, smoothActionTimer / f.actionDuration);
          f.lunge = -0.4 + 2.2 * progress;
          f.model.rotation.z = side === "a" ? 0.22 : -0.22;
        } else if (f.actionState === "recover") {
          const progress = Math.min(1.0, smoothActionTimer / f.actionDuration);
          f.lunge = 1.8 * (1 - progress * (2 - progress));
          f.model.rotation.z = 0;
        } else if (f.actionState === "dodge") {
          const half = f.actionDuration / 2;
          if (smoothActionTimer < half) {
            f.dodgeOffset = f.dodgeDir * 1.5 * (smoothActionTimer / half);
          } else {
            f.dodgeOffset = f.dodgeDir * 1.5 * (1 - (smoothActionTimer - half) / half);
          }
        } else {
          f.lunge = 0;
          f.dodgeOffset = 0;
        }

        const dirVec = targetF.basePos.clone().sub(f.basePos).normalize();
        const perpVec = new THREE.Vector3(-dirVec.z, 0, dirVec.x).normalize();

        let shakeX = 0;
        let shakeY = 0;
        if (f.shake > 0.01) {
          f.shake *= 0.90;
          shakeX = (Math.random() - 0.5) * f.shake;
          shakeY = (Math.random() - 0.5) * f.shake * 0.4;
        }

        const currentPos = f.basePos.clone()
          .add(dirVec.multiplyScalar(f.lunge))
          .add(perpVec.multiplyScalar(f.dodgeOffset))
          .add(new THREE.Vector3(shakeX, shakeY, 0));

        const alive = fView.displayHp > 0.5;
        
        const isAvian = fView.genome.forelimbs === "eagle" || fView.genome.body === "eagle" || fView.genome.body === "dragon";
        const isSerpentine = fView.genome.body === "cobra" || fView.genome.body === "eel" || fView.genome.body === "jellyfish";
        const isHeavyMammal = ["bear", "rhino", "gorilla", "boar"].includes(fView.genome.body);
        const isInsect = ["ant", "scorpion", "crab"].includes(fView.genome.body);

        const isClawSwipe = fView.genome.forelimbs === "crab" || fView.genome.forelimbs === "scorpion";
        const isAvianDive = fView.genome.forelimbs === "eagle";
        const isTailWhip = ["scorpion", "cobra", "eel", "tiger", "dragon", "jellyfish"].includes(fView.genome.tail);
        const isBiteSlam = ["boar", "wolf", "bear", "rhino", "cobra", "dragon"].includes(fView.genome.head);
        const isGorillaSlam = fView.genome.forelimbs === "gorilla";

        if (alive) {
          if (frame < introDuration) {
            // Drop-in animation from Y=8 to Y=0.1
            const progress = frame / introDuration;
            const dropY = 8.0 * (1.0 - progress * progress);
            currentPos.y += dropY + 0.1;
          } else {
            let hoverY = Math.sin(f.time * 2.5) * 0.08 + 0.1;
            if (isAvian) {
              hoverY = Math.sin(f.time * 2.2) * 0.15 + 0.35;
            } else if (isSerpentine) {
              hoverY = Math.sin(f.time * 1.8) * 0.03 + 0.1;
            } else if (isHeavyMammal) {
              hoverY = 0.05;
            } else if (isInsect) {
              hoverY = 0.02 + Math.sin(f.time * 4.5) * 0.01;
            }
            currentPos.y += hoverY;

            // Combat height modifications based on strike type
            if (f.actionState === "windup") {
              const progress = f.actionTimer / f.actionDuration;
              if (isAvianDive) {
                currentPos.y += progress * 1.4;
              } else if (isGorillaSlam) {
                currentPos.y += progress * 0.8;
              }
            } else if (f.actionState === "strike") {
              const progress = f.actionTimer / f.actionDuration;
              if (isAvianDive) {
                // Swoop curve
                currentPos.y += 1.4 * (1.0 - progress) + Math.sin(progress * Math.PI) * 0.5;
              } else if (isGorillaSlam) {
                currentPos.y += 0.8 * (1.0 - progress);
              }
            }
          }
        } else {
          f.deathTimer++;
          const collapsePos = Math.min(1.0, f.deathTimer / 30);
          currentPos.y = 0.1 - collapsePos * 0.7;
          f.model.rotation.z = (side === "a" ? -0.8 : 0.8) * Math.min(1.0, f.deathTimer / 15);
          
          f.model.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (mesh.isMesh && mesh.material) {
              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              mats.forEach((mat) => {
                mat.transparent = true;
                mat.opacity = Math.max(0, 1.0 - (f.deathTimer - 15) / 35);
              });
            }
          });

          const battleActive = cursor < ordered.length || frame <= durationFrames;
          if (battleActive && Math.random() < 0.1) {
            spawnBurst3D(f.model.position, "#555555", 3, 0.03);
          }
        }

        f.model.position.copy(currentPos);

        // Update soft shadow plane
        if (f.shadow) {
          f.shadow.position.set(currentPos.x, 0.19, currentPos.z);
          const sHeight = currentPos.y;
          const sScale = Math.max(0.2, 1.2 - sHeight * 0.8);
          f.shadow.scale.set(sScale, sScale, 1);
          if (alive) {
            (f.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.1, 0.55 - sHeight * 0.65);
          } else {
            (f.shadow.material as THREE.MeshBasicMaterial).transparent = true;
            (f.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.55 - f.deathTimer / 30);
          }
        }

        // Apply visual orientations based on combat strike state
        const defaultRotY = side === "a" ? Math.PI / 2 - 0.4 : -Math.PI / 2 + 0.4;
        if (alive) {
          if (f.actionState === "strike" && isTailWhip) {
            const progress = f.actionTimer / f.actionDuration;
            f.model.rotation.y = defaultRotY + Math.sin(progress * Math.PI) * Math.PI * (side === "a" ? 2 : -2);
          } else {
            f.model.rotation.y += (defaultRotY - f.model.rotation.y) * 0.15;
          }

          if (f.actionState === "windup" && isGorillaSlam) {
            f.model.rotation.z += ((side === "a" ? -0.25 : 0.25) - f.model.rotation.z) * 0.15;
          } else if (f.actionState === "strike" && isAvianDive) {
            const progress = f.actionTimer / f.actionDuration;
            f.model.rotation.z = (side === "a" ? 0.35 : -0.35) * (1.0 - progress * 2.5);
          } else if (f.actionState === "strike" && !isAvianDive) {
            f.model.rotation.z = side === "a" ? 0.22 : -0.22;
          } else if (f.actionState === "windup" && !isGorillaSlam) {
            f.model.rotation.z = side === "a" ? -0.12 : 0.12;
          } else {
            f.model.rotation.z += (0 - f.model.rotation.z) * 0.15;
          }
        }

        // Animate individual sub-meshes inside the 3D model
        const bodyPart = f.model.getObjectByName("body");
        const neckPart = f.model.getObjectByName("neck");
        const forelimbsPart = f.model.getObjectByName("forelimbs");
        const hindlimbsPart = f.model.getObjectByName("hindlimbs");

        if (alive) {
          if (bodyPart) {
            if (isAvian) {
              const breathe = Math.sin(f.time * 3.0) * 0.015;
              bodyPart.scale.set(1.04 + breathe, 0.94 - breathe, 1.18 + breathe);
              bodyPart.rotation.x = 0.12 + Math.sin(f.time * 2.2) * 0.04;
              bodyPart.rotation.y = 0;
            } else if (isSerpentine) {
              bodyPart.rotation.y = Math.sin(f.time * 2.2) * 0.12;
              bodyPart.rotation.x = Math.cos(f.time * 1.8) * 0.05;
              bodyPart.scale.set(1.05, 0.92, 1.2);
            } else if (isHeavyMammal) {
              const breathe = Math.sin(f.time * 1.2) * 0.035;
              bodyPart.scale.set(1.1 + breathe, 0.88 - breathe, 1.25 + breathe);
              bodyPart.rotation.x = 0;
              bodyPart.rotation.y = Math.sin(f.time * 0.8) * 0.04;
            } else if (isInsect) {
              const breathe = Math.sin(f.time * 4.0) * 0.018;
              bodyPart.scale.set(1.03 + breathe, 0.94 - breathe, 1.2 + breathe);
              bodyPart.rotation.x = 0.02;
              bodyPart.rotation.y = 0;
            } else {
              const breathe = Math.sin(f.time * 2.5) * 0.02;
              bodyPart.scale.set(1.05 + breathe, 0.92 - breathe, 1.2 + breathe);
              bodyPart.rotation.set(0, 0, 0);
            }
          }

          if (neckPart && isSerpentine) {
            neckPart.rotation.y = -Math.sin(f.time * 2.2) * 0.08;
          }

          if (forelimbsPart) {
            forelimbsPart.rotation.set(0, 0, 0);
            if (f.actionState === "strike" && isClawSwipe) {
              const progress = f.actionTimer / f.actionDuration;
              forelimbsPart.rotation.y = Math.sin(progress * Math.PI) * (side === "a" ? 0.9 : -0.9);
              forelimbsPart.rotation.x = Math.sin(progress * Math.PI) * 0.4;
            } else if (f.actionState === "strike" && isGorillaSlam) {
              const progress = f.actionTimer / f.actionDuration;
              forelimbsPart.rotation.x = -1.3 * progress;
            } else if (isAvian) {
              forelimbsPart.rotation.x = 0.25;
            } else if (isInsect) {
              forelimbsPart.rotation.z = Math.sin(f.time * 15.0) * 0.02;
            }
          }

          if (hindlimbsPart) {
            hindlimbsPart.rotation.set(0, 0, 0);
            if (isAvian) {
              hindlimbsPart.rotation.x = 0.4;
            } else if (isInsect) {
              hindlimbsPart.rotation.z = -Math.sin(f.time * 15.0) * 0.02;
            }
          }
        }
        
        // Active Head Tracking of opponent's head
        const headPart = f.model.getObjectByName("head");
        if (headPart && alive && targetF) {
          if (frame > introDuration - 20 && frame < introDuration + 40) {
            // Roar tilt: tilt head up and slightly outward
            headPart.rotation.x = -0.35;
            headPart.rotation.y = side === "a" ? 0.2 : -0.2;
          } else if (f.actionState === "strike" && isBiteSlam) {
            const progress = f.actionTimer / f.actionDuration;
            headPart.position.z = Math.sin(progress * Math.PI) * 0.6;
            headPart.rotation.set(0, 0, 0);
          } else {
            headPart.position.z += (0 - headPart.position.z) * 0.15;
            
            const worldPosHead = new THREE.Vector3();
            headPart.getWorldPosition(worldPosHead);
            const worldPosTarget = new THREE.Vector3();
            targetF.model.getWorldPosition(worldPosTarget);
            worldPosTarget.y += 1.6;
            
            const localTarget = headPart.parent!.worldToLocal(worldPosTarget.clone());
            const angleY = Math.atan2(localTarget.x, localTarget.z);
            const angleX = -Math.atan2(localTarget.y, Math.hypot(localTarget.x, localTarget.z));
            
            let targetRotY = Math.max(-0.6, Math.min(0.6, angleY));
            let targetRotX = Math.max(-0.4, Math.min(0.4, angleX));
            
            if (isAvian) {
              targetRotX -= 0.08;
            } else if (isSerpentine) {
              targetRotY += -Math.sin(f.time * 2.2) * 0.08;
            } else if (isInsect) {
              const twitch = (Math.sin(f.time * 12.0) + Math.cos(f.time * 19.0)) * 0.018;
              targetRotY += twitch * 1.5;
              targetRotX += twitch;
            }
            
            headPart.rotation.y += (targetRotY - headPart.rotation.y) * 0.1;
            headPart.rotation.x += (targetRotX - headPart.rotation.x) * 0.1;
          }
        }

        // Update rabbit ears physics (spring bounce)
        const earL0 = f.model.getObjectByName("ear_l_0");
        const earL1 = f.model.getObjectByName("ear_l_1");
        const earR0 = f.model.getObjectByName("ear_r_0");
        const earR1 = f.model.getObjectByName("ear_r_1");
        if (earL0 && earR0 && alive) {
          const bounceX = Math.sin(f.time * 4.0) * 0.08;
          const bounceZ = Math.cos(f.time * 3.0) * 0.05;
          
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

        // Animate mouth lower jaw opening during roars/attacks
        const lowerJaw = f.model.getObjectByName("lower_jaw");
        if (lowerJaw && alive) {
          let mouthOpen = 0;
          if (frame > introDuration - 20 && frame < introDuration + 40) {
            mouthOpen = 0.35; // Roar!
          } else if (f.actionState === "windup" || f.actionState === "strike") {
            mouthOpen = isBiteSlam ? 0.45 : 0.25; // Attack!
          } else {
            mouthOpen = Math.max(0, Math.sin(f.time * 1.8) * 0.06); // Breath
          }
          lowerJaw.rotation.x = mouthOpen;
        }

        // Eye blinking
        if (Math.random() < 0.008 && f.blinkTimer === 0) {
          f.blinkTimer = 10;
        }
        let eyeScaleY = 1.0;
        if (f.blinkTimer > 0) {
          f.blinkTimer--;
          if (f.blinkTimer > 5) {
            eyeScaleY = 0.1 + (f.blinkTimer - 5) * 0.18;
          } else {
            eyeScaleY = 0.1 + (5 - f.blinkTimer) * 0.18;
          }
        }
        for (const sideSuffix of ["_r", "_l"]) {
          const eye = f.model.getObjectByName(`eye${sideSuffix}`);
          const pupil = f.model.getObjectByName(`pupil${sideSuffix}`);
          if (eye) eye.scale.y = eyeScaleY;
          if (pupil) pupil.scale.y = eyeScaleY;
        }

        // Progressive sin-wave tail segments wag
        const tailSwaySpeed = isSerpentine ? 4.5 : (isHeavyMammal ? 2.0 : 3.5);
        const tailSwayAmp = isSerpentine ? 0.32 : (isHeavyMammal ? 0.08 : 0.15);
        for (let i = 0; i < 8; i++) {
          const seg = f.model.getObjectByName(`tail_seg_${i}`);
          if (seg) {
            seg.rotation.y = Math.sin(f.time * tailSwaySpeed - i * 0.32) * tailSwayAmp;
          }
        }
        const oldTail = f.model.getObjectByName("tail");
        if (oldTail && !f.model.getObjectByName("tail_seg_0") && alive) {
          oldTail.rotation.y = Math.sin(f.time * tailSwaySpeed) * tailSwayAmp;
        }

        const wingR = f.model.getObjectByName("wing_r");
        const wingL = f.model.getObjectByName("wing_l");
        if (wingR && wingL && alive) {
          const flap = Math.sin(f.time * (isAvian ? 10 : 6)) * (isAvian ? 0.45 : 0.3);
          wingR.rotation.z = flap;
          wingL.rotation.z = -flap;
        }
        
        // Hit-flash white material on damage
        if (f.flash > 0.5) {
          f.flash *= 0.92;
          if (!flashWhiteMaterial) {
            flashWhiteMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
          }
          f.model.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (mesh.isMesh && mesh.material) {
              if (!(mesh as any).originalMaterial) {
                (mesh as any).originalMaterial = mesh.material;
              }
              mesh.material = flashWhiteMaterial!;
            }
          });
        } else {
          if (f.flash > 0.02) {
            f.flash *= 0.92;
          } else {
            f.flash = 0;
          }
          f.model.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (mesh.isMesh && (mesh as any).originalMaterial) {
              mesh.material = (mesh as any).originalMaterial;
              delete (mesh as any).originalMaterial;
            }
          });
        }
      }

      renderer3D.render(scene3D, camera3D);

      // Update HUD Overlay widths & texts
      if (hudOverlay) {
        const pFill = hudOverlay.querySelector(".player-hud .hud-hp-fill") as HTMLElement;
        const pText = hudOverlay.querySelector(".player-hud .hud-text") as HTMLElement;
        const pPct = Math.max(0, fighters.a.displayHp) / fighters.a.maxHp * 100;
        pFill.style.width = `${pPct}%`;
        pFill.style.background = pPct > 30 ? "linear-gradient(90deg, #36c08a, #6ce5b1)" : "linear-gradient(90deg, #ff6b81, #ff97a6)";
        pText.textContent = `${Math.max(0, Math.round(fighters.a.displayHp))}/${fighters.a.maxHp}`;

        const oFill = hudOverlay.querySelector(".opponent-hud .hud-hp-fill") as HTMLElement;
        const oText = hudOverlay.querySelector(".opponent-hud .hud-text") as HTMLElement;
        const oPct = Math.max(0, fighters.b.displayHp) / fighters.b.maxHp * 100;
        oFill.style.width = `${oPct}%`;
        oFill.style.background = oPct > 30 ? "linear-gradient(90deg, #36c08a, #6ce5b1)" : "linear-gradient(90deg, #ff6b81, #ff97a6)";
        oText.textContent = `${Math.max(0, Math.round(fighters.b.displayHp))}/${fighters.b.maxHp}`;
      }
    } else {
      // 2D Fallback path rendering
      for (const side of ["a", "b"] as Side[]) {
        const f = fighters[side];
        f.displayHp += (f.targetHp - f.displayHp) * 0.25;
        f.shake *= 0.8;
        f.lunge *= 0.82;
        f.flash *= 0.85;
        f.attackAnim = Math.max(0, f.attackAnim - 0.065);
        f.hitAnim = Math.max(0, f.hitAnim - 0.055);
        const dir = side === "a" ? 1 : -1;
        f.x = f.baseX + f.lunge * dir;
      }
      for (let i = floats.length - 1; i >= 0; i--) {
        const ft = floats[i];
        ft.y += ft.vy;
        ft.vy += 0.06;
        ft.life -= 1;
        if (ft.life <= 0) floats.splice(i, 1);
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.18;
        p.vx *= 0.98;
        p.life -= 1;
        if (p.life <= 0) particles.splice(i, 1);
      }
      for (let i = beams.length - 1; i >= 0; i--) {
        beams[i].life -= 1;
        if (beams[i].life <= 0) beams.splice(i, 1);
      }
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const pr = projectiles[i];
        pr.x += pr.vx;
        pr.y += pr.vy;
        particles.push({
          x: pr.x, y: pr.y, vx: 0, vy: 0,
          life: 8, maxLife: 8, color: pr.trail, size: pr.size * 0.7,
        });
        const dx = pr.tx - pr.x;
        const dy = pr.ty - pr.y;
        if (dx * dx + dy * dy < 220 || frame > durationFrames + 400) {
          pr.onHit();
          projectiles.splice(i, 1);
        }
      }
      camShake *= 0.85;

      draw();
    }

    const done = cursor >= ordered.length && frame > durationFrames;
    if (done && floats.length === 0 && projectiles.length === 0 && beams.length === 0 && activeProjectiles3D.length === 0 && activeParticles3D.length === 0 && activeFloats3D.length === 0) {
      if (!finished && victoryTimer === 0) {
        if (use3D && fighters3D && result.winner !== "draw") {
          // Defer finish — victory animation will call onDone when complete
          victoryTimer = 1;
        } else {
          finished = true;
          if (hudOverlay) {
            hudOverlay.remove();
            hudOverlay = null;
          }
          onDone(result.winner);
        }
      }
      if (victoryTimer === 0 || finished) return;
    }
    raf = requestAnimationFrame(step);
  }

  /** Three diagonal arc-lines forming a claw slash glyph at `pos`. */
  const spawnClawSlash3D = (pos: THREE.Vector3, side: Side) => {
    const dir = side === "a" ? 1 : -1;
    const offsets: [number, number][] = [
      [-0.18 * dir, 0.55],
      [0, 0.40],
      [0.18 * dir, 0.55],
    ];
    for (const [ox, oy] of offsets) {
      const from = pos.clone().add(new THREE.Vector3(ox - 0.22 * dir, oy + 0.22, 0));
      const to   = pos.clone().add(new THREE.Vector3(ox + 0.22 * dir, oy - 0.22, 0));
      const geo  = new THREE.BufferGeometry().setFromPoints([from, to]);
      const mat  = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
      const line = new THREE.Line(geo, mat);
      scene3D?.add(line);
      activeBeams3D.push({
        line,
        life: 14,
        maxLife: 14,
        kind: "lightning",
        x1: from.x, y1: from.y, z1: from.z,
        x2: to.x,   y2: to.y,   z2: to.z,
      });
    }
  };

  /** A single white-to-transparent speed streak trailing behind `pos` in `dir` direction. */
  const spawnSpeedLine3D = (pos: THREE.Vector3, side: Side) => {
    const dir = side === "a" ? -1 : 1;
    const from = pos.clone().add(new THREE.Vector3(dir * 0.6 + (Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.5, 0));
    const to   = pos.clone().add(new THREE.Vector3(dir * 1.8 + (Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.3, 0));
    const geo  = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat  = new THREE.LineBasicMaterial({ color: 0xeeeeff, transparent: true, opacity: 0.75 });
    const line = new THREE.Line(geo, mat);
    scene3D?.add(line);
    activeBeams3D.push({
      line,
      life: 9,
      maxLife: 9,
      kind: "lightning",
      x1: from.x, y1: from.y, z1: from.z,
      x2: to.x,   y2: to.y,   z2: to.z,
    });
  };

  const spawnBurst3D = (pos: THREE.Vector3, colorHex: string, count = 20, speed = 0.12) => {
    const geo = new THREE.SphereGeometry(0.06, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(colorHex), transparent: true, opacity: 0.9 });
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, mat.clone());
      mesh.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4));
      scene3D?.add(mesh);
      activeParticles3D.push({
        mesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * speed * 2,
          (Math.random() - 0.2) * speed * 2,
          (Math.random() - 0.5) * speed * 2
        ),
        life: 1.0,
        decay: 0.02 + Math.random() * 0.02,
      });
    }
  };

  const spawnDustCloud3D = (pos: THREE.Vector3, count = 15) => {
    const geo = new THREE.SphereGeometry(0.18, 8, 8);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xb0b6c2),
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    });
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, mat.clone());
      const angle = Math.random() * Math.PI * 2;
      const dist = 0.2 + Math.random() * 0.8;
      mesh.position.set(
        pos.x + Math.cos(angle) * dist,
        0.2,
        pos.z + Math.sin(angle) * dist
      );
      scene3D?.add(mesh);
      activeParticles3D.push({
        mesh,
        velocity: new THREE.Vector3(
          Math.cos(angle) * (0.02 + Math.random() * 0.04),
          0.01 + Math.random() * 0.03,
          Math.sin(angle) * (0.02 + Math.random() * 0.04)
        ),
        life: 0.7,
        decay: 0.02 + Math.random() * 0.02,
      });
    }
  };

  const spawnSoundwaveRing3D = (pos: THREE.Vector3, colorHex: string) => {
    const geo = new THREE.RingGeometry(0.1, 0.12, 32);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(colorHex),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    if (camera3D) {
      mesh.lookAt(camera3D.position);
    }
    scene3D?.add(mesh);
    activeParticles3D.push({
      mesh,
      velocity: new THREE.Vector3(0, 0, 0),
      life: 0.8,
      decay: 0.03,
    });
  };

  const spawnDebris3D = (pos: THREE.Vector3, count = 12) => {
    const geo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
    const mat = new THREE.MeshStandardMaterial({ color: 0x5a5345, roughness: 0.9 });
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, mat.clone());
      mesh.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.1, (Math.random() - 0.5) * 0.6));
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      scene3D?.add(mesh);
      activeParticles3D.push({
        mesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.16,
          0.06 + Math.random() * 0.15,
          (Math.random() - 0.5) * 0.16
        ),
        life: 1.0,
        decay: 0.015 + Math.random() * 0.01,
      });
    }
  };

  const spawnGroundCrack3D = (pos: THREE.Vector3, maxRadius = 1.3) => {
    const geo = new THREE.RingGeometry(maxRadius * 0.8, maxRadius, 24);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x070912,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(pos.x, 0.02, pos.z);
    scene3D?.add(mesh);
    activeParticles3D.push({
      mesh,
      velocity: new THREE.Vector3(0, 0, 0),
      life: 1.3,
      decay: 0.012,
    });
  };

  const spawnToxicBubbles3D = (pos: THREE.Vector3, count = 12) => {
    const geo = new THREE.SphereGeometry(0.08, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0x39ff14, transparent: true, opacity: 0.8 });
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geo, mat.clone());
      mesh.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.2, (Math.random() - 0.5) * 0.5));
      scene3D?.add(mesh);
      activeParticles3D.push({
        mesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.01,
          0.015 + Math.random() * 0.02,
          (Math.random() - 0.5) * 0.01
        ),
        life: 0.8,
        decay: 0.014,
      });
    }
  };

  const spawnShield3D = (pos: THREE.Vector3, colorHex: string) => {
    const geo = new THREE.IcosahedronGeometry(1.6, 1);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(colorHex),
      wireframe: true,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos).add(new THREE.Vector3(0, 0.8, 0));
    scene3D?.add(mesh);
    activeParticles3D.push({
      mesh,
      velocity: new THREE.Vector3(0, 0, 0),
      life: 1.0,
      decay: 0.03,
    });
  };

  let healTexture: THREE.CanvasTexture | null = null;
  const getHealTexture = (): THREE.CanvasTexture => {
    if (!healTexture) {
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#36c08a";
        ctx.fillRect(26, 10, 12, 44);
        ctx.fillRect(10, 26, 44, 12);
      }
      healTexture = new THREE.CanvasTexture(canvas);
    }
    return healTexture;
  };

  const spawnHealCrosses3D = (pos: THREE.Vector3, count = 8) => {
    const mat = new THREE.SpriteMaterial({
      map: getHealTexture(),
      transparent: true,
      opacity: 0.95,
    });
    for (let i = 0; i < count; i++) {
      const sprite = new THREE.Sprite(mat.clone());
      sprite.position.copy(pos).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.8,
        0.3 + Math.random() * 0.5,
        (Math.random() - 0.5) * 0.8
      ));
      sprite.scale.setScalar(0.4);
      scene3D?.add(sprite);
      activeFloats3D.push({
        sprite,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.008,
          0.025 + Math.random() * 0.015,
          0
        ),
        life: 1.0,
        decay: 0.018,
      });
    }
  };

  function drawSpeedLines(canvasOverlay: HTMLCanvasElement) {
    const sCtx = canvasOverlay.getContext("2d");
    if (!sCtx) return;
    sCtx.clearRect(0, 0, W, H);
    
    sCtx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    sCtx.lineWidth = 1.5;
    
    const centerX = W / 2;
    const centerY = H / 2;
    const count = 35;
    
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const len = 40 + Math.random() * 80;
      const startDist = 180 + Math.random() * 100;
      
      const x1 = centerX + Math.cos(angle) * startDist;
      const y1 = centerY + Math.sin(angle) * startDist;
      const x2 = centerX + Math.cos(angle) * (startDist + len);
      const y2 = centerY + Math.sin(angle) * (startDist + len);
      
      sCtx.beginPath();
      sCtx.moveTo(x1, y1);
      sCtx.lineTo(x2, y2);
      sCtx.stroke();
    }
  }

  const spawnSwirlParticle3D = (center: THREE.Vector3, colorHex: string) => {
    const geo = new THREE.SphereGeometry(0.05, 4, 4);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(colorHex), transparent: true, opacity: 0.9 });
    const mesh = new THREE.Mesh(geo, mat);
    const angle = Math.random() * Math.PI * 2;
    const radius = 1.8;
    mesh.position.set(
      center.x + Math.cos(angle) * radius,
      center.y + (Math.random() - 0.2) * 0.5,
      center.z + Math.sin(angle) * radius
    );
    scene3D?.add(mesh);
    const tangent = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle)).normalize();
    const radial = center.clone().sub(mesh.position).normalize();
    const vel = radial.multiplyScalar(0.04).add(tangent.multiplyScalar(0.03)).add(new THREE.Vector3(0, 0.03, 0));
    activeParticles3D.push({
      mesh,
      velocity: vel,
      life: 0.8,
      decay: 0.02,
    });
  };

  const spawnImpactRing3D = (pos: THREE.Vector3, colorHex: string) => {
    const geo = new THREE.RingGeometry(0.1, 0.15, 32);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(colorHex),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos).add(new THREE.Vector3(0, 1.0, 0.5));
    if (camera3D) {
      mesh.lookAt(camera3D.position);
    }
    scene3D?.add(mesh);
    activeParticles3D.push({
      mesh,
      velocity: new THREE.Vector3(0, 0, 0),
      life: 0.7,
      decay: 0.045,
    });
  };

  const spawnBuffAuraHelix3D = (pos: THREE.Vector3, colorHex: string) => {
    const geo = new THREE.SphereGeometry(0.06, 4, 4);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(colorHex), transparent: true, opacity: 0.8 });
    for (let i = 0; i < 16; i++) {
      const mesh = new THREE.Mesh(geo, mat.clone());
      const angle = (i / 16) * Math.PI * 4;
      const height = (i / 16) * 2.0;
      mesh.position.set(
        pos.x + Math.cos(angle) * 0.7,
        pos.y + height,
        pos.z + Math.sin(angle) * 0.7
      );
      scene3D?.add(mesh);
      activeParticles3D.push({
        mesh,
        velocity: new THREE.Vector3(0, 0.02 + Math.random() * 0.015, 0),
        life: 1.0,
        decay: 0.02 + Math.random() * 0.01,
      });
    }
  };

  function triggerLungeStrike(side: Side, multiplier = 1.0, onHit: () => void) {
    const f = fighters3D![side];
    f.actionState = "windup";
    f.actionTimer = 0;
    f.actionDuration = Math.round(10 * multiplier);
    f.lunge = 0;
    f.onHitCallback = onHit;
  }

  const createBeam3D = (from: THREE.Vector3, to: THREE.Vector3, colorHex: string, kind: "lightning" | "tether" | "tether_1" | "tether_2") => {
    const points: THREE.Vector3[] = [];
    const segs = 10;
    for (let i = 0; i <= segs; i++) {
      points.push(new THREE.Vector3());
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color: new THREE.Color(colorHex),
    });
    const line = new THREE.Line(geo, mat);
    scene3D?.add(line);
    const isLightning = kind === "lightning";
    activeBeams3D.push({
      line,
      life: isLightning ? 22 : 40,
      maxLife: isLightning ? 22 : 40,
      kind,
      x1: from.x, y1: from.y, z1: from.z,
      x2: to.x, y2: to.y, z2: to.z,
    });
  };

  const createFloat3D = (pos: THREE.Vector3, text: string, colorHex: string, size: number) => {
    const textCanvas = document.createElement("canvas");
    textCanvas.width = 256;
    textCanvas.height = 128;
    const tCtx = textCanvas.getContext("2d");
    if (!tCtx) return;
    tCtx.font = `bold ${size * 2}px Inter, sans-serif`;
    tCtx.fillStyle = colorHex;
    tCtx.textAlign = "center";
    tCtx.textBaseline = "middle";
    tCtx.fillText(text, 128, 64);
    
    const texture = new THREE.CanvasTexture(textCanvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(pos);
    sprite.scale.set(2, 1, 1);
    scene3D?.add(sprite);
    
    activeFloats3D.push({
      sprite,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 0.02, 0.05, 0),
      life: 1.0,
      decay: 0.02,
    });
  };

  function executeAbilityVFX(e: Extract<BattleEvent, { kind: "ability" }>) {
    const foe = fighters[other(e.by)];
    const atk3D = fighters3D![e.by];
    const foe3D = fighters3D![other(e.by)];
    sfxAbility(e.ability as Parameters<typeof sfxAbility>[0]);
    
    if (e.ability === "spit") {
      const startPos = atk3D.model.position.clone().add(new THREE.Vector3(e.by === "a" ? 0.8 : -0.8, 1.2, 0));
      const endPos = foe3D.model.position.clone().add(new THREE.Vector3(0, 0.8, 0));
      const projGeo = new THREE.SphereGeometry(0.18, 8, 8);
      const projMat = new THREE.MeshBasicMaterial({ color: 0x39ff14 });
      const projMesh = new THREE.Mesh(projGeo, projMat);
      projMesh.position.copy(startPos);
      scene3D?.add(projMesh);
      activeProjectiles3D.push({
        mesh: projMesh,
        start: startPos,
        end: endPos,
        progress: 0,
        speed: 0.018,
        colorHex: "#39ff14",
        onHit: () => {
          fighters[other(e.by)].hitAnim = 0.9;
          foe3D.shake = 1.0;
          foe3D.flash = 1.0;
          foe.targetHp = e.targetHp;
          camShake = Math.max(camShake, 0.8);
          spawnBurst3D(foe3D.model.position, "#39ff14", 15, 0.15);
          spawnImpactRing3D(foe3D.model.position, "#39ff14");
          spawnToxicBubbles3D(foe3D.model.position, 12);
          spawnDustCloud3D(foe3D.model.position, 10);
          createFloat3D(foe3D.model.position.clone().add(new THREE.Vector3(0, 2, 0)), `${abilityTag(e.ability)} ${e.value}`, "#39ff14", 26);
        }
      });
    } else if (e.ability === "shock") {
      const startPos = atk3D.model.position.clone().add(new THREE.Vector3(0, 1.2, 0));
      const endPos = foe3D.model.position.clone().add(new THREE.Vector3(0, 0.8, 0));
      createBeam3D(startPos, endPos, "#c39bff", "lightning");
      fighters[other(e.by)].hitAnim = 0.9;
      foe3D.shake = 1.2;
      foe3D.flash = 1.0;
      foe.targetHp = e.targetHp;
      camShake = Math.max(camShake, 0.9);
      spawnBurst3D(foe3D.model.position, "#c39bff", 15, 0.16);
      spawnImpactRing3D(foe3D.model.position, "#c39bff");
      spawnImpactRing3D(foe3D.model.position, "#ffd700"); // extra electric spark ring
      spawnDustCloud3D(foe3D.model.position, 10);
      createFloat3D(foe3D.model.position.clone().add(new THREE.Vector3(0, 2, 0)), `${abilityTag(e.ability)} ${e.value}`, "#c39bff", 26);
    } else if (e.ability === "leech") {
      const startPos = atk3D.model.position.clone().add(new THREE.Vector3(0, 0.8, 0));
      const endPos = foe3D.model.position.clone().add(new THREE.Vector3(0, 0.8, 0));
      createBeam3D(endPos, startPos, "#ff3b30", "tether_1");
      createBeam3D(endPos, startPos, "#ff3b30", "tether_2");
      fighters[other(e.by)].hitAnim = 0.9;
      foe3D.shake = 1.0;
      foe3D.flash = 1.0;
      foe.targetHp = e.targetHp;
      camShake = Math.max(camShake, 0.7);
      spawnBurst3D(foe3D.model.position, "#ff3b30", 12, 0.12);
      spawnImpactRing3D(foe3D.model.position, "#ff3b30");
      spawnDustCloud3D(foe3D.model.position, 8);
      createFloat3D(foe3D.model.position.clone().add(new THREE.Vector3(0, 2, 0)), `${abilityTag(e.ability)} ${e.value}`, "#ff3b30", 26);
    } else if (e.ability === "charge") {
      triggerLungeStrike(e.by, 1.8, () => {
        fighters[other(e.by)].hitAnim = 1.0;
        foe3D.shake = 1.4;
        foe3D.flash = 1.0;
        foe.targetHp = e.targetHp;
        camShake = Math.max(camShake, 1.2);
        spawnBurst3D(foe3D.model.position, "#ffae19", 18, 0.22);
        spawnImpactRing3D(foe3D.model.position, "#ffae19");
        spawnGroundCrack3D(foe3D.model.position, 1.5);
        spawnDebris3D(foe3D.model.position, 15);
        spawnDustCloud3D(foe3D.model.position, 12);
        createFloat3D(foe3D.model.position.clone().add(new THREE.Vector3(0, 2, 0)), `${abilityTag(e.ability)} ${e.value}`, "#ffae19", 26);
      });
    } else {
      atk3D.flash = 0.8;
      let col = "#7aa2ff";
      if (e.ability === "venom") {
        col = "#9be86c";
        spawnToxicBubbles3D(atk3D.model.position, 12);
      } else if (e.ability === "frenzy") {
        col = "#ff6b81";
        atk3D.flash = 1.3;
      } else if (e.ability === "regenerate") {
        col = "#6ce5b1";
        spawnHealCrosses3D(atk3D.model.position, 10);
      } else if (e.ability === "armor") {
        col = "#7aa2ff";
        spawnShield3D(atk3D.model.position, "#7aa2ff");
      }
      spawnBurst3D(atk3D.model.position, col, 14, 0.14);
      spawnBuffAuraHelix3D(atk3D.model.position, col);
      createFloat3D(atk3D.model.position.clone().add(new THREE.Vector3(0, 2, 0)), abilityTag(e.ability), col, 24);
      if (e.targetHp !== undefined) {
        foe.targetHp = e.targetHp;
      }
    }
  }

  function applyEvent(e: BattleEvent) {
    if (use3D && fighters3D) {
      // 3D event logic
      switch (e.kind) {
        case "attack": {
          const foe = fighters[other(e.by)];
          const foe3D = fighters3D[other(e.by)];
          triggerLungeStrike(e.by, 1.0, () => {
            foe3D.shake = e.crit ? 1.0 : 0.6;
            foe3D.flash = 1.0;
            foe.targetHp = e.targetHp;
            camShake = Math.max(camShake, e.crit ? 1.2 : 0.6);
            if (e.crit) {
              slowMoTimer = 35;
            }
            spawnBurst3D(foe3D.model.position, e.crit ? "#ffce6b" : "#ff8f6b", e.crit ? 18 : 10, e.crit ? 0.2 : 0.12);
            spawnImpactRing3D(foe3D.model.position, e.crit ? "#ffce6b" : "#ff8f6b");
            if (e.crit || fighters[e.by].genome.forelimbs === "gorilla") {
              spawnGroundCrack3D(foe3D.model.position, e.crit ? 1.4 : 1.1);
              spawnDebris3D(foe3D.model.position, e.crit ? 10 : 6);
            }
            spawnDustCloud3D(foe3D.model.position, e.crit ? 12 : 6);
            sfxHit(e.crit);
            createFloat3D(foe3D.model.position.clone().add(new THREE.Vector3(0, 2, 0)), e.crit ? `${e.dmg}!` : `${e.dmg}`, e.crit ? "#ffce6b" : "#ff8f6b", e.crit ? 38 : 28);
          });
          break;
        }
        case "ability": {
          const isSpecial = ["spit", "shock", "leech", "charge"].includes(e.ability);
          if (isSpecial) {
            cinematic = {
              active: true,
              casterSide: e.by,
              timer: 0,
              duration: 45,
              ability: e.ability,
              value: e.value,
              targetHp: e.targetHp,
              onComplete: () => {
                executeAbilityVFX(e);
              }
            };
          } else {
            executeAbilityVFX(e);
          }
          break;
        }
        case "poison": {
          const f = fighters[e.on];
          f.targetHp = e.hp;
          sfxAbility("venom");
          const f3D = fighters3D[e.on];
          f3D.flash = 0.5;
          spawnBurst3D(f3D.model.position, "#9be86c", 8, 0.1);
          createFloat3D(f3D.model.position.clone().add(new THREE.Vector3(0, 2, 0)), `☠ ${e.dmg}`, "#9be86c", 22);
          break;
        }
        case "heal": {
          const f = fighters[e.on];
          f.targetHp = e.hp;
          sfxHeal();
          const f3D = fighters3D[e.on];
          spawnBurst3D(f3D.model.position, "#6ce5b1", 10, 0.12);
          createFloat3D(f3D.model.position.clone().add(new THREE.Vector3(0, 2, 0)), `+${e.amount}`, "#6ce5b1", 24);
          break;
        }
        case "death": {
          const f = fighters[e.side];
          f.flash = 1;
          const f3D = fighters3D[e.side];
          f3D.flash = 1.0;
          sfxDeath();
          break;
        }
      }
    } else {
      // 2D Canvas Fallback logic
      switch (e.kind) {
        case "attack": {
          const atk = fighters[e.by];
          const foe = fighters[other(e.by)];
          atk.lunge = 85;
          atk.attackAnim = 1;
          foe.hitAnim = 1;
          foe.shake = e.crit ? 16 : 9;
          foe.flash = 1;
          foe.targetHp = e.targetHp;
          camShake = Math.max(camShake, e.crit ? 10 : 5);
          spawnBurst(foe, e.crit ? "#ffce6b" : "#ff8f6b", e.crit ? 16 : 9, e.crit ? 5 : 3.4);
          sfxHit(e.crit);
          addFloat(foe, e.crit ? `${e.dmg}!` : `${e.dmg}`, e.crit ? "#ffce6b" : "#ff8f6b", e.crit ? 34 : 26);
          break;
        }
        case "ability": {
          const atk = fighters[e.by];
          const foe = fighters[other(e.by)];
          atk.attackAnim = 0.8;
          atk.lunge = 55;
          atk.flash = 0.6;
          sfxAbility(e.ability as Parameters<typeof sfxAbility>[0]);
          const heals = e.value < 0;
          if (!heals && (e.ability === "venom" || e.ability === "armor" || e.ability === "frenzy")) {
            spawnBurst(atk, "#7aa2ff", 8, 2.6);
            addFloat(atk, abilityTag(e.ability), "#7aa2ff", 20);
          } else if (e.ability !== "regenerate") {
            foe.hitAnim = 0.9;
            foe.shake = 12;
            foe.flash = 1;
            foe.targetHp = e.targetHp;
            camShake = Math.max(camShake, 8);
            spawnBurst(foe, "#c39bff", 12, 4);
            addFloat(foe, `${abilityTag(e.ability)} ${e.value}`, "#c39bff", 24);
          }
          break;
        }
        case "poison": {
          const f = fighters[e.on];
          f.targetHp = e.hp;
          f.flash = Math.max(f.flash, 0.5);
          sfxAbility("venom");
          spawnBurst(f, "#9be86c", 5, 2);
          addFloat(f, `☠ ${e.dmg}`, "#9be86c", 20);
          break;
        }
        case "heal": {
          const f = fighters[e.on];
          f.targetHp = e.hp;
          sfxHeal();
          spawnBurst(f, "#6ce5b1", 8, 2.4);
          addFloat(f, `+${e.amount}`, "#6ce5b1", 24);
          break;
        }
        case "death": {
          fighters[e.side].flash = 1;
          sfxDeath();
          break;
        }
      }
    }
  }

  function addFloat(f: FighterView, text: string, color: string, size: number) {
    floats.push({
      x: f.baseX + (Math.random() * 40 - 20),
      y: GROUND_Y - 110,
      vy: -2.2,
      life: 55,
      text,
      color,
      size,
    });
  }

  function spawnBurst(f: FighterView, color: string, count: number, power: number) {
    if (instant) return;
    const cx = f.baseX;
    const cy = GROUND_Y - 60;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = power * (0.4 + Math.random());
      particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 1.5,
        life: 22 + Math.random() * 14,
        maxLife: 36,
        color,
        size: 2 + Math.random() * 3,
      });
    }
  }

  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    drawBackground();

    const shakeAmt = reduceMotion ? 0 : camShake;
    const sx = (Math.random() * 2 - 1) * shakeAmt;
    const sy = (Math.random() * 2 - 1) * shakeAmt;
    ctx.save();
    ctx.translate(sx, sy);

    drawFighter(fighters.a);
    drawFighter(fighters.b);

    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const ft of floats) {
      ctx.globalAlpha = Math.min(1, ft.life / 30);
      ctx.fillStyle = ft.color;
      ctx.font = `700 ${ft.size}px Inter, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // HUD (HP bars) stays fixed, unaffected by camera shake
    drawHpBars();
  }

  function drawBackground() {
    if (!ctx) return;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#0e1730");
    g.addColorStop(1, "#0a1120");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // arena floor
    const fg = ctx.createLinearGradient(0, GROUND_Y, 0, H);
    fg.addColorStop(0, "#16223f");
    fg.addColorStop(1, "#0c1426");
    ctx.fillStyle = fg;
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.strokeStyle = "rgba(122,162,255,0.25)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(W, GROUND_Y);
    ctx.stroke();
  }

  function drawFighter(f: FighterView) {
    if (!ctx) return;
    const alive = f.displayHp > 0.5;
    const t = frame;

    const bob = alive ? Math.sin(t * 0.11 + (f.side === "a" ? 0 : Math.PI)) * 5 : 0;
    const breathe = alive ? Math.sin(t * 0.07 + (f.side === "a" ? 0 : Math.PI * 0.5)) : 0;
    // Slow stalking sway
    const sway = alive ? Math.sin(t * 0.022 + (f.side === "a" ? 0 : Math.PI)) * 9 : 0;

    const shakeX = (Math.random() * 2 - 1) * f.shake;
    const shakeY = (Math.random() * 2 - 1) * f.shake * 0.4;

    const cx = f.x + shakeX + sway;
    const cy = GROUND_Y - 72 + bob + shakeY;

    const atk = f.attackAnim;
    const hit = f.hitAnim;

    const p = f.partEmojis;

    // Shadow grows during lunge
    const shadowScale = 1 + (f.lunge / 85) * 0.2;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(f.x + sway * 0.4, GROUND_Y + 6, 55 * shadowScale, 13, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(cx, cy);
    if (f.side === "b") ctx.scale(-1, 1);

    if (!alive) {
      ctx.globalAlpha = 0.35;
      ctx.rotate(0.5);
      ctx.translate(0, 18);
    } else if (hit > 0) {
      // Recoil lean: push away from opponent, tilt back
      ctx.translate(-hit * 10, -hit * 3);
      ctx.rotate(-hit * 0.14);
    }

    // Draw back-to-front: tail → hindlimbs → body → forelimbs → head
    // Each part drawn in local space; we translate to its anatomical position.

    const SCALE = 0.52; // overall creature size

    // TAIL — wags behind the body
    ctx.save();
    ctx.translate(-46 - atk * 8, -6);
    ctx.rotate(-0.18 + Math.sin(t * 0.18) * 0.16);
    ctx.scale(SCALE, SCALE);
    drawTail(ctx, p.tail, t * 0.18);
    ctx.restore();

    // HINDLIMBS — rear legs, push off during attack
    ctx.save();
    ctx.translate(-18 - atk * 6, 14 + atk * 7);
    ctx.rotate(-0.04 + atk * 0.1);
    ctx.scale(SCALE * 0.9, SCALE * 0.9);
    drawHindlimbs(ctx, p.hindlimbs, atk);
    ctx.restore();

    // BODY — central mass with breathing scale
    ctx.save();
    ctx.scale(SCALE * (1 + breathe * 0.016), SCALE * (1 - breathe * 0.01));
    drawBody(ctx, p.body, breathe);
    ctx.restore();

    // FORELIMBS — front limbs, surge forward and rise on attack
    ctx.save();
    ctx.translate(20 + atk * 32, 14 - atk * 14);
    ctx.rotate(atk * 0.6);
    ctx.scale(SCALE * 0.9, SCALE * 0.9);
    drawForelimbs(ctx, p.forelimbs, atk);
    ctx.restore();

    // HEAD — front-right, thrust on attack, recoil on hit
    ctx.save();
    ctx.translate(32 + atk * 18, -40 - atk * 12);
    ctx.rotate(atk * 0.2 - hit * 0.16);
    ctx.scale(SCALE, SCALE);
    drawHead(ctx, p.head, t * 0.18, atk);
    ctx.restore();

    ctx.restore();

    if (f.flash > 0.02) {
      ctx.globalAlpha = f.flash * 0.38;
      ctx.fillStyle = "#ff4d6d";
      ctx.beginPath();
      ctx.arc(cx, cy - 12, 80, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawHpBars() {
    drawHpBar(fighters.a, 40, "left");
    drawHpBar(fighters.b, W - 360, "right");
  }

  function drawHpBar(f: FighterView, x: number, align: "left" | "right") {
    if (!ctx) return;
    const barW = 320;
    const y = 32;
    const pct = Math.max(0, f.displayHp) / f.maxHp;
    ctx.fillStyle = "#0c1222";
    roundRect(x, y, barW, 18, 9);
    ctx.fill();
    const grad = ctx.createLinearGradient(x, 0, x + barW, 0);
    grad.addColorStop(0, pct > 0.3 ? "#36c08a" : "#ff6b81");
    grad.addColorStop(1, pct > 0.3 ? "#6ce5b1" : "#ff97a6");
    ctx.fillStyle = grad;
    const fillW = barW * pct;
    if (fillW > 0) {
      roundRect(align === "left" ? x : x + barW - fillW, y, fillW, 18, 9);
      ctx.fill();
    }
    ctx.fillStyle = "#e7ecf7";
    ctx.font = "700 15px Inter, system-ui, sans-serif";
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = align;
    ctx.fillText(
      `${f.name}  ${Math.max(0, Math.round(f.displayHp))}/${f.maxHp}`,
      align === "left" ? x : x + barW,
      y - 8,
    );
  }

  function roundRect(x: number, y: number, w: number, h: number, r: number) {
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function disposeModel(m: THREE.Object3D) {
    m.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mt = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mt)) mt.forEach((x) => x.dispose());
      else if (mt) mt.dispose();
    });
  }

  raf = requestAnimationFrame(step);
  return () => {
    stopMusic();
    stopAmbient();
    cancelAnimationFrame(raf);
    if (use3D) {
      if (hudOverlay) {
        hudOverlay.remove();
      }
      if (speedLinesCanvas) {
        speedLinesCanvas.remove();
      }
      for (let i = 0; i < 3; i++) {
        const ray = scene3D?.getObjectByName(`light_ray_${i}`);
        if (ray instanceof THREE.Mesh) {
          scene3D?.remove(ray);
          ray.geometry.dispose();
          (ray.material as THREE.Material).dispose();
        }
      }
      if (fighters3D && scene3D) {
        scene3D.remove(fighters3D.a.model);
        disposeModel(fighters3D.a.model);
        scene3D.remove(fighters3D.a.shadow);
        disposeModel(fighters3D.a.shadow);
        scene3D.remove(fighters3D.b.model);
        disposeModel(fighters3D.b.model);
        scene3D.remove(fighters3D.b.shadow);
        disposeModel(fighters3D.b.shadow);
      }
      if (arenaGroup && scene3D) {
        scene3D.remove(arenaGroup);
        platform?.geometry.dispose();
        platMat?.dispose();
        ringGeo?.dispose();
        ringMat?.dispose();
      }
      activeParticles3D.forEach(p => {
        scene3D?.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
      });
      activeProjectiles3D.forEach(p => {
        scene3D?.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
      });
      activeBeams3D.forEach(b => {
        scene3D?.remove(b.line);
        b.line.geometry.dispose();
        (b.line.material as THREE.Material).dispose();
      });
      activeFloats3D.forEach(f => {
        scene3D?.remove(f.sprite);
        f.sprite.material.map?.dispose();
        f.sprite.material.dispose();
      });
      if (biomeParticleSystem && scene3D) {
        scene3D.remove(biomeParticleSystem.mesh);
        biomeParticleSystem.mesh.geometry.dispose();
        (biomeParticleSystem.mesh.material as THREE.Material).dispose();
      }
      renderer3D?.dispose();
    }
  };
}

function mkView(side: Side, s: { name: string; emoji: string; partEmojis: Record<string, string>; genome: Record<string, string>; maxHp: number }, x: number): FighterView {
  return {
    side,
    name: s.name,
    emoji: s.emoji,
    partEmojis: s.partEmojis,
    genome: s.genome,
    maxHp: s.maxHp,
    displayHp: s.maxHp,
    targetHp: s.maxHp,
    x,
    baseX: x,
    shake: 0,
    lunge: 0,
    flash: 0,
    attackAnim: 0,
    hitAnim: 0,
  };
}

function other(s: Side): Side {
  return s === "a" ? "b" : "a";
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function abilityTag(id: string): string {
  return (
    {
      venom: "Venom",
      regenerate: "Regen",
      spit: "Spit",
      charge: "Charge",
      armor: "Armor",
      frenzy: "Frenzy",
      shock: "Shock",
      leech: "Leech",
    }[id] ?? id
  );
}

