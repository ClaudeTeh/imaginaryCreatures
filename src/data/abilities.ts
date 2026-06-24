import type { AbilityId, TraitId } from "../core/types";

export interface AbilityDef {
  id: AbilityId;
  name: string;
  /** Energy required to fire. */
  cost: number;
  description: string;
}

export const ABILITIES: Record<AbilityId, AbilityDef> = {
  venom: {
    id: "venom",
    name: "Venom",
    cost: 30,
    description: "Injects poison that deals damage over the next few ticks.",
  },
  regenerate: {
    id: "regenerate",
    name: "Regenerate",
    cost: 40,
    description: "Heals a chunk of health.",
  },
  spit: {
    id: "spit",
    name: "Acid Spit",
    cost: 25,
    description: "A ranged burst that ignores part of the enemy's defense.",
  },
  charge: {
    id: "charge",
    name: "Charge",
    cost: 35,
    description: "A heavy slam dealing big up-front damage.",
  },
  armor: {
    id: "armor",
    name: "Plate Up",
    cost: 30,
    description: "Temporarily raises defense.",
  },
  frenzy: {
    id: "frenzy",
    name: "Frenzy",
    cost: 35,
    description: "Sharply raises attack speed for a short time.",
  },
  shock: {
    id: "shock",
    name: "Shock",
    cost: 30,
    description: "Electric jolt that also briefly slows the enemy.",
  },
  leech: {
    id: "leech",
    name: "Leech",
    cost: 30,
    description: "Bite that heals for part of the damage dealt.",
  },
};

export interface TraitDef {
  id: TraitId;
  name: string;
  description: string;
}

export const TRAITS: Record<TraitId, TraitDef> = {
  thickHide: { id: "thickHide", name: "Thick Hide", description: "+20% defense." },
  swift: { id: "swift", name: "Swift", description: "+15% speed." },
  predator: { id: "predator", name: "Predator", description: "+15% attack." },
  hardy: { id: "hardy", name: "Hardy", description: "+15% health." },
  keenSenses: {
    id: "keenSenses",
    name: "Keen Senses",
    description: "+10% energy gain.",
  },
};
