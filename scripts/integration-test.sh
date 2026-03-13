#!/bin/bash
# ==============================================================
# RummiArena 통합 테스트 (Integration Test)
#
# docs/04-testing/04-integration-test-scenarios.md 기반
# TC-I-002 ~ TC-I-041 자동 실행
#
# 사용법:
#   JWT_SECRET=your-secret ./scripts/integration-test.sh
#   JWT_SECRET=your-secret ./scripts/integration-test.sh --verbose
#
# 환경변수:
#   JWT_SECRET   - game-server JWT 서명 시크릿 (필수)
#   BASE_URL     - API 기본 URL (기본값: http://localhost:8080)
#   DB_HOST      - PostgreSQL 호스트 (기본값: localhost)
#   DB_PORT      - PostgreSQL 포트 (기본값: 5432)
#   REDIS_HOST   - Redis 호스트 (기본값: localhost)
#   REDIS_PORT   - Redis 포트 (기본값: 6379)
# ==============================================================

set -o pipefail

# --- 설정 ---
BASE_URL="${BASE_URL:-http://localhost:8080}"
API_URL="${BASE_URL}/api"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"
VERBOSE=false
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
GAME_SERVER_DIR="${PROJECT_ROOT}/src/game-server"

if [[ "$1" == "--verbose" ]]; then
  VERBOSE=true
fi

# --- 카운터 ---
PASS=0
FAIL=0
TOTAL=0

# --- 색상 ---
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ============================================================
# 헬퍼 함수
# ============================================================

log_header() {
  echo ""
  echo -e "${CYAN}========================================${NC}"
  echo -e "${CYAN} $1${NC}"
  echo -e "${CYAN}========================================${NC}"
}

log_section() {
  echo ""
  echo -e "${BOLD}--- $1 ---${NC}"
}

log_verbose() {
  if $VERBOSE; then
    echo -e "  ${YELLOW}[DEBUG]${NC} $1"
  fi
}

assert_status() {
  local tc_id="$1"
  local desc="$2"
  local expected="$3"
  local actual="$4"
  local body="$5"
  TOTAL=$((TOTAL + 1))
  if [ "$expected" = "$actual" ]; then
    echo -e "  ${GREEN}[PASS]${NC} ${tc_id}: ${desc} (HTTP ${actual})"
    PASS=$((PASS + 1))
    return 0
  else
    echo -e "  ${RED}[FAIL]${NC} ${tc_id}: ${desc} (expected HTTP ${expected}, got ${actual})"
    echo -e "    Response: ${body}"
    FAIL=$((FAIL + 1))
    return 1
  fi
}

