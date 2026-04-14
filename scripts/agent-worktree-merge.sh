#!/usr/bin/env bash
# agent-worktree-merge.sh — Merge an agent's worktree branch back into main and clean up
#
# Usage:
#   scripts/agent-worktree-merge.sh <agent-name>
#
# Behavior:
#   1. Acquire global merge lock (flock) — 동시 머지 race condition 회피
#   2. Locate worktree at .claude/worktrees/agent-<name>
#   3. Verify the working tree is clean (all changes committed)
#   4. Rebase agent branch onto origin/main (fast-forward 보장)
#      - rebase 충돌 시 abort + worktree/브랜치 보존 (수동 해결 요구)
#   5. Fast-forward main → agent (3-way 머지 없음, 항상 ff-only)
#   6. On success: remove worktree, delete temp branch
#   7. On any failure: leave artefacts in place + print recovery hint
#
# Exit codes: 0 success, 1 usage, 2 dirty worktree, 3 rebase/merge conflict, 4 other
#
# 근거: docs/02-design/40-agent-commit-queue-design.md §6 보강 2/3/4
set -euo pipefail

AGENT_NAME="${1:-}"
if [[ -z "$AGENT_NAME" ]]; then
  echo "Usage: $0 <agent-name>" >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# ============================================================================
# Step 0: 동시 머지 lock (flock) — 보강 4
# ============================================================================
# 두 agent가 동시에 merge를 호출하면 .git/index.lock 충돌이 발생할 수 있다
# (Day 1+2 attribution 경합 deb9635 사례 재현 방지).
# flock으로 직렬화 — 머지가 수 초 작업이므로 비용 무시 가능.
LOCK_FILE="/tmp/rummiarena-merge.lock"
if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  if ! flock -w 60 -x 9; then
    echo "ERROR: 60초 내 merge lock 획득 실패. 다른 머지가 진행 중일 수 있음." >&2
    exit 4
  fi
  trap "flock -u 9 2>/dev/null || true" EXIT
  echo "[merge] acquired global merge lock: $LOCK_FILE" >&2
else
  # WSL2 등 flock 미설치 환경을 위한 mkdir lock fallback
  LOCK_DIR="/tmp/rummiarena-merge.lock.d"
  for i in $(seq 1 60); do
    if mkdir "$LOCK_DIR" 2>/dev/null; then
      trap "rmdir '$LOCK_DIR' 2>/dev/null || true" EXIT
      echo "[merge] acquired mkdir lock: $LOCK_DIR" >&2
      break
    fi
    [[ $i -eq 60 ]] && { echo "ERROR: 60초 내 mkdir lock 획득 실패." >&2; exit 4; }
    sleep 1
  done
fi

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

# Step 3: rebase agent onto main → fast-forward 보장 (보강 2)
# 3-way merge는 머지 커밋이 attribution을 흐리므로, 항상 rebase + ff-only 정책 사용.
# rebase 충돌 시 abort 후 worktree/브랜치 보존 (보강 3) — agent가 worktree 안에서
# 직접 충돌 해결한 뒤 본 스크립트 재실행 가능.
if ! git merge-base --is-ancestor "$BASE_SHA" "$AGENT_SHA"; then
  echo "[merge] base diverged — rebasing agent branch onto main" >&2
  if ! git -C "$WORKTREE_DIR" rebase "$BASE_SHA"; then
    echo "ERROR: rebase 충돌 발생. worktree와 브랜치를 보존합니다." >&2
    git -C "$WORKTREE_DIR" rebase --abort 2>/dev/null || true
    echo "  recovery 단계:" >&2
    echo "    cd $WORKTREE_DIR" >&2
    echo "    git rebase $BASE_SHA  # 충돌 수동 해결" >&2
    echo "    git rebase --continue" >&2
    echo "    cd $REPO_ROOT && bash scripts/agent-worktree-merge.sh $AGENT_NAME" >&2
    exit 3
  fi
  AGENT_SHA="$(git -C "$WORKTREE_DIR" rev-parse HEAD)"
  echo "[merge] rebase 성공 — new agent tip: ${AGENT_SHA}" >&2
fi

echo "[merge] fast-forward main → ${AGENT_SHA}" >&2
if ! git merge --ff-only "$AGENT_SHA"; then
  echo "ERROR: fast-forward 머지 실패. worktree와 브랜치를 보존합니다." >&2
  echo "  recovery 단계:" >&2
  echo "    git status" >&2
  echo "    cd $WORKTREE_DIR" >&2
  echo "    git rebase $(git -C "$REPO_ROOT" rev-parse HEAD)  # main 위로 재정렬 후 재시도" >&2
  exit 3
fi

MERGED_SHA="$(git rev-parse HEAD)"
echo "[merge] success — main now at ${MERGED_SHA}" >&2

# Step 4: Cleanup worktree + branch (성공 시에만 — 보강 3)
echo "[merge] removing worktree ${WORKTREE_DIR}" >&2
git worktree remove "$WORKTREE_DIR"

echo "[merge] deleting branch ${BRANCH_NAME}" >&2
git branch -D "$BRANCH_NAME"

echo "MERGED_SHA=${MERGED_SHA}"
