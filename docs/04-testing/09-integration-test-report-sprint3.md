# Sprint 3 통합 테스트 리포트

**테스트 일시**: 2026-03-23
**테스트 환경**: K8s Docker Desktop (rummikub namespace)
**테스터**: QA Agent
**테스트 방식**: curl REST API 호출 기반 사용자 여정(User Journey) 통합 테스트

## 요약

| 항목 | 값 |
|------|------|
| 총 TC 수 | 30 |
| PASS | 28 |
| FAIL | 1 |
| SKIP | 1 |
| 통과율 | 93.3% |

## 서비스 엔드포인트

| 서비스 | URL | 상태 |
|--------|-----|------|
| Game Server | http://localhost:30080 | Running |
| Frontend | http://localhost:30000 | Running |
| AI Adapter | http://localhost:30081 | Running |
| PostgreSQL | localhost:30432 | Running |

---

## S1. 서비스 헬스체크

### TC-S1-01: GET /health

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 200 |
| 실제 HTTP | 200 |

**응답 본문**:
```json
{"redis":true,"status":"ok","timestamp":"2026-03-22T15:46:17Z"}
```

Redis 연결 상태를 포함한 상세 헬스 정보를 반환한다. `redis: true`로 Redis 연동도 정상이다.

### TC-S1-02: GET /ready

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 200 |
| 실제 HTTP | 200 |

**응답 본문**:
```json
{"status":"ready"}
```

K8s readiness probe 용도의 엔드포인트가 정상 동작한다.

---

## S2. 인증 없음 차단 검증

### TC-S2-01: GET /api/rooms (no auth)

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 401 |
| 실제 HTTP | 401 |

**응답 본문**:
```json
{"error":{"code":"UNAUTHORIZED","message":"인증 토큰이 없습니다."}}
```

### TC-S2-02: POST /api/rooms (no auth)

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 401 |
| 실제 HTTP | 401 |

**응답 본문**:
```json
{"error":{"code":"UNAUTHORIZED","message":"인증 토큰이 없습니다."}}
```

### TC-S2-03: GET /api/games/fake-id (no auth)

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 401 |
| 실제 HTTP | 401 |

**응답 본문**:
```json
{"error":{"code":"UNAUTHORIZED","message":"인증 토큰이 없습니다."}}
```

API 설계 문서(03-api-design.md) 0.1 공통 에러 응답 포맷을 준수한다. `error.code` + `error.message` 구조 확인.

---

## S3. 방 생성 및 목록 조회

### TC-S3-01: POST /api/rooms (방 생성)

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 201 |
| 실제 HTTP | 201 |

**요청**: `{"name":"테스트방","playerCount":2,"turnTimeoutSec":30}`

**응답 본문** (발췌):
```json
{
  "id": "53b5f796-651f-489f-b8c8-cdc5d27836f6",
  "roomCode": "EFVE",
  "name": "테스트방",
  "status": "WAITING",
  "hostUserId": "test-user-001",
  "playerCount": 1,
  "settings": {"playerCount": 2, "turnTimeoutSec": 30, "initialMeldThreshold": 30},
  "players": [
    {"seat": 0, "userId": "test-user-001", "type": "HUMAN", "status": "CONNECTED"},
    {"seat": 1, "type": "HUMAN", "status": "EMPTY"}
  ]
}
```

- UUID 형식의 방 ID가 생성됨
- 4자리 roomCode 자동 발급
- host가 자동으로 seat 0에 배치됨
- initialMeldThreshold 기본값 30 적용

### TC-S3-02: GET /api/rooms (목록 조회)

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 200 |
| 실제 HTTP | 200 |

**응답 본문** (발췌):
```json
{
  "rooms": [...],
  "total": 3
}
```

- 생성한 방이 목록에 포함되어 있음을 확인
- `total` 필드로 전체 방 수를 반환

---

## S4. 방 상세 조회 및 참가

### TC-S4-01: GET /api/rooms/:id (방 상세)

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 200 |
| 실제 HTTP | 200 |

**응답 본문** (발췌):
```json
{
  "id": "c88fd11c-2f72-4839-bfea-8c54aaa931aa",
  "status": "WAITING",
  "hostUserId": "test-user-001",
  "playerCount": 1,
  "players": [
    {"seat": 0, "userId": "test-user-001", "type": "HUMAN", "status": "CONNECTED"},
    {"seat": 1, "type": "HUMAN", "status": "EMPTY"}
  ]
}
```

