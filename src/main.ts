import "./styles.css";
import { makeRng } from "./core/rng";
import { SLOTS, type Genome } from "./core/types";
import { simulateBattle, type Side } from "./combat/combat";
import { ANIMALS, getAnimal } from "./data/animals";
import { breed, randomGenome } from "./genome/breed";
import { buildCreature, powerRating, slotLabel } from "./genome/genome";
import { makeOpponent } from "./game/opponents";
import { load, save, unlockNext, type GameState } from "./game/state";
import { addToRoster, isInRoster, removeFromRoster } from "./game/roster";
import { clear, el } from "./render/dom";
import { creatureCard } from "./render/creatureCard";
import { playBattle } from "./render/arena";
import { initAudio, setMuted, sfxLose, sfxWin, toggleMuted } from "./render/sound";

let state: GameState = load();
let cancelArena: (() => void) | null = null;

setMuted(state.muted);

const app = document.getElementById("app")!;

type Screen = "lab" | "arena" | "result";
let screen: Screen = "lab";

function setGenome(next: Genome) {
  state.player = next;
  save(state);
  renderLab();
}

function doRandomize() {
  setGenome(randomGenome(makeRng(Date.now()), state.unlocked));
}

function doSplice() {
  const mate = randomGenome(makeRng(Date.now() ^ 0x55), state.unlocked);
  const child = breed(state.player, mate, makeRng(Date.now() >>> 1), {
    pool: state.unlocked,
  });
  setGenome(child);
}

function topbar(): HTMLElement {
  return el("div", { class: "topbar" }, [
    el("div", { class: "brand" }, [
      el("span", { class: "logo" }, ["🧬"]),
      el("div", {}, [
        el("h1", {}, ["Imaginary Creatures"]),
        el("small", {}, ["Splice DNA. Build a beast. Win the arena."]),
      ]),
    ]),
    el("div", { class: "stats-pills" }, [
      el("span", { class: "pill" }, [pillFrag("Wins", state.wins)]),
      el("span", { class: "pill" }, [pillFrag("Losses", state.losses)]),
      el("span", { class: "pill" }, [pillFrag("Species", state.unlocked.length)]),
      el(
        "button",
        {
          class: "pill",
          title: "Toggle sound",
          onclick: (e) => {
            const muted = toggleMuted();
            state.muted = muted;
            save(state);
            (e.target as HTMLElement).textContent = muted ? "🔇 Sound" : "🔊 Sound";
          },
        },
        [state.muted ? "🔇 Sound" : "🔊 Sound"],
      ),
    ]),
  ]);
}

function pillFrag(label: string, value: number): HTMLElement {
  return el("span", { html: `${label} <b>${value}</b>` });
}

function renderLab() {
  if (cancelArena) {
    cancelArena();
    cancelArena = null;
  }
  screen = "lab";
  clear(app);

  const builder = el("div", { class: "panel" }, [
    el("h2", {}, ["Genetics Lab"]),
    el(
      "div",
      { class: "slots" },
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
    ),
    el("div", { class: "btnrow" }, [
      el("button", { onclick: doRandomize }, ["🎲 Randomize"]),
      el("button", { onclick: doSplice }, ["🧬 Splice DNA"]),
    ]),
    el("p", { class: "hint" }, [
      "Each animal gives different stats and powers depending on the slot it fills. " +
        "Splice mixes your current creature with a random one — mutations can graft in traits from neither parent. Win fights to unlock stronger species.",
    ]),
    el("p", { class: "hint" }, [
      "⌨ Shortcuts: R randomize · S splice · Enter fight",
    ]),
  ]);

  const creature = buildCreature(state.player);
  const alreadySaved = isInRoster(state.roster, state.player);
  const preview = el("div", { class: "panel" }, [
    el("h2", {}, ["Your Creature"]),
    creatureCard(creature),
    el("div", { class: "btnrow" }, [
      el("button", { class: "primary", onclick: startBattle }, ["⚔ Enter Arena"]),
      el(
        "button",
        {
          disabled: alreadySaved,
          onclick: () => {
            state.roster = addToRoster(state.roster, {
              name: creature.name,
              genome: { ...state.player },
            });
            save(state);
            renderLab();
          },
        },
        [alreadySaved ? "✓ Saved" : "💾 Save"],
      ),
    ]),
  ]);

  app.append(
    topbar(),
    el("div", { class: "layout" }, [builder, preview]),
    opponentPanel(creature),
    rosterPanel(),
  );
}

function opponentPanel(player: ReturnType<typeof buildCreature>): HTMLElement {
  const opponent = makeOpponent(player, state.wins, state.seed);
  const yourPower = powerRating(player);
  const theirPower = powerRating(opponent);
  const verdict =
    theirPower > yourPower * 1.12
      ? el("span", { class: "verdict tough" }, ["Tougher than you — build to counter"])
      : theirPower < yourPower * 0.88
        ? el("span", { class: "verdict easy" }, ["You out-power them"])
        : el("span", { class: "verdict even" }, ["Evenly matched"]);

  return el("div", { class: "panel opponent-panel" }, [
    el("div", { class: "opponent-head" }, [
      el("h2", {}, ["⚔ Next Opponent"]),
      el("div", { class: "btnrow", style: "margin:0" }, [
        el(
          "button",
          {
            title: "Scout a different opponent",
            onclick: () => {
              state.seed = (state.seed * 1664525 + 1013904223) >>> 0;
              save(state);
              renderLab();
            },
          },
          ["🔄 Scout another"],
        ),
      ]),
    ]),
    creatureCard(opponent),
    el("p", { class: "hint" }, [verdict]),
  ]);
}

