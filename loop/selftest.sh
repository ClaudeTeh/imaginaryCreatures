#!/bin/bash
# Proves the loop's safety machinery without waiting for the schedule or invoking
# an LLM: it runs the same verify-gate / commit-on-pass / revert-on-fail logic
# that run-loop.sh uses, across a known-GOOD cycle then a known-BAD cycle, and
# confirms the game stays green throughout. Restores the repo to its starting
# state at the end, so it leaves no trace.

set -u
PROJ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJ" || exit 1

BASELINE="$(git rev-parse HEAD)"
echo "[selftest] baseline = $(git rev-parse --short HEAD)"
FAIL=0

# ---- Cycle 1: a GOOD change should pass verify and be committed --------------
printf '\n// loop selftest: harmless valid comment\n' >> src/core/rng.ts
if npm run verify >/dev/null 2>&1; then
  git add -A && git commit -q -m "loop-selftest: good change"
  echo "[selftest] cycle 1 GOOD  -> verify PASSED, change committed ✓"
else
  echo "[selftest] cycle 1 GOOD  -> unexpectedly FAILED ✗"; FAIL=1
  git reset --hard "$BASELINE" >/dev/null 2>&1
fi

# ---- Cycle 2: a BAD change should fail verify and be reverted ----------------
GOOD_REF="$(git rev-parse HEAD)"
printf '\nthis is &&& not valid typescript @@@\n' >> src/core/rng.ts
if npm run verify >/dev/null 2>&1; then
  echo "[selftest] cycle 2 BAD   -> verify unexpectedly PASSED ✗"; FAIL=1
else
  git reset --hard "$GOOD_REF" >/dev/null 2>&1
  if [ -z "$(git status --porcelain)" ] && [ "$(git rev-parse HEAD)" = "$GOOD_REF" ]; then
    echo "[selftest] cycle 2 BAD   -> verify FAILED, tree reverted clean ✓"
  else
    echo "[selftest] cycle 2 BAD   -> revert incomplete ✗"; FAIL=1
  fi
fi

# ---- The game must still be green after both cycles --------------------------
if npm run verify >/dev/null 2>&1; then
  echo "[selftest] post-cycles  -> game still GREEN ✓ (stays perfect across cycles)"
else
  echo "[selftest] post-cycles  -> game BROKEN ✗"; FAIL=1
fi

# ---- Restore to starting state ----------------------------------------------
git reset --hard "$BASELINE" >/dev/null 2>&1
echo "[selftest] restored to baseline = $(git rev-parse --short HEAD); tree: $([ -z "$(git status --porcelain)" ] && echo clean || echo dirty)"
[ "$FAIL" -eq 0 ] && echo "[selftest] RESULT: PASS" || echo "[selftest] RESULT: FAIL"
exit "$FAIL"