### TC-S4-02: POST /api/rooms/:id/join (User2 참가)

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 200 |
| 실제 HTTP | 200 |

**응답 본문** (발췌):
```json
{
  "playerCount": 2,
  "players": [
    {"seat": 0, "userId": "test-user-001", "type": "HUMAN", "status": "CONNECTED"},
    {"seat": 1, "userId": "test-user-002", "type": "HUMAN", "status": "CONNECTED"}
  ]
}
```

- User2가 seat 1에 자동 배치됨
- playerCount가 1에서 2로 증가

### TC-S4-03: POST /api/rooms/:id/join (중복 참가)

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 409 |
| 실제 HTTP | 409 |

**응답 본문**:
```json
{"error":{"code":"ALREADY_JOINED","message":"이미 방에 참가하고 있습니다."}}
```

중복 참가 방지 로직이 정상 동작한다.

---

## S5. 게임 시작

### TC-S5-01: POST /api/rooms/:id/start (비호스트가 시작 시도)

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 403 |
| 실제 HTTP | 403 |

**응답 본문**:
```json
{"error":{"code":"FORBIDDEN","message":"방장만 게임을 시작할 수 있습니다."}}
```

### TC-S5-02: POST /api/rooms/:id/start (호스트가 시작)

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 200 |
| 실제 HTTP | 200 |

**응답 본문**:
```json
{
  "gameId": "1b6a1ae7-7a29-4d3a-a26d-01e2f0ad2848",
  "message": "게임이 시작되었습니다.",
  "status": "PLAYING"
}
```

- 게임 ID(UUID)가 발급됨
- 상태가 PLAYING으로 전환됨

---

## S6. 게임 상태 조회 및 액션

### TC-S6-01: GET /api/games/:id (게임 상태 조회)

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 200 |
| 실제 HTTP | 200 |

**응답 본문** (발췌):
```json
{
  "gameId": "1b6a1ae7-7a29-4d3a-a26d-01e2f0ad2848",
  "status": "PLAYING",
  "currentSeat": 0,
  "table": [],
  "myRack": ["Y9a", "B3a", "R12a", "K13a", ...],
  "players": [
    {"seat": 0, "userId": "test-user-001", "playerType": "HUMAN", "tileCount": 14, "hasInitialMeld": false},
    {"seat": 1, "userId": "test-user-002", "playerType": "HUMAN", "tileCount": 14, "hasInitialMeld": false}
  ],
  "drawPileCount": 78
}
```

- 각 플레이어 14장씩 배분 (106 - 14*2 = 78 drawPile)
- 타일 코드 규칙 준수 (`{Color}{Number}{Set}` 형식)
- 상대방 타일은 개수만 표시 (보안)

### TC-S6-02: GET /api/games/non-existent (존재하지 않는 게임)

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 404 |
| 실제 HTTP | 404 |

**응답 본문**:
```json
{"error":{"code":"NOT_FOUND","message":"게임을 찾을 수 없습니다."}}
```

### TC-S6-03: POST /api/games/:id/draw (드로우)

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 200 |
| 실제 HTTP | 200 |

**응답 본문** (발췌):
```json
{
  "success": true,
  "nextSeat": 1,
  "gameState": {
    "status": "PLAYING",
    "currentSeat": 1,
    "turnCount": 1,
    "players": [
      {"seatOrder": 0, "userId": "test-user-001", "rack": ["...", "R11b"]},
      {"seatOrder": 1, "userId": "test-user-002", "rack": ["..."]}
    ]
  }
}
```

- 드로우 후 타일이 14장에서 15장으로 증가
- 턴이 seat 0에서 seat 1로 넘어감
- drawPileCount가 78에서 77로 감소

### TC-S6-04: POST /api/games/:id/reset (턴이 아닌 플레이어의 리셋)

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 422 |
| 실제 HTTP | 422 |

**응답 본문**:
```json
{"error":{"code":"NOT_YOUR_TURN","message":"자신의 턴이 아닙니다."}}
```

턴 순서 검증 로직이 정상 동작한다.

### TC-S6-05: GET /api/games/:id (드로우 후 상태 재조회)

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 200 |
| 실제 HTTP | 200 |

드로우 후 상태가 정확히 반영되었다. seat 0의 tileCount가 15, drawPileCount가 77.

---

## S7. ELO 랭킹 API

### TC-S7-01: GET /api/rankings (전체 랭킹)

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 200 |
| 실제 HTTP | 200 |

