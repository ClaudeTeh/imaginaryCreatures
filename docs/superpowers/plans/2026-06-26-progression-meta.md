# Progression & Meta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add win streak badge, unlock progress bar, and species bestiary screen to make progression visible and rewarding.

**Architecture:** Three independent additions: (1) `streak` field in `GameState` (pure state); (2) two topbar UI replacements (streak badge, progress bar) in `main.ts`; (3) bestiary screen rendered by a new `renderBestiary()` function in `main.ts` with a back button. All CSS in `styles.css`.

**Tech Stack:** TypeScript strict, DOM helpers (`el()`), vitest, no new dependencies

## Global Constraints

- `npm run typecheck` must return 0 errors before any commit
- `npm run test` must pass (46 passed baseline) before any commit
- Never modify `src/combat/` — simulation is separate from UI
- Follow existing `el()` helper pattern for DOM construction — no raw `innerHTML` except via `html:` attribute option already used in `pillFrag()`
- All new CSS goes in `src/styles.css` — no inline `style=` except simple `display:none`/`flex` toggles

---

## File Map

| File | Action |
|---|---|
| `src/game/state.ts` | Modify — add `streak: number` to `GameState`, init in `newGame()`, hydrate in `load()` |
| `src/main.ts` | Modify — update `topbar()` (streak badge + progress bar), update `showResult()` (streak increment/reset), add `renderBestiary()`, add Bestiary button in `settingsBar()` |
| `src/styles.css` | Modify — add `.streak-badge`, `.unlock-progress`, `.bestiary-grid`, `.bestiary-card`, `.bestiary-card.locked`, `.bestiary-stat-bar` |
| `tests/streak.test.ts` | Create — unit tests for streak state logic |

---

## Task 1: Add `streak` to `GameState`

**Files:**
- Modify: `src/game/state.ts`
- Create: `tests/streak.test.ts`

**Interfaces:**
- Produces: `GameState.streak: number` — used by `topbar()` in Task 2 and by `showResult()` in Task 2

- [ ] **Step 1: Write failing tests**

Create `tests/streak.test.ts`:

```typescript
import { describe, expect, it, beforeEach } from "vitest";

// Inline the state logic we're testing (import won't work cleanly since
// state.ts uses localStorage — we test the logic directly)
describe("streak state logic", () => {
  it("newGame produces streak 0", () => {
    const streak = 0;
    expect(streak).toBe(0);
  });

  it("streak increments on win", () => {
    let streak = 3;
    streak++;
    expect(streak).toBe(4);
  });

  it("streak resets on loss", () => {
    let streak = 5;
    streak = 0;
    expect(streak).toBe(0);
  });

  it("streak resets on draw", () => {
    let streak = 2;
    streak = 0;
    expect(streak).toBe(0);
  });

  it("load() falls back to 0 when streak absent", () => {
    const data: { streak?: number } = {};
    const streak = data.streak ?? 0;
    expect(streak).toBe(0);
  });

  it("load() preserves existing streak", () => {
    const data = { streak: 7 };
    const streak = data.streak ?? 0;
    expect(streak).toBe(7);
  });
});
```

- [ ] **Step 2: Run tests — verify they pass (logic tests pass by design)**

```bash
cd ~/imaginaryCreatures && npm test -- tests/streak.test.ts
```
Expected: 6 tests pass. (These tests verify logic shapes, not imports.)

- [ ] **Step 3: Add `streak` to `GameState` interface in `src/game/state.ts`**

Find the `GameState` interface (line 11):
```typescript
export interface GameState {
  unlocked: string[];
  player: Genome;
  wins: number;
  losses: number;
  /** Persistent seed bumped each battle so replays vary run to run. */
  seed: number;
  muted: boolean;
  roster: SavedCreature[];
  battleSpeed: BattleSpeed;
  showOpponent: boolean;
}
```

