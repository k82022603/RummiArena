#!/usr/bin/env bash
# verify-rooms-persistence.sh — D-03 Phase 1 Dual-Write 배포 후 실 K8s/PG 검증
#
# 목적: AI vs AI 1판 배치 실행 이후 rooms 테이블과 games 테이블 사이의
# FK 관계가 정상 기록되었는지를 ADR §"검증 계획" 에 명시된 4가지 SQL 질의로 확인한다.
#
# 사용:
#   scripts/verify-rooms-persistence.sh                  # 최근 방 자동 선택
#   scripts/verify-rooms-persistence.sh --room-id <uuid> # 특정 방 검증
#
# 종료 코드:
#   0 — 모든 assertion PASS
#   1 — 하나 이상 FAIL
#   2 — 환경 오류(kubectl, psql 접근 불가 등)
#
# 연관:
#   - ADR: work_logs/decisions/2026-04-22-rooms-postgres-phase1.md §"Integration Test"
#   - Go 통합 테스트: src/game-server/e2e/rooms_persistence_test.go
#   - 단위 테스트: src/game-server/internal/service/room_service_test.go §D-03

set -uo pipefail

# ─── 색상 (터미널 TTY 일 때만) ────────────────────────────────────────
if [ -t 1 ]; then
  C_RED='\033[0;31m'
  C_GREEN='\033[0;32m'
  C_YELLOW='\033[0;33m'
  C_BLUE='\033[0;34m'
  C_RESET='\033[0m'
else
  C_RED='' C_GREEN='' C_YELLOW='' C_BLUE='' C_RESET=''
fi

# ─── 환경 변수 (기본값) ──────────────────────────────────────────────
NS="${NS:-rummikub}"
PG_DEPLOY="${PG_DEPLOY:-deploy/postgres}"
PG_USER="${PG_USER:-rummikub}"
PG_DB="${PG_DB:-rummikub}"

PASS_COUNT=0
FAIL_COUNT=0

# ─── 인자 파싱 ───────────────────────────────────────────────────────
ROOM_ID=""
while [ $# -gt 0 ]; do
  case "$1" in
    --room-id)
      ROOM_ID="${2:-}"
      shift 2
      ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *)
      echo -e "${C_RED}unknown argument: $1${C_RESET}" >&2
      exit 2
      ;;
  esac
done

# ─── 헬퍼 함수 ───────────────────────────────────────────────────────

# psql_q "<SQL>" — PostgreSQL 에서 단일 값 질의. 공백/개행 제거 후 출력.
psql_q() {
  local sql="$1"
  kubectl exec -n "$NS" "$PG_DEPLOY" -- \
    psql -U "$PG_USER" -d "$PG_DB" -t -A -c "$sql" 2>/dev/null
}

# assert_eq "name" "expected" "actual"
assert_eq() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo -e "  ${C_GREEN}PASS${C_RESET} — ${name} (=${actual})"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo -e "  ${C_RED}FAIL${C_RESET} — ${name} (expected=${expected}, actual=${actual})"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