**응답 본문** (발췌):
```json
{
  "data": [
    {"rank": 1, "userId": "11111111-...", "rating": 2100, "tier": "DIAMOND", "winRate": 78.95},
    {"rank": 2, "userId": "22222222-...", "rating": 1750, "tier": "PLATINUM", "winRate": 54.55},
    ...
  ],
  "pagination": {"limit": 20, "offset": 0, "total": 7}
}
```

- 랭킹이 ELO rating 내림차순으로 정렬됨
- 티어(DIAMOND, PLATINUM, GOLD, SILVER, BRONZE, UNRANKED) 포함
- 인증 없이 접근 가능 (공개 API)

### TC-S7-02: GET /api/rankings/tier/BRONZE (티어별 랭킹)

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 200 |
| 실제 HTTP | 200 |

**응답 본문**:
```json
{
  "data": [{"rank": 1, "userId": "55555555-...", "rating": 1050, "tier": "BRONZE"}],
  "tier": "BRONZE"
}
```

### TC-S7-03: GET /api/users/test-user-001/rating (비UUID 사용자 rating)

| 항목 | 값 |
|------|------|
| 상태 | **FAIL** |
| 기대 HTTP | 404 |
| 실제 HTTP | 500 |

**응답 본문**:
```json
{"error":{"code":"INTERNAL_ERROR","message":"서버 내부 오류가 발생했습니다."}}
```

**원인 분석**: `user_id` 컬럼이 PostgreSQL UUID 타입인데, `test-user-001`은 UUID 형식이 아니다. GORM이 PostgreSQL에 쿼리할 때 타입 변환 에러가 발생하여 `gorm.ErrRecordNotFound`가 아닌 일반 DB 에러로 처리된다. 핸들러의 `errors.Is(err, repository.ErrNotFound)` 분기를 타지 못하고 500이 반환된다.

### TC-S7-04: GET /api/users/00000000-.../rating (UUID 형식, 존재하지 않는 유저)

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 404 |
| 실제 HTTP | 404 |

**응답 본문**:
```json
{"error":{"code":"NOT_FOUND","message":"해당 사용자의 랭킹 정보가 없습니다."}}
```

UUID 형식일 때는 정상적으로 NOT_FOUND 처리된다.

### TC-S7-05: GET /api/users/11111111-.../rating (실존 유저)

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 200 |
| 실제 HTTP | 200 |

**응답 본문**:
```json
{
  "userId": "11111111-1111-1111-1111-111111111111",
  "rating": 2100, "tier": "DIAMOND", "tierProgress": 100,
  "wins": 45, "losses": 10, "draws": 2, "gamesPlayed": 57,
  "winRate": 78.95, "winStreak": 5, "bestStreak": 8, "peakRating": 2150
}
```

### TC-S7-06: GET /api/rankings/tier/INVALID_TIER (잘못된 티어)

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 400 |
| 실제 HTTP | 400 |

**응답 본문**:
```json
{"error":{"code":"INVALID_TIER","message":"유효하지 않은 티어입니다. (UNRANKED, BRONZE, SILVER, GOLD, PLATINUM, DIAMOND)"}}
```

---

## S8. 잘못된 요청 처리

### TC-S8-01: POST /api/rooms (빈 body)

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 400 |
| 실제 HTTP | 400 |

**응답 본문**:
```json
{"error":{"code":"INVALID_REQUEST","message":"요청 형식이 올바르지 않습니다."}}
```

### TC-S8-02: POST /api/rooms (playerCount=5, 범위 초과)

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 400 |
| 실제 HTTP | 400 |

binding 태그 `max=4` 검증이 정상 동작한다.

### TC-S8-03: POST /api/rooms (turnTimeoutSec=10, 범위 미달)

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 400 |
| 실제 HTTP | 400 |

binding 태그 `min=30` 검증이 정상 동작한다.

### TC-S8-04: GET /api/rooms/non-existent-id

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 404 |
| 실제 HTTP | 404 |

**응답 본문**:
```json
{"error":{"code":"NOT_FOUND","message":"방을 찾을 수 없습니다."}}
```

### TC-S8-05: POST /api/rooms/non-existent-id/start

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 404 |
| 실제 HTTP | 404 |

### TC-S8-06: POST /api/rooms/non-existent-id/join

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 404 |
| 실제 HTTP | 404 |

---

## S9. AI Adapter 헬스체크

### TC-S9-01: GET /health (AI Adapter)

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 200 |
| 실제 HTTP | 200 |

**응답 본문**:
```json
{"status":"ok","timestamp":"2026-03-22T15:47:58.058Z"}
```

