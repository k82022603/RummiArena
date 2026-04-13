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
| `AI_COOLDOWN` | **403** | `room_service.go` | AI 게임 생성 쿨다운 (5분/1회) — Sprint 5 W2 Day 5 (`822282e`)에서 429→403 전환 |
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
| 403 | 5 | `FORBIDDEN`, **`AI_COOLDOWN`** (Day 5 이후) |
| 404 | 12 | `NOT_FOUND` |
| 409 | 5 | `GAME_ALREADY_STARTED`, `ALREADY_JOINED`, `ROOM_FULL`, `ALREADY_IN_ROOM` |
| 422 | 18+ | `NOT_YOUR_TURN`, `ERR_*` (엔진 검증 실패 14종) |
| **429** | **1** | **`RATE_LIMITED`** (middleware만) |
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

---

## 7. 2차 전수 검토 (2026-04-14, Sprint 6 Day 2)

> **담당**: Architect (architect-1)  
> **근거**: Sprint 6 킥오프 디렉티브 `docs/01-planning/17-sprint6-kickoff-directives.md` BL-S6-003 (잔여 영역 2차 검토)  
> **범위 확장**: `src/ai-adapter/` (NestJS), admin routes, WS 신규 미들웨어, 최근 3주 커밋 신규 영역

### 7.1. 1차 검토 범위 재확인 (Sprint 5 Day 5 완료분)

1차 검토 (Sprint 5 W2 Day 5, 커밋 `822282e`)가 다룬 범위:

| 구분 | 범위 | 결과 |
|------|------|------|
| Service Layer | `room_service.go`, `game_service.go`, `turn_service.go`의 `ServiceError` | 13개 코드 매핑 완료 |
| Handler Layer | `*_handler.go`의 `respondError` 직접 호출 | 9개 코드 매핑 완료 |
| Middleware | `auth.go`, `role_middleware.go`, `rate_limiter.go` | 3개 코드 매핑 완료 |
| WebSocket | `ws_connection.go`의 `SendError` | 2개 코드 (`RATE_LIMITED`, `INVALID_MESSAGE`) 매핑 완료 |
| Engine | `engine.ValidationError.Code` (`ERR_*`) | 14개 코드 매핑 완료 |
| **수정 완료** | AI_COOLDOWN 429→403 (+ frontend 403 핸들러), `DAILY_COST_LIMIT_EXCEEDED` 429→403 | 커밋 `822282e`에 반영 |

1차에서 **검토되지 않은 영역**:
- AI Adapter (NestJS) — `HttpException`, `GlobalHttpExceptionFilter`
- AI Adapter Guards — `RateLimitGuard`, `CostLimitGuard`, `InternalTokenGuard`
- Game-Server의 특수 응답 경로 — `ws_handler.go` flat 응답, `ai_client.go` 문자열 파싱
- 최근 3주 신규 추가 코드 — Admin Tournament, BUG-GS-005 cleanup, SEC-REV-008/009

### 7.2. 2차 검토 대상 및 현 상태

#### 7.2.1. AI Adapter — Global Exception Filter

- **파일**: `src/ai-adapter/src/common/filters/http-exception.filter.ts:25~58`
- **상태**: **부분 준수**
- **분석**:
  - 공통 응답 포맷 `{error: {code, message, statusCode}}` — game-server의 `{error: {code, message}}`와 유사하나 `statusCode` 필드가 **추가**되어 있음
  - `exResponse`가 객체이고 `code` 필드가 없으면 `error` 필드 fallback → 없으면 `HTTP_{status}` 생성 (line 42~43)
  - `statusCode` 필드는 HTTP status와 중복 정보 — 클라이언트가 파싱할 필요 없는 필드
- **현황 등급**: 🟡 **MINOR** — 공통 포맷의 세부 불일치(statusCode 필드 유무, game-server는 없음)

#### 7.2.2. AI Adapter — RateLimitGuard

