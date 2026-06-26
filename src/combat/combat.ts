import { chance, type RNG } from "../core/rng";
import type { AbilityId, Creature } from "../core/types";
import { ABILITIES } from "../data/abilities";
import { typeMultiplier } from "./typeChart";

export type Side = "a" | "b";

export type BattleEvent =
  | { t: number; kind: "start"; side: Side; maxHp: number; name: string; emoji: string; partEmojis: Record<string, string>; genome: Record<string, string> }
  | { t: number; kind: "attack"; by: Side; dmg: number; crit: boolean; targetHp: number; typeMultiplier?: number }
  | { t: number; kind: "ability"; by: Side; ability: AbilityId; value: number; targetHp: number }
  | { t: number; kind: "poison"; on: Side; dmg: number; hp: number }
  | { t: number; kind: "heal"; on: Side; amount: number; hp: number }
  | { t: number; kind: "death"; side: Side };

export interface BattleResult {
  winner: Side | "draw";
  ticks: number;
  events: BattleEvent[];
  /** Human-readable highlights, handy for tests and the "judge". */
  log: string[];
}

const ATTACK_THRESHOLD = 100;
const MAX_TICKS = 4000;

interface Fighter {
  side: Side;
  name: string;
  emoji: string;
  partEmojis: Record<string, string>;
  genome: Record<string, string>;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  energyRegen: number;
  energy: number;
  abilities: AbilityId[];
  // transient combat state
  attackMeter: number;
  poison: { dmg: number; ticks: number }[];
  armorTicks: number;
  frenzyTicks: number;
  slowTicks: number;
}

function makeFighter(side: Side, c: Creature): Fighter {
  const keen = c.traits.includes("keenSenses") ? 1.1 : 1;
  return {
    side,
    name: c.name,
    emoji: c.emoji,
    partEmojis: c.partEmojis,
    genome: c.genome,
    hp: c.stats.health,
    maxHp: c.stats.health,
    attack: c.stats.attack,
    defense: c.stats.defense,
    speed: Math.max(4, c.stats.speed),
    energyRegen: (2 + c.stats.energy * 0.1) * keen,
    energy: 0,
    abilities: c.abilities,
    attackMeter: 0,
    poison: [],
    armorTicks: 0,
    frenzyTicks: 0,
    slowTicks: 0,
  };
}

function effDefense(f: Fighter): number {
  return f.armorTicks > 0 ? f.defense * 1.5 : f.defense;
}

function effSpeed(f: Fighter): number {
  let s = f.speed;
  if (f.frenzyTicks > 0) s *= 1.6;
  if (f.slowTicks > 0) s *= 0.7;
  return s;
}

function basicDamage(att: Fighter, def: Fighter): number {
  const mult = typeMultiplier(att.genome.body ?? "", def.genome.body ?? "");
  return Math.max(1, Math.round((att.attack - effDefense(def) * 0.4) * mult));
}

/** Simulate a full battle deterministically. Same inputs → identical log. */
export function simulateBattle(ca: Creature, cb: Creature, rng: RNG): BattleResult {
  const a = makeFighter("a", ca);
  const b = makeFighter("b", cb);
  const events: BattleEvent[] = [];
  const log: string[] = [];
  let t = 0;

  events.push({ t, kind: "start", side: "a", maxHp: a.maxHp, name: a.name, emoji: a.emoji, partEmojis: a.partEmojis, genome: a.genome });
  events.push({ t, kind: "start", side: "b", maxHp: b.maxHp, name: b.name, emoji: b.emoji, partEmojis: b.partEmojis, genome: b.genome });

  const useAbility = (self: Fighter, foe: Fighter): boolean => {
    // Fire the most expensive ability we can currently afford.
    const affordable = self.abilities
      .map((id) => ABILITIES[id])
      .filter((ab) => self.energy >= ab.cost)
      .sort((x, y) => y.cost - x.cost);
    if (affordable.length === 0) return false;
    const ab = affordable[0];
    self.energy -= ab.cost;
    applyAbility(ab.id, self, foe, events, log, t, rng);
    return true;
  };

  while (a.hp > 0 && b.hp > 0 && t < MAX_TICKS) {
    t++;
    for (const f of [a, b]) {
      f.energy += f.energyRegen;
      if (f.armorTicks > 0) f.armorTicks--;
      if (f.frenzyTicks > 0) f.frenzyTicks--;
      if (f.slowTicks > 0) f.slowTicks--;
      // poison damage over time
      if (f.poison.length > 0) {
        let pd = 0;
        for (const p of f.poison) {
          pd += p.dmg;
          p.ticks--;
        }
        f.poison = f.poison.filter((p) => p.ticks > 0);
        if (pd > 0) {
          f.hp -= pd;
          events.push({ t, kind: "poison", on: f.side, dmg: pd, hp: Math.max(0, Math.round(f.hp)) });
        }
      }
    }
    if (a.hp <= 0 || b.hp <= 0) break;

    for (const [self, foe] of [
      [a, b],
      [b, a],
    ] as [Fighter, Fighter][]) {
      if (self.hp <= 0 || foe.hp <= 0) continue;
      // try ability first
      useAbility(self, foe);
      if (foe.hp <= 0) continue;
      // basic attack on meter
      self.attackMeter += effSpeed(self);
      if (self.attackMeter >= ATTACK_THRESHOLD) {
        self.attackMeter -= ATTACK_THRESHOLD;
        const crit = chance(rng, 0.08);
        let dmg = basicDamage(self, foe);
        if (crit) dmg = Math.round(dmg * 1.5);
        foe.hp -= dmg;
        events.push({
          t,
          kind: "attack",
          by: self.side,
          dmg,
          crit,
          targetHp: Math.max(0, Math.round(foe.hp)),
          typeMultiplier: typeMultiplier(self.genome.body ?? "", foe.genome.body ?? ""),
        });
      }
    }
  }

  let winner: Side | "draw";
  if (a.hp <= 0 && b.hp <= 0) winner = "draw";
  else if (b.hp <= 0) {
    winner = "a";
    events.push({ t, kind: "death", side: "b" });
  } else if (a.hp <= 0) {
    winner = "b";
    events.push({ t, kind: "death", side: "a" });
  } else {
    // timeout: higher remaining health fraction wins
    const fa = a.hp / a.maxHp;
    const fb = b.hp / b.maxHp;
    winner = fa === fb ? "draw" : fa > fb ? "a" : "b";
  }

  log.push(
    `Winner: ${winner} after ${t} ticks (A ${Math.max(0, Math.round(a.hp))}/${a.maxHp}, B ${Math.max(0, Math.round(b.hp))}/${b.maxHp})`,
  );
  return { winner, ticks: t, events, log };
}