function rosterPanel(): HTMLElement {
  const items =
    state.roster.length === 0
      ? [el("p", { class: "hint" }, ["No saved creatures yet. Build one and hit 💾 Save."])]
      : state.roster.map((entry, i) => {
          const c = buildCreature(entry.genome, entry.name);
          return el("div", { class: "roster-item" }, [
            el("span", { class: "roster-emoji" }, [c.emoji]),
            el("div", { class: "roster-meta" }, [
              el("div", { class: "roster-name" }, [c.name]),
              el("div", { class: "roster-power" }, [`Power ${powerRating(c)}`]),
            ]),
            el("div", { class: "roster-actions" }, [
              el(
                "button",
                {
                  onclick: () => {
                    state.player = { ...entry.genome };
                    save(state);
                    renderLab();
                  },
                },
                ["Load"],
              ),
              el(
                "button",
                {
                  title: "Delete",
                  "aria-label": `Delete ${c.name}`,
                  onclick: () => {
                    state.roster = removeFromRoster(state.roster, i);
                    save(state);
                    renderLab();
                  },
                },
                ["🗑"],
              ),
            ]),
          ]);
        });

  return el("div", { class: "panel roster-panel" }, [
    el("h2", {}, [`Saved Roster (${state.roster.length}/6)`]),
    el("div", { class: "roster-grid" }, items),
  ]);
}

function startBattle() {
  initAudio(); // unlock Web Audio on this user gesture
  screen = "arena";
  const player = buildCreature(state.player);
  const opponent = makeOpponent(player, state.wins, state.seed);
  const battleSeed = (state.seed ^ (state.wins * 2654435761)) >>> 0;
  const result = simulateBattle(player, opponent, makeRng(battleSeed));

  clear(app);
  const canvas = el("canvas", {
    id: "arena",
    role: "img",
    "aria-label": "Battle arena replay",
  }) as HTMLCanvasElement;
  const resultArea = el("div", { class: "center" }, []);

  app.append(
    topbar(),
    el("div", { class: "panel arena-wrap" }, [
      el("div", { class: "arena-fighters" }, [
        el("div", { class: "fighter-tag" }, [
          el("div", { class: "nm" }, [`${player.emoji} ${player.name}`]),
          el("div", { class: "pw" }, [`Power ${powerRating(player)}`]),
        ]),
        el("div", { class: "fighter-tag right" }, [
          el("div", { class: "nm" }, [`${opponent.name} ${opponent.emoji}`]),
          el("div", { class: "pw" }, [`Power ${powerRating(opponent)}`]),
        ]),
      ]),
      canvas,
      resultArea,
    ]),
  );

  cancelArena = playBattle(canvas, result, (winner) => {
    cancelArena = null;
    showResult(resultArea, winner, opponent.name);
  });
}

function showResult(area: HTMLElement, winner: Side | "draw", opponentName: string) {
  screen = "result";
  const playerWon = winner === "a";
  let unlockedId: string | null = null;

  if (playerWon) {
    state.wins++;
    unlockedId = unlockNext(state);
    sfxWin();
  } else if (winner === "b") {
    state.losses++;
    sfxLose();
  }
  state.seed = (state.seed * 1664525 + 1013904223) >>> 0;
  save(state);

  const banner = playerWon
    ? el("div", { class: "result-banner win" }, ["VICTORY"])
    : winner === "draw"
      ? el("div", { class: "result-banner draw" }, ["DRAW"])
      : el("div", { class: "result-banner lose" }, ["DEFEAT"]);

  const lines: (Node | string)[] = [banner];
  lines.push(
    el("p", { class: "hint" }, [
      playerWon
        ? `You beat ${opponentName}.`
        : winner === "draw"
          ? `Stalemate with ${opponentName}.`
          : `${opponentName} beat you. Tweak your genome and try again.`,
    ]),
  );
  if (unlockedId) {
    const a = getAnimal(unlockedId);
    lines.push(
      el("p", { class: "unlock-note" }, [`🔓 New species unlocked: ${a.emoji} ${a.name}!`]),
    );
  }
  lines.push(
    el("div", { class: "btnrow", style: "justify-content:center" }, [
      el("button", { class: "accent", onclick: startBattle }, ["⚔ Fight Again"]),
      el("button", { onclick: renderLab }, ["🧪 Back to Lab"]),
    ]),
  );

  clear(area);
  area.append(el("div", { class: "fadein" }, lines));
}

// Keyboard controls (accessibility): drive the game without a mouse.
window.addEventListener("keydown", (e) => {
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === "SELECT" || tag === "INPUT" || tag === "TEXTAREA") return;
  if (screen === "lab") {
    if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      doRandomize();
    } else if (e.key === "s" || e.key === "S") {
      e.preventDefault();
      doSplice();
    } else if (e.key === "Enter") {
      e.preventDefault();
      startBattle();
    }
  } else if (screen === "result") {
    if (e.key === "Enter") {
      e.preventDefault();
      startBattle();
    } else if (e.key === "Escape") {
      e.preventDefault();
      renderLab();
    }
  }
});

// sanity: ensure data integrity at boot (helps catch a broken save/build)
if (ANIMALS.length === 0) throw new Error("No animals defined");
renderLab();