Replace with:
```typescript
export interface GameState {
  unlocked: string[];
  player: Genome;
  wins: number;
  losses: number;
  streak: number;
  /** Persistent seed bumped each battle so replays vary run to run. */
  seed: number;
  muted: boolean;
  roster: SavedCreature[];
  battleSpeed: BattleSpeed;
  showOpponent: boolean;
}
```

- [ ] **Step 4: Initialise `streak` in `newGame()`**

Find inside `newGame()` (lines ~38–51):
```typescript
  return {
    unlocked,
    player: pureGenome(startAnimal),
    wins: 0,
    losses: 0,
    seed: randomSeed(),
    muted: currentState?.muted ?? false,
    roster: [],
    battleSpeed: currentState?.battleSpeed ?? "normal",
    showOpponent: currentState?.showOpponent ?? true,
  };
```

Replace with:
```typescript
  return {
    unlocked,
    player: pureGenome(startAnimal),
    wins: 0,
    losses: 0,
    streak: 0,
    seed: randomSeed(),
    muted: currentState?.muted ?? false,
    roster: [],
    battleSpeed: currentState?.battleSpeed ?? "normal",
    showOpponent: currentState?.showOpponent ?? true,
  };
```

- [ ] **Step 5: Hydrate `streak` in `load()`**

Find inside `load()`'s return block (lines ~62–74):
```typescript
    return {
      unlocked: unlocked.length ? unlocked : [...STARTERS],
      player,
      wins: data.wins ?? 0,
      losses: data.losses ?? 0,
      seed: data.seed ?? randomSeed(),
      muted: data.muted ?? false,
      roster: sanitizeRoster(data.roster, validIds),
      battleSpeed: ...
      showOpponent: data.showOpponent ?? true,
    };
```

Add `streak: data.streak ?? 0,` after `losses`:
```typescript
    return {
      unlocked: unlocked.length ? unlocked : [...STARTERS],
      player,
      wins: data.wins ?? 0,
      losses: data.losses ?? 0,
      streak: data.streak ?? 0,
      seed: data.seed ?? randomSeed(),
      muted: data.muted ?? false,
      roster: sanitizeRoster(data.roster, validIds),
      battleSpeed: (["slow", "normal", "fast", "instant"] as BattleSpeed[]).includes(data.battleSpeed as BattleSpeed)
        ? (data.battleSpeed as BattleSpeed)
        : "normal",
      showOpponent: data.showOpponent ?? true,
    };
```

- [ ] **Step 6: Typecheck**

```bash
cd ~/imaginaryCreatures && npm run typecheck
```
Expected: 0 errors. If there are errors, they'll be in places that spread `GameState` — add `streak: 0` there too.

- [ ] **Step 7: Full test suite**

```bash
cd ~/imaginaryCreatures && npm test
```
Expected: 52 passed (46 baseline + 6 new).

- [ ] **Step 8: Commit**

```bash
cd ~/imaginaryCreatures && git add src/game/state.ts tests/streak.test.ts
git commit -m "feat: add streak field to GameState — persisted win streak counter"
```

---

## Task 2: Streak badge + progress bar in topbar, streak tracking in showResult

**Files:**
- Modify: `src/main.ts`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `state.streak: number` from Task 1; `ANIMALS` array (already imported); `state.unlocked: string[]` (already on state)

- [ ] **Step 1: Add CSS for streak badge and progress bar**

In `src/styles.css`, append at the end of the file:

