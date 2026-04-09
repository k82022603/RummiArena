# 29. Game-Server HTTP 에러 코드 레지스트리

> **작성일**: 2026-04-09  
> **근거**: AI_COOLDOWN 429 vs RATE_LIMITED 429 충돌 사건 (Sprint 5 W2)  
> **범위**: `src/game-server/` 전체 (`*.go`, 테스트 제외)

---

## 1. 전수 조사 결과: Error Code + HTTP Status 매핑표

### 1.1. Service Layer (`ServiceError`)

| Code | HTTP Status | 파일 | 설명 |
|------|:-----------:|------|------|
| `NOT_FOUND` | 404 | `room_service.go`, `game_service.go`, `turn_service.go` | 방/게임/플레이어를 찾을 수 없음 |
| `INVALID_REQUEST` | 400 | `room_service.go`, `game_service.go` | 유효하지 않은 요청 파라미터 |
| `UNAUTHORIZED` | 401 | `room_service.go` | 인증되지 않은 사용자 |
| `FORBIDDEN` | 403 | `room_service.go` | 방장 권한 필요 (시작/삭제) |
| `NOT_YOUR_TURN` | 422 | `game_service.go` | 자신의 턴이 아님 |
| `GAME_NOT_PLAYING` | 400 | `game_service.go` | 진행 중인 게임이 아님 |
| `NOT_ENOUGH_PLAYERS` | 400 | `room_service.go` | 최소 2명 미달 |
| `GAME_ALREADY_STARTED` | 409 | `room_service.go` | 이미 시작된 게임 |
| `ALREADY_JOINED` | 409 | `room_service.go` | 이미 방에 참가 중 |
| `ROOM_FULL` | 409 | `room_service.go` | 방 정원 초과 |
| `ALREADY_IN_ROOM` | 409 | `room_service.go` | 다른 방에서 게임 중 |
| `AI_COOLDOWN` | **429** | `room_service.go` | AI 게임 생성 쿨다운 (5분/1회) |
| `ERR_*` (동적) | 422 | `game_service.go` | 엔진 유효성 검증 실패 (`extractErrCode`) |

### 1.2. Handler Layer (직접 `respondError` 호출)

| Code | HTTP Status | 파일 | 설명 |
|------|:-----------:|------|------|
| `UNAUTHORIZED` | 401 | `room_handler.go`, `game_handler.go`, `practice_handler.go` | JWT 미포함 |
| `INVALID_REQUEST` | 400 | `room_handler.go`, `game_handler.go`, `ranking_handler.go`, `practice_handler.go`, `admin_handler.go`, `auth_handler.go` | 요청 바디/파라미터 오류 |
| `INVALID_TIER` | 400 | `ranking_handler.go` | 유효하지 않은 티어 |
| `NOT_FOUND` | 404 | `ranking_handler.go`, `admin_handler.go` | 사용자 랭킹/게임 미존재 |
| `INTERNAL_ERROR` | 500 | `room_handler.go`, `ranking_handler.go`, `practice_handler.go`, `admin_handler.go`, `auth_handler.go` | 서버 내부 오류 |
| `OAUTH_DISABLED` | 503 | `auth_handler.go` | Google OAuth 미설정 |
| `JWKS_UNAVAILABLE` | 503 | `auth_handler.go` | JWKS 초기화 실패 |
| `OAUTH_CODE_INVALID` | 400 | `auth_handler.go` | Google code 교환 실패 |
| `INVALID_ID_TOKEN` | 401 | `auth_handler.go` | Google id_token 서명 검증 실패 |

### 1.3. Middleware Layer

| Code | HTTP Status | 파일 | 설명 |
|------|:-----------:|------|------|
| `UNAUTHORIZED` | 401 | `auth.go` | JWT 토큰 없음/만료/서명 불일치 |
| `FORBIDDEN` | 403 | `role_middleware.go` | role 클레임 없음/권한 부족 |
| `RATE_LIMITED` | **429** | `rate_limiter.go` | HTTP API rate limit 초과 (Redis Fixed Window) |

### 1.4. WebSocket Layer

| Code | 전송 방식 | 파일 | 설명 |
|------|-----------|------|------|
| `RATE_LIMITED` | S2C `ERROR` + WS Close 4005 | `ws_connection.go` | WS 메시지 빈도 초과 (In-memory Fixed Window) |
| `INVALID_MESSAGE` | S2C `ERROR` | `ws_connection.go` | JSON 파싱 실패 |

### 1.5. Engine Layer (Game Rules)

