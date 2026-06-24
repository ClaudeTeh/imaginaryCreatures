import { SLOTS, type Genome } from "../core/types";

export interface SavedCreature {
  name: string;
  genome: Genome;
}

export const ROSTER_LIMIT = 6;

/** A stable string key for a genome, used to dedupe saved creatures. */
export function genomeKey(g: Genome): string {
  return SLOTS.map((s) => g[s]).join("|");
}

/**
 * Save a creature to the roster: newest first, identical genomes deduped (a
 * re-save just moves it to the front), capped at ROSTER_LIMIT (oldest dropped).
 * Returns a new array — never mutates the input.
 */
export function addToRoster(
  roster: SavedCreature[],
  entry: SavedCreature,
): SavedCreature[] {
  const key = genomeKey(entry.genome);
  const withoutDupe = roster.filter((r) => genomeKey(r.genome) !== key);
  return [entry, ...withoutDupe].slice(0, ROSTER_LIMIT);
}

export function removeFromRoster(
  roster: SavedCreature[],
  index: number,
): SavedCreature[] {
  return roster.filter((_, i) => i !== index);
}

export function isInRoster(roster: SavedCreature[], genome: Genome): boolean {
  const key = genomeKey(genome);
  return roster.some((r) => genomeKey(r.genome) === key);
}