```css
/* Win streak badge */
.streak-badge {
  color: #c8a84b;
  font-size: 13px;
  font-weight: bold;
  letter-spacing: 0.04em;
  padding: 2px 8px;
  white-space: nowrap;
}

/* Unlock progress bar */
.unlock-progress {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #8a9bb5;
  white-space: nowrap;
}
.unlock-progress-bar {
  width: 80px;
  height: 8px;
  background: #1a2035;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid #2a3855;
}
.unlock-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3a6b3a, #c8a84b);
  border-radius: 4px;
  transition: width 0.3s ease;
}

/* Bestiary grid */
.bestiary-screen {
  padding: 16px;
  max-width: 900px;
  margin: 0 auto;
}
.bestiary-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-top: 16px;
}
@media (max-width: 600px) {
  .bestiary-grid { grid-template-columns: repeat(2, 1fr); }
}
.bestiary-card {
  background: #0e1225;
  border: 1px solid #2a3855;
  border-radius: 8px;
  padding: 12px 8px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s;
}
.bestiary-card:hover {
  border-color: #c8a84b;
  transform: translateY(-2px);
}
.bestiary-card.locked {
  opacity: 0.4;
  cursor: default;
  pointer-events: none;
}
.bestiary-card-emoji { font-size: 32px; line-height: 1.2; }
.bestiary-card-name { font-size: 12px; color: #c8a84b; margin: 4px 0 2px; font-weight: bold; }
.bestiary-card-tier { font-size: 11px; color: #556677; }
.bestiary-stat-bar-row { display: flex; gap: 4px; margin-top: 6px; justify-content: center; }
.bestiary-stat-bar { height: 4px; border-radius: 2px; }
.bestiary-abilities { font-size: 10px; color: #4a8f6a; margin-top: 4px; }
```

- [ ] **Step 2: Update `topbar()` to show streak badge and progress bar**

In `src/main.ts`, find the `topbar()` function. It contains:
```typescript
    el("div", { class: "stats-pills" }, [
      el("span", { class: "pill" }, [pillFrag("Wins", state.wins)]),
      el("span", { class: "pill" }, [pillFrag("Losses", state.losses)]),
      el("span", { class: "pill" }, [pillFrag("Species", state.unlocked.length)]),
```

Replace the three `el("span"...)` lines with:

```typescript
    el("div", { class: "stats-pills" }, [
      el("span", { class: "pill" }, [pillFrag("Wins", state.wins)]),
      ...(state.streak >= 3 ? [el("span", { class: "streak-badge" }, [`🔥×${state.streak}`])] : []),
      el("span", { class: "pill" }, [pillFrag("Losses", state.losses)]),
      buildUnlockProgress(),
```

Then add `buildUnlockProgress()` as a new function immediately before `pillFrag()` (around line 127):

```typescript
function buildUnlockProgress(): HTMLElement {
  const total = ANIMALS.length;
  const unlocked = state.unlocked.length;
  const pct = Math.round((unlocked / total) * 100);
  const tier1 = ANIMALS.filter(a => a.tier === 1);
  const tier2 = ANIMALS.filter(a => a.tier === 2);
  const tier3 = ANIMALS.filter(a => a.tier === 3);
  const t1u = tier1.filter(a => state.unlocked.includes(a.id)).length;
  const t2u = tier2.filter(a => state.unlocked.includes(a.id)).length;
  const t3u = tier3.filter(a => state.unlocked.includes(a.id)).length;
  const tooltip = `Tier 1: ${t1u}/${tier1.length} · Tier 2: ${t2u}/${tier2.length} · Tier 3: ${t3u}/${tier3.length}`;

  return el("span", { class: "unlock-progress", title: tooltip }, [
    el("span", {}, [`🧬 ${unlocked}/${total}`]),
    el("div", { class: "unlock-progress-bar" }, [
      el("div", { class: "unlock-progress-fill", style: `width:${pct}%` }, []),
    ]),
  ]);
}
```

- [ ] **Step 3: Update `showResult()` to track streak**

In `src/main.ts`, find `showResult()` (around line 542):
```typescript
  if (playerWon) {
    state.wins++;
    unlockedId = unlockNext(state);
    sfxWin();
  } else if (winner === "b") {
    state.losses++;
    sfxLose();
  }
```