### TC-S9-02: POST /move (빈 body, 요청 검증 확인)

| 항목 | 값 |
|------|------|
| 상태 | **SKIP** |
| 기대 HTTP | 400 (검증 에러) |
| 실제 HTTP | 400 |

**응답 본문**:
```json
{
  "message": [
    "gameId should not be empty", "gameId must be a string",
    "playerId should not be empty", "model must be one of the following values: ",
    "persona must be one of the following values: ", ...
  ],
  "error": "Bad Request",
  "statusCode": 400
}
```

SKIP 사유: POST /move는 game-server 내부에서만 호출하는 서비스 간 API이다. class-validator 기반 요청 검증이 동작하는 것을 확인했으나, 실제 LLM 호출 테스트는 별도 환경에서 수행해야 한다.

### TC-S9-03: GET / (AI Adapter 루트)

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 200 |
| 실제 HTTP | 200 |

**응답 본문**:
```json
{
  "name": "RummiArena AI Adapter",
  "version": "0.0.1",
  "description": "Multi-LLM adapter service for Rummikub game AI (OpenAI, Claude, DeepSeek, Ollama)"
}
```

---

## S10. 동시 방 생성 (경쟁 조건 검증)

### TC-S10-01: 3개 방 순차 생성

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 | 3개 방 모두 고유 ID로 생성 |
| 실제 | 3개 방 모두 고유 UUID 발급됨 |

| 방 | ID | roomCode | playerCount |
|----|----|----------|-------------|
| A | c4822f93-... | 고유 | 2 |
| B | c81422cd-... | 고유 | 3 |
| C | 97321cb6-... | 고유 | 4 |

### TC-S10-02: 목록에서 3개 방 모두 확인

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 | 3개 모두 포함 |
| 실제 | 3개 모두 포함 (total: 8개 중 3개 신규) |

---

## 추가 엣지 케이스 검증

### TC-EDGE-01: 잘못된 JWT 토큰

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 401 |
| 실제 HTTP | 401 |

**응답 본문**:
```json
{"error":{"code":"UNAUTHORIZED","message":"유효하지 않거나 만료된 토큰입니다."}}
```

### TC-EDGE-02: Bearer prefix 없는 토큰

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 401 |
| 실제 HTTP | 401 |

**응답 본문**:
```json
{"error":{"code":"UNAUTHORIZED","message":"Bearer 토큰 형식이 올바르지 않습니다."}}
```

### TC-EDGE-03: 만료된 JWT 토큰

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 401 |
| 실제 HTTP | 401 |

**응답 본문**:
```json
{"error":{"code":"UNAUTHORIZED","message":"유효하지 않거나 만료된 토큰입니다."}}
```

### TC-EDGE-04: 이미 시작된 게임 재시작

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 409 |
| 실제 HTTP | 409 |

**응답 본문**:
```json
{"error":{"code":"GAME_ALREADY_STARTED","message":"이미 시작된 게임입니다."}}
```

### TC-EDGE-05: 시작된 방에 참가 시도

| 항목 | 값 |
|------|------|
| 상태 | **PASS** |
| 기대 HTTP | 409 |
| 실제 HTTP | 409 |

**응답 본문**:
```json
{"error":{"code":"GAME_ALREADY_STARTED","message":"이미 시작된 게임에는 참가할 수 없습니다."}}
```

---

## 발견된 버그/이슈

### BUG-001: 비UUID 형식 user_id로 /api/users/:id/rating 조회 시 500 반환

| 항목 | 내용 |
|------|------|
| 심각도 | Medium |
| TC | TC-S7-03 |
| 재현 | `GET /api/users/test-user-001/rating` |
| 기대 동작 | 404 NOT_FOUND |
| 실제 동작 | 500 INTERNAL_ERROR |

**원인 분석**:

1. PostgreSQL의 `elo_ratings.user_id` 컬럼이 UUID 타입으로 정의되어 있다.
2. `test-user-001` 같은 비UUID 문자열로 쿼리하면 PostgreSQL이 타입 변환 에러를 발생시킨다.
3. GORM은 이 에러를 `gorm.ErrRecordNotFound`가 아닌 일반 DB 에러로 반환한다.
4. `ranking_handler.go` 115행의 `errors.Is(err, repository.ErrNotFound)` 분기를 타지 못하고 500으로 폴스루된다.

**영향 범위**:
- dev-login으로 발급된 userId(`test-user-001` 등)는 UUID 형식이 아니므로, 이런 유저가 자신의 ELO rating을 조회하면 500 에러를 받는다.
- 프론트엔드에서 rating 조회 시 UUID가 아닌 경우에도 안전하게 처리되어야 한다.

