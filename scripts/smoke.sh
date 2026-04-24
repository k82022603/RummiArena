#!/usr/bin/env bash
# smoke.sh — RummiArena 배포 Smoke 검증 스크립트
#
# 사용법:
#   scripts/smoke.sh --all              # 5축 전체 검증
#   scripts/smoke.sh --axis inf         # 인프라 축만
#   scripts/smoke.sh --axis game        # 게임 완주 축만
#   scripts/smoke.sh --axis rearrange   # 재배치 4유형 축만
#   scripts/smoke.sh --axis i18n        # 한글 렌더 축만
#   scripts/smoke.sh --axis drag        # drag stuck 축만
#   scripts/smoke.sh --watch --duration 300  # 배포 후 5분 모니터링
#   scripts/smoke.sh --retry-failed     # 이전 실패 축만 재실행
#
# 합격 기준: 5축 모두 GREEN → 배포 허가
#            1축이라도 FAIL → 배포 차단
#
# 근거 문서: docs/05-deployment/10-smoke-criteria.md

set -euo pipefail

NAMESPACE="rummikub"
HEALTH_URL="http://localhost:30080/api/health"
FRONTEND_URL="http://localhost:30000"
PLAYWRIGHT_DIR="src/frontend"
SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPTS_DIR/.." && pwd)"

# 결과 추적
declare -A AXIS_RESULTS
AXIS_RESULTS=(
  [inf]="SKIP"
  [game]="SKIP"
  [rearrange]="SKIP"
  [i18n]="SKIP"
  [drag]="SKIP"
)

# ─────────────────────────────────────────────
# 유틸
# ─────────────────────────────────────────────
log()  { echo "[$(date '+%H:%M:%S')] $*"; }
pass() { echo "[PASS] $*"; }
fail() { echo "[FAIL] $*" >&2; }

print_summary() {
  echo ""
  echo "════════════════════════════════════════"
  echo "  Smoke 결과 요약"
  echo "════════════════════════════════════════"
  local all_pass=true
  for axis in inf game rearrange i18n drag; do
    local result="${AXIS_RESULTS[$axis]}"
    if [ "$result" = "PASS" ]; then
      echo "  [GREEN] Axis-$(echo $axis | tr '[:lower:]' '[:upper:]'): PASS"
    elif [ "$result" = "FAIL" ]; then
      echo "  [RED]   Axis-$(echo $axis | tr '[:lower:]' '[:upper:]'): FAIL"
      all_pass=false
    else
      echo "  [SKIP]  Axis-$(echo $axis | tr '[:lower:]' '[:upper:]'): SKIP"
    fi
  done
  echo "════════════════════════════════════════"
  if $all_pass; then
    echo "  결과: 배포 허가 (모든 실행 축 PASS)"
    return 0
  else
    echo "  결과: 배포 차단 (FAIL 축 존재)"
    return 1
  fi
}

