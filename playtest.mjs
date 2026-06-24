/**
 * Headless playtest: boots the built game, then exercises the real user flow —
 * change a genome slot, splice DNA, enter the arena, wait out the battle, and
 * read the result. Fails on any console error, page error, or missing UI.
 *
 * Hardened: launches Chromium with renderer-backgrounding/timer-throttling
 * disabled (old-headless otherwise throttles requestAnimationFrame, stalling the
 * arena replay), plus a hard watchdog so the run can never hang indefinitely.
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = 4318;
const errors = [];
const base = `http://localhost:${PORT}/`;
const log = (m) => process.stdout.write(`[playtest] ${m}\n`);

const watchdog = setTimeout(() => {
  console.error("WATCHDOG: playtest exceeded 90s, aborting as failure.");
  process.exit(1);
}, 90_000);
watchdog.unref();

function startPreview() {
  return spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], {
    cwd: process.cwd(),
    stdio: "ignore",
  });
}

async function waitForServer(url, tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(200);
  }
  throw new Error("preview server did not start");
}

const server = startPreview();
let browser;

try {
  log("waiting for preview server...");
  await waitForServer(base);
  log("server up; launching chromium");
  browser = await chromium.launch({
    args: [
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
    ],
  });
  const page = await browser.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console.error: " + m.text());
  });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  await page.addInitScript(() => localStorage.clear());
  await page.goto(base, { waitUntil: "domcontentloaded" });
  log("page loaded");

  await page.waitForSelector(".creature-name", { timeout: 5000 });
  const name1 = (await page.textContent(".creature-name"))?.trim();
  log(`lab rendered, creature: ${name1}`);

  // Keyboard accessibility: 'r' randomizes without crashing.
  await page.keyboard.press("r");
  await page.waitForTimeout(120);
  await page.waitForSelector(".creature-name", { timeout: 3000 });
  log("keyboard randomize OK");

  // Change the head slot -> creature should rebuild
  const firstSelect = page.locator(".slot select").first();
  const optionValues = await firstSelect
    .locator("option")
    .evaluateAll((os) => os.map((o) => o.value));
  if (optionValues.length < 2) throw new Error("not enough unlocked animals to test slot change");
  await firstSelect.selectOption(optionValues[optionValues.length - 1]);
  await page.waitForTimeout(150);
  log("changed head slot");

  // Splice DNA
  await page.getByRole("button", { name: "Splice DNA" }).click();
  await page.waitForTimeout(150);
  const name2 = (await page.textContent(".creature-name"))?.trim();
  log(`spliced, creature: ${name2}`);

  // Opponent preview: scout a different opponent
  await page.waitForSelector(".opponent-panel .creature-name", { timeout: 5000 });
  const opp1 = (await page.textContent(".opponent-panel .creature-name"))?.trim();
  await page.getByRole("button", { name: "Scout another" }).click();
  await page.waitForTimeout(120);
  const opp2 = (await page.textContent(".opponent-panel .creature-name"))?.trim();
  log(`scouted opponents: ${opp1} -> ${opp2}`);

  // Enter arena
  await page.getByRole("button", { name: "Enter Arena" }).click();
  await page.waitForSelector("canvas#arena", { timeout: 5000 });
  log("entered arena, awaiting battle result...");
  await page.waitForTimeout(1200); // let the battle replay get going
  await page.screenshot({ path: "playtest-arena.png" });
  await page.waitForSelector(".result-banner", { timeout: 30000 });
  const outcome = (await page.textContent(".result-banner"))?.trim();
  log(`battle 1 outcome: ${outcome}`);

  // Fight again (re-entry path)
  await page.getByRole("button", { name: "Fight Again" }).click();
  await page.waitForTimeout(100);
  await page.waitForSelector(".result-banner", { timeout: 30000 });
  log("battle 2 completed");

  // Back to lab
  await page.getByRole("button", { name: "Back to Lab" }).click();
  await page.waitForSelector(".creature-name", { timeout: 5000 });
  // Assert the creature card actually renders its content (not a blank panel):
  // five stat bars, a non-empty emoji, and a Power line.
  await page.waitForTimeout(450); // let the fade-in settle for a true screenshot
  const barCount = await page.locator(".layout .creature-card .bar").count();
  if (barCount !== 5) throw new Error(`expected 5 stat bars on player card, got ${barCount}`);
  // Composite body: check that the head part emoji is visible (not empty).
  const headEmoji = (await page.textContent(".layout .cb-head"))?.trim();
  if (!headEmoji) throw new Error("composite head emoji is empty");
  const bodyEmoji = (await page.textContent(".layout .cb-body"))?.trim();
  if (!bodyEmoji) throw new Error("composite body emoji is empty");
  const cardVisible = await page.locator(".layout .creature-card").isVisible();
  if (!cardVisible) throw new Error("creature card is not visible");
  log(`returned to lab; card OK (head ${headEmoji}, body ${bodyEmoji}, ${barCount} bars)`);

  // Roster: save the current creature, confirm it appears, then load it back.
  await page.getByRole("button", { name: "💾 Save" }).click();
  await page.waitForTimeout(100);
  const rosterCount = await page.locator(".roster-item").count();
  if (rosterCount < 1) throw new Error("saved creature did not appear in roster");
  await page.locator(".roster-item").first().getByRole("button", { name: "Load" }).click();
  await page.waitForSelector(".creature-name", { timeout: 5000 });
  log(`roster OK (${rosterCount} saved, load works)`);

  await page.screenshot({ path: "playtest-lab.png", fullPage: false });
  await page.screenshot({ path: "playtest-top.png", clip: { x: 0, y: 0, width: 1280, height: 500 } });

  // Reduced-motion: a fresh context that requests reduced motion must resolve a
  // battle near-instantly (accessibility + performance).
  const rmContext = await browser.newContext({ reducedMotion: "reduce" });
  const rmPage = await rmContext.newPage();
  rmPage.on("pageerror", (e) => errors.push("rm pageerror: " + e.message));
  rmPage.on("console", (m) => {
    if (m.type() === "error") errors.push("rm console.error: " + m.text());
  });
  await rmPage.addInitScript(() => localStorage.clear());
  await rmPage.goto(base, { waitUntil: "domcontentloaded" });
  await rmPage.getByRole("button", { name: "Enter Arena" }).click();
  const t0 = Date.now();
  await rmPage.waitForSelector(".result-banner", { timeout: 15000 });
  const rmMs = Date.now() - t0;
  log(`reduced-motion battle resolved in ${rmMs}ms`);
  if (rmMs > 6000) throw new Error(`reduced-motion battle too slow: ${rmMs}ms`);
  await rmContext.close();

  if (errors.length) {
    console.error("FAIL — runtime errors:\n" + errors.join("\n"));
    process.exitCode = 1;
  } else {
    log(`names: "${name1}" -> "${name2}"`);
    console.log("PLAYTEST PASS — full flow ran with zero console/page errors.");
  }
} catch (e) {
  console.error("PLAYTEST ERROR:", e.message);
  if (errors.length) console.error(errors.join("\n"));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill("SIGTERM");
  clearTimeout(watchdog);
}