- **파일**: `src/ai-adapter/src/common/guards/rate-limit.guard.ts:38~46`
- **상태**: **부분 준수** (GlobalFilter 통과 후 정합)
- **분석**:
  - throw 시점에는 flat 구조 `{code: 'RATE_LIMITED', error: '...', message: '...', retryAfter: 30}` 직접 전달
  - GlobalHttpExceptionFilter가 객체의 `code` 필드를 우선 사용 → 최종 응답은 `{error: {code: 'RATE_LIMITED', message: '...', statusCode: 429}}`로 변환됨
  - 단 **`retryAfter` 필드가 최종 응답에서 소실**됨 — 클라이언트는 재시도 지연 정보를 받지 못함
- **현황 등급**: 🟡 **MINOR** — `retryAfter` 소실, 클라이언트 UX 저하

#### 7.2.3. AI Adapter — CostLimitGuard

- **파일**: `src/ai-adapter/src/cost/cost-limit.guard.ts:47, 73`
- **상태**: **준수** (Sprint 5 Day 5에서 429→403 이미 전환됨)
- **분석**:
  - `DAILY_COST_LIMIT_EXCEEDED` → 403
  - `HOURLY_COST_LIMIT_EXCEEDED` → 403
  - `allowedModels: ['ollama']` 커스텀 필드 포함 — GlobalFilter 통과 시 **소실** (`retryAfter`와 동일 문제)
- **현황 등급**: 🟡 **MINOR** — `allowedModels` 안내 필드 소실

#### 7.2.4. AI Adapter — InternalTokenGuard

- **파일**: `src/ai-adapter/src/common/guards/internal-token.guard.ts:34`
- **상태**: **미준수**
- **분석**:
  - `throw new UnauthorizedException('Invalid internal token')` — 문자열 메시지만 전달
  - GlobalFilter가 `code`/`error` 필드를 못 찾아 `HTTP_401`로 자동 생성 → 최종 응답의 `code` 값이 `HTTP_401` (비표준 코드명)
  - 권고 코드명: `UNAUTHORIZED` 또는 `INVALID_INTERNAL_TOKEN`
- **현황 등급**: 🟠 **WARNING** — 비표준 코드명 노출 (내부 서비스 전용이라 영향은 낮음)

#### 7.2.5. AI Adapter — Move Service `selectAdapter`

- **파일**: `src/ai-adapter/src/move/move.service.ts:121~124`
- **상태**: **미준수**
- **분석**:
  - `throw new BadRequestException('지원하지 않는 모델입니다: "${model}"...')` — 문자열 메시지만 전달
  - 최종 응답 `code`는 `HTTP_400`으로 생성됨
  - 권고 코드명: `INVALID_MODEL` 또는 `UNSUPPORTED_MODEL`
- **현황 등급**: 🟠 **WARNING** — 비표준 코드명

#### 7.2.6. Admin Routes

- **파일**: `src/game-server/internal/handler/admin_handler.go` (전체)
- **상태**: **준수**
- **분석**:
  - `GetDashboard`, `GetAIStats`, `GetEloStats`, `GetGameDetail`, `GetPerformanceStats`, `GetTournamentSummary` 모두 `respondError` 헬퍼 사용
  - 에러 코드: `INTERNAL_ERROR` (500), `NOT_FOUND` (404), `INVALID_REQUEST` (400) — 1차 검토 범위와 동일
  - `ListGames`, `ListUsers`는 **에러 시 빈 배열 + 200 OK 반환** — 에러 숨김 설계(의도적). 추후 필요 시 `GET /admin/games?strict=true` 옵션 검토
- **현황 등급**: 🟢 **PASS**

#### 7.2.7. WS 신규 미들웨어 — ws_rate_limiter.go

