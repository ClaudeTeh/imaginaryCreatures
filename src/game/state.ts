import { randomSeed } from "../core/rng";
import type { Genome } from "../core/types";
import { ANIMALS } from "../data/animals";
import { pureGenome } from "../genome/genome";
import type { SavedCreature } from "./roster";

const SAVE_KEY = "imaginary-creatures.save.v1";

export interface GameState {
  unlocked: string[];
  player: Genome;
  wins: number;
  losses: number;
  /** Persistent seed bumped each battle so replays vary run to run. */
  seed: number;
  muted: boolean;
  roster: SavedCreature[];
}

/** Animals available at the start; the rest unlock by winning. */
const STARTERS = ["ant", "rabbit", "crab", "gecko", "boar"];

/** The order locked animals unlock in (tier 1 -> 3). */
export const UNLOCK_ORDER = ANIMALS.filter((a) => !STARTERS.includes(a.id))
  .sort((a, b) => a.tier - b.tier)
  .map((a) => a.id);

export function newGame(): GameState {
  return {
    unlocked: [...STARTERS],
    player: pureGenome("boar"),
    wins: 0,
    losses: 0,
    seed: randomSeed(),
    muted: false,
    roster: [],
  };
}

export function load(): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return newGame();
    const data = JSON.parse(raw) as Partial<GameState>;
    const validIds = new Set(ANIMALS.map((a) => a.id));
    const unlocked = (data.unlocked ?? STARTERS).filter((id) => validIds.has(id));
    const player = sanitizeGenome(data.player, unlocked);
    return {
      unlocked: unlocked.length ? unlocked : [...STARTERS],
      player,
      wins: data.wins ?? 0,
      losses: data.losses ?? 0,
      seed: data.seed ?? randomSeed(),
      muted: data.muted ?? false,
      roster: sanitizeRoster(data.roster, validIds),
    };
  } catch {
    return newGame();
  }
}

function sanitizeRoster(
  roster: SavedCreature[] | undefined,
  validIds: Set<string>,
): SavedCreature[] {
  if (!Array.isArray(roster)) return [];
  return roster.filter(
    (r) =>
      r &&
      typeof r.name === "string" &&
      r.genome &&
      (["head", "body", "forelimbs", "hindlimbs", "tail"] as const).every((s) =>
        validIds.has(r.genome[s]),
      ),
  );
}

export function save(state: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — game still works in-memory */
  }
}

function sanitizeGenome(g: Partial<Genome> | undefined, unlocked: string[]): Genome {
  const fallback = unlocked[0] ?? "boar";
  const base = pureGenome(fallback);
  if (!g) return base;
  const valid = new Set(unlocked);
  return {
    head: valid.has(g.head ?? "") ? g.head! : fallback,
    body: valid.has(g.body ?? "") ? g.body! : fallback,
    forelimbs: valid.has(g.forelimbs ?? "") ? g.forelimbs! : fallback,
    hindlimbs: valid.has(g.hindlimbs ?? "") ? g.hindlimbs! : fallback,
    tail: valid.has(g.tail ?? "") ? g.tail! : fallback,
  };
}

/** Unlock the next locked animal after a win. Returns its id, or null if all owned. */
export function unlockNext(state: GameState): string | null {
  for (const id of UNLOCK_ORDER) {
    if (!state.unlocked.includes(id)) {
      state.unlocked.push(id);
      return id;
    }
  }
  return null;
}
