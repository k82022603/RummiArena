#!/usr/bin/env bash
# agent-worktree-status.sh — List active agent worktrees in table format
#
# Usage:
#   scripts/agent-worktree-status.sh
#
# Output: one row per agent worktree under .claude/worktrees/agent-*
#   AGENT  BRANCH  CREATED  AHEAD  DIRTY
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

WORKTREES_DIR="${REPO_ROOT}/.claude/worktrees"

if [[ ! -d "$WORKTREES_DIR" ]]; then
  echo "(no agent worktrees)"
  exit 0
fi

shopt -s nullglob
ROWS=()
for wt in "$WORKTREES_DIR"/agent-*; do
  [[ -d "$wt" ]] || continue
  agent_name="$(basename "$wt" | sed 's/^agent-//')"
  if ! git -C "$wt" rev-parse --git-dir >/dev/null 2>&1; then
    ROWS+=("${agent_name}|<broken>|-|-|-")
    continue
  fi
  branch="$(git -C "$wt" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '<detached>')"
  # Created time = mtime of worktree dir (close enough for short-lived branches)
  created="$(date -r "$wt" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo '-')"
  # Commits ahead of main
  if git rev-parse --verify main >/dev/null 2>&1; then
    ahead="$(git -C "$wt" rev-list --count main..HEAD 2>/dev/null || echo '?')"
  else
    ahead='?'
  fi
  dirty_count="$(git -C "$wt" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
  ROWS+=("${agent_name}|${branch}|${created}|${ahead}|${dirty_count}")
done
shopt -u nullglob

if [[ ${#ROWS[@]} -eq 0 ]]; then
  echo "(no agent worktrees)"
  exit 0
fi

{
  echo "AGENT|BRANCH|CREATED|AHEAD|DIRTY"
  printf '%s\n' "${ROWS[@]}"
} | column -t -s '|'