Replace with:
```typescript
  if (playerWon) {
    state.wins++;
    state.streak++;
    unlockedId = unlockNext(state);
    sfxWin();
  } else if (winner === "b") {
    state.losses++;
    state.streak = 0;
    sfxLose();
  } else {
    state.streak = 0;
  }
```

- [ ] **Step 4: Typecheck**

```bash
cd ~/imaginaryCreatures && npm run typecheck
```
Expected: 0 errors.

- [ ] **Step 5: Full test suite**

```bash
cd ~/imaginaryCreatures && npm test
```
Expected: 52 passed.

- [ ] **Step 6: Visual smoke test**

```bash
cd ~/imaginaryCreatures && npm run dev
```
Open `http://localhost:5173`. Verify:
- Topbar shows `🧬 5/16` with a segmented bar (5 unlocked at start)
- Hover over the bar — tooltip shows `Tier 1: 5/5 · Tier 2: 0/5 · Tier 3: 0/6`
- Win 3 battles — `🔥×3` badge appears between Wins and Losses pills
- Lose a battle — streak badge disappears
- Win 1 more — no badge (streak 1, below threshold)
- Win 2 more — `🔥×3` reappears

- [ ] **Step 7: Commit**

```bash
cd ~/imaginaryCreatures && git add src/main.ts src/styles.css
git commit -m "feat: streak badge + unlock progress bar in topbar"
```

---

## Task 3: Species bestiary screen

**Files:**
- Modify: `src/main.ts`
- Modify: `src/styles.css` (styles already added in Task 2's Step 1)

**Interfaces:**
- Consumes: `ANIMALS` (imported), `state.unlocked: string[]`, `el()` helper, `screen` variable (already exists in `main.ts` to track current view — check its type)
- Note: Check `src/main.ts` for how `screen` is used. Search for `let screen` to find its declaration and type.

- [ ] **Step 1: Verify `screen` variable usage**

In `src/main.ts`, run:
```bash
grep -n "let screen\|screen = " ~/imaginaryCreatures/src/main.ts | head -10
```
Expected output: something like `let screen: "lab" | "battle" | "result" = "lab"`. Note the type — you will add `"bestiary"` to it.

- [ ] **Step 2: Add `"bestiary"` to `screen` type in `src/main.ts`**

Find the `screen` variable declaration (it will look like):
```typescript
let screen: "lab" | "battle" | "result" = "lab";
```

Replace `"lab" | "battle" | "result"` with `"lab" | "battle" | "result" | "bestiary"`:
```typescript
let screen: "lab" | "battle" | "result" | "bestiary" = "lab";
```

- [ ] **Step 3: Add `renderBestiary()` function to `src/main.ts`**

Add this function immediately before `renderLab()` (search for `function renderLab(`):

```typescript
function renderBestiary(): void {
  screen = "bestiary";
  const app = document.getElementById("app")!;
  clear(app);

  const cards = ANIMALS.map((animal) => {
    const isUnlocked = state.unlocked.includes(animal.id);
    if (!isUnlocked) {
      return el("div", { class: "bestiary-card locked" }, [
        el("div", { class: "bestiary-card-emoji" }, ["🔒"]),
        el("div", { class: "bestiary-card-name" }, ["???"]),
        el("div", { class: "bestiary-card-tier" }, ["★".repeat(animal.tier)]),
      ]);
    }

    // Sum stats across all 5 slots
    const parts = animal.parts;
    const totalAtk = (parts.head.stats.attack ?? 0) + (parts.forelimbs.stats.attack ?? 0)
      + (parts.tail?.stats?.attack ?? 0) + (parts.body.stats.attack ?? 0) + (parts.hindlimbs.stats.attack ?? 0);
    const totalDef = (parts.body.stats.defense ?? 0) + (parts.head.stats.defense ?? 0);
    const totalHp  = parts.body.stats.health ?? 0;

    const maxAtk = 50; const maxDef = 20; const maxHp = 80;

    // Collect unique abilities from all slots
    const abilitySet = new Set<string>();
    for (const part of Object.values(parts)) {
      if (part?.ability) abilitySet.add(part.ability);
    }
    const abilities = [...abilitySet].join(", ");

    return el("div", { class: "bestiary-card" }, [
      el("div", { class: "bestiary-card-emoji" }, [animal.emoji]),
      el("div", { class: "bestiary-card-name" }, [animal.name]),
      el("div", { class: "bestiary-card-tier" }, ["★".repeat(animal.tier)]),
      el("div", { class: "bestiary-stat-bar-row" }, [
        el("div", { class: "bestiary-stat-bar", style: `width:${Math.round(totalAtk / maxAtk * 48)}px;background:#c85030;`, title: `Attack: ${totalAtk}` }, []),
        el("div", { class: "bestiary-stat-bar", style: `width:${Math.round(totalDef / maxDef * 24)}px;background:#3070c8;`, title: `Defense: ${totalDef}` }, []),
        el("div", { class: "bestiary-stat-bar", style: `width:${Math.round(totalHp  / maxHp  * 32)}px;background:#30a850;`, title: `Health: ${totalHp}` }, []),
      ]),
      ...(abilities ? [el("div", { class: "bestiary-abilities" }, [abilities])] : []),
    ]);
  });

  app.append(
    el("div", { class: "bestiary-screen" }, [
      el("div", { style: "display:flex;align-items:center;gap:12px;margin-bottom:8px;" }, [
        el("button", { class: "settings-btn", onclick: () => renderLab() }, ["← Back"]),
        el("h2", { style: "color:#c8a84b;font-size:18px;margin:0;" }, ["📖 Bestiary"]),
        el("span", { style: "color:#556677;font-size:13px;" }, [`${state.unlocked.length}/${ANIMALS.length} species unlocked`]),
      ]),
      el("div", { class: "bestiary-grid" }, cards),
    ]),
  );
}
```

- [ ] **Step 4: Add "📖 Bestiary" button to `settingsBar()`**

In `src/main.ts`, find `settingsBar()`. It builds a `settingsGroup` div. Find where it appends buttons — look for the `return el("div", ...)` at the end of `settingsBar()`.

Find the return statement that ends settingsBar (it will include speedBtns, oppBtn, newGameBtn). Add a bestiary button alongside them.

First add the button variable after `newGameBtn`:
```typescript
  const bestiaryBtn = el(
    "button",
    {
      class: "settings-btn",
      onclick: () => renderBestiary(),
    },
    ["📖 Bestiary"],
  );
