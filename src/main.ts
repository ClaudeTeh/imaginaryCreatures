import "./styles.css";
import { makeRng } from "./core/rng";
import { SLOTS, type Animal, type Genome, type Slot } from "./core/types";
import { simulateBattle, type Side } from "./combat/combat";
import { ANIMALS, getAnimal } from "./data/animals";
import { breed, randomGenome } from "./genome/breed";
import { buildCreature, powerRating, pureGenome, slotLabel } from "./genome/genome";
import { makeOpponent } from "./game/opponents";
import { load, newGame, save, unlockNext, type BattleSpeed, type GameState } from "./game/state";
import { addToRoster, isInRoster, removeFromRoster } from "./game/roster";
import { clear, el } from "./render/dom";
import { creatureCard } from "./render/creatureCard";
import { playBattle } from "./render/arena";
import type { Creature3DHandle } from "./render/creature3d";
import { initAudio, setMuted, sfxLose, sfxWin, toggleMuted } from "./render/sound";
import { BODY_TYPE } from "./combat/typeChart";
import { ABILITIES } from "./data/abilities";
import { playSpliceSequence } from "./render/spliceSequence";

let state: GameState = load();
let cancelArena: (() => void) | null = null;
let newGameExpanded = false;

let gauntletRound = 0;           // 0 = not in gauntlet
let gauntletHpRatio = 1.0;       // surviving HP fraction carried between rounds
let lastBattleResult: ReturnType<typeof simulateBattle> | null = null;
const GAUNTLET_ROUNDS = 5;

const ACHIEVEMENT_LABELS: Record<string, string> = {
  first_blood:       "🩸 First Victory — You won your first battle!",
  streak_5:          "🔥 On Fire — 5-win streak!",
  tier1_complete:    "🧬 Tier 1 Complete — All starter species unlocked!",
  ten_wins:          "⚔ Veteran — 10 battles won!",
  gauntlet_complete: "⚔ Gauntlet Champion — Survived all 5 rounds!",
};

function checkAchievements(): string[] {
  const earned: string[] = [];
  const tier1Ids = ANIMALS.filter(a => a.tier === 1).map(a => a.id);

  if (state.wins === 1 && !state.achievements.includes("first_blood"))
    earned.push("first_blood");
  if (state.streak === 5 && !state.achievements.includes("streak_5"))
    earned.push("streak_5");
  if (tier1Ids.every(id => state.unlocked.includes(id)) && !state.achievements.includes("tier1_complete"))
    earned.push("tier1_complete");
  if (state.wins === 10 && !state.achievements.includes("ten_wins"))
    earned.push("ten_wins");

  return earned;
}

