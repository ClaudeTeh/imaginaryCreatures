# 🧬 Imaginary Creatures

A DNA-splicing creature combiner and arena auto-battler, inspired by
*Impossible Creatures*. Mix body parts from different animals to build a hybrid,
then send it into the arena. Win to unlock stronger species and engineer ever
nastier beasts.

Built with **Vite + TypeScript**, zero runtime dependencies. The game logic
(breeding + combat) is a **deterministic, seeded simulation**, so battles are
fully reproducible — which makes them unit-testable and lets the Canvas arena
replay a fight exactly as it was computed.

## Play it

```bash
npm install
npm run dev        # open the printed localhost URL
```

Build a static bundle:

```bash
npm run build      # outputs to dist/
npm run preview    # serve the production build
```

## How it works

- **Genome** — a creature is five body slots (head, body, forelimbs, hindlimbs,
  tail). Each slot is donated by an animal, and each animal gives different
  stats and powers depending on the slot it fills.
- **Splice DNA** — breed your current creature with another. Each slot is
  inherited 50/50, with a mutation chance that grafts in a random animal —
  producing traits neither parent had.
- **Arena** — your creature fights a power-scaled opponent. Stats drive health,
  attack, defense, speed, and the energy that fuels abilities (Venom, Charge,
  Frenzy, Shock, Leech, Regenerate, Acid Spit, Plate Up). The battle replays on
  a high-DPI Canvas with impact particles, camera shake, floating damage, and
  procedural Web Audio sound effects (toggle with the 🔊 button; no asset files).
- **Progression** — every win unlocks the next species (tiers 1 → 3). Progress
  is saved to `localStorage`.
- **Roster** — save up to six favourite hybrids, reload them into the Lab, or
  delete them. Saves are deduped by genome and persisted.

## Controls & accessibility

- **Keyboard:** `R` randomize · `S` splice · `Enter` fight · (`Enter` fight again / `Esc` back to lab on the result screen).
- **Reduced motion:** if your OS requests reduced motion, battles resolve near-instantly with no camera shake or particles.
- Icon-only buttons have ARIA labels; visible-text buttons keep their text as the accessible name (WCAG "Label in Name").

## Project layout

| Path | Purpose |
|---|---|
| `src/core/` | seeded RNG + shared types |
| `src/data/` | animal roster, abilities, traits |
| `src/genome/` | build a creature from a genome; breeding/mutation |
| `src/combat/` | deterministic battle simulator → event log |
| `src/game/` | save/load state, progression, opponent generation |
| `src/render/` | Lab UI, creature card, Canvas arena replay |
| `tests/` | Vitest unit + balance tests |
| `playtest.mjs` | headless-browser end-to-end playtest |

## Testing

```bash
npm test           # unit + balance tests (Vitest)
npm run e2e        # build + headless-browser playtest (Playwright)
npm run verify     # typecheck + unit tests + build + playtest
```

- **Unit tests** cover the RNG, genome building, breeding, and combat.
- **Balance tests** (`tests/balance.test.ts`) run a per-tier round-robin
  tournament across many seeds and assert no creature is degenerate (always
  wins / always loses within its tier), that fights are decisive, and that power
  rating correlates with winning.
- **Playtest** (`playtest.mjs`) boots the built game in headless Chromium and
  drives the real user flow (change a slot → splice → enter arena → resolve the
  battle → fight again → back to lab), failing on any console or page error.
