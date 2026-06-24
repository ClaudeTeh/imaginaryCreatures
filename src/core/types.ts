/** The five body-part slots that make up a creature's genome. */
export const SLOTS = ["head", "body", "forelimbs", "hindlimbs", "tail"] as const;
export type Slot = (typeof SLOTS)[number];

export interface StatBlock {
  health: number;
  attack: number;
  defense: number;
  /** Higher = attacks more often. */
  speed: number;
  /** Pool that fuels active abilities. */
  energy: number;
}

export const ZERO_STATS: StatBlock = {
  health: 0,
  attack: 0,
  defense: 0,
  speed: 0,
  energy: 0,
};

export type AbilityId =
  | "venom"
  | "regenerate"
  | "spit"
  | "charge"
  | "armor"
  | "frenzy"
  | "shock"
  | "leech";

export type TraitId =
  | "thickHide"
  | "swift"
  | "predator"
  | "hardy"
  | "keenSenses";

/** One animal's contribution when it fills a given slot. */
export interface PartDef {
  stats: Partial<StatBlock>;
  ability?: AbilityId;
  trait?: TraitId;
}

export interface Animal {
  id: string;
  name: string;
  emoji: string;
  /** Rough power tier, used for unlock progression. */
  tier: 1 | 2 | 3;
  parts: Record<Slot, PartDef>;
}

/** A genome maps each slot to the id of the animal that donated that part. */
export type Genome = Record<Slot, string>;

export interface Creature {
  name: string;
  genome: Genome;
  emoji: string;
  stats: StatBlock;
  abilities: AbilityId[];
  traits: TraitId[];
}
