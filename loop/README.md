# Durable 10-hour improvement loop

This is the **opt-in, persistent** version of the "improve the game every 10 hours"
loop. Unlike the in-session cron, a launchd job survives Claude exiting and your
machine restarting, and runs unattended.

It is **not enabled by default** — it edits code autonomously and runs headless
Claude with permissions bypassed, so turning it on is your explicit choice.

## What each run does

`run-loop.sh` (every 10 hours):
1. Aborts if the git tree is dirty (it needs a clean baseline).
2. Runs a headless `claude -p` session against `improvement-prompt.txt` (one
   bounded improvement, tested).
3. Runs `npm run verify` (typecheck + unit tests + build + browser playtest).
4. **If verify passes** → commits the change. **If it fails** → hard-reverts to
   the last good commit. The game is never left broken.

History of autonomous changes lives in `git log`.

## ⚠️ Read before enabling

- **Cost:** every 10 hours it spends tokens/compute, indefinitely, whether or not
  there's anything worth improving.
- **Quality drift:** auto-revert guards against *broken* builds, not against slow
  drift toward bloat or worse design. Review `git log` periodically.
- **Permissions:** runs `claude --dangerously-skip-permissions` headless. Only do
  this on your own machine for this sandboxed project.
- **Full Disk Access:** launchd-spawned `/bin/bash` has no TCC grant. Grant Full
  Disk Access to `/bin/bash` in System Settings → Privacy & Security, or the job
  may fail to read/write files. (Same gotcha as the market-briefing job.)
- launchd does **not** wake a sleeping Mac; pair with `pmset` if you need that.

## Enable

```bash
cd ~/imaginaryCreatures
chmod +x loop/run-loop.sh

# stamp the absolute path into a copy of the plist
sed "s#REPLACE_WITH_ABSOLUTE_PATH#$PWD#g" \
  loop/com.imaginarycreatures.loop.plist \
  > ~/Library/LaunchAgents/com.imaginarycreatures.loop.plist

launchctl load ~/Library/LaunchAgents/com.imaginarycreatures.loop.plist
launchctl list | grep imaginarycreatures   # confirm it's registered
```

## Watch it

```bash
tail -f ~/imaginaryCreatures/loop/loop.log
git -C ~/imaginaryCreatures log --oneline   # autonomous commits
```

## Disable

```bash
launchctl unload ~/Library/LaunchAgents/com.imaginarycreatures.loop.plist
rm ~/Library/LaunchAgents/com.imaginarycreatures.loop.plist
```

## Run one tick manually (to try it without scheduling)

```bash
~/imaginaryCreatures/loop/run-loop.sh && tail -20 ~/imaginaryCreatures/loop/loop.log
```
