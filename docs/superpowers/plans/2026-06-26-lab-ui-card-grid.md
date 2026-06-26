# Lab UI Card Grid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 5 `<select>` dropdowns in the Genetics Lab with horizontal scrollable animal card rows, with hover-to-preview (3D model + stats tooltip) and locked-animal dimming.

**Architecture:** Two tasks — CSS first (cards/tooltip/row), then JS (replace select elements with `buildSlotCards()` in `renderLab()`). Both changes live in existing files only. No unit tests for DOM/Three.js interaction — typecheck + visual verification is the gate.

**Tech Stack:** TypeScript, vanilla DOM (`el()` helper from `./render/dom`), CSS custom properties, Three.js (via `creature3d.setGenome()`)

## Global Constraints

- Never touch `src/combat/` — simulation is separate from renderer
- `npm run typecheck` must return 0 errors before any commit
- `npm run test` must pass (46/46) before any commit
- No new files — changes go into `src/styles.css` and `src/main.ts` only
- All 16 ANIMALS must appear in the card row (locked ones dimmed, not hidden)
- `data-slot` and `data-animal-id` attributes required on every card for testability

---

## File Map

| File | Action | Change |
|---|---|---|
| `src/styles.css` | Modify | Add `.slot-cards`, `.animal-card`, `.card-tooltip` styles |
| `src/main.ts` | Modify | Add `pureGenome` import; add `buildSlotCards`, `buildTooltip`, `positionTooltip`; replace slot selects in `renderLab()` |

---

## Task 1: CSS — card row, card tile, tooltip

**Files:**
- Modify: `src/styles.css`

**Interfaces:**
- Produces: CSS classes `.slot-cards`, `.animal-card`, `.animal-card.selected`, `.animal-card.locked`, `.card-emoji`, `.card-name`, `.card-tooltip`, `.tip-stat`, `.tip-ability`, `.tip-trait`

- [ ] **Step 1: Append card styles to `src/styles.css`**

Add the following to the end of `src/styles.css`:

