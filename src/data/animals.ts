import type { Animal } from "../core/types";

/**
 * The donor animal roster. Each animal contributes different stats and powers
 * depending on which body slot it fills, so the same animal feels different as
 * a head vs. a tail. Mix across animals to build hybrids.
 */
export const ANIMALS: Animal[] = [
  {
    id: "ant",
    name: "Ant",
    emoji: "🐜",
    tier: 1,
    parts: {
      head: { stats: { attack: 6, energy: 4 }, ability: "venom" },
      body: { stats: { health: 18, defense: 4 } },
      forelimbs: { stats: { attack: 5 } },
      hindlimbs: { stats: { speed: 6 }, trait: "swift" },
      tail: { stats: { energy: 6 } },
    },
  },
  {
    id: "rabbit",
    name: "Rabbit",
    emoji: "🐇",
    tier: 1,
    parts: {
      head: { stats: { attack: 5, energy: 7 }, trait: "keenSenses" },
      body: { stats: { health: 24, speed: 3 } },
      forelimbs: { stats: { attack: 7 } },
      hindlimbs: { stats: { speed: 10 }, ability: "frenzy", trait: "swift" },
      tail: { stats: { speed: 4 } },
    },
  },
  {
    id: "crab",
    name: "Crab",
    emoji: "🦀",
    tier: 1,
    parts: {
      head: { stats: { defense: 4 } },
      body: { stats: { health: 26, defense: 8 }, trait: "thickHide" },
      forelimbs: { stats: { attack: 9, defense: 2 }, ability: "charge" },
      hindlimbs: { stats: { speed: 2 } },
      tail: { stats: { defense: 4 } },
    },
  },
  {
    id: "gecko",
    name: "Gecko",
    emoji: "🦎",
    tier: 1,
    parts: {
      head: { stats: { attack: 7, energy: 7 }, ability: "spit" },
      body: { stats: { health: 22, defense: 3 }, ability: "regenerate" },
      forelimbs: { stats: { attack: 8 } },
      hindlimbs: { stats: { speed: 8 } },
      tail: { stats: { energy: 6 }, ability: "regenerate" },
    },
  },
  {
    id: "boar",
    name: "Boar",
    emoji: "🐗",
    tier: 1,
    parts: {
      head: { stats: { attack: 7 }, ability: "charge" },
      body: { stats: { health: 25, defense: 5 }, trait: "hardy" },
      forelimbs: { stats: { attack: 6 } },
      hindlimbs: { stats: { speed: 5 } },
      tail: { stats: { health: 6 } },
    },
  },
  {
    id: "wolf",
    name: "Wolf",
    emoji: "🐺",
    tier: 2,
    parts: {
      head: { stats: { attack: 11, energy: 4 }, ability: "leech", trait: "predator" },
      body: { stats: { health: 34, defense: 6 } },
      forelimbs: { stats: { attack: 10 } },
      hindlimbs: { stats: { speed: 11 }, trait: "swift" },
      tail: { stats: { speed: 5 } },
    },
  },
  {
    id: "cobra",
    name: "Cobra",
    emoji: "🐍",
    tier: 2,
    parts: {
      head: { stats: { attack: 9, energy: 8 }, ability: "venom" },
      body: { stats: { health: 28, defense: 4 } },
      forelimbs: { stats: { attack: 6 } },
      hindlimbs: { stats: { speed: 8 } },
      tail: { stats: { attack: 7, energy: 4 }, ability: "venom" },
    },
  },
  {
    id: "scorpion",
    name: "Scorpion",
    emoji: "🦂",
    tier: 2,
    parts: {
      head: { stats: { attack: 8, defense: 3 } },
      body: { stats: { health: 30, defense: 9 }, trait: "thickHide" },
      forelimbs: { stats: { attack: 12, energy: 4 }, ability: "venom" },
      hindlimbs: { stats: { speed: 6 } },
      tail: { stats: { attack: 10, energy: 6 }, ability: "venom", trait: "predator" },
    },
  },
  {
    id: "eagle",
    name: "Eagle",
    emoji: "🦅",
    tier: 2,
    parts: {
      head: { stats: { attack: 12, energy: 6 }, trait: "keenSenses" },
      body: { stats: { health: 26, speed: 6 } },
      forelimbs: { stats: { attack: 9, speed: 4 }, ability: "spit" },
      hindlimbs: { stats: { speed: 13 }, trait: "swift" },
      tail: { stats: { speed: 7 } },
    },
  },
  {
    id: "gorilla",
    name: "Gorilla",
    emoji: "🦍",
    tier: 2,
    parts: {
      head: { stats: { attack: 10, defense: 4 } },
      body: { stats: { health: 44, defense: 8 }, trait: "hardy" },
      forelimbs: { stats: { attack: 15 }, ability: "frenzy", trait: "predator" },
      hindlimbs: { stats: { speed: 6 } },
      tail: { stats: { health: 10 } },
    },
  },
  {
    id: "bear",
    name: "Bear",
    emoji: "🐻",
    tier: 3,
    parts: {
      head: { stats: { attack: 14, defense: 4 }, ability: "frenzy" },
      body: { stats: { health: 56, defense: 10 }, trait: "hardy" },
      forelimbs: { stats: { attack: 18 }, ability: "charge", trait: "predator" },
      hindlimbs: { stats: { speed: 7 } },
      tail: { stats: { health: 12 } },
    },
  },
  {
    id: "rhino",
    name: "Rhino",
    emoji: "🦏",
    tier: 3,
    parts: {
      head: { stats: { attack: 16, defense: 6 }, ability: "charge" },
      body: { stats: { health: 64, defense: 16 }, trait: "thickHide", ability: "armor" },
      forelimbs: { stats: { attack: 12 } },
      hindlimbs: { stats: { speed: 8 } },
      tail: { stats: { defense: 6 } },
    },
  },
  {
    id: "eel",
    name: "Electric Eel",
    emoji: "🐡",
    tier: 3,
    parts: {
      head: { stats: { attack: 12, energy: 10 }, ability: "shock" },
      body: { stats: { health: 32, defense: 5 }, ability: "shock" },
      forelimbs: { stats: { attack: 8, energy: 6 } },
      hindlimbs: { stats: { speed: 10 }, trait: "swift" },
      tail: { stats: { attack: 10, energy: 8 }, ability: "shock", trait: "keenSenses" },
    },
  },
  {
    id: "tiger",
    name: "Tiger",
    emoji: "🐅",
    tier: 3,
    parts: {
      head: { stats: { attack: 15, energy: 6 }, ability: "leech", trait: "predator" },
      body: { stats: { health: 46, defense: 8 } },
      forelimbs: { stats: { attack: 14 }, ability: "frenzy" },
      hindlimbs: { stats: { speed: 12 }, trait: "swift" },
      tail: { stats: { speed: 8 } },
    },
  },
  {
    id: "dragon",
    name: "Dragon",
    emoji: "🐉",
    tier: 3,
    parts: {
      head: { stats: { attack: 14, energy: 8 }, ability: "spit", trait: "predator" },
      body: { stats: { health: 52, defense: 8 }, ability: "frenzy", trait: "hardy" },
      forelimbs: { stats: { attack: 12, energy: 5 }, ability: "charge" },
      hindlimbs: { stats: { speed: 8 } },
      tail: { stats: { attack: 10, energy: 6 }, ability: "shock" },
    },
  },
  {
    id: "jellyfish",
    name: "Jellyfish",
    emoji: "🪼",
    tier: 3,
    parts: {
      head: { stats: { attack: 10, energy: 14 }, ability: "shock", trait: "keenSenses" },
      body: { stats: { health: 38, defense: 6 }, ability: "regenerate" },
      forelimbs: { stats: { attack: 8, energy: 8 }, ability: "leech" },
      hindlimbs: { stats: { speed: 9 }, trait: "swift" },
      tail: { stats: { energy: 10 }, ability: "venom" },
    },
  },
];

export const ANIMALS_BY_ID: Record<string, Animal> = Object.fromEntries(
  ANIMALS.map((a) => [a.id, a]),
);

export function getAnimal(id: string): Animal {
  const a = ANIMALS_BY_ID[id];
  if (!a) throw new Error(`Unknown animal id: ${id}`);
  return a;
}
