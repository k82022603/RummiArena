#!/usr/bin/env bash
# check-merged-pr.sh — 내 PR 상태 확인 + 로컬·원격 branch 정리 + main 동기화
#
# 사용법:
#   ./scripts/check-merged-pr.sh           # 내 로컬 branch 전수 체크
#   ./scripts/check-merged-pr.sh --dry-run # 삭제 없이 현재 상태만 보고
#
# 동작:
#   1. git fetch --all --prune
#   2. 로컬 branch 중 내가 만든 PR 로 merged 된 것 탐지
#   3. 로컬·원격 branch 삭제 (checkout 중이면 main 으로 전환 후)
#   4. main pull --ff-only
#   5. 내 현재 open PR 목록 출력
#
# 요구사항: git + gh CLI (auth 완료)

set -euo pipefail

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run|-n) DRY_RUN=1 ;;
    -h|--help)
      sed -n '2,15p' "$0"
      exit 0
      ;;
  esac
done

ROOT=$(git rev-parse --show-toplevel 2>/dev/null || { echo "✗ git 저장소가 아닙니다"; exit 1; })
cd "$ROOT"

if ! command -v gh >/dev/null 2>&1; then
  echo "✗ gh CLI 가 설치되지 않았습니다"
  exit 1
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "✗ gh 인증 필요: gh auth login"
  exit 1
fi

ME=$(gh api user -q .login)
echo "==============================================="
echo " PR Status Check — $(date '+%Y-%m-%d %H:%M:%S')"
echo " User: $ME"
[[ $DRY_RUN -eq 1 ]] && echo " Mode: DRY-RUN (삭제 없음)"
echo "==============================================="

echo
echo "[1/4] git fetch --all --prune"
if [[ $DRY_RUN -eq 0 ]]; then
  git fetch --all --prune >/dev/null 2>&1 && echo "  ✓ 완료" || echo "  ⚠ fetch 실패 (오프라인?)"
else
  echo "  (skip — dry-run)"
fi

echo
echo "[2/4] 로컬 branch 중 merged 탐지"
LOCAL_BRANCHES=$(git for-each-ref --format='%(refname:short)' refs/heads | grep -v '^main$' || true)

CLEANED=0
if [[ -z "$LOCAL_BRANCHES" ]]; then
  echo "  로컬에 main 외 branch 없음"
else
  while IFS= read -r branch; do
    [[ -z "$branch" ]] && continue
    PR_NUM=$(gh pr list --author="$ME" --state=merged --head="$branch" --json number -q '.[0].number' 2>/dev/null || echo "")
    if [[ -n "$PR_NUM" ]]; then
      echo "  ✓ $branch — PR #$PR_NUM merged"
      if [[ $DRY_RUN -eq 0 ]]; then
        CURRENT=$(git branch --show-current)
        if [[ "$CURRENT" == "$branch" ]]; then
          git checkout main >/dev/null 2>&1 || { echo "    ✗ main checkout 실패, 수동 처리 필요"; continue; }
          echo "    → main 으로 checkout"
        fi
        git branch -D "$branch" >/dev/null 2>&1 && echo "    → 로컬 삭제" || echo "    ⚠ 로컬 삭제 실패"
        git push origin --delete "$branch" >/dev/null 2>&1 && echo "    → 원격 삭제" || echo "    (원격 이미 없음)"
        CLEANED=$((CLEANED + 1))
      fi
    else
      # 로컬에만 있고 PR 없는 경우는 그대로 둠 (사용자 작업 중)
      echo "  · $branch — 작업 중 (merged PR 없음)"
    fi
  done <<< "$LOCAL_BRANCHES"
fi

echo
echo "[3/4] main 동기화"
if [[ $DRY_RUN -eq 0 ]]; then
  CURRENT=$(git branch --show-current)
  if [[ "$CURRENT" != "main" ]]; then
    git checkout main >/dev/null 2>&1 || true
  fi
  if git pull --ff-only origin main >/dev/null 2>&1; then
    echo "  ✓ main pull --ff-only 완료"
  else
    echo "  ⚠ main pull 실패 (충돌 또는 비-FF). 수동 처리"
  fi
else
  echo "  (skip — dry-run)"
fi

echo
echo "[4/4] 현재 열린 PR (author=$ME)"
OPEN_COUNT=$(gh pr list --author="$ME" --state=open --json number -q 'length' 2>/dev/null || echo 0)
if [[ "$OPEN_COUNT" -eq 0 ]]; then
  echo "  열린 PR 없음"
else
  gh pr list --author="$ME" --state=open \
    --json number,title,url,headRefName,createdAt,reviewDecision \
    -q '.[] | "  #\(.number) [\(.headRefName)] \(.title)\n    \(.url)\n    review: \(.reviewDecision // \"NONE\"), 생성: \(.createdAt | split(\"T\")[0])"'
fi

echo
echo "==============================================="
echo " 요약: merged 정리 $CLEANED 개 / 열린 PR $OPEN_COUNT 개"
echo "==============================================="
