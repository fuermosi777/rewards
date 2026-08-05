# scripts/

| File | Purpose |
|---|---|
| `validate.js` | Schema + cross-reference validation. `npm run validate`. |
| `next-batch.js` | Prints the next N unfilled card ids (stable order, derived from data — no separate progress file). `node scripts/next-batch.js 5`. |
| `daily-update-prompt.md` | The task prompt fed to `claude -p` for the daily fill-in agent run. |
| `daily-update.sh` | Driver script: syncs git, calls `claude -p` headless with a scoped tool allowlist. Meant to run under launchd, but safe to run by hand. |
| `com.rewards.daily-update.plist` | launchd job definition — runs `daily-update.sh` once a day. |

## Setting up the daily agent on a machine that stays on (e.g. a Mac mini)

This assumes: the repo is cloned locally, `claude` CLI is installed and logged in, `gh` CLI is authenticated (`gh auth status`), and `npm install` has been run in the repo once.

1. **Test the script by hand first**, before wiring it to launchd:
   ```bash
   ./scripts/daily-update.sh
   ```
   Watch `~/Library/Logs/rewards-daily-update/<today>.log` while it runs. Confirm it opens a real PR you'd be comfortable reviewing before automating this.

2. **Install the launchd job**:
   ```bash
   cp scripts/com.rewards.daily-update.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/com.rewards.daily-update.plist
   ```
   This runs the job daily at 09:00 local time (edit the plist's `StartCalendarInterval` before installing if you want a different time).

3. **To trigger a run immediately** (for testing, without waiting for the scheduled time):
   ```bash
   launchctl start com.rewards.daily-update
   ```

4. **To check it's loaded / see recent run status**:
   ```bash
   launchctl list | grep com.rewards.daily-update
   ```

5. **To stop/uninstall**:
   ```bash
   launchctl unload ~/Library/LaunchAgents/com.rewards.daily-update.plist
   rm ~/Library/LaunchAgents/com.rewards.daily-update.plist
   ```

## What actually happens each run

1. `daily-update.sh` refuses to run if the working tree isn't clean (protects any in-progress manual work) or if `git pull --ff-only` isn't possible.
2. It computes how many cards are still unfilled via `next-batch.js`. If zero, it exits — nothing to do.
3. It invokes `claude -p` with `scripts/daily-update-prompt.md` as the prompt, `--permission-mode acceptEdits` (auto-accepts file edits, still no blanket bypass), and a tool allowlist scoped to reading/writing files, git, npm, gh, and web research — no unrestricted shell access.
4. Per `daily-update-prompt.md` (which mirrors AGENTS.md), the agent fills in a batch of 5 cards, validates, and **opens a PR — it never merges or pushes to `main` directly.**
5. You review and merge the PR yourself, on your own schedule. The next day's run pulls `main` fresh, so it picks up whatever you did or didn't merge.

## Adjusting batch size / cadence

- Batch size: change the `5` in `daily-update.sh`'s call to `next-batch.js`, and in `daily-update-prompt.md`'s "Today's batch" line — keep both in sync.
- Cadence: edit `StartCalendarInterval` in the plist. `launchctl unload` + edit + `launchctl load` to apply changes.
- If usage/cost monitoring suggests 5/day is too much (or too little), this is the number to tune — there's no other throttle in this pipeline.

## Why PRs, not direct commits, even though this runs unattended

Benefit terms are exactly the kind of data where a confidently-wrong write is worse than no write — a user could rely on incorrect data and miss a real benefit, or plan around one that doesn't exist. Keeping a human merge step in the loop, even for a fully automated daily job, is a deliberate choice — see AGENTS.md's "Output: always a PR" section.
