#!/bin/zsh
# Daily driver for the benefit-fill-in agent. Meant to be invoked by launchd
# (see scripts/com.rewards.daily-update.plist) on a Mac that stays on, but
# safe to run by hand too: `./scripts/daily-update.sh`.
#
# What it does, in order:
#   1. Make sure the working tree is clean and on main, pull latest.
#   2. Run `claude -p` headless with a scoped tool allowlist to fill in the
#      next batch of cards (see daily-update-prompt.md for the actual task).
#   3. The agent itself creates a branch, commits, pushes, and opens a PR —
#      this script does not merge anything or push to main directly.
#
# Exits non-zero (and leaves a log) on any failure so launchd/you can notice.

set -euo pipefail

# launchd runs with a minimal environment (no shell rc files sourced), so PATH
# must be set explicitly here. node is resolved via fnm's stable "default"
# alias rather than the ephemeral per-shell fnm_multishells symlink, which
# doesn't exist outside an interactive shell session.
export PATH="$HOME/.local/share/fnm/aliases/default/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PROMPT_FILE="$REPO_DIR/scripts/daily-update-prompt.md"
LOG_DIR="$HOME/Library/Logs/rewards-daily-update"
LOG_FILE="$LOG_DIR/$(date +%Y-%m-%d).log"

mkdir -p "$LOG_DIR"
exec >> "$LOG_FILE" 2>&1

echo "=== $(date '+%Y-%m-%d %H:%M:%S') starting daily update ==="

cd "$REPO_DIR"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean — aborting rather than risk clobbering in-progress work."
  git status --porcelain
  exit 1
fi

git checkout main
git pull --ff-only origin main

REMAINING=$(node scripts/next-batch.js 5 | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>console.log(JSON.parse(d).remaining))')
echo "Cards remaining unfilled: $REMAINING"

if [[ "$REMAINING" -eq 0 ]]; then
  echo "Nothing left to fill in. Exiting."
  exit 0
fi

claude -p "$(cat "$PROMPT_FILE")" \
  --permission-mode acceptEdits \
  --allowedTools "Read,Write,Edit,Bash(git *),Bash(node *),Bash(npm *),Bash(gh *),WebSearch,WebFetch" \
  --add-dir "$REPO_DIR"

echo "=== $(date '+%Y-%m-%d %H:%M:%S') done ==="