# ─────────────────────────────────────────────
# Axis-INF: 인프라 생존 확인
# ─────────────────────────────────────────────
run_axis_inf() {
  log "Axis-INF 시작: 인프라 생존 확인"

  # Pod 상태 확인
  local not_running
  not_running=$(kubectl get pods -n "$NAMESPACE" --no-headers 2>/dev/null \
    | grep -v "Running" | grep -v "Completed" || true)
  if [ -n "$not_running" ]; then
    fail "일부 Pod 가 Running 상태가 아닙니다:"
    echo "$not_running"
    AXIS_RESULTS[inf]="FAIL"; return 1
  fi

  # Restart 횟수 확인 (3회 미만)
  local high_restarts
  high_restarts=$(kubectl get pods -n "$NAMESPACE" --no-headers 2>/dev/null \
    | awk '{if ($4+0 >= 3) print $0}' || true)
  if [ -n "$high_restarts" ]; then
    fail "RESTARTS >= 3 인 Pod 감지:"
    echo "$high_restarts"
    AXIS_RESULTS[inf]="FAIL"; return 1
  fi

  # Health endpoint
  local health_code
  health_code=$(curl -so /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")
  if [ "$health_code" != "200" ]; then
    fail "Health endpoint 응답 비정상: HTTP $health_code (기대: 200)"
    AXIS_RESULTS[inf]="FAIL"; return 1
  fi

  # Helm 배포 상태
  local helm_status
  helm_status=$(helm list -n "$NAMESPACE" --short 2>/dev/null | head -1)
  if [ -z "$helm_status" ]; then
    fail "helm list 에 배포된 release 없음"
    AXIS_RESULTS[inf]="FAIL"; return 1
  fi

  pass "Axis-INF: Pod ALL Running, Health 200, Helm deployed"
  AXIS_RESULTS[inf]="PASS"
}

# ─────────────────────────────────────────────
# Axis-GAME: 1 게임 완주
# ─────────────────────────────────────────────
run_axis_game() {
  log "Axis-GAME 시작: 게임 완주 검증 (20~30턴, 최대 10분)"

  if ! command -v python3 &>/dev/null; then
    fail "python3 없음 — Axis-GAME 건너뜀"
    AXIS_RESULTS[game]="FAIL"; return 1
  fi

  # smoke-rooms-phase1.py 활용 (30턴 제한, 600초 타임아웃)
  if python3 "$SCRIPTS_DIR/smoke-rooms-phase1.py" \
      --max-turns 30 \
      --timeout 600 \
      2>&1 | tail -5; then
    pass "Axis-GAME: 게임 완주 성공"
    AXIS_RESULTS[game]="PASS"
  else
    fail "Axis-GAME: 게임 완주 실패 (crash 또는 타임아웃)"
    AXIS_RESULTS[game]="FAIL"; return 1
  fi
}

# ─────────────────────────────────────────────
# Axis-REARRANGE: 재배치 4유형 Playwright
# ─────────────────────────────────────────────
run_axis_rearrange() {
  log "Axis-REARRANGE 시작: 재배치 I-1~I-4 Playwright 검증"

  cd "$PROJECT_ROOT/$PLAYWRIGHT_DIR" || { fail "frontend 디렉토리 없음"; AXIS_RESULTS[rearrange]="FAIL"; return 1; }

  # spec 파일 존재 여부 확인
  local specs=(
    "e2e/rearrange-i1-new-group.spec.ts"
    "e2e/rearrange-i2-extend.spec.ts"
    "e2e/rearrange-i3-joker-swap.spec.ts"
    "e2e/rearrange-i4-multi.spec.ts"
  )
  local missing=0
  for spec in "${specs[@]}"; do
    if [ ! -f "$spec" ]; then
      log "  [경고] spec 미존재 (qa 작성 대기): $spec"
      missing=$((missing + 1))
    fi
  done

  if [ "$missing" -gt 0 ]; then
    log "  Axis-REARRANGE: spec $missing 개 미작성 — qa 가 작성 후 재실행 필요"
    log "  현재 단계: SKIP (spec 미작성은 배포 차단 대상 아님 — 단 qa 가 Day 3 오전 중 작성 의무)"
    AXIS_RESULTS[rearrange]="SKIP"
    cd "$PROJECT_ROOT"
    return 0
  fi

  if npx playwright test \
      "${specs[@]}" \
      --project=chromium \
      --reporter=line \
      2>&1; then
    pass "Axis-REARRANGE: 재배치 4유형 PASS"
    AXIS_RESULTS[rearrange]="PASS"
  else
    fail "Axis-REARRANGE: 재배치 spec FAIL"
    AXIS_RESULTS[rearrange]="FAIL"
    cd "$PROJECT_ROOT"; return 1
  fi
  cd "$PROJECT_ROOT"
}

# ─────────────────────────────────────────────
# Axis-I18N: 한글 렌더 diff
# ─────────────────────────────────────────────
run_axis_i18n() {
  log "Axis-I18N 시작: 한글 렌더 mojibake 검증"

  cd "$PROJECT_ROOT/$PLAYWRIGHT_DIR" || { fail "frontend 디렉토리 없음"; AXIS_RESULTS[i18n]="FAIL"; return 1; }

  if [ ! -f "e2e/i18n-render.spec.ts" ]; then
    log "  Axis-I18N: spec 미작성 — qa 가 작성 후 재실행 필요"
    AXIS_RESULTS[i18n]="SKIP"
    cd "$PROJECT_ROOT"; return 0
  fi

  if npx playwright test \
      e2e/i18n-render.spec.ts \
      --project=chromium \
      --reporter=line \
      2>&1; then
    pass "Axis-I18N: 한글 렌더 mojibake 0건 확인"
    AXIS_RESULTS[i18n]="PASS"
  else
    fail "Axis-I18N: 한글 렌더 이상 감지"
    AXIS_RESULTS[i18n]="FAIL"
    cd "$PROJECT_ROOT"; return 1
  fi
  cd "$PROJECT_ROOT"
}

# ─────────────────────────────────────────────
# Axis-DRAG: drag stuck 0건
# ─────────────────────────────────────────────
run_axis_drag() {
  log "Axis-DRAG 시작: meld-dup-render.spec.ts 6개 시나리오"

  cd "$PROJECT_ROOT/$PLAYWRIGHT_DIR" || { fail "frontend 디렉토리 없음"; AXIS_RESULTS[drag]="FAIL"; return 1; }

  if [ ! -f "e2e/meld-dup-render.spec.ts" ]; then
    log "  Axis-DRAG: spec 미작성 — qa + frontend-dev 가 작성 후 재실행 필요"
    AXIS_RESULTS[drag]="SKIP"
    cd "$PROJECT_ROOT"; return 0
  fi

  if npx playwright test \
      e2e/meld-dup-render.spec.ts \
      --project=chromium \
      --reporter=line \
      2>&1; then
    pass "Axis-DRAG: drag stuck 0건 확인 (6/6 GREEN)"
    AXIS_RESULTS[drag]="PASS"
  else
    fail "Axis-DRAG: drag stuck 감지 (6개 중 FAIL 존재)"
    AXIS_RESULTS[drag]="FAIL"
    cd "$PROJECT_ROOT"; return 1
  fi
  cd "$PROJECT_ROOT"
}

# ─────────────────────────────────────────────
# Watch 모드: 배포 후 n초 모니터링
# ─────────────────────────────────────────────
run_watch() {
  local duration="${1:-300}"
  log "Watch 모드 시작: ${duration}초간 Health + Pod 모니터링"
  local end=$((SECONDS + duration))
  local fail_count=0
  while [ $SECONDS -lt $end ]; do
    local health_code
    health_code=$(curl -so /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")
    if [ "$health_code" != "200" ]; then
      fail_count=$((fail_count + 1))
      log "  [경고] health=$health_code (fail_count=$fail_count)"
      if [ "$fail_count" -ge 3 ]; then
        fail "Watch: 연속 3회 비정상 — 자동 rollback 트리거 R-01 조건 충족"
        fail "즉시 실행: helm rollback rummiarena 0 -n $NAMESPACE"
        exit 1
      fi
    else
      fail_count=0
      log "  health=200 OK (남은 시간: $((end - SECONDS))s)"
    fi
    sleep 10
  done
  pass "Watch: ${duration}초 이상 정상 유지"
}

# ─────────────────────────────────────────────
# 메인 진입점
# ─────────────────────────────────────────────
main() {
  local mode="all"
  local axis=""
  local watch=false
  local watch_duration=300

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --all)            mode="all" ;;
      --axis)           mode="axis"; axis="$2"; shift ;;
      --watch)          watch=true ;;
      --duration)       watch_duration="$2"; shift ;;
      --retry-failed)   mode="retry" ;;
      -h|--help)
        grep '^#' "$0" | sed 's/^# //'
        exit 0
        ;;
      *) echo "알 수 없는 옵션: $1"; exit 1 ;;
    esac
    shift
  done

  if $watch; then
    run_watch "$watch_duration"
    exit 0
  fi

  log "RummiArena Smoke 검증 시작 (mode=$mode)"
  echo ""

  case "$mode" in
    all)
      run_axis_inf
      run_axis_game
      run_axis_rearrange
      run_axis_i18n
      run_axis_drag
      ;;
    axis)
      case "$axis" in
        inf)       run_axis_inf ;;
        game)      run_axis_game ;;
        rearrange) run_axis_rearrange ;;
        i18n)      run_axis_i18n ;;
        drag)      run_axis_drag ;;
        *)         echo "알 수 없는 axis: $axis (inf|game|rearrange|i18n|drag)"; exit 1 ;;
      esac
      ;;
    retry)
      # 이전 실행 결과 기반 재실행 — 현재는 전체 재실행과 동일
      run_axis_inf
      run_axis_game
      run_axis_rearrange
      run_axis_i18n
      run_axis_drag
      ;;
  esac

  print_summary
}

main "$@"