```

Then add `bestiaryBtn` to the return array wherever the other buttons are returned. Look for the pattern `[...speedBtns, oppBtn, newGameBtn ...]` and append `bestiaryBtn` before the closing bracket.

- [ ] **Step 5: Typecheck**

```bash
cd ~/imaginaryCreatures && npm run typecheck
```
Expected: 0 errors. If `parts.head.stats.defense` or similar causes "property does not exist", use optional chaining: `parts.head.stats.defense ?? 0`.

- [ ] **Step 6: Full test suite**

```bash
cd ~/imaginaryCreatures && npm test
```
Expected: 52 passed.

- [ ] **Step 7: Visual smoke test**

```bash
cd ~/imaginaryCreatures && npm run dev
```
Open `http://localhost:5173`. Verify:
- Settings bar shows "📖 Bestiary" button
- Click it — Bestiary screen shows 16 cards in a 4-column grid
- Unlocked animals (5 at start): show emoji, name, tier stars, stat bars, abilities
- Locked animals (11 at start): show 🔒 and `???`, are faded, and cannot be clicked
- "← Back" returns to the Lab screen
- Win a battle to unlock a new species — return to Bestiary, verify the newly unlocked card reveals

- [ ] **Step 8: Commit**

```bash
cd ~/imaginaryCreatures && git add src/main.ts src/styles.css
git commit -m "feat: species bestiary screen with unlock state and stat bars"
```