engine `ValidationError.Code`는 `ConfirmTurn` 422 응답의 `code` 필드로 전달된다.

| Code | HTTP Status | 설명 |
|------|:-----------:|------|
| `ERR_INVALID_SET` | 422 | 그룹도 런도 아님 (V-01) |
| `ERR_SET_SIZE` | 422 | 세트 3장 미만 (V-02) |
| `ERR_GROUP_NUMBER` | 422 | 그룹 숫자 불일치 |
| `ERR_GROUP_COLOR_DUP` | 422 | 그룹 색상 중복 (V-14) |
| `ERR_RUN_COLOR` | 422 | 런 색상 불일치 |
| `ERR_RUN_SEQUENCE` | 422 | 런 숫자 비연속 (V-15) |
| `ERR_RUN_RANGE` | 422 | 런 숫자 범위 초과 |
| `ERR_RUN_DUPLICATE` | 422 | 런 숫자 중복 |
| `ERR_RUN_NO_NUMBER` | 422 | 런에 숫자 타일 없음 |
| `ERR_NO_RACK_TILE` | 422 | 랙에서 타일 미추가 (V-03) |
| `ERR_TABLE_TILE_MISSING` | 422 | 테이블 타일 유실 (V-06) |
| `ERR_JOKER_NOT_USED` | 422 | 조커 교체 미사용 (V-07) |
| `ERR_INITIAL_MELD_SCORE` | 422 | 30점 미달 (V-04) |
| `ERR_INITIAL_MELD_SOURCE` | 422 | 랙 외 타일 사용 (V-05) |

---

## 2. HTTP Status Code 별 사용처 요약

| HTTP Status | 사용 횟수 | 사용 Code(들) |
|:-----------:|:---------:|---------------|
| 200 | 다수 | (성공 응답) |
| 201 | 2 | (방 생성, 연습 기록 저장) |
| 400 | 10 | `INVALID_REQUEST`, `GAME_NOT_PLAYING`, `NOT_ENOUGH_PLAYERS`, `INVALID_TIER`, `OAUTH_CODE_INVALID` |
| 401 | 4 | `UNAUTHORIZED`, `INVALID_ID_TOKEN` |
| 403 | 4 | `FORBIDDEN` |
| 404 | 12 | `NOT_FOUND` |
| 409 | 5 | `GAME_ALREADY_STARTED`, `ALREADY_JOINED`, `ROOM_FULL`, `ALREADY_IN_ROOM` |
| 422 | 18+ | `NOT_YOUR_TURN`, `ERR_*` (엔진 검증 실패 14종) |
| **429** | **2** | **`AI_COOLDOWN`**, **`RATE_LIMITED`** |
| 500 | 7 | `INTERNAL_ERROR` |
| 503 | 2 | `OAUTH_DISABLED`, `JWKS_UNAVAILABLE` |

---

## 3. 충돌/중복 분석

### 3.1. CRITICAL: HTTP 429 충돌 (이번 사건의 근본 원인)

```
room_service.go  : AI_COOLDOWN  -> 429
rate_limiter.go  : RATE_LIMITED -> 429
```

**문제**: 프론트엔드가 HTTP 429 상태 코드만으로 에러 유형을 판별하면, AI 쿨다운(비즈니스 로직)과 Rate Limit(인프라 방어)을 구분할 수 없다.

**응답 포맷도 상이**:

| 출처 | JSON 포맷 |
|------|-----------|
| `AI_COOLDOWN` (ServiceError) | `{"error": {"code": "AI_COOLDOWN", "message": "..."}}` |
| `RATE_LIMITED` (middleware) | `{"error": "RATE_LIMITED", "message": "...", "retryAfter": N}` |

응답 포맷 불일치가 추가 혼란 요인이다. ServiceError는 `error.code` 구조이나, Rate Limiter는 flat 구조다.

### 3.2. WARNING: 동일 HTTP 409 내 다수 비즈니스 코드

```
GAME_ALREADY_STARTED -> 409 (방 참가, 게임 시작 각각)
ALREADY_JOINED       -> 409
ROOM_FULL            -> 409
ALREADY_IN_ROOM      -> 409
```

이 경우는 **충돌이 아니다**. 각각 `code` 필드가 다르므로 프론트엔드가 `error.code`로 구분 가능하다. 다만 클라이언트가 HTTP status만 확인하는 코드가 있다면 주의가 필요하다.

### 3.3. WARNING: 동일 HTTP 400 내 다수 비즈니스 코드