assert_json_field() {
  local tc_id="$1"
  local desc="$2"
  local body="$3"
  local field="$4"
  local expected="$5"
  TOTAL=$((TOTAL + 1))
  local actual
  actual=$(echo "$body" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    keys = '${field}'.split('.')
    val = data
    for k in keys:
        if k.startswith('[') and k.endswith(']'):
            val = val[int(k[1:-1])]
        else:
            val = val[k]
    print(val)
except Exception as e:
    print('__FIELD_NOT_FOUND__')
" 2>/dev/null)
  if [ "$actual" = "__FIELD_NOT_FOUND__" ]; then
    echo -e "  ${RED}[FAIL]${NC} ${tc_id}: ${desc} (field '${field}' not found)"
    echo -e "    Response: ${body}"
    FAIL=$((FAIL + 1))
    return 1
  elif [ -n "$expected" ] && [ "$actual" != "$expected" ]; then
    echo -e "  ${RED}[FAIL]${NC} ${tc_id}: ${desc} (field '${field}': expected '${expected}', got '${actual}')"
    FAIL=$((FAIL + 1))
    return 1
  else
    echo -e "  ${GREEN}[PASS]${NC} ${tc_id}: ${desc} ('${field}' = '${actual}')"
    PASS=$((PASS + 1))
    return 0
  fi
}

assert_json_length() {
  local tc_id="$1"
  local desc="$2"
  local body="$3"
  local field="$4"
  local expected="$5"
  TOTAL=$((TOTAL + 1))
  local actual
  actual=$(echo "$body" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    keys = '${field}'.split('.')
    val = data
    for k in keys:
        if k.startswith('[') and k.endswith(']'):
            val = val[int(k[1:-1])]
        else:
            val = val[k]
    print(len(val))
except Exception as e:
    print('-1')
" 2>/dev/null)
  if [ "$actual" = "$expected" ]; then
    echo -e "  ${GREEN}[PASS]${NC} ${tc_id}: ${desc} (len(${field}) = ${actual})"
    PASS=$((PASS + 1))
    return 0
  else
    echo -e "  ${RED}[FAIL]${NC} ${tc_id}: ${desc} (len(${field}): expected ${expected}, got ${actual})"
    FAIL=$((FAIL + 1))
    return 1
  fi
}

# curl 래퍼: body + HTTP 상태 코드를 분리하여 반환
# $1: method, $2: url, $3: auth_header, $4: body(선택)
do_request() {
  local method="$1"
  local url="$2"
  local auth="$3"
  local data="$4"

  local curl_args=(-s -w "\n%{http_code}" -H "Content-Type: application/json")
  if [ -n "$auth" ]; then
    curl_args+=(-H "Authorization: Bearer ${auth}")
  fi
  if [ "$method" != "GET" ]; then
    curl_args+=(-X "$method")
  fi
  if [ -n "$data" ]; then
    curl_args+=(-d "$data")
  fi

  local response
  response=$(curl "${curl_args[@]}" "${url}" 2>/dev/null)
  local http_code
  http_code=$(echo "$response" | tail -1)
  local body
  body=$(echo "$response" | sed '$d')

  log_verbose "  ${method} ${url}"
  log_verbose "  HTTP ${http_code}: ${body}"

  echo "${http_code}"
  echo "${body}"
}

# ============================================================
# 1. 사전 조건 체크
# ============================================================

log_header "1. 사전 조건 체크"

# 1-1. JWT_SECRET 확인
if [ -z "${JWT_SECRET}" ]; then
  echo -e "${RED}[ERROR]${NC} JWT_SECRET 환경변수가 설정되지 않았습니다."
  echo "  사용법: JWT_SECRET=your-secret ./scripts/integration-test.sh"
  exit 1
fi
echo -e "  ${GREEN}[OK]${NC} JWT_SECRET 설정 확인"

# 1-2. python3 확인 (JSON 파싱용)
if ! command -v python3 &>/dev/null; then
  echo -e "${RED}[ERROR]${NC} python3이 설치되어 있지 않습니다. JSON 파싱에 필요합니다."
  exit 1
fi
echo -e "  ${GREEN}[OK]${NC} python3 사용 가능"

# 1-3. curl 확인
if ! command -v curl &>/dev/null; then
  echo -e "${RED}[ERROR]${NC} curl이 설치되어 있지 않습니다."
  exit 1
fi
echo -e "  ${GREEN}[OK]${NC} curl 사용 가능"

# 1-4. Go 확인 (JWT 토큰 생성용)
if ! command -v go &>/dev/null; then
  echo -e "${RED}[ERROR]${NC} Go가 설치되어 있지 않습니다. JWT 토큰 생성에 필요합니다."
  exit 1
fi
echo -e "  ${GREEN}[OK]${NC} Go $(go version | awk '{print $3}')"

# 1-5. game-server 헬스체크
echo -n "  game-server 헬스체크 (${BASE_URL}/health)... "
HEALTH_RESP=$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/health" 2>/dev/null)
if [ "$HEALTH_RESP" = "200" ]; then
  echo -e "${GREEN}[OK]${NC} HTTP 200"
else
  echo -e "${RED}[FAIL]${NC} HTTP ${HEALTH_RESP}"
  echo ""
  echo -e "${RED}[ERROR]${NC} game-server가 응답하지 않습니다."
  echo "  실행 방법: cd ${GAME_SERVER_DIR} && JWT_SECRET=${JWT_SECRET} go run ./cmd/server"
  exit 1
fi

# 1-6. PostgreSQL 연결 확인 (선택적)
echo -n "  PostgreSQL (${DB_HOST}:${DB_PORT})... "
if timeout 2 bash -c "echo > /dev/tcp/${DB_HOST}/${DB_PORT}" 2>/dev/null; then
  echo -e "${GREEN}[OK]${NC} 연결 가능"
else
  echo -e "${YELLOW}[SKIP]${NC} 연결 불가 (인메모리 모드로 진행)"
fi

# 1-7. Redis 연결 확인 (선택적)
echo -n "  Redis (${REDIS_HOST}:${REDIS_PORT})... "
if timeout 2 bash -c "echo > /dev/tcp/${REDIS_HOST}/${REDIS_PORT}" 2>/dev/null; then
  echo -e "${GREEN}[OK]${NC} 연결 가능"
else
  echo -e "${YELLOW}[SKIP]${NC} 연결 불가 (인메모리 모드로 진행)"
fi

# ============================================================
# 2. JWT 테스트 토큰 생성
# ============================================================

log_header "2. JWT 테스트 토큰 생성"

JWT_GEN_FILE=$(mktemp /tmp/jwt_gen_XXXXXX.go)
trap "rm -f ${JWT_GEN_FILE}" EXIT

cat > "${JWT_GEN_FILE}" << 'GOEOF'
package main

import (
	"fmt"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func main() {
	if len(os.Args) < 3 {
		fmt.Fprintf(os.Stderr, "Usage: %s <secret> <userID>\n", os.Args[0])
		os.Exit(1)
	}
	secret := os.Args[1]
	userID := os.Args[2]

	now := time.Now()
	claims := jwt.MapClaims{
		"sub":   userID,
		"email": userID + "@test.rummiarena.dev",
		"iat":   now.Unix(),
		"exp":   now.Add(2 * time.Hour).Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error signing token: %v\n", err)
		os.Exit(1)
	}
	fmt.Print(signed)
}
GOEOF

# Go 임시 모듈 환경에서 jwt 패키지를 사용하여 토큰 생성
JWT_TOKEN_P1=$(cd "${GAME_SERVER_DIR}" && go run "${JWT_GEN_FILE}" "${JWT_SECRET}" "test-user-001" 2>/dev/null)
if [ -z "$JWT_TOKEN_P1" ]; then
  echo -e "${RED}[ERROR]${NC} Player 1 JWT 토큰 생성 실패"
  echo "  game-server 디렉토리에서 go run 확인 필요: ${GAME_SERVER_DIR}"
  exit 1
fi
echo -e "  ${GREEN}[OK]${NC} Player 1 토큰 생성 (test-user-001)"
log_verbose "JWT_P1: ${JWT_TOKEN_P1:0:40}..."

JWT_TOKEN_P2=$(cd "${GAME_SERVER_DIR}" && go run "${JWT_GEN_FILE}" "${JWT_SECRET}" "test-user-002" 2>/dev/null)
if [ -z "$JWT_TOKEN_P2" ]; then
  echo -e "${RED}[ERROR]${NC} Player 2 JWT 토큰 생성 실패"
  exit 1
fi
echo -e "  ${GREEN}[OK]${NC} Player 2 토큰 생성 (test-user-002)"
log_verbose "JWT_P2: ${JWT_TOKEN_P2:0:40}..."

JWT_TOKEN_P3=$(cd "${GAME_SERVER_DIR}" && go run "${JWT_GEN_FILE}" "${JWT_SECRET}" "test-user-003" 2>/dev/null)
if [ -z "$JWT_TOKEN_P3" ]; then
  echo -e "${RED}[ERROR]${NC} Player 3 JWT 토큰 생성 실패"
  exit 1
fi
echo -e "  ${GREEN}[OK]${NC} Player 3 토큰 생성 (test-user-003)"

# ============================================================
# 3. 시나리오 1: 방 생성 -> 게임 흐름
# ============================================================

log_header "3. 시나리오 1: 방 생성 -> 게임 흐름"

# --- TC-I-002: Room 목록 조회 (빈 목록 확인) ---
log_section "TC-I-002: Room 목록 조회"
RESPONSE=$(do_request GET "${API_URL}/rooms" "${JWT_TOKEN_P1}")
HTTP_CODE=$(echo "$RESPONSE" | head -1)
BODY=$(echo "$RESPONSE" | tail -n +2)

assert_status "TC-I-002" "Room 목록 조회" "200" "$HTTP_CODE" "$BODY"

# --- TC-I-003: Room 생성 ---
log_section "TC-I-003: Room 생성"
RESPONSE=$(do_request POST "${API_URL}/rooms" "${JWT_TOKEN_P1}" '{"playerCount":2,"turnTimeoutSec":60}')
HTTP_CODE=$(echo "$RESPONSE" | head -1)
BODY=$(echo "$RESPONSE" | tail -n +2)

assert_status "TC-I-003" "Room 생성 (HTTP 201)" "201" "$HTTP_CODE" "$BODY"
assert_json_field "TC-I-003" "id 필드 존재" "$BODY" "id" ""
assert_json_field "TC-I-003" "status=WAITING" "$BODY" "status" "WAITING"
assert_json_field "TC-I-003" "playerCount=2" "$BODY" "playerCount" "2"

# Room ID, Room Code 추출
ROOM_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)
ROOM_CODE=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('roomCode',''))" 2>/dev/null)
echo -e "  Room ID: ${ROOM_ID}"
echo -e "  Room Code: ${ROOM_CODE}"

if [ -z "$ROOM_ID" ]; then
  echo -e "${RED}[ERROR]${NC} Room ID를 추출할 수 없습니다. 이후 테스트를 건너뜁니다."
  # 최종 요약으로 이동
  SCENARIO1_SKIP=true
fi

# --- TC-I-004: Room 상세 조회 ---
if [ "${SCENARIO1_SKIP}" != "true" ]; then
  log_section "TC-I-004: Room 상세 조회"
  RESPONSE=$(do_request GET "${API_URL}/rooms/${ROOM_ID}" "${JWT_TOKEN_P1}")
  HTTP_CODE=$(echo "$RESPONSE" | head -1)
  BODY=$(echo "$RESPONSE" | tail -n +2)

  assert_status "TC-I-004" "Room 상세 조회" "200" "$HTTP_CODE" "$BODY"
  assert_json_field "TC-I-004" "id 일치" "$BODY" "id" "${ROOM_ID}"
  assert_json_field "TC-I-004" "roomCode 일치" "$BODY" "roomCode" "${ROOM_CODE}"
  assert_json_field "TC-I-004" "hostUserId" "$BODY" "hostUserId" "test-user-001"
fi

# --- TC-I-020: Player 2 참가 ---
if [ "${SCENARIO1_SKIP}" != "true" ]; then
  log_section "TC-I-020: Player 2 참가 (Join)"
  RESPONSE=$(do_request POST "${API_URL}/rooms/${ROOM_ID}/join" "${JWT_TOKEN_P2}")
  HTTP_CODE=$(echo "$RESPONSE" | head -1)
  BODY=$(echo "$RESPONSE" | tail -n +2)

  assert_status "TC-I-020" "Player 2 방 참가" "200" "$HTTP_CODE" "$BODY"
  assert_json_field "TC-I-020" "status=WAITING" "$BODY" "status" "WAITING"

  # players[1].userId = test-user-002 확인
  P2_USER=$(echo "$BODY" | python3 -c "
import sys, json
data = json.load(sys.stdin)
players = data.get('players', [])
for p in players:
    if p.get('seat') == 1:
        print(p.get('userId', ''))
        break
" 2>/dev/null)
  TOTAL=$((TOTAL + 1))
  if [ "$P2_USER" = "test-user-002" ]; then
    echo -e "  ${GREEN}[PASS]${NC} TC-I-020: players[1].userId = test-user-002"
    PASS=$((PASS + 1))
  else
    echo -e "  ${RED}[FAIL]${NC} TC-I-020: players[1].userId expected 'test-user-002', got '${P2_USER}'"
    FAIL=$((FAIL + 1))
  fi
fi

# --- TC-I-005: 게임 시작 ---
GAME_ID=""
if [ "${SCENARIO1_SKIP}" != "true" ]; then
  log_section "TC-I-005: 게임 시작"
  RESPONSE=$(do_request POST "${API_URL}/rooms/${ROOM_ID}/start" "${JWT_TOKEN_P1}")
  HTTP_CODE=$(echo "$RESPONSE" | head -1)
  BODY=$(echo "$RESPONSE" | tail -n +2)

  assert_status "TC-I-005" "게임 시작" "200" "$HTTP_CODE" "$BODY"
  assert_json_field "TC-I-005" "status=PLAYING" "$BODY" "status" "PLAYING"
  assert_json_field "TC-I-005" "message" "$BODY" "message" ""

  GAME_ID=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('gameId',''))" 2>/dev/null)
  echo -e "  Game ID: ${GAME_ID}"

  if [ -z "$GAME_ID" ]; then
    echo -e "${RED}[ERROR]${NC} Game ID를 추출할 수 없습니다. 게임 관련 테스트를 건너뜁니다."
    GAME_SKIP=true
  fi
fi

# --- TC-I-006: 게임 상태 조회 (초기 상태) ---
if [ "${SCENARIO1_SKIP}" != "true" ] && [ "${GAME_SKIP}" != "true" ]; then
  log_section "TC-I-006: 게임 상태 조회 (초기 상태)"
  RESPONSE=$(do_request GET "${API_URL}/games/${GAME_ID}?seat=0" "${JWT_TOKEN_P1}")
  HTTP_CODE=$(echo "$RESPONSE" | head -1)
  BODY=$(echo "$RESPONSE" | tail -n +2)

  assert_status "TC-I-006" "게임 상태 조회" "200" "$HTTP_CODE" "$BODY"
  assert_json_field "TC-I-006" "status=PLAYING" "$BODY" "status" "PLAYING"
  assert_json_field "TC-I-006" "currentSeat=0" "$BODY" "currentSeat" "0"
  assert_json_length "TC-I-006" "myRack 14장" "$BODY" "myRack" "14"
  assert_json_length "TC-I-006" "table 빈 배열" "$BODY" "table" "0"

  # drawPileCount = 106 - (14 * 2) = 78
  assert_json_field "TC-I-006" "drawPileCount=78" "$BODY" "drawPileCount" "78"
fi

# --- TC-I-009: 드로우 ---
if [ "${SCENARIO1_SKIP}" != "true" ] && [ "${GAME_SKIP}" != "true" ]; then
  log_section "TC-I-009: 드로우 (Draw)"
  RESPONSE=$(do_request POST "${API_URL}/games/${GAME_ID}/draw" "${JWT_TOKEN_P1}" '{"seat":0}')
  HTTP_CODE=$(echo "$RESPONSE" | head -1)
  BODY=$(echo "$RESPONSE" | tail -n +2)

  assert_status "TC-I-009" "드로우" "200" "$HTTP_CODE" "$BODY"
  assert_json_field "TC-I-009" "success=True" "$BODY" "success" "True"
  assert_json_field "TC-I-009" "nextSeat=1" "$BODY" "nextSeat" "1"

  # 드로우 후 상태 검증: seat 0의 랙이 15장
  RESPONSE2=$(do_request GET "${API_URL}/games/${GAME_ID}?seat=0" "${JWT_TOKEN_P1}")
  BODY2=$(echo "$RESPONSE2" | tail -n +2)
  assert_json_length "TC-I-009" "드로우 후 myRack 15장" "$BODY2" "myRack" "15"
  assert_json_field "TC-I-009" "drawPileCount=77" "$BODY2" "drawPileCount" "77"
fi

# --- TC-I-010: 턴 초기화 (Reset) ---
# 먼저 seat 1이 드로우 -> seat 0이 place -> seat 0이 reset
if [ "${SCENARIO1_SKIP}" != "true" ] && [ "${GAME_SKIP}" != "true" ]; then
  log_section "TC-I-010: 턴 초기화 (Reset)"

  # seat 1이 드로우하여 seat 0의 턴으로 돌아옴
  RESPONSE=$(do_request POST "${API_URL}/games/${GAME_ID}/draw" "${JWT_TOKEN_P2}" '{"seat":1}')
  HTTP_CODE_DRAW=$(echo "$RESPONSE" | head -1)
  log_verbose "seat 1 드로우: HTTP ${HTTP_CODE_DRAW}"

  # seat 0의 현재 랙 타일 3개를 가져와서 place 시도
  RESPONSE=$(do_request GET "${API_URL}/games/${GAME_ID}?seat=0" "${JWT_TOKEN_P1}")
  BODY_STATE=$(echo "$RESPONSE" | tail -n +2)
  PLACE_TILES=$(echo "$BODY_STATE" | python3 -c "
import sys, json
data = json.load(sys.stdin)
rack = data.get('myRack', [])
if len(rack) >= 3:
    tiles = rack[:3]
    print(json.dumps(tiles))
else:
    print('[]')
" 2>/dev/null)

  if [ "$PLACE_TILES" != "[]" ] && [ -n "$PLACE_TILES" ]; then
    # place 수행
    PLACE_BODY=$(echo "$PLACE_TILES" | python3 -c "
import sys, json
tiles = json.load(sys.stdin)
req = {
    'seat': 0,
    'tableGroups': [{'id': 'tmp-group-1', 'tiles': tiles}],
    'tilesFromRack': tiles
}
print(json.dumps(req))
" 2>/dev/null)
    RESPONSE=$(do_request POST "${API_URL}/games/${GAME_ID}/place" "${JWT_TOKEN_P1}" "$PLACE_BODY")
    HTTP_CODE_PLACE=$(echo "$RESPONSE" | head -1)
    log_verbose "place: HTTP ${HTTP_CODE_PLACE}"

    # reset 수행
    RESPONSE=$(do_request POST "${API_URL}/games/${GAME_ID}/reset" "${JWT_TOKEN_P1}" '{"seat":0}')
    HTTP_CODE=$(echo "$RESPONSE" | head -1)
    BODY=$(echo "$RESPONSE" | tail -n +2)

    assert_status "TC-I-010" "턴 초기화 (Reset)" "200" "$HTTP_CODE" "$BODY"
    assert_json_field "TC-I-010" "success=True" "$BODY" "success" "True"
    assert_json_field "TC-I-010" "nextSeat=0 (턴 유지)" "$BODY" "nextSeat" "0"

    # reset 후 랙이 원래 크기(15장)로 복원되었는지 확인
    RESPONSE2=$(do_request GET "${API_URL}/games/${GAME_ID}?seat=0" "${JWT_TOKEN_P1}")
    BODY2=$(echo "$RESPONSE2" | tail -n +2)
    assert_json_length "TC-I-010" "reset 후 myRack 복원 (15장)" "$BODY2" "myRack" "15"
  else
    TOTAL=$((TOTAL + 1))
    echo -e "  ${YELLOW}[SKIP]${NC} TC-I-010: 랙에 충분한 타일이 없어 place/reset 테스트 건너뜀"
    FAIL=$((FAIL + 1))
  fi
fi


# ============================================================
# 4. 시나리오 3: 에러 핸들링
# ============================================================

log_header "4. 시나리오 3: 에러 핸들링"

# --- TC-I-030: 존재하지 않는 방 조회 (404) ---
log_section "TC-I-030: 존재하지 않는 방 조회"
RESPONSE=$(do_request GET "${API_URL}/rooms/nonexistent-room-id" "${JWT_TOKEN_P1}")
HTTP_CODE=$(echo "$RESPONSE" | head -1)
BODY=$(echo "$RESPONSE" | tail -n +2)

assert_status "TC-I-030" "존재하지 않는 방 조회 (404)" "404" "$HTTP_CODE" "$BODY"
assert_json_field "TC-I-030" "error.code=NOT_FOUND" "$BODY" "error.code" "NOT_FOUND"

# --- TC-I-031: 가득 찬 방 참가 (409) ---
log_section "TC-I-031: 가득 찬 방 참가"

# 새 2인 방 생성
RESPONSE=$(do_request POST "${API_URL}/rooms" "${JWT_TOKEN_P1}" '{"playerCount":2,"turnTimeoutSec":60}')
BODY_FULL=$(echo "$RESPONSE" | tail -n +2)
ROOM_FULL_ID=$(echo "$BODY_FULL" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)

if [ -n "$ROOM_FULL_ID" ]; then
  # Player 2 참가 (seat 1 채움)
  do_request POST "${API_URL}/rooms/${ROOM_FULL_ID}/join" "${JWT_TOKEN_P2}" > /dev/null

  # Player 3 참가 시도 (방이 가득 참)
  RESPONSE=$(do_request POST "${API_URL}/rooms/${ROOM_FULL_ID}/join" "${JWT_TOKEN_P3}")
  HTTP_CODE=$(echo "$RESPONSE" | head -1)
  BODY=$(echo "$RESPONSE" | tail -n +2)

  assert_status "TC-I-031" "가득 찬 방 참가 (409)" "409" "$HTTP_CODE" "$BODY"
  assert_json_field "TC-I-031" "error.code=ROOM_FULL" "$BODY" "error.code" "ROOM_FULL"

  # 정리: 이 방 삭제
  do_request DELETE "${API_URL}/rooms/${ROOM_FULL_ID}" "${JWT_TOKEN_P1}" > /dev/null
else
  TOTAL=$((TOTAL + 2))
  echo -e "  ${RED}[FAIL]${NC} TC-I-031: 테스트용 방 생성 실패"
  FAIL=$((FAIL + 2))
fi

# --- TC-I-032: 비호스트 게임 시작 (403) ---
log_section "TC-I-032: 비호스트 게임 시작"

# 새 2인 방 생성 (P1 호스트)
RESPONSE=$(do_request POST "${API_URL}/rooms" "${JWT_TOKEN_P1}" '{"playerCount":2,"turnTimeoutSec":60}')
BODY_NHOST=$(echo "$RESPONSE" | tail -n +2)
ROOM_NHOST_ID=$(echo "$BODY_NHOST" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)

if [ -n "$ROOM_NHOST_ID" ]; then
  # Player 2 참가
  do_request POST "${API_URL}/rooms/${ROOM_NHOST_ID}/join" "${JWT_TOKEN_P2}" > /dev/null

  # Player 2가 게임 시작 시도 (비호스트)
  RESPONSE=$(do_request POST "${API_URL}/rooms/${ROOM_NHOST_ID}/start" "${JWT_TOKEN_P2}")
  HTTP_CODE=$(echo "$RESPONSE" | head -1)
  BODY=$(echo "$RESPONSE" | tail -n +2)

  assert_status "TC-I-032" "비호스트 게임 시작 (403)" "403" "$HTTP_CODE" "$BODY"
  assert_json_field "TC-I-032" "error.code=FORBIDDEN" "$BODY" "error.code" "FORBIDDEN"

  # 정리: 이 방 삭제
  do_request DELETE "${API_URL}/rooms/${ROOM_NHOST_ID}" "${JWT_TOKEN_P1}" > /dev/null
else
  TOTAL=$((TOTAL + 2))
  echo -e "  ${RED}[FAIL]${NC} TC-I-032: 테스트용 방 생성 실패"
  FAIL=$((FAIL + 2))
fi

# --- TC-I-033: 자기 턴이 아닐 때 드로우 (422) ---
log_section "TC-I-033: 자기 턴이 아닐 때 드로우"

# 새 게임 생성 (P1 호스트, P2 참가, 게임 시작)
RESPONSE=$(do_request POST "${API_URL}/rooms" "${JWT_TOKEN_P1}" '{"playerCount":2,"turnTimeoutSec":60}')
BODY_TURN=$(echo "$RESPONSE" | tail -n +2)
ROOM_TURN_ID=$(echo "$BODY_TURN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)

if [ -n "$ROOM_TURN_ID" ]; then
  # P2 참가
  do_request POST "${API_URL}/rooms/${ROOM_TURN_ID}/join" "${JWT_TOKEN_P2}" > /dev/null

  # 게임 시작
  RESPONSE=$(do_request POST "${API_URL}/rooms/${ROOM_TURN_ID}/start" "${JWT_TOKEN_P1}")
  BODY_START=$(echo "$RESPONSE" | tail -n +2)
  GAME_TURN_ID=$(echo "$BODY_START" | python3 -c "import sys,json; print(json.load(sys.stdin).get('gameId',''))" 2>/dev/null)

  if [ -n "$GAME_TURN_ID" ]; then
    # seat 0의 턴인데 seat 1이 드로우 시도
    RESPONSE=$(do_request POST "${API_URL}/games/${GAME_TURN_ID}/draw" "${JWT_TOKEN_P2}" '{"seat":1}')
    HTTP_CODE=$(echo "$RESPONSE" | head -1)
    BODY=$(echo "$RESPONSE" | tail -n +2)

    assert_status "TC-I-033" "자기 턴이 아닐 때 드로우 (422)" "422" "$HTTP_CODE" "$BODY"
    assert_json_field "TC-I-033" "error.code=NOT_YOUR_TURN" "$BODY" "error.code" "NOT_YOUR_TURN"
  else
    TOTAL=$((TOTAL + 2))
    echo -e "  ${RED}[FAIL]${NC} TC-I-033: 게임 시작 실패"
    FAIL=$((FAIL + 2))
  fi
else
  TOTAL=$((TOTAL + 2))
  echo -e "  ${RED}[FAIL]${NC} TC-I-033: 테스트용 방 생성 실패"
  FAIL=$((FAIL + 2))
fi


# ============================================================
# 5. 시나리오 4: 방 관리
# ============================================================

log_header "5. 시나리오 4: 방 관리"

# --- TC-I-040: 방 삭제 ---
log_section "TC-I-040: 방 삭제 (DELETE)"

# 새 방 생성
RESPONSE=$(do_request POST "${API_URL}/rooms" "${JWT_TOKEN_P1}" '{"playerCount":2,"turnTimeoutSec":60}')
HTTP_CODE_CREATE=$(echo "$RESPONSE" | head -1)
BODY_DEL=$(echo "$RESPONSE" | tail -n +2)
ROOM_DEL_ID=$(echo "$BODY_DEL" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)

if [ -n "$ROOM_DEL_ID" ]; then
  # 방 삭제
  RESPONSE=$(do_request DELETE "${API_URL}/rooms/${ROOM_DEL_ID}" "${JWT_TOKEN_P1}")
  HTTP_CODE=$(echo "$RESPONSE" | head -1)
  BODY=$(echo "$RESPONSE" | tail -n +2)

  assert_status "TC-I-040" "방 삭제" "200" "$HTTP_CODE" "$BODY"
  assert_json_field "TC-I-040" "message 확인" "$BODY" "message" ""

  # 삭제 후 조회 -> 404
  RESPONSE=$(do_request GET "${API_URL}/rooms/${ROOM_DEL_ID}" "${JWT_TOKEN_P1}")
  HTTP_CODE=$(echo "$RESPONSE" | head -1)
  BODY=$(echo "$RESPONSE" | tail -n +2)

  assert_status "TC-I-040" "삭제 후 조회 (404)" "404" "$HTTP_CODE" "$BODY"
else
  TOTAL=$((TOTAL + 3))
  echo -e "  ${RED}[FAIL]${NC} TC-I-040: 테스트용 방 생성 실패"
  FAIL=$((FAIL + 3))
fi

# --- TC-I-041: 호스트 퇴장 -> 방 CANCELLED ---
log_section "TC-I-041: 호스트 퇴장 -> 방 CANCELLED"

# 새 방 생성
RESPONSE=$(do_request POST "${API_URL}/rooms" "${JWT_TOKEN_P1}" '{"playerCount":2,"turnTimeoutSec":60}')
BODY_LEAVE=$(echo "$RESPONSE" | tail -n +2)
ROOM_LEAVE_ID=$(echo "$BODY_LEAVE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null)

if [ -n "$ROOM_LEAVE_ID" ]; then
  # P2 참가
  do_request POST "${API_URL}/rooms/${ROOM_LEAVE_ID}/join" "${JWT_TOKEN_P2}" > /dev/null

  # 호스트(P1) 퇴장
  RESPONSE=$(do_request POST "${API_URL}/rooms/${ROOM_LEAVE_ID}/leave" "${JWT_TOKEN_P1}")
  HTTP_CODE=$(echo "$RESPONSE" | head -1)
  BODY=$(echo "$RESPONSE" | tail -n +2)

  assert_status "TC-I-041" "호스트 퇴장" "200" "$HTTP_CODE" "$BODY"
  assert_json_field "TC-I-041" "status=CANCELLED" "$BODY" "status" "CANCELLED"
else
  TOTAL=$((TOTAL + 2))
  echo -e "  ${RED}[FAIL]${NC} TC-I-041: 테스트용 방 생성 실패"
  FAIL=$((FAIL + 2))
fi


# ============================================================
# 6. 추가 에러 케이스
# ============================================================

log_header "6. 추가 검증"

# --- 인증 없는 요청 (401) ---
log_section "AUTH-001: JWT 없는 요청 (401)"
RESPONSE=$(do_request GET "${API_URL}/rooms" "")
HTTP_CODE=$(echo "$RESPONSE" | head -1)
BODY=$(echo "$RESPONSE" | tail -n +2)

assert_status "AUTH-001" "JWT 없는 요청" "401" "$HTTP_CODE" "$BODY"
assert_json_field "AUTH-001" "error.code=UNAUTHORIZED" "$BODY" "error.code" "UNAUTHORIZED"

# --- 잘못된 JWT (401) ---
log_section "AUTH-002: 잘못된 JWT (401)"
RESPONSE=$(do_request GET "${API_URL}/rooms" "invalid-jwt-token-here")
HTTP_CODE=$(echo "$RESPONSE" | head -1)
BODY=$(echo "$RESPONSE" | tail -n +2)

assert_status "AUTH-002" "잘못된 JWT" "401" "$HTTP_CODE" "$BODY"
assert_json_field "AUTH-002" "error.code=UNAUTHORIZED" "$BODY" "error.code" "UNAUTHORIZED"


# ============================================================
# 7. 최종 결과 요약
# ============================================================

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN} 통합 테스트 결과 요약${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "  전체:  ${BOLD}${TOTAL}${NC} 건"
echo -e "  통과:  ${GREEN}${PASS}${NC} 건"
echo -e "  실패:  ${RED}${FAIL}${NC} 건"
echo ""

if [ $FAIL -eq 0 ]; then
  echo -e "  ${GREEN}${BOLD}ALL TESTS PASSED${NC}"
  echo ""
  exit 0
else
  PASS_RATE=$(python3 -c "print(f'{${PASS}/${TOTAL}*100:.1f}%')" 2>/dev/null || echo "N/A")
  echo -e "  통과율: ${PASS_RATE}"
  echo -e "  ${RED}${BOLD}${FAIL} TEST(S) FAILED${NC}"
  echo ""
  exit 1
fi