- **파일**: `src/game-server/internal/handler/ws_rate_limiter.go`
- **상태**: **준수** (에러는 `ws_connection.go:220~254`에서 공통 `ErrorPayload` 포맷으로 발송)
- **분석**:
  - `wsRateLimiter.check()`는 `checkResult` 구조체만 반환 (순수 함수)
  - 에러 응답은 `c.Send(&WSMessage{Type: S2CError, Payload: ErrorPayload{Code: "RATE_LIMITED", Message: ...}})` — 1차 검토 포맷 준수
  - SEC-REV-002 (violations 카운터 decay 임계값)는 **에러 코드와 무관** (내부 카운터 로직)
- **현황 등급**: 🟢 **PASS**

#### 7.2.8. ws_handler.go의 **Flat 에러 응답** (잔여 버그)

- **파일**: `src/game-server/internal/handler/ws_handler.go:145`
- **상태**: **미준수** (1차 검토에서 놓친 항목)
- **분석**:
  - ```go
    c.JSON(http.StatusBadRequest, gin.H{"error": "roomId query parameter is required"})
    ```
  - 공통 포맷 `{error: {code, message}}` 미준수 — flat 문자열
  - 프론트엔드가 `error.code`로 분기할 수 없음 (WS 업그레이드 실패 경로)
- **현황 등급**: 🟠 **WARNING** — 실수 가능성 낮은 경로(쿼리 파라미터 누락)이지만 공통 포맷 위반
- **권고 수정**: `respondError(c, http.StatusBadRequest, "INVALID_REQUEST", "roomId 쿼리 파라미터가 필요합니다.")`

#### 7.2.9. ws_handler.go의 **AI 에러 문자열 파싱** (구조적 취약점)

- **파일**: `src/game-server/internal/handler/ws_handler.go:930~937`
- **상태**: **구조적 취약** (1차 검토에서 놓친 항목)
- **분석**:
  - ```go
    if strings.Contains(err.Error(), "status 429") { reason = "AI_RATE_LIMITED" }
    else if strings.Contains(err.Error(), "status 403") { reason = "AI_COST_LIMIT" }
    ```
  - `ai_client.go:141`에서 `fmt.Errorf("ai_client: status %d, error=%s, message=%s", ...)` 포맷으로 에러를 던지고, WS handler가 문자열을 파싱
  - **AI_COOLDOWN도 403**을 쓰므로 만약 AI 어댑터 경로에서 403이 발생하면 `AI_COST_LIMIT`로 오분류될 수 있음 (실제 game-server → ai-adapter 경로에서는 AI_COOLDOWN이 발생하지 않아 영향은 없음)
  - `ai_client.errResp.Error` (string) 필드를 통해 구체 코드(`RATE_LIMITED`, `DAILY_COST_LIMIT_EXCEEDED`)를 받고 있음에도, handler는 이를 사용하지 않고 status 코드만 문자열 파싱
- **현황 등급**: 🟠 **WARNING** — 향후 AI Adapter 신규 403 에러가 추가되면 자동으로 `AI_COST_LIMIT`로 오분류 위험
- **권고 수정**: `ai_client.go`가 에러 구조체(`type AIError struct { StatusCode int; Code string }`)를 반환하도록 타입화, handler는 `errors.As()`로 분기

#### 7.2.10. middleware/rate_limiter.go의 flat 응답 (미수정 1차 권고안)

- **파일**: `src/game-server/internal/middleware/rate_limiter.go:182~186`
- **상태**: **미준수** (1차 §5 P2 권고안 미적용)
- **분석**: 1차 검토에서 P2로 기록되었으나 아직 수정되지 않음. 재확인 목적으로 재기록.
- **현황 등급**: 🟠 **WARNING** — 1차 이월

### 7.3. 발견 사항 요약

