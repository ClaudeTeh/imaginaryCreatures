// Element type per body ID.
// tiger=fire (not nature) so eel/jellyfish can beat it via water→fire.
// cobra=air (not water) so it gets 1.2x against wolf/gorilla (nature) via air→nature.
export const BODY_TYPE: Record<string, string> = {
  dragon:   "fire",
  cobra:    "air",
  eel:      "water",
  jellyfish:"water",
  wolf:     "nature",
  bear:     "nature",
  gorilla:  "nature",
  tiger:    "fire",
  rhino:    "earth",
  boar:     "earth",
  scorpion: "earth",
  eagle:    "air",
  ant:      "electric",
  crab:     "electric",
  rabbit:   "electric",
  gecko:    "electric",
  panther:   "nature",
  mantis:    "air",
  chameleon: "nature",
  octopus:   "water",
  bat:       "air",
  ox:        "earth",
  shark:     "water",
  phoenix:   "fire",
};

// Multiplier when attacker's type hits defender's type
// 1.2 = super effective, 0.83 = not very effective, 1.0 = neutral
const CHART: Record<string, Record<string, number>> = {
  fire:     { nature: 1.2, water: 0.83 },
  water:    { fire: 1.2, earth: 1.2, nature: 0.83 },
  nature:   { earth: 1.2, water: 1.2, fire: 0.83 },
  earth:    { fire: 1.2, electric: 1.2, water: 0.83 },
  air:      { nature: 1.2, earth: 1.2, electric: 0.83 },
  electric: { water: 1.2, air: 1.2, earth: 0.83 },
};

export function typeMultiplier(attackerBodyId: string, defenderBodyId: string): number {
  const atkType = BODY_TYPE[attackerBodyId] ?? "normal";
  const defType = BODY_TYPE[defenderBodyId] ?? "normal";
  return CHART[atkType]?.[defType] ?? 1.0;
}
