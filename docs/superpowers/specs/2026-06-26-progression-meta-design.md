# Progression & Meta Design
**Date:** 2026-06-26
**Scope:** Win streak badge, unlock progress bar, and species bestiary screen.

---

## Goal

The game tracks wins but shows nothing beyond a number. Three additions make progression visible and rewarding — matching the meta-loop depth of Temtem/Monster Legends without adding grinding mechanics.

---

## Feature 1: Win Streak Badge

### State change
Add `streak: number` to `GameState` (persisted in localStorage).

- On win: `state.streak++`
- On loss or draw: `state.streak = 0`
- `newGame()` initialises `streak: 0`
- `load()` hydrates `streak: data.streak ?? 0`

### Display
In `topbar()`, after the Wins pill, add a streak badge — visible only when `state.streak >= 3`:

```
🔥×5
```

Style: gold text, fire emoji, no border — inline next to the wins pill. Hidden (not rendered) when streak < 3.

---

## Feature 2: Unlock Progress Bar

Replace the plain `"Species: N"` pill in `topbar()` with a segmented progress bar showing per-tier unlock completion.

Visual:
```
🧬 6 / 16  [████████░░░░░░░░]
```

- Segments filled = `state.unlocked.length`
- Total segments = `ANIMALS.length` (16)
- Use a CSS `<progress>` element styled to match the dark theme, or a div with inline width %
- Tooltip on hover: `"Tier 1: 5/5 · Tier 2: 1/5 · Tier 3: 0/6"`

---

## Feature 3: Species Bestiary

New screen accessible via a "📖 Bestiary" button in `settingsBar()`. Renders `renderBestiary()` (new function in `main.ts`).

### Layout
Grid of 16 animal cards (4 columns on desktop, 2 on narrow):

```
[🐺 Wolf ★★★] [🦅 Eagle ★★★] [🔒 ???] ...
```

Each card:
- Emoji (large)
- Name
- Tier stars (★ per tier level)
- Mini stat bars (attack / defense / health across all 5 parts summed)
- Ability tags (distinct abilities across all 5 slots)
- **Locked animals**: show 🔒 with `"???"` name and no stats

Clicking an unlocked card expands it (or navigates to a detail view) showing per-slot breakdown:
- Each slot's stats + ability + trait

### Navigation
"← Back" button returns to Lab screen.

---

## Architecture

**`src/game/state.ts`:**
- Add `streak: number` to `GameState` interface
- Init to 0 in `newGame()` and `load()`

**`src/main.ts`:**
- `topbar()`: add streak badge + replace species pill with progress bar
- `renderLab()` / `startBattle()` win path: `state.streak++`; loss path: `state.streak = 0`
- Add `renderBestiary()` function
- Add "📖 Bestiary" button to `settingsBar()`

**`src/styles.css`:**
- `.streak-badge` — gold inline badge
- `.unlock-progress` — progress bar container + fill
- `.bestiary-grid`, `.bestiary-card`, `.bestiary-card.locked` — bestiary layout

## Edge Cases

| Case | Behaviour |
|---|---|
| Existing save without `streak` | `load()` falls back to 0 — no crash |
| Locked bestiary card clicked | No-op (pointer-events none or early return) |
| Draw result | Streak resets to 0 (same as loss) |
| All 16 unlocked | Progress bar fully filled; bestiary shows all cards |

## Out of Scope

- Leaderboards / cloud sync
- Badges/achievements as separate collectibles
- Bestiary sorting/filtering
