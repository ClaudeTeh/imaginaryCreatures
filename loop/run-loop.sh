#!/bin/bash
# Durable every-10-hours improvement loop for Imaginary Creatures.
# Runs a headless Claude Code session against loop/improvement-prompt.txt, then
# verifies the result. If `npm run verify` does not pass, the working tree is
# reverted to the last good commit so the game is NEVER left broken. Successful
# runs are committed, giving you a full history of autonomous changes.
#
# Triggered by launchd (see com.imaginarycreatures.loop.plist). See loop/README.md.

set -u

# launchd gives a minimal env; uvx (Polygon-style MCP launcher) lives in
# ~/.local/bin, and claude/node must be found too.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

PROJ="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$PROJ/loop/loop.log"
cd "$PROJ" || { echo "no project dir" >>"$LOG"; exit 1; }

echo "===== $(date '+%F %T %Z') loop start =====" >>"$LOG"

# Refuse to run on a dirty tree — we need a clean baseline to revert to.
if [ -n "$(git status --porcelain)" ]; then
  echo "ABORT: working tree is dirty; commit or stash first." >>"$LOG"
  exit 1
fi

[ -d node_modules ] || npm install >>"$LOG" 2>&1

PROMPT="$(cat "$PROJ/loop/improvement-prompt.txt")"
claude -p "$PROMPT" --dangerously-skip-permissions >>"$LOG" 2>&1

if npm run verify >>"$LOG" 2>&1; then
  git add -A
  if [ -n "$(git status --porcelain)" ]; then
    git commit -m "loop: auto-improvement $(date '+%F %T')" >>"$LOG" 2>&1
    echo "OK: verified & committed" >>"$LOG"
  else
    echo "OK: no changes this tick" >>"$LOG"
  fi
else
  echo "FAIL: verify did not pass — reverting to last good commit" >>"$LOG"
  git reset --hard HEAD >>"$LOG" 2>&1
  git clean -fd >>"$LOG" 2>&1
fi
echo "===== $(date '+%F %T %Z') loop end =====" >>"$LOG"