| # | 항목 | 등급 | 위치 | 권고 조치 |
|---|------|:----:|------|-----------|
| 1 | ws_handler.go flat 에러 | 🟠 WARN | `ws_handler.go:145` | `respondError` 사용으로 교체 |
| 2 | AI 에러 문자열 파싱 | 🟠 WARN | `ws_handler.go:930`, `ai_client.go:141` | 에러 타입화 + `errors.As()` |
| 3 | middleware/rate_limiter flat | 🟠 WARN | `rate_limiter.go:182` | 공통 포맷으로 재작성 (1차 P2 이월) |
| 4 | InternalTokenGuard 코드 누락 | 🟠 WARN | `internal-token.guard.ts:34` | `code: 'UNAUTHORIZED'` 명시 |
| 5 | Move Service 코드 누락 | 🟠 WARN | `move.service.ts:121` | `code: 'INVALID_MODEL'` 명시 |
| 6 | AI Adapter `statusCode` 중복 | 🟡 MINOR | `http-exception.filter.ts:56` | 필드 제거 또는 game-server 정렬 |
| 7 | `retryAfter` 필드 소실 | 🟡 MINOR | `rate-limit.guard.ts:43` | GlobalFilter가 retryAfter 보존하도록 수정 |
| 8 | `allowedModels` 필드 소실 | 🟡 MINOR | `cost-limit.guard.ts:54` | 동상 |
| 9 | Admin ListGames/ListUsers 에러 숨김 | ℹ️ INFO | `admin_handler.go:50,65` | 의도적 설계 (기록만) |

### 7.4. Sprint 6 이후 이월 항목

본 2차 검토는 **조사 및 문서화만** 수행하며, 실제 수정은 다음 스프린트에서 진행한다.

#### 7.4.1. Sprint 6 W2 권장 수정 (WARNING 5건)

| 항목 | 예상 공수 | 의존성 |
|------|:---------:|--------|
| #1 ws_handler.go flat 에러 | 10분 | 없음 |
| #3 middleware/rate_limiter flat | 30분 | 프론트엔드 retryAfter 파싱 위치 확인 필요 |
| #4 InternalTokenGuard | 10분 | 없음 |
| #5 Move Service selectAdapter | 10분 | 없음 |
| #2 AI 에러 타입화 | 2~3시간 | `ai_client.go` 리팩터링 필요 |

**합계**: ~4시간 (1 SP 미만)

#### 7.4.2. Sprint 7+ 장기 과제 (MINOR 3건)

- #6 AI Adapter vs game-server 응답 포맷 통일 (statusCode 필드 처리)
- #7, #8 GlobalHttpExceptionFilter가 커스텀 필드(`retryAfter`, `allowedModels`)를 보존하도록 개선
- 1차 §5 P3 (`INVALID_REQUEST` 세분화) 이월 유지

### 7.5. 결론

1차 검토 이후 **코드 수정이 반영된 항목**:
- ✅ AI_COOLDOWN 429→403 (§5 P1 권고 완료)
- ✅ DAILY_COST_LIMIT_EXCEEDED 429→403 (AI Adapter)

**2차에서 신규 발견된 이슈**: 9건 (WARNING 5, MINOR 3, INFO 1)

**가장 주목할 항목**: **#2 AI 에러 문자열 파싱** — 1차 `AI_COOLDOWN`/`RATE_LIMITED` 충돌 사건과 동일한 근본 원인(HTTP status만으로 비즈니스 로직 분기). AI Adapter 신규 403 에러가 추가되면 자동으로 오분류될 구조. Sprint 6 W2 리팩터링 대상으로 권고.

**전반적 상태**: 게임서버 핸들러/서비스 레이어의 공통 포맷 준수는 **95% 이상**. AI Adapter는 **글로벌 필터가 fallback으로 동작**하여 겉보기 형식은 맞으나, throw 지점에서 `code` 필드를 명시하지 않아 `HTTP_4xx` 비표준 코드가 클라이언트에 노출되는 케이스가 2건(#4, #5) 존재. 모두 Sprint 6 W2에서 30분 내 해결 가능.