function applyAbility(
  id: AbilityId,
  self: Fighter,
  foe: Fighter,
  events: BattleEvent[],
  log: string[],
  t: number,
  _rng: RNG,
): void {
  switch (id) {
    case "venom": {
      const dmg = Math.max(1, Math.round(self.attack * 0.3));
      foe.poison.push({ dmg, ticks: 5 });
      events.push({ t, kind: "ability", by: self.side, ability: id, value: dmg, targetHp: Math.max(0, Math.round(foe.hp)) });
      log.push(`${self.name} envenoms ${foe.name} (${dmg}/tick)`);
      break;
    }
    case "regenerate": {
      const amount = Math.round(self.maxHp * 0.18);
      self.hp = Math.min(self.maxHp, self.hp + amount);
      events.push({ t, kind: "heal", on: self.side, amount, hp: Math.round(self.hp) });
      break;
    }
    case "spit": {
      const dmg = Math.max(1, Math.round(self.attack * 0.9 - foe.defense * 0.2));
      foe.hp -= dmg;
      events.push({ t, kind: "ability", by: self.side, ability: id, value: dmg, targetHp: Math.max(0, Math.round(foe.hp)) });
      break;
    }
    case "charge": {
      const dmg = Math.max(1, Math.round(self.attack * 1.8 - effDefense(foe) * 0.4));
      foe.hp -= dmg;
      events.push({ t, kind: "ability", by: self.side, ability: id, value: dmg, targetHp: Math.max(0, Math.round(foe.hp)) });
      break;
    }
    case "armor": {
      self.armorTicks = Math.max(self.armorTicks, 35);
      events.push({ t, kind: "ability", by: self.side, ability: id, value: 35, targetHp: Math.round(self.hp) });
      break;
    }
    case "frenzy": {
      self.frenzyTicks = Math.max(self.frenzyTicks, 45);
      events.push({ t, kind: "ability", by: self.side, ability: id, value: 45, targetHp: Math.round(self.hp) });
      break;
    }
    case "shock": {
      const dmg = Math.max(1, Math.round(self.attack * 0.7));
      foe.hp -= dmg;
      foe.slowTicks = Math.max(foe.slowTicks, 25);
      events.push({ t, kind: "ability", by: self.side, ability: id, value: dmg, targetHp: Math.max(0, Math.round(foe.hp)) });
      break;
    }
    case "leech": {
      const dmg = Math.max(1, Math.round(self.attack * 1.1 - effDefense(foe) * 0.4));
      foe.hp -= dmg;
      const heal = Math.round(dmg * 0.5);
      self.hp = Math.min(self.maxHp, self.hp + heal);
      events.push({ t, kind: "ability", by: self.side, ability: id, value: dmg, targetHp: Math.max(0, Math.round(foe.hp)) });
      events.push({ t, kind: "heal", on: self.side, amount: heal, hp: Math.round(self.hp) });
      break;
    }
  }
}
