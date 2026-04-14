#!/usr/bin/env bash
# agent-worktree-setup.sh — Create an isolated git worktree for an agent
#
# Usage:
#   scripts/agent-worktree-setup.sh <agent-name>
#
# Output (stdout, last two lines for eval):
#   AGENT_WORKTREE_PATH=/abs/path
#   AGENT_WORKTREE_BRANCH=agent/<name>/<timestamp>
#
# Exit codes: 0 success, 1 usage / branch exists / git failure
set -euo pipefail

AGENT_NAME="${1:-}"
if [[ -z "$AGENT_NAME" ]]; then
  echo "Usage: $0 <agent-name>" >&2
  exit 1
fi

if ! [[ "$AGENT_NAME" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo "ERROR: agent name must match [a-zA-Z0-9_-]+ (got: $AGENT_NAME)" >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BRANCH_NAME="agent/${AGENT_NAME}/${TIMESTAMP}"
WORKTREE_DIR="${REPO_ROOT}/.claude/worktrees/agent-${AGENT_NAME}"

if [[ -e "$WORKTREE_DIR" ]]; then
  echo "ERROR: worktree dir already exists: $WORKTREE_DIR" >&2
  echo "  hint: scripts/agent-worktree-merge.sh ${AGENT_NAME}  (or remove manually)" >&2
  exit 1
fi

if git show-ref --verify --quiet "refs/heads/${BRANCH_NAME}"; then
  echo "ERROR: branch already exists: $BRANCH_NAME" >&2
  exit 1
fi

mkdir -p "$(dirname "$WORKTREE_DIR")"

echo "[setup] creating worktree for agent='${AGENT_NAME}'" >&2
echo "[setup]   branch:   ${BRANCH_NAME}" >&2
echo "[setup]   path:     ${WORKTREE_DIR}" >&2
echo "[setup]   base:     main" >&2

git worktree add -b "$BRANCH_NAME" "$WORKTREE_DIR" main >&2

echo "AGENT_WORKTREE_PATH=${WORKTREE_DIR}"
echo "AGENT_WORKTREE_BRANCH=${BRANCH_NAME}"