# assert_ge "name" "minimum" "actual"
assert_ge() {
  local name="$1" minimum="$2" actual="$3"
  if [ -z "$actual" ]; then
    echo -e "  ${C_RED}FAIL${C_RESET} — ${name} (no value returned)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    return
  fi
  if [ "$actual" -ge "$minimum" ] 2>/dev/null; then
    echo -e "  ${C_GREEN}PASS${C_RESET} — ${name} (${actual} >= ${minimum})"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo -e "  ${C_RED}FAIL${C_RESET} — ${name} (${actual} < ${minimum})"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

# ─── 사전 점검 ───────────────────────────────────────────────────────
echo -e "${C_BLUE}=== D-03 Phase 1 Dual-Write 배포 후 검증 ===${C_RESET}"
echo "namespace=$NS deploy=$PG_DEPLOY user=$PG_USER db=$PG_DB"
echo ""

if ! command -v kubectl >/dev/null 2>&1; then
  echo -e "${C_RED}kubectl 이 PATH 에 없습니다.${C_RESET}" >&2
  exit 2
fi

if ! kubectl -n "$NS" get "$PG_DEPLOY" >/dev/null 2>&1; then
  echo -e "${C_RED}kubectl -n $NS get $PG_DEPLOY 실패 — 클러스터/namespace 확인 필요.${C_RESET}" >&2
  exit 2
fi

# pg_isready
if ! kubectl exec -n "$NS" "$PG_DEPLOY" -- pg_isready -U "$PG_USER" >/dev/null 2>&1; then
  echo -e "${C_RED}pg_isready 실패 — PostgreSQL 접속 불가.${C_RESET}" >&2
  exit 2
fi

# ─── Assertion 1: rooms 테이블 INSERT 발생 ───────────────────────────
echo -e "${C_YELLOW}[1/5] rooms 테이블 INSERT 검증${C_RESET}"
ROOMS_COUNT=$(psql_q "SELECT count(*) FROM rooms;")
assert_ge "SELECT count(*) FROM rooms" 1 "$ROOMS_COUNT"

# ─── Assertion 2: 대상 방 ID 자동 선택 (--room-id 미지정 시) ────────────
if [ -z "$ROOM_ID" ]; then
  ROOM_ID=$(psql_q "SELECT id FROM rooms ORDER BY updated_at DESC LIMIT 1;")
  if [ -z "$ROOM_ID" ]; then
    echo -e "  ${C_RED}FAIL${C_RESET} — 최근 방을 찾을 수 없음. rooms 테이블이 비어 있습니다."
    FAIL_COUNT=$((FAIL_COUNT + 1))
  else
    echo -e "  ${C_BLUE}INFO${C_RESET} — 자동 선택 room_id=${ROOM_ID}"
  fi
fi

# ─── Assertion 3: 해당 방 상태가 FINISHED (게임 종료 후 기준) ────────
echo -e "${C_YELLOW}[2/5] rooms.status=FINISHED 검증${C_RESET}"
if [ -n "$ROOM_ID" ]; then
  STATUS=$(psql_q "SELECT status FROM rooms WHERE id = '${ROOM_ID}';")
  assert_eq "SELECT status FROM rooms WHERE id=\$1" "FINISHED" "$STATUS"
else
  echo -e "  ${C_YELLOW}SKIP${C_RESET} — room_id 없음"
fi

# ─── Assertion 4: games.room_id NOT NULL (I-14 wire 이후) ─────────────
echo -e "${C_YELLOW}[3/5] games.room_id NOT NULL 검증 (I-14 FK 정상화)${C_RESET}"
NULL_GAMES=$(psql_q "SELECT count(*) FROM games WHERE room_id IS NULL;")
TOTAL_GAMES=$(psql_q "SELECT count(*) FROM games;")
echo "  games total=${TOTAL_GAMES}, games with room_id=NULL: ${NULL_GAMES}"
# D-03 이후 새로 INSERT 된 게임은 모두 room_id 를 가져야 한다.
# PR #38 이전 레거시 row 는 NULL 일 수 있으므로, 최근 10분 이내 INSERT 된 게임 기준 검사.
RECENT_NULL_GAMES=$(psql_q "SELECT count(*) FROM games WHERE room_id IS NULL AND created_at > NOW() - INTERVAL '10 minutes';")
assert_eq "SELECT count(*) FROM games WHERE room_id IS NULL AND recent" "0" "$RECENT_NULL_GAMES"

# ─── Assertion 5: rooms-games JOIN (FK 유효성) ─────────────────────────
echo -e "${C_YELLOW}[4/5] rooms-games JOIN (FK 유효성)${C_RESET}"
JOIN_COUNT=$(psql_q "SELECT count(*) FROM rooms r JOIN games g ON g.room_id = r.id;")
assert_ge "SELECT count(*) FROM rooms r JOIN games g ON g.room_id = r.id" 1 "$JOIN_COUNT"

# ─── Assertion 6 (Bonus): stale 데이터 가드 ────────────────────────────
echo -e "${C_YELLOW}[5/5] Bonus — stale 데이터 가드 (최근 10분 이내 방 >= 1)${C_RESET}"
RECENT_ROOMS=$(psql_q "SELECT count(*) FROM rooms WHERE created_at > NOW() - INTERVAL '10 minutes';")
assert_ge "SELECT count(*) FROM rooms WHERE created_at > NOW()-INTERVAL '10 minutes'" 1 "$RECENT_ROOMS"

# ─── 결과 요약 ───────────────────────────────────────────────────────
echo ""
echo -e "${C_BLUE}========================================${C_RESET}"
echo -e "  결과: ${C_GREEN}PASS=${PASS_COUNT}${C_RESET} / ${C_RED}FAIL=${FAIL_COUNT}${C_RESET}"
echo -e "${C_BLUE}========================================${C_RESET}"

if [ "$FAIL_COUNT" -gt 0 ]; then
  echo ""
  echo -e "${C_YELLOW}참고 — FAIL 시 점검 포인트:${C_RESET}"
  echo "  1) main.go 에 pgGameRepo 주입되었는가? (로그: 'rooms dual-write enabled')"
  echo "  2) 게임이 실제 종료되었는가? (AI vs AI 배치 완료 확인)"
  echo "  3) 호스트가 UUID 형식인가? (게스트 non-UUID 는 DB 쓰기 스킵이 정상)"
  echo "  4) persistGameResult 가 roomID 를 전달받는가? (I-14 wire 확인)"
  echo "  5) rooms/games 테이블이 올바르게 AutoMigrate 되었는가?"
  exit 1
fi

exit 0
