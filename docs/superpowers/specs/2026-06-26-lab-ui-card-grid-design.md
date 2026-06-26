# Lab UI — Animal Card Grid Design
**Date:** 2026-06-26  
**Scope:** Replace 5 slot `<select>` dropdowns in the Genetics Lab with horizontal scrollable animal card rows, with hover-to-preview and per-slot stats tooltip.

---

## Goal

Make the Genetics Lab feel like a game UI instead of a form. Players should be able to visually browse animals, see what stats each brings to a slot, and preview what their creature looks like as a pure specimen before committing.

## Architecture

**Files touched:**
- `src/main.ts` — replace slot selects with card rows; hoist 3D handle to module scope
- `src/styles.css` — add card, tooltip, and scroll row styles

**No new files.** Keep it lean.

## Data Flow

- **Click a card** → `setGenome({ ...state.player, [slot]: id })` — identical to old `onchange`
- **Hover a card** → `creature3dHandle.setGenome(pureGenome(hoveredId))` — temporarily shows pure animal in 3D preview
- **Mouse-off** → `creature3dHandle.setGenome(state.player)` — reverts to current chimera
- `pureGenome()` from `src/genome/genome.ts` — already exists
- `setGenome()` on the 3D handle — already exists; handle must be hoisted to module scope (currently local to `renderLab()`)

## Components

### SlotCardRow
Renders one horizontal scrollable row per slot (head / body / forelimbs / hindlimbs / tail).

- Label above (e.g. "HEAD")
- `overflow-x: auto`, `display: flex`, `gap: 8px`
- Cards inside

### AnimalCard
~72px × 80px. Dark surface (`palette.surface`), subtle gold border (`palette.borderGold`).

- Large emoji (28px centred)
- Animal name below (11px, muted)
- **Selected state:** gold border + soft glow (`palette.goldBright`)
- **Hovered state:** `transform: scale(1.06)`, border brightens, tooltip shown
- **Locked state:** emoji replaced with 🔒, dimmed opacity (0.4), pointer-events none

### StatsTooltip
Floating card above the hovered animal card. Shows stats for `animal.parts[slot]`:

```
⚔ Attack   11
🛡 Defense   4
⚡ Energy    6
🌀 Leech          ← ability if present
✦ Predator +15% atk  ← trait if present
```

Only stats that exist for that part are shown (no zero-padding absent stats).

Positioning: above card by default. If card is within 120px of viewport top, position below. If within 160px of right edge, align right.

## Edge Cases

| Case | Behaviour |
|---|---|
| Touch / mobile | No hover events → no tooltip, no 3D preview on hover. Tap selects only. Acceptable. |
| Tooltip overflow right edge | `getBoundingClientRect` check → align tooltip right instead of left |
| Hover on locked animal | 3D preview still works (pureGenome doesn't check unlock state). Click disabled. |
| 3D handle not initialised (WebGL fallback) | `creature3dHandle?.setGenome(...)` — optional chain, silent no-op |

## E2E Playtest Update

Current playtest uses `page.selectOption()` on `<select>` elements. Must update to:
- `page.click('[data-animal-id="ant"][data-slot="head"]')` or similar `data-` attribute selectors
- Add `data-slot` and `data-animal-id` attributes to each card for testability

## Out of Scope

- Slots B (arena environments) and C (progression) — separate specs
- Search/filter within cards — YAGNI at 16 species
- Drag-and-drop reordering — YAGNI
