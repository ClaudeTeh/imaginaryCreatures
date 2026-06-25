import type { BattleEvent, BattleResult, Side } from "../combat/combat";
import { sfxAbility, sfxHeal, sfxHit } from "./sound";
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

const W = 960;
const H = 420;
const GROUND_Y = 300;

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
    kind: "lightning" | "tether";
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
  const activeProjectiles3D: Projectile3D[] = [];
  const activeBeams3D: Beam3D[] = [];
  const activeFloats3D: Float3D[] = [];

  let hudOverlay: HTMLElement | null = null;

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

  try {
    renderer3D = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer3D.setSize(W, H);
    renderer3D.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer3D.shadowMap.enabled = true;
    renderer3D.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer3D.toneMapping = THREE.ACESFilmicToneMapping;
    renderer3D.toneMappingExposure = 1.25;

    scene3D = new THREE.Scene();
    scene3D.background = new THREE.Color(0x0e1730);
    scene3D.fog = new THREE.FogExp2(0x0e1730, 0.012);

    camera3D = new THREE.PerspectiveCamera(38, W / H, 0.1, 100);
    camera3D.position.set(0, 14, 22); // Start back for intro fly-in
    camera3D.lookAt(0, 1.2, 0);

    ambientLight = new THREE.AmbientLight(0x445588, 0.9);
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

    // Arena Floor
    arenaGroup = new THREE.Group();
    const platGeo = new THREE.CylinderGeometry(10, 10.5, 0.8, 64);
    platMat = new THREE.MeshStandardMaterial({ color: 0x16223f, metalness: 0.8, roughness: 0.3 });
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

    if (use3D && cinematic.active) {
      // Pause simulation progress during cinematic animations, but let frame advance
    } else {
      currentTick += ticksPerFrame;
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
      } else if (cinematic.active) {
        cinematic.timer++;
        const progress = cinematic.timer / cinematic.duration;
        const caster = fighters3D[cinematic.casterSide];
        
        // 1. Camera Zoom close-up on caster
        const targetCamPos = caster.basePos.clone().add(new THREE.Vector3(cinematic.casterSide === "a" ? 2.5 : -2.5, 2.2, 5.0));
        const targetLookAt = caster.basePos.clone().add(new THREE.Vector3(0, 1.4, 0));
        
        camera3D.position.lerp(targetCamPos, 0.12);
        camera3D.lookAt(new THREE.Vector3(0, 1.2, 0).lerp(targetLookAt, 0.5));
        
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
        pr.progress += pr.speed;
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
            decay: 0.04,
          });
        }
      }

      // Update active 3D particles
      for (let i = activeParticles3D.length - 1; i >= 0; i--) {
        const p = activeParticles3D[i];
        p.mesh.position.add(p.velocity);
        if (p.mesh.geometry.type === "RingGeometry") {
          p.mesh.scale.addScalar(0.14);
        } else {
          p.velocity.y -= 0.003; // gravity
        }
        p.life -= p.decay;
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, p.life);
        if (p.life <= 0) {
          scene3D.remove(p.mesh);
          p.mesh.geometry.dispose();
          (p.mesh.material as THREE.Material).dispose();
          activeParticles3D.splice(i, 1);
        }
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

      // Update 3D fighter models
      for (const side of ["a", "b"] as Side[]) {
        const f = fighters3D[side];
        const fView = fighters[side];
        const otherSide = side === "a" ? "b" : "a";
        const targetF = fighters3D[otherSide];

        f.time += 0.016;

        // Action State machine transitions
        if (f.actionState === "windup") {
          f.actionTimer++;
          f.lunge = -0.4 * (f.actionTimer / f.actionDuration);
          f.model.rotation.z = side === "a" ? -0.12 : 0.12;
          if (f.actionTimer >= f.actionDuration) {
            f.actionState = "strike";
            f.actionTimer = 0;
            f.actionDuration = 5;
          }
        } else if (f.actionState === "strike") {
          f.actionTimer++;
          const progress = f.actionTimer / f.actionDuration;
          f.lunge = -0.4 + 2.2 * progress;
          f.model.rotation.z = side === "a" ? 0.22 : -0.22;
          if (f.actionTimer >= f.actionDuration) {
            if (f.onHitCallback) {
              f.onHitCallback();
              f.onHitCallback = undefined;
            }
            f.actionState = "recover";
            f.actionTimer = 0;
            f.actionDuration = 18;
          }
        } else if (f.actionState === "recover") {
          f.actionTimer++;
          const progress = f.actionTimer / f.actionDuration;
          f.lunge = 1.8 * (1 - progress * (2 - progress));
          f.model.rotation.z = 0;
          if (f.actionTimer >= f.actionDuration) {
            f.actionState = "idle";
            f.lunge = 0;
          }
        } else if (f.actionState === "dodge") {
          f.actionTimer++;
          const half = f.actionDuration / 2;
          if (f.actionTimer < half) {
            f.dodgeOffset = f.dodgeDir * 1.5 * (f.actionTimer / half);
          } else {
            f.dodgeOffset = f.dodgeDir * 1.5 * (1 - (f.actionTimer - half) / half);
          }
          if (f.actionTimer >= f.actionDuration) {
            f.actionState = "idle";
            f.dodgeOffset = 0;
          }
        } else {
          f.lunge = 0;
          f.dodgeOffset = 0;
          // Random idle side-steps/dodges
          if (Math.random() < 0.003 && fView.displayHp > 0.5) {
            f.actionState = "dodge";
            f.actionTimer = 0;
            f.actionDuration = 24;
            f.dodgeDir = Math.random() < 0.5 ? 1 : -1;
          }
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
        if (alive) {
          currentPos.y += Math.sin(f.time * 2.5) * 0.08 + 0.1;
        } else {
          currentPos.y -= 1.0;
          f.model.rotation.z = side === "a" ? -0.8 : 0.8;
          if (Math.random() < 0.1) {
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
          (f.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.1, 0.55 - sHeight * 0.65);
        }

        // Animate individual sub-meshes inside the 3D model
        const bodyPart = f.model.getObjectByName("body");
        if (bodyPart && alive) {
          const breathe = Math.sin(f.time * 2.5) * 0.02;
          bodyPart.scale.set(1.05 + breathe, 0.92 - breathe, 1.2 + breathe);
        }
        
        // Active Head Tracking of opponent's head
        const headPart = f.model.getObjectByName("head");
        if (headPart && alive && targetF) {
          const worldPosHead = new THREE.Vector3();
          headPart.getWorldPosition(worldPosHead);
          const worldPosTarget = new THREE.Vector3();
          targetF.model.getWorldPosition(worldPosTarget);
          worldPosTarget.y += 1.6;
          
          const localTarget = headPart.parent!.worldToLocal(worldPosTarget.clone());
          const angleY = Math.atan2(localTarget.x, localTarget.z);
          const angleX = -Math.atan2(localTarget.y, Math.hypot(localTarget.x, localTarget.z));
          
          const clampedY = Math.max(-0.6, Math.min(0.6, angleY));
          const clampedX = Math.max(-0.4, Math.min(0.4, angleX));
          headPart.rotation.y += (clampedY - headPart.rotation.y) * 0.1;
          headPart.rotation.x += (clampedX - headPart.rotation.x) * 0.1;
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
        for (let i = 0; i < 8; i++) {
          const seg = f.model.getObjectByName(`tail_seg_${i}`);
          if (seg) {
            seg.rotation.y = Math.sin(f.time * 3.5 - i * 0.28) * 0.15;
          }
        }
        const oldTail = f.model.getObjectByName("tail");
        if (oldTail && !f.model.getObjectByName("tail_seg_0") && alive) {
          oldTail.rotation.y = Math.sin(f.time * 3.5) * 0.15;
        }

        const wingR = f.model.getObjectByName("wing_r");
        const wingL = f.model.getObjectByName("wing_l");
        if (wingR && wingL && alive) {
          const flap = Math.sin(f.time * 6) * 0.3;
          wingR.rotation.z = flap;
          wingL.rotation.z = -flap;
        }
        
        // Emissive model flashing on damage
        if (f.flash > 0.02) {
          f.flash *= 0.92;
          f.model.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (mesh.material && (mesh.material as THREE.MeshStandardMaterial).emissive) {
              const mat = mesh.material as THREE.MeshStandardMaterial;
              mat.emissive.setHex(0xff3355);
              mat.emissiveIntensity = f.flash * 2.0;
            }
          });
        } else {
          f.flash = 0;
          f.model.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (mesh.material && (mesh.material as THREE.MeshStandardMaterial).emissive) {
              const mat = mesh.material as THREE.MeshStandardMaterial;
              mat.emissive.setHex(0x000000);
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
      if (!finished) {
        finished = true;
        
        if (hudOverlay) {
          hudOverlay.remove();
          hudOverlay = null;
        }

        onDone(result.winner);
      }
      return;
    }
    raf = requestAnimationFrame(step);
  }

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

  const createBeam3D = (from: THREE.Vector3, to: THREE.Vector3, colorHex: string, kind: "lightning" | "tether") => {
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
    activeBeams3D.push({
      line,
      life: kind === "lightning" ? 22 : 40,
      maxLife: kind === "lightning" ? 22 : 40,
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
    sfxAbility();
    
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
      createFloat3D(foe3D.model.position.clone().add(new THREE.Vector3(0, 2, 0)), `${abilityTag(e.ability)} ${e.value}`, "#c39bff", 26);
    } else if (e.ability === "leech") {
      const startPos = atk3D.model.position.clone().add(new THREE.Vector3(0, 0.8, 0));
      const endPos = foe3D.model.position.clone().add(new THREE.Vector3(0, 0.8, 0));
      createBeam3D(endPos, startPos, "#ff3b30", "tether");
      fighters[other(e.by)].hitAnim = 0.9;
      foe3D.shake = 1.0;
      foe3D.flash = 1.0;
      foe.targetHp = e.targetHp;
      camShake = Math.max(camShake, 0.7);
      spawnBurst3D(foe3D.model.position, "#ff3b30", 12, 0.12);
      spawnImpactRing3D(foe3D.model.position, "#ff3b30");
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
        createFloat3D(foe3D.model.position.clone().add(new THREE.Vector3(0, 2, 0)), `${abilityTag(e.ability)} ${e.value}`, "#ffae19", 26);
      });
    } else {
      atk3D.flash = 0.8;
      let col = "#7aa2ff";
      if (e.ability === "venom") col = "#9be86c";
      if (e.ability === "frenzy") col = "#ff6b81";
      if (e.ability === "regenerate") col = "#6ce5b1";
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
            spawnBurst3D(foe3D.model.position, e.crit ? "#ffce6b" : "#ff8f6b", e.crit ? 18 : 10, e.crit ? 0.2 : 0.12);
            spawnImpactRing3D(foe3D.model.position, e.crit ? "#ffce6b" : "#ff8f6b");
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
          sfxAbility();
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
    cancelAnimationFrame(raf);
    if (use3D) {
      if (hudOverlay) {
        hudOverlay.remove();
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