```
INVALID_REQUEST      -> 400 (파라미터 오류 전반)
GAME_NOT_PLAYING     -> 400
NOT_ENOUGH_PLAYERS   -> 400
INVALID_TIER         -> 400
OAUTH_CODE_INVALID   -> 400
```

`INVALID_REQUEST`가 너무 광범위하게 사용되고 있다. 방 생성 파라미터 오류, JSON 파싱 실패, 타일 미포함 오류가 모두 동일 코드다. 디버깅 시 메시지 문자열에 의존해야 한다.

### 3.4. INFO: Rate Limit 응답 포맷 불일치

rate_limiter.go 미들웨어의 429 응답이 공통 에러 포맷(`{"error": {"code": ..., "message": ...}}`)을 따르지 않고 flat 구조(`{"error": "RATE_LIMITED", ...}`)를 사용한다. 이는 API 설계 03-api-design.md 0.1절 공통 에러 응답 규격 위반이다.

---

## 4. AI_COOLDOWN 429 사건 교훈

### 4.1. 사건 경위

1. SEC-RL-002로 AI 게임 생성 쿨다운(5분/1회) 구현 시, HTTP 429를 반환하도록 설계
2. SEC-RL-003으로 HTTP Rate Limit 미들웨어도 429를 반환
3. 프론트엔드에서 429를 수신하면 "rate limit" 안내 메시지를 표시
4. AI 쿨다운으로 인한 429가 rate limit 메시지로 오인됨

### 4.2. 근본 원인

- HTTP 상태 코드만으로 비즈니스 로직을 구분하려는 설계
- Rate Limiting(인프라 방어)과 Business Throttle(쿨다운)의 의미론적 차이를 HTTP status level에서 구분하지 않음

### 4.3. RFC 7231 관점

429 Too Many Requests (RFC 6585)는 "rate limiting"을 위한 코드다. AI 게임 생성 쿨다운은 비즈니스 로직 제약이므로 의미론적으로 429보다 **422 Unprocessable Entity** 또는 **403 Forbidden**이 더 적절하다.

---

## 5. 개선 권고

### P1: AI_COOLDOWN HTTP 상태 코드 변경

```
AS-IS: AI_COOLDOWN -> 429
TO-BE: AI_COOLDOWN -> 403 (비즈니스 제약은 Forbidden 계열)
```

429는 인프라 Rate Limit 전용으로 예약한다. 비즈니스 쿨다운은 403 + `code: "AI_COOLDOWN"`으로 변경하면 프론트엔드에서 HTTP status level 분기만으로도 올바르게 처리된다.

### P2: Rate Limiter 응답 포맷 통일

```go
// AS-IS (flat)
{"error": "RATE_LIMITED", "message": "Too many requests", "retryAfter": 60}

// TO-BE (공통 에러 포맷)
{"error": {"code": "RATE_LIMITED", "message": "Too many requests"}, "retryAfter": 60}
```

API 설계 03-api-design.md 0.1절 공통 에러 응답 포맷에 맞추되, `retryAfter`는 최상위에 유지한다 (HTTP 표준 호환).

### P3: INVALID_REQUEST 세분화 (장기)

현재 `INVALID_REQUEST`가 10+ 곳에서 사용되어 디버깅이 어렵다. 의미가 명확한 경우 세분화를 검토한다.

| 현재 | 후보 |
|------|------|
| playerCount 범위 초과 | `INVALID_PLAYER_COUNT` |
| turnTimeoutSec 범위 초과 | `INVALID_TIMEOUT` |
| JSON 파싱 실패 | `INVALID_JSON` |
| 타일 미포함 | `MISSING_TILES` |

단, 이는 기존 프론트엔드 호환성을 깨뜨리므로 Sprint 6 이후 점진 적용한다.

---

## 6. 에러 코드 네이밍 규칙 (신규 코드 추가 시)

1. **HTTP 429**: Rate Limit/Throttle 전용 (`RATE_LIMITED`만 사용)
2. **비즈니스 쿨다운/제약**: 403 + 구체적 코드명
3. **코드명 형식**: `UPPER_SNAKE_CASE`, 도메인 접두사 권장 (`AI_`, `GAME_`, `ROOM_`, `ERR_`)
4. **응답 포맷**: 항상 `{"error": {"code": "...", "message": "..."}}` 구조 준수
5. **동일 HTTP status에 다수 code 허용**: 프론트엔드는 반드시 `error.code`로 분기 (status만 보지 말 것)
