#!/usr/bin/env bash
# agent-worktree-merge.sh — Merge an agent's worktree branch back into main and clean up
#
# Usage:
#   scripts/agent-worktree-merge.sh <agent-name>
#
# Behavior:
#   1. Locate worktree at .claude/worktrees/agent-<name>
#   2. Verify the working tree is clean (all changes committed)
#   3. Switch main repo to main, fast-forward; fall back to 3-way merge on divergence
#   4. On success: remove worktree, delete temp branch
#   5. On failure: leave artefacts in place + print recovery hint
#
# Exit codes: 0 success, 1 usage, 2 dirty worktree, 3 merge conflict, 4 other
set -euo pipefail

AGENT_NAME="${1:-}"
if [[ -z "$AGENT_NAME" ]]; then
  echo "Usage: $0 <agent-name>" >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

WORKTREE_DIR="${REPO_ROOT}/.claude/worktrees/agent-${AGENT_NAME}"

if [[ ! -d "$WORKTREE_DIR" ]]; then
  echo "ERROR: no worktree for agent '${AGENT_NAME}' at ${WORKTREE_DIR}" >&2
  exit 1
fi

BRANCH_NAME="$(git -C "$WORKTREE_DIR" rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH_NAME" == "HEAD" || "$BRANCH_NAME" == "main" ]]; then
  echo "ERROR: worktree HEAD is not on a feature branch (got: $BRANCH_NAME)" >&2
  exit 4
fi

echo "[merge] agent='${AGENT_NAME}' branch='${BRANCH_NAME}'" >&2

# Step 1: Verify worktree is clean of *tracked* changes (untracked files are allowed —
# they can't cause merge conflicts and agents legitimately leave scratch artifacts behind)
WT_TRACKED_DIRTY="$(git -C "$WORKTREE_DIR" status --porcelain | grep -v '^??' || true)"
if [[ -n "$WT_TRACKED_DIRTY" ]]; then
  echo "ERROR: worktree has uncommitted tracked changes — commit or stash first" >&2
  echo "$WT_TRACKED_DIRTY" >&2
  exit 2
fi

AGENT_SHA="$(git -C "$WORKTREE_DIR" rev-parse HEAD)"
BASE_SHA="$(git rev-parse main)"
echo "[merge]   base main:  ${BASE_SHA}" >&2
echo "[merge]   agent tip:  ${AGENT_SHA}" >&2

# Step 2: Ensure primary repo is on main and clean
PRIMARY_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$PRIMARY_BRANCH" != "main" ]]; then
  echo "ERROR: primary repo is on '${PRIMARY_BRANCH}', expected 'main'. Switch first." >&2
  exit 4
fi

PRIMARY_TRACKED_DIRTY="$(git status --porcelain | grep -v '^??' || true)"
if [[ -n "$PRIMARY_TRACKED_DIRTY" ]]; then
  echo "ERROR: primary repo has uncommitted tracked changes — cannot merge safely" >&2
  echo "$PRIMARY_TRACKED_DIRTY" >&2
  exit 4
fi

# Step 3: Fast-forward merge if possible, else 3-way
if git merge-base --is-ancestor "$BASE_SHA" "$AGENT_SHA"; then
  echo "[merge] fast-forward main → ${AGENT_SHA}" >&2
  if ! git merge --ff-only "$AGENT_SHA"; then
    echo "ERROR: fast-forward failed unexpectedly" >&2
    exit 3
  fi
else
  echo "[merge] base diverged — attempting 3-way merge" >&2
  if ! git merge --no-ff -m "merge: agent ${AGENT_NAME} branch ${BRANCH_NAME}" "$AGENT_SHA"; then
    echo "ERROR: 3-way merge produced conflicts" >&2
    echo "  recovery: resolve conflicts in primary repo, commit, then run:" >&2
    echo "    git worktree remove --force ${WORKTREE_DIR}" >&2
    echo "    git branch -D ${BRANCH_NAME}" >&2
    exit 3
  fi
fi

MERGED_SHA="$(git rev-parse HEAD)"
echo "[merge] success — main now at ${MERGED_SHA}" >&2

# Step 4: Cleanup worktree + branch
echo "[merge] removing worktree ${WORKTREE_DIR}" >&2
git worktree remove "$WORKTREE_DIR"

echo "[merge] deleting branch ${BRANCH_NAME}" >&2
git branch -D "$BRANCH_NAME"

echo "MERGED_SHA=${MERGED_SHA}"