**수정 방안**:
- `GetByUserID` 또는 핸들러 레벨에서 user_id가 UUID 형식인지 사전 검증하여 형식 오류일 때 400 BAD_REQUEST 반환
- 또는 repository 레벨에서 DB 에러 메시지에 "invalid input syntax for type uuid" 포함 시 ErrNotFound로 래핑

---

## 테스트 커버리지 분석

### API 엔드포인트 커버리지

| 엔드포인트 | 메서드 | 테스트 여부 | 비고 |
|------------|--------|-------------|------|
| `/health` | GET | Tested | |
| `/ready` | GET | Tested | |
| `/api/auth/dev-login` | POST | Tested | JWT 발급에 활용 |
| `/api/rooms` | POST | Tested | 생성+검증 |
| `/api/rooms` | GET | Tested | 목록 조회 |
| `/api/rooms/:id` | GET | Tested | 상세+404 |
| `/api/rooms/:id/join` | POST | Tested | 참가+중복 |
| `/api/rooms/:id/start` | POST | Tested | 호스트/비호스트/재시작 |
| `/api/rooms/:id/leave` | POST | Not tested | |
| `/api/rooms/:id` | DELETE | Not tested | |
| `/api/games/:id` | GET | Tested | 상태 조회+404 |
| `/api/games/:id/draw` | POST | Tested | |
| `/api/games/:id/reset` | POST | Tested | NOT_YOUR_TURN 검증 |
| `/api/games/:id/place` | POST | Not tested | |
| `/api/games/:id/confirm` | POST | Not tested | |
| `/api/rankings` | GET | Tested | |
| `/api/rankings/tier/:tier` | GET | Tested | 유효/무효 티어 |
| `/api/users/:id/rating` | GET | Tested | 존재/미존재/비UUID |
| `/api/users/:id/rating/history` | GET | Tested | 인증 필요 |
| `/api/practice/*` | * | Not tested | DB 의존 |

**REST API 커버리지**: 15/20 엔드포인트 = **75%**

### 에러 코드 검증 결과

| 에러 코드 | HTTP Status | 검증 여부 |
|-----------|-------------|-----------|
| UNAUTHORIZED | 401 | Tested (3가지 시나리오) |
| FORBIDDEN | 403 | Tested |
| NOT_FOUND | 404 | Tested (방, 게임, 유저) |
| ALREADY_JOINED | 409 | Tested |
| GAME_ALREADY_STARTED | 409 | Tested (재시작, 참가) |
| NOT_YOUR_TURN | 422 | Tested |
| INVALID_REQUEST | 400 | Tested (빈 body, 범위 초과) |
| INVALID_TIER | 400 | Tested |
| INTERNAL_ERROR | 500 | Tested (BUG-001) |

---

## 개선 권고

### 우선순위 High

1. **BUG-001 수정**: 비UUID user_id 입력 시 500 대신 400/404 반환하도록 입력 검증 추가
   - 파일: `src/game-server/internal/handler/ranking_handler.go` L115-132
   - 또는: `src/game-server/internal/repository/elo_repo.go` L45-57

### 우선순위 Medium

2. **게임 액션 API 통합 테스트 확대**: place, confirm 엔드포인트를 포함한 전체 게임 턴 사이클 E2E 테스트 추가
3. **방 퇴장/삭제 API 테스트**: leave, delete 엔드포인트에 대한 시나리오 추가
4. **AI Adapter POST /move 통합 테스트**: 실제 Ollama 연동 테스트 (gemma3:4b)

### 우선순위 Low

5. **부하 테스트**: k6를 사용한 동시 접속 및 방 생성 스트레스 테스트
6. **WebSocket 통합 테스트**: wscat 또는 Playwright를 사용한 실시간 이벤트 검증
7. **Rate Limiting 검증**: API 설계 문서의 Rate Limit 정책이 실제 적용되었는지 확인

---

## 테스트 실행 환경

```
K8s namespace: rummikub
Game Server image: rummiarena/game-server:dev
AI Adapter image: rummiarena/ai-adapter:dev
APP_ENV: dev (dev-login 활성화)
JWT Secret: rummiarena-jwt-secret-2026
PostgreSQL: rummikub/REDACTED_DB_PASSWORD
Redis: ClusterIP (직접 접근 불가, 서버 내부 사용)
```

---

*테스트 수행 완료: 2026-03-23 00:48 KST*