```css
/* ── Lab card grid ────────────────────────────────────── */

.slot-cards {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}

.slot-cards::-webkit-scrollbar {
  height: 4px;
}
.slot-cards::-webkit-scrollbar-thumb {
  background: var(--line);
  border-radius: 2px;
}

.animal-card {
  position: relative;
  flex-shrink: 0;
  width: 72px;
  height: 80px;
  background: var(--panel-2);
  border: 2px solid var(--line);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  transition:
    transform 0.1s ease,
    border-color 0.1s ease,
    box-shadow 0.1s ease;
  user-select: none;
}

.animal-card:hover {
  transform: scale(1.06);
  border-color: var(--gold);
  z-index: 10;
}

.animal-card.selected {
  border-color: var(--gold);
  box-shadow: 0 0 12px rgba(255, 206, 107, 0.4);
}

.animal-card.locked {
  opacity: 0.35;
  cursor: default;
  pointer-events: none;
}

.card-emoji {
  font-size: 28px;
  line-height: 1;
}

.card-name {
  font-size: 10px;
  color: var(--muted);
  text-align: center;
  line-height: 1.2;
  padding: 0 4px;
}

/* ── Stats tooltip ───────────────────────────────────── */

.card-tooltip {
  position: fixed;
  z-index: 2000;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 11px;
  color: var(--text);
  pointer-events: none;
  min-width: 120px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
}

.tip-stat {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  line-height: 1.7;
}

.tip-divider {
  margin: 4px 0;
  border: none;
  border-top: 1px solid var(--line);
}

.tip-ability {
  color: var(--accent);
  font-size: 10px;
  line-height: 1.6;
}

.tip-trait {
  color: var(--gold);
  font-size: 10px;
  line-height: 1.6;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd ~/imaginaryCreatures && npm run typecheck
```
Expected: 0 errors. (CSS changes can't fail typecheck, but run it as a baseline.)

- [ ] **Step 3: Commit**

```bash
cd ~/imaginaryCreatures && git add src/styles.css
git commit -m "feat: add lab card grid CSS — slot-cards, animal-card, card-tooltip"
```

---

## Task 2: Replace select dropdowns with card rows in main.ts

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes:
  - `creature3d: Creature3DHandle | null` — module-level variable (already exists in main.ts)
  - `state.player: Genome` — current genome (already exists)
  - `state.unlocked: string[]` — unlocked animal IDs (already exists)
  - `setGenome(next: Genome): void` — already exists in main.ts
  - `ANIMALS: Animal[]` — already imported from `./data/animals`
  - `pureGenome(animalId: string): Genome` — must add to import from `./genome/genome`
  - `el(tag, props, children): HTMLElement` — already imported from `./render/dom`
  - `slotLabel(slot: Slot): string` — already imported from `./genome/genome`
  - `Animal` type — import from `./core/types`
  - `Slot` type — already imported from `./core/types`
  - `PartDef` type — already in `./core/types`

- Produces: `buildSlotCards(slot: Slot): HTMLElement`, `buildTooltip(a: Animal, slot: Slot): HTMLElement`, `positionTooltip(tooltip: HTMLElement, anchor: HTMLElement): void` (all local to main.ts, not exported)

**Note:** No unit tests — these functions manipulate `creature3d` (Three.js) and DOM directly. Typecheck + manual visual verification is the gate.

- [ ] **Step 1: Add imports to main.ts**

Find the existing import line (line ~7):
```typescript
import { buildCreature, powerRating, slotLabel } from "./genome/genome";
```
Replace with:
```typescript
import { buildCreature, powerRating, pureGenome, slotLabel } from "./genome/genome";
```

Find the existing type import (line ~3):
```typescript
import { SLOTS, type Genome } from "./core/types";
```
Replace with:
```typescript
import { SLOTS, type Animal, type Genome, type Slot } from "./core/types";
```

- [ ] **Step 2: Add `buildSlotCards`, `buildTooltip`, `positionTooltip` functions**

Add these three functions to `main.ts`, just before the `renderLab()` function (around line 227):

```typescript
function buildSlotCards(slot: Slot): HTMLElement {
  const row = el("div", { class: "slot-cards" }) as HTMLElement;
  let activeTooltip: HTMLElement | null = null;

  const removeTooltip = () => {
    activeTooltip?.remove();
    activeTooltip = null;
  };

  for (const a of ANIMALS) {
    const isUnlocked = (state.unlocked as string[]).includes(a.id);
    const isSelected = state.player[slot] === a.id;

    const classes = [
      "animal-card",
      isSelected ? "selected" : "",
      !isUnlocked ? "locked" : "",
    ]
      .filter(Boolean)
      .join(" ");

    const card = el(
      "div",
      {
        class: classes,
        "data-slot": slot,
        "data-animal-id": a.id,
      },
      [
        el("span", { class: "card-emoji" }, [a.emoji]),
        el("span", { class: "card-name" }, [a.name]),
      ],
    ) as HTMLElement;

    if (isUnlocked) {
      card.addEventListener("click", () => {
        setGenome({ ...state.player, [slot]: a.id });
      });

      card.addEventListener("mouseenter", () => {
        removeTooltip();
        activeTooltip = buildTooltip(a, slot);
        document.body.appendChild(activeTooltip);
        positionTooltip(activeTooltip, card);
        creature3d?.setGenome(pureGenome(a.id));
      });

      card.addEventListener("mouseleave", () => {
        removeTooltip();
        creature3d?.setGenome(state.player);
      });
    }

    row.append(card);
  }

  return row;
}

function buildTooltip(a: Animal, slot: Slot): HTMLElement {
  const part = a.parts[slot];
  const stats = part.stats;
  const lines: HTMLElement[] = [];

  const statDefs: [keyof typeof stats, string][] = [
    ["attack", "⚔ Attack"],
    ["defense", "🛡 Defense"],
    ["health", "❤ Health"],
    ["speed", "⚡ Speed"],
    ["energy", "✨ Energy"],
  ];

  for (const [key, label] of statDefs) {
    const val = stats[key];
    if (val !== undefined && val > 0) {
      lines.push(
        el("div", { class: "tip-stat" }, [
          el("span", {}, [label]),
          el("span", {}, [String(val)]),
        ]) as HTMLElement,
      );
    }
  }

  if (part.ability || part.trait) {
    lines.push(el("hr", { class: "tip-divider" }) as HTMLElement);
  }
  if (part.ability) {
    lines.push(el("div", { class: "tip-ability" }, [`🌀 ${part.ability}`]) as HTMLElement);
  }
  if (part.trait) {
    lines.push(el("div", { class: "tip-trait" }, [`✦ ${part.trait}`]) as HTMLElement);
  }

  return el("div", { class: "card-tooltip" }, lines) as HTMLElement;
}

function positionTooltip(tooltip: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const TIP_H = 140;
  const TIP_W = 140;

  let top = rect.top - TIP_H - 8;
  let left = rect.left + rect.width / 2 - TIP_W / 2;

  if (top < 8) top = rect.bottom + 8;
  if (left + TIP_W > window.innerWidth - 8) left = rect.right - TIP_W;
  if (left < 8) left = 8;

  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;
  tooltip.style.width = `${TIP_W}px`;
}
```

- [ ] **Step 3: Replace slot selects in `renderLab()` with card rows**

Find this block inside `renderLab()` (around line 241):

```typescript
      SLOTS.map((slot) => {
        const select = el("select", {
          onchange: (e) => {
            const next = { ...state.player, [slot]: (e.target as HTMLSelectElement).value };
            setGenome(next);
          },
        }) as HTMLSelectElement;
        for (const id of state.unlocked) {
          const a = getAnimal(id);
          const opt = el("option", { value: id }, [`${a.emoji}  ${a.name}`]);
          if (state.player[slot] === id) (opt as HTMLOptionElement).selected = true;
          select.append(opt);
        }
        return el("div", { class: "slot" }, [
          el("label", {}, [slotLabel(slot)]),
          select,
        ]);
      }),
```

Replace with:

```typescript
      SLOTS.map((slot) =>
        el("div", { class: "slot" }, [
          el("label", {}, [slotLabel(slot)]),
          buildSlotCards(slot),
        ]),
      ),
```

- [ ] **Step 4: Scroll selected card into view after render**

At the end of `renderLab()`, just before the closing `}`, add:

```typescript
  // Scroll each card row so the selected card is visible on first render
  requestAnimationFrame(() => {
    document.querySelectorAll<HTMLElement>(".animal-card.selected").forEach((card) => {
      card.scrollIntoView({ block: "nearest", inline: "center" });
    });
  });
```

- [ ] **Step 5: Remove unused `getAnimal` import if it's no longer used**

Check if `getAnimal` is still used elsewhere in `main.ts`:

```bash
cd ~/imaginaryCreatures && grep -n "getAnimal" src/main.ts
```

If it only appeared in the old dropdown code and nowhere else, remove it from the import:
```typescript
import { ANIMALS } from "./data/animals";
```
If it's still used (e.g. in `opponentPanel` or elsewhere), leave the import untouched.

- [ ] **Step 6: Typecheck**

```bash
cd ~/imaginaryCreatures && npm run typecheck
```
Expected: 0 errors. Common errors to watch for:
- `Property 'attack' does not exist on type 'Partial<StatBlock>'` — `stats[key]` is safe because `Partial<StatBlock>` already types all keys as `number | undefined`; the `!== undefined && > 0` guard is correct
- `Type 'string' is not assignable to type 'Slot'` — if `"data-slot"` causes issues, cast slot as `string` in the props object

- [ ] **Step 7: Visual test in browser**

```bash
cd ~/imaginaryCreatures && npm run dev
```
Open `http://localhost:5173`. In the Genetics Lab:
1. ✅ Each slot shows a horizontal row of emoji cards, not a dropdown
2. ✅ Currently selected animal has gold border + glow
3. ✅ Locked animals appear dimmed (🔒 text replaced by actual emoji, dimmed)
4. ✅ Hovering unlocked card: stats tooltip appears with correct stat values
5. ✅ Hovering unlocked card: 3D preview switches to that animal's pure form
6. ✅ Mouse-off: tooltip disappears, 3D preview reverts to current chimera
7. ✅ Clicking a card: genome updates, card highlights, 3D preview updates
8. ✅ Rows scroll horizontally when there are more cards than visible

- [ ] **Step 8: Run full test suite**

```bash
cd ~/imaginaryCreatures && npm test
```
Expected: 46 passed (0 failures).

- [ ] **Step 9: Commit**

```bash
cd ~/imaginaryCreatures && git add src/main.ts
git commit -m "feat: replace Lab dropdowns with animal card grid — hover preview + stats tooltip"
```
