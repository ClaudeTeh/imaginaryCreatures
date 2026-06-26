import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { newGame, load } from "../src/game/state";

// Create a mock localStorage implementation
const createMockStorage = () => {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      Object.keys(store).forEach((key) => delete store[key]);
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
};

describe("streak in GameState", () => {
  let mockLocalStorage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    mockLocalStorage = createMockStorage();
    // Stub the global localStorage with our mock
    vi.stubGlobal("localStorage", mockLocalStorage);
  });

  afterEach(() => {
    mockLocalStorage.clear();
    vi.unstubAllGlobals();
  });

  it("newGame() initialises streak to 0", () => {
    const state = newGame();
    expect(state.streak).toBe(0);
  });

  it("load() returns streak 0 when no save exists", () => {
    const state = load();
    expect(state.streak).toBe(0);
  });

  it("load() returns streak 0 when save has no streak field (old save)", () => {
    const oldSave = JSON.stringify({
      unlocked: ["ant", "rabbit", "crab", "gecko", "boar"],
      player: { head: "ant", body: "ant", forelimbs: "ant", hindlimbs: "ant", tail: "ant" },
      wins: 5,
      losses: 2,
      seed: 12345,
      muted: false,
      roster: [],
      battleSpeed: "normal",
      showOpponent: true
      // no streak field — simulates old save format
    });
    mockLocalStorage.setItem("imaginary-creatures.save.v1", oldSave);
    const state = load();
    expect(state.streak).toBe(0);
  });

  it("load() restores streak from saved state", () => {
    const savedState = JSON.stringify({
      unlocked: ["ant", "rabbit", "crab", "gecko", "boar"],
      player: { head: "ant", body: "ant", forelimbs: "ant", hindlimbs: "ant", tail: "ant" },
      wins: 5,
      losses: 2,
      streak: 4,
      seed: 12345,
      muted: false,
      roster: [],
      battleSpeed: "normal",
      showOpponent: true
    });
    mockLocalStorage.setItem("imaginary-creatures.save.v1", savedState);
    const state = load();
    expect(state.streak).toBe(4);
  });

  it("streak field is a number type", () => {
    const state = newGame();
    expect(typeof state.streak).toBe("number");
  });
});