function showAchievementToast(id: string): void {
  const label = ACHIEVEMENT_LABELS[id] ?? id;
  const toast = el("div", { class: "achievement-toast" }, [
    el("div", { class: "achievement-icon" }, ["🏆"]),
    el("div", { class: "achievement-text" }, [label]),
  ]);
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add("achievement-show"), 50);
  setTimeout(() => {
    toast.classList.remove("achievement-show");
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

// Persistent 3D Lab preview. Created lazily once (a single WebGL context that we
// reuse across re-renders via setGenome) so we never leak GL contexts. Falls back
// silently to the 2D card if WebGL is unavailable or three fails to load.
let creature3d: Creature3DHandle | null = null;
let preview3dHost: HTMLElement | null = null;
let creature3dFailed = false;

function mount3dPreview(genome: Genome): HTMLElement | null {
  if (creature3dFailed) return null;
  if (!preview3dHost) {
    preview3dHost = document.createElement("div");
    preview3dHost.className = "creature3d-host";
  }
  if (!creature3d) {
    // Lazy-import keeps three out of the initial bundle path until the Lab needs it.
    import("./render/creature3d")
      .then(({ mountCreature3D, modelsReady }) => {
        const overlay = document.getElementById("models-loading-overlay") as HTMLElement | null;
        if (overlay) overlay.style.display = "flex";
        return modelsReady.then(() => {
          if (overlay) overlay.style.display = "none";
          if (!preview3dHost) return;
          try {
            creature3d = mountCreature3D(preview3dHost, genome, 240);
          } catch {
            creature3dFailed = true;
            preview3dHost?.remove();
            preview3dHost = null;
          }
        });
      })
      .catch(() => {
        const overlay = document.getElementById("models-loading-overlay") as HTMLElement | null;
        if (overlay) overlay.style.display = "none";
        creature3dFailed = true;
      });
  } else {
    creature3d.setGenome(genome);
  }
  return preview3dHost;
}

const SPEED_OPTS: { id: BattleSpeed; label: string; mult: number }[] = [
  { id: "slow", label: "🐢 Slow", mult: 0.4 },
  { id: "normal", label: "▶ Normal", mult: 1 },
  { id: "fast", label: "⚡ Fast", mult: 3 },
  { id: "instant", label: "⏩ Instant", mult: 0 },
];

setMuted(state.muted);

const app = document.getElementById("app")!;

type Screen = "lab" | "arena" | "result" | "bestiary";
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
  playSpliceSequence(document.body, state.player, mate, child, () => {
    setGenome(child);
  });
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
      ...(state.streak >= 3 ? [el("span", { class: "streak-badge" }, [`🔥×${state.streak}`])] : []),
      el("span", { class: "pill" }, [pillFrag("Losses", state.losses)]),
      buildUnlockProgress(),
      el(
        "button",
        {
          class: "pill",
          title: "Toggle sound",
          onclick: (e) => {
            initAudio();
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

function pillFrag(label: string, value: number): HTMLElement {
  return el("span", { html: `${label} <b>${value}</b>` });
}

function settingsBar(): HTMLElement {
  const speedBtns = SPEED_OPTS.map(({ id, label, mult }) =>
    el(
      "button",
      {
        class: state.battleSpeed === id ? "settings-btn active" : "settings-btn",
        onclick: () => {
          state.battleSpeed = id;
          save(state);
          renderLab();
        },
        title: `Battle speed: ${id} (${mult === 0 ? "instant" : mult + "×"})`,
      },
      [label],
    ),
  );

  const oppBtn = el(
    "button",
    {
      class: state.showOpponent ? "settings-btn active" : "settings-btn",
      onclick: () => {
        state.showOpponent = !state.showOpponent;
        save(state);
        renderLab();
      },
    },
    [state.showOpponent ? "🔭 Opponent" : "🔭 Opponent (hidden)"],
  );

  const newGameBtn = el(
    "button",
    {
      class: newGameExpanded ? "settings-btn active" : "settings-btn",
      onclick: () => {
        newGameExpanded = !newGameExpanded;
        renderLab();
      },
    },
    ["🗑 New Game"],
  );

  const bestiaryBtn = el(
    "button",
    {
      class: "settings-btn",
      onclick: () => renderBestiary(),
    },
    ["📖 Bestiary"],
  );

  const dailyBtn = el(
    "button",
    {
      class: "settings-btn",
      title: "Daily Challenge — same opponent for everyone today",
      onclick: () => startDailyChallenge(),
    },
    ["📅 Daily"],
  );

  const gauntletBtn = el(
    "button",
    {
      class: "settings-btn",
      title: "Gauntlet — 5 battles, HP carries over. Can you survive all 5?",
      onclick: () => startGauntlet(),
    },
    ["⚔ Gauntlet"],
  );

  const row = el("div", { class: "settings-bar" }, [
    el("div", { class: "settings-group" }, [
      el("span", { class: "settings-label" }, ["Speed"]),
      ...speedBtns,
    ]),
    el("div", { class: "settings-group" }, [oppBtn]),
    el("div", { class: "settings-group" }, [newGameBtn]),
    el("div", { class: "settings-group" }, [bestiaryBtn]),
    el("div", { class: "settings-group" }, [dailyBtn]),
    el("div", { class: "settings-group" }, [gauntletBtn]),
  ]);

  if (newGameExpanded) {
    const tierBtns = (
      [
        { tier: 1 as const, label: "🌱 Tier 1 (5 species)" },
        { tier: 2 as const, label: "🔥 Tier 1+2 (10 species)" },
        { tier: 3 as const, label: "💀 All species unlocked" },
      ] as const
    ).map(({ tier, label }) =>
      el(
        "button",
        {
          class: "settings-btn",
          onclick: () => {
            if (!confirm(`Start a new game at ${label}? Current progress will be lost.`)) return;
            newGameExpanded = false;
            state = newGame(tier, state);
            save(state);
            renderLab();
          },
        },
        [label],
      ),
    );
    row.append(
      el("div", { class: "settings-newgame" }, [
        el("span", { class: "settings-label" }, ["Pick start tier:"]),
        ...tierBtns,
        el(
          "button",
          {
            class: "settings-btn",
            onclick: () => {
              newGameExpanded = false;
              renderLab();
            },
          },
          ["✕ Cancel"],
        ),
      ]),
    );
  }

  return row;
}

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

  const bodyType = slot === "body" ? (BODY_TYPE[a.id] ?? null) : null;
  const typeEmojis: Record<string, string> = {
    fire: "🔥", water: "💧", nature: "🌿", earth: "🪨", air: "💨", electric: "⚡",
  };
  if (bodyType) {
    lines.push(el("div", { class: "tip-type-badge" }, [`${typeEmojis[bodyType] ?? ""} ${bodyType}`]) as HTMLElement);
  }

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
    const abilityDef = ABILITIES[part.ability];
    lines.push(el("div", { class: "tip-ability" }, [`🌀 ${abilityDef?.name ?? part.ability}`]) as HTMLElement);
    if (abilityDef?.description) {
      lines.push(el("div", { class: "tip-ability-desc" }, [abilityDef.description]) as HTMLElement);
    }
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
      + (parts.tail.stats.attack ?? 0) + (parts.body.stats.attack ?? 0) + (parts.hindlimbs.stats.attack ?? 0);
    const totalDef = (parts.body.stats.defense ?? 0) + (parts.head.stats.defense ?? 0);
    const totalHp  = parts.body.stats.health ?? 0;

    const maxAtk = 50; const maxDef = 20; const maxHp = 80;

    // Collect unique abilities from all slots
    const abilitySet = new Set<string>();
    for (const part of Object.values(parts)) {
      if (part.ability) abilitySet.add(part.ability);
    }
    const abilityList = [...abilitySet];

    const bodyType = BODY_TYPE[animal.id];
    const typeEmojis: Record<string, string> = {
      fire: "🔥", water: "💧", nature: "🌿", earth: "🪨", air: "💨", electric: "⚡",
    };

    return el("div", { class: "bestiary-card" }, [
      el("div", { class: "bestiary-card-emoji" }, [animal.emoji]),
      el("div", { class: "bestiary-card-name" }, [animal.name]),
      el("div", { class: "bestiary-card-tier" }, ["★".repeat(animal.tier)]),
      ...(bodyType ? [el("div", { class: "bestiary-card-type" }, [`${typeEmojis[bodyType] ?? ""} ${bodyType}`])] : []),
      el("div", { class: "bestiary-stat-bar-row" }, [
        el("div", { class: "bestiary-stat-bar", style: `width:${Math.round(totalAtk / maxAtk * 48)}px;background:#c85030;`, title: `Attack: ${totalAtk}` }, []),
        el("div", { class: "bestiary-stat-bar", style: `width:${Math.round(totalDef / maxDef * 24)}px;background:#3070c8;`, title: `Defense: ${totalDef}` }, []),
        el("div", { class: "bestiary-stat-bar", style: `width:${Math.round(totalHp  / maxHp  * 32)}px;background:#30a850;`, title: `Health: ${totalHp}` }, []),
      ]),
      ...(abilityList.length > 0 ? [el("div", { class: "bestiary-abilities" }, [
        ...abilityList.map(id => {
          const def = ABILITIES[id as keyof typeof ABILITIES];
          return el("span", {
            class: "ability-tag",
            title: def ? `${def.name}: ${def.description}` : id,
          }, [def?.name ?? id]) as HTMLElement;
        }),
      ])] : []),
    ]);
  });

  const achievementDefs = [
    { id: "first_blood",       label: "🩸 First Victory" },
    { id: "streak_5",          label: "🔥 On Fire (5-streak)" },
    { id: "tier1_complete",    label: "🧬 Tier 1 Complete" },
    { id: "ten_wins",          label: "⚔ Veteran (10 wins)" },
    { id: "gauntlet_complete", label: "⚔ Gauntlet Champion" },
  ];
  const achSection = el("div", { style: "margin-top:20px;" }, [
    el("h3", { style: "color:#c8a84b;font-size:14px;margin:0 0 8px;" }, ["🏆 Achievements"]),
    el("div", { style: "display:flex;gap:8px;flex-wrap:wrap;" },
      achievementDefs.map(({ id, label }) =>
        el("span", {
          class: state.achievements.includes(id) ? "achievement-badge earned" : "achievement-badge",
        }, [label])
      )
    ),
  ]);

  app.append(
    el("div", { class: "bestiary-screen" }, [
      el("div", { style: "display:flex;align-items:center;gap:12px;margin-bottom:8px;" }, [
        el("button", { class: "settings-btn", onclick: () => renderLab() }, ["← Back"]),
        el("h2", { style: "color:#c8a84b;font-size:18px;margin:0;" }, ["📖 Bestiary"]),
        el("span", { style: "color:#556677;font-size:13px;" }, [`${state.unlocked.length}/${ANIMALS.length} species unlocked`]),
      ]),
      el("div", { class: "bestiary-grid" }, cards),
      achSection,
    ]),
  );
}

function startGauntlet(): void {
  initAudio();
  gauntletRound = 1;
  gauntletHpRatio = 1.0;
  runGauntletRound();
}

function runGauntletRound(): void {
  if (cancelArena) { cancelArena(); cancelArena = null; }

  // Build opponent based on round (tiers: 1,1,2,2,3)
  const tierMap: Record<number, 1 | 2 | 3> = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3 };
  const tier = tierMap[gauntletRound] ?? 3;

  let opponent: ReturnType<typeof buildCreature>;
  if (gauntletRound === GAUNTLET_ROUNDS) {
    // Final boss: spliced chimera from two random genomes
    const rng1 = makeRng(Date.now() ^ 0xcafe);
    const rng2 = makeRng(Date.now() ^ 0xbeef);
    const g1 = randomGenome(rng1, state.unlocked);
    const g2 = randomGenome(rng2, state.unlocked);
    opponent = buildCreature(breed(g1, g2, makeRng(Date.now() ^ 0xdead), { pool: state.unlocked }));
  } else {
    const pool = state.unlocked.filter(id => {
      const animal = ANIMALS.find(a => a.id === id);
      return animal && animal.tier <= tier;
    });
    const pickPool = pool.length > 0 ? pool : state.unlocked;
    const rng = makeRng(Date.now() ^ (gauntletRound * 0x9e3779b9));
    const pickedId = pickPool[Math.floor(rng() * pickPool.length)];
    opponent = buildCreature({ head: pickedId, body: pickedId, forelimbs: pickedId, hindlimbs: pickedId, tail: pickedId });
  }

  // Apply HP carry-over to player by scaling stats.health
  const basePlayer = buildCreature(state.player);
  const carriedHp = Math.max(1, Math.round(basePlayer.stats.health * gauntletHpRatio));
  const player = { ...basePlayer, stats: { ...basePlayer.stats, health: carriedHp } };

  lastBattleResult = simulateBattle(player, opponent, makeRng((Date.now() >>> 1) ^ gauntletRound));

  const appEl = document.getElementById("app")!;
  clear(appEl);
  screen = "arena";

  const roundBadge = el("div", { class: "gauntlet-badge" }, [
    `⚔ Gauntlet — Round ${gauntletRound}/${GAUNTLET_ROUNDS}  HP: ${Math.round(gauntletHpRatio * 100)}%`,
  ]);

  const canvas = el("canvas", {
    id: "arena",
    role: "img",
    "aria-label": `Gauntlet round ${gauntletRound} arena`,
  }) as HTMLCanvasElement;
  const resultArea = el("div", { class: "center" }, []);

  const arenaPanel = el("div", { class: "panel arena-wrap" }, [
    el("div", { class: "arena-fighters" }, [
      el("div", { class: "fighter-tag" }, [
        el("div", { class: "nm" }, [`${basePlayer.emoji} ${basePlayer.name}`]),
        el("div", { class: "pw" }, [`HP ${Math.round(gauntletHpRatio * 100)}% · Power ${powerRating(basePlayer)}`]),
      ]),
      el("div", { class: "fighter-tag right" }, [
        el("div", { class: "nm" }, [`${opponent.name} ${opponent.emoji}`]),
        el("div", { class: "pw" }, [gauntletRound === GAUNTLET_ROUNDS ? "👑 Final Boss" : `Tier ${tier} · Power ${powerRating(opponent)}`]),
      ]),
    ]),
    canvas,
    resultArea,
  ]);

  appEl.append(topbar(), settingsBar(), roundBadge, arenaPanel);

  const speedMult = SPEED_OPTS.find((s) => s.id === state.battleSpeed)?.mult ?? 1;

  cancelArena = playBattle(
    canvas,
    lastBattleResult,
    (winner) => {
      cancelArena = null;
      onGauntletRoundEnd(resultArea, winner, opponent);
    },
    speedMult,
  );
}

function onGauntletRoundEnd(
  area: HTMLElement,
  winner: Side | "draw",
  _opponent: ReturnType<typeof buildCreature>,
): void {
  const playerWon = winner === "a";
  const result = lastBattleResult!;

  if (!playerWon) {
    // Gauntlet over — show failure screen
    const roundsSurvived = gauntletRound - 1;
    gauntletRound = 0;
    gauntletHpRatio = 1.0;
    state.losses++;
    state.streak = 0;
    save(state);
    sfxLose();

    clear(area);
    area.append(
      el("div", { class: "fadein" }, [
        el("div", { class: "result-banner lose" }, ["GAUNTLET FAILED"]),
        el("p", { class: "hint" }, [
          `Survived ${roundsSurvived} round${roundsSurvived !== 1 ? "s" : ""} out of ${GAUNTLET_ROUNDS}.`,
        ]),
        el("div", { class: "btnrow", style: "justify-content:center" }, [
          el("button", { class: "accent", onclick: () => startGauntlet() }, ["⚔ Try Again"]),
          el("button", { onclick: renderLab }, ["🧪 Back to Lab"]),
        ]),
      ]),
    );
    return;
  }

  // Compute remaining HP ratio from events
  // baseHp is the full (unscaled) health of the player's creature
  const baseHp = buildCreature(state.player).stats.health;
  const roundStartHp = Math.max(1, Math.round(baseHp * gauntletHpRatio));
  let dmgTaken = 0;
  for (const e of result.events) {
    if (e.kind === "attack" && e.by === "b") {
      dmgTaken += e.dmg;
    }
    if (e.kind === "poison" && e.on === "a") {
      dmgTaken += e.dmg;
    }
  }
  const playerHpRemaining = Math.max(1, roundStartHp - dmgTaken);
  gauntletHpRatio = playerHpRemaining / baseHp;

  state.wins++;
  state.streak++;

  if (gauntletRound >= GAUNTLET_ROUNDS) {
    // Won the whole gauntlet!
    if (!state.achievements.includes("gauntlet_complete")) {
      state.achievements.push("gauntlet_complete");
    }
    if (gauntletRound > state.gauntletBestScore) {
      state.gauntletBestScore = gauntletRound;
    }
    save(state);
    showAchievementToast("gauntlet_complete");
    sfxWin();

    gauntletRound = 0;
    gauntletHpRatio = 1.0;

    clear(area);
    area.append(
      el("div", { class: "fadein" }, [
        el("div", { class: "result-banner win" }, ["GAUNTLET COMPLETE!"]),
        el("p", { class: "hint" }, ["You survived all 5 rounds. You are the Gauntlet Champion!"]),
        el("div", { class: "btnrow", style: "justify-content:center" }, [
          el("button", { class: "accent", onclick: () => startGauntlet() }, ["⚔ Run Again"]),
          el("button", { onclick: renderLab }, ["🧪 Back to Lab"]),
        ]),
      ]),
    );
    return;
  }

  gauntletRound++;
  save(state);
  sfxWin();

  // Show "Round X won!" overlay with continue button
  const cont = el("div", { class: "gauntlet-continue" }, [
    el("div", { class: "gauntlet-continue-text" }, [
      `✅ Round ${gauntletRound - 1} Won!  HP remaining: ${Math.round(gauntletHpRatio * 100)}%`,
    ]),
    el("button", { class: "accent", onclick: () => { cont.remove(); runGauntletRound(); } }, [
      `Round ${gauntletRound} →`,
    ]),
  ]);
  document.getElementById("app")!.appendChild(cont);
}

function renderLab() {
  document.querySelectorAll(".card-tooltip").forEach((t) => t.remove());
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
      SLOTS.map((slot) =>
        el("div", { class: "slot" }, [
          el("label", {}, [slotLabel(slot)]),
          buildSlotCards(slot),
        ]),
      ),
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
  const host3d = mount3dPreview(state.player);
  const heroChildren: HTMLElement[] = [el("h2", {}, ["Your Creature"])];
  if (host3d) heroChildren.push(el("div", { class: "creature3d-stage" }, [host3d]));
  heroChildren.push(creatureCard(creature));
  const preview = el("div", { class: "panel" }, [
    ...heroChildren,
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

  const sections: Node[] = [
    topbar(),
    settingsBar(),
    el("div", { class: "layout" }, [builder, preview]),
  ];
  if (state.showOpponent) sections.push(opponentPanel(creature));
  sections.push(rosterPanel());
  app.append(...sections);

  // Scroll each card row so the selected card is visible on first render
  requestAnimationFrame(() => {
    document.querySelectorAll<HTMLElement>(".animal-card.selected").forEach((card) => {
      card.scrollIntoView({ block: "nearest", inline: "center" });
    });
  });
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
  lastBattleResult = result;

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

  const speedMult = SPEED_OPTS.find((s) => s.id === state.battleSpeed)?.mult ?? 1;
  cancelArena = playBattle(canvas, result, (winner) => {
    cancelArena = null;
    showResult(resultArea, winner, opponent.name);
  }, speedMult);
}

function showResult(area: HTMLElement, winner: Side | "draw", opponentName: string) {
  screen = "result";
  const playerWon = winner === "a";
  let unlockedId: string | null = null;

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
  state.seed = (state.seed * 1664525 + 1013904223) >>> 0;
  save(state);

  const newAchievements = checkAchievements();
  if (newAchievements.length > 0) {
    state.achievements.push(...newAchievements);
    save(state);
    newAchievements.forEach((id, i) => {
      setTimeout(() => showAchievementToast(id), i * 1200);
    });
  }

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
  if (lastBattleResult) {
    const evts = lastBattleResult.events;
    const stats = {
      playerDmg: evts.filter(e => e.kind === "attack" && e.by === "a").reduce((s, e) => s + (e as { dmg: number }).dmg, 0),
      enemyDmg:  evts.filter(e => e.kind === "attack" && e.by === "b").reduce((s, e) => s + (e as { dmg: number }).dmg, 0),
      crits:     evts.filter(e => e.kind === "attack" && (e as { crit: boolean }).crit).length,
      abilities: evts.filter(e => e.kind === "ability").length,
      rounds:    evts.filter(e => e.kind === "attack").length,
    };
    lines.push(
      el("div", { class: "battle-stats" }, [
        el("div", { class: "battle-stats-title" }, ["📊 Battle Stats"]),
        el("div", { class: "battle-stats-row" }, [`⚔ Your damage: ${stats.playerDmg}`]),
        el("div", { class: "battle-stats-row" }, [`🛡 Damage taken: ${stats.enemyDmg}`]),
        el("div", { class: "battle-stats-row" }, [`💥 Critical hits: ${stats.crits}`]),
        el("div", { class: "battle-stats-row" }, [`✨ Abilities used: ${stats.abilities}`]),
        el("div", { class: "battle-stats-row" }, [`🔁 Rounds: ${stats.rounds}`]),
      ]),
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

function dailySeed(): number {
  const d = new Date();
  return (d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()) * 2654435761 >>> 0;
}

function startDailyChallenge(): void {
  initAudio();
  const seed = dailySeed();
  const rng = makeRng(seed);
  const oppAnimal = ANIMALS[Math.floor(rng() * ANIMALS.length)];
  const oppGenome = pureGenome(oppAnimal.id);
  const opponent = buildCreature(oppGenome);

  const player = buildCreature(state.player);
  const result = simulateBattle(player, opponent, makeRng(seed ^ 0xdeadbeef));
  lastBattleResult = result;

  screen = "arena";
  clear(app);

  const canvas = el("canvas", {
    id: "arena",
    role: "img",
    "aria-label": "Daily challenge arena",
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
          el("div", { class: "pw" }, [`📅 Daily · Power ${powerRating(opponent)}`]),
        ]),
      ]),
      canvas,
      resultArea,
    ]),
  );

  const speedMult = SPEED_OPTS.find((s) => s.id === state.battleSpeed)?.mult ?? 1;
  cancelArena = playBattle(canvas, result, (winner) => {
    cancelArena = null;
    showResult(resultArea, winner, `Daily ${oppAnimal.name}`);
  }, speedMult);
}

function showTutorial(): void {
  if (localStorage.getItem("ic-tutorial-done")) return;
  const appEl = document.getElementById("app")!;
  let step = 0;

  const steps = [
    { icon: "🧬", title: "Splice Your Creature", body: "Pick one part from each animal — head, body, arms, legs, tail. Each part brings stats and abilities." },
    { icon: "⚔", title: "Battle to Unlock", body: "Win fights to unlock more species. Build the ultimate chimera." },
    { icon: "🔥", title: "Chain Your Wins", body: "Keep a win streak to prove your creature is unbeatable. Check the Bestiary to see all species." },
  ];

  const overlay = el("div", { class: "tutorial-overlay" }, []);

  const render = () => {
    const s = steps[step];
    const isLast = step === steps.length - 1;
    overlay.innerHTML = "";
    overlay.append(
      el("div", { class: "tutorial-card" }, [
        el("div", { class: "tutorial-icon" }, [s.icon]),
        el("div", { class: "tutorial-title" }, [s.title]),
        el("div", { class: "tutorial-body" }, [s.body]),
        el("div", { class: "tutorial-dots" }, steps.map((_, i) =>
          el("span", { class: i === step ? "tutorial-dot active" : "tutorial-dot" }, [])
        )),
        el("button", {
          class: "accent",
          onclick: () => {
            if (isLast) {
              localStorage.setItem("ic-tutorial-done", "1");
              overlay.remove();
            } else {
              step++;
              render();
            }
          }
        }, [isLast ? "Start Playing" : "Next →"]),
      ])
    );
  };

  render();
  appEl.append(overlay);
}

window.addEventListener("creature-assets-loaded", () => {
  console.log("Assets loaded; redrawing UI and active 3D model preview...");
  if (screen === "lab") {
    renderLab();
  }
  if (creature3d && state.player) {
    creature3d.setGenome(state.player);
  }
});

// sanity: ensure data integrity at boot (helps catch a broken save/build)
if (ANIMALS.length === 0) throw new Error("No animals defined");
renderLab();
showTutorial();
