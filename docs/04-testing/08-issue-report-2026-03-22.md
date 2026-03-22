# 이슈 보고서 — 프론트엔드 API 통신 구조 결함

- **작성일**: 2026-03-22
- **심각도**: Critical (서비스 불가)
- **발견 경위**: 수동 E2E 테스트 중 브라우저 콘솔 오류 확인
- **영향 범위**: 로비, 방 생성, 대기실 전체 기능

---

## 1. 발견된 이슈 목록

### ISS-001 · ERR_NAME_NOT_RESOLVED — API 호출 전면 실패

| 항목 | 내용 |
|------|------|
| 심각도 | **Critical** |
| 증상 | `GET http://game-server:8080/api/rooms net::ERR_NAME_NOT_RESOLVED` |
| 영향 | 로비 방 목록 조회 실패, 방 생성 실패 |

**근본 원인 — 설계 구조 결함 (3중 복합)**

```
[결함 1] next.config.ts의 rewrite가 dead code였음
  source:      /api/:path*
  destination: ${NEXT_PUBLIC_API_URL}/api/:path*
                        ↑                   ↑
               이미 /api 포함         또 /api 추가 → 이중 /api 버그

[결함 2] api.ts가 절대 URL 사용 → rewrite 우회
  const API_BASE = process.env.NEXT_PUBLIC_API_URL  // 브라우저가 직접 호출
                            ↑
              K8s 내부 DNS (game-server:8080) → 브라우저에서 해석 불가

[결함 3] NEXT_PUBLIC_* 변수는 빌드 시점에 번들에 고정됨
  → 내부 URL이 JS 번들에 구워져 배포됨
  → 환경마다 재빌드 필요 (이미지 재사용 불가)
```

**수정 내용**

`next.config.ts` — 서버 전용 env var 사용, 이중 `/api` 제거:
```typescript
// Before (broken)
destination: `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"}/api/:path*`

// After (fixed)
const gameServer = process.env.GAME_SERVER_INTERNAL_URL ?? "http://localhost:8080";
destination: `${gameServer}/api/:path*`
```

`lib/api.ts`, `lib/rankings-api.ts` — 절대 URL → 상대 URL:
```typescript
// Before (broken)
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api";

// After (fixed)
const API_BASE = "/api";
```

**수정 후 통신 흐름**
```
Before: 브라우저 → http://game-server:8080/api/rooms  (ERR_NAME_NOT_RESOLVED)
After:  브라우저 → /api/rooms (Next.js rewrite) → http://game-server:8080/api/rooms
```

---

### ISS-002 · 대기실 401 Unauthorized — 토큰 미전달

| 항목 | 내용 |
|------|------|
| 심각도 | **Critical** |
| 증상 | 대기실 진입 시 "인증 토큰이 없습니다." 반복 표시 |
| 영향 | 대기실 페이지 기능 전체 불가 |

**근본 원인**

`WaitingRoomClient.tsx`에서 `useSession()` 호출은 있었으나 `session.accessToken`을 API 함수에 전달하지 않음:

```typescript
// Before (broken)
const data = await getRoom(roomId);       // Authorization 헤더 없음 → 401
await startGame(room.id);                 // Authorization 헤더 없음 → 401
await leaveRoom(room.id);                 // Authorization 헤더 없음 → 401

// After (fixed)
const token = session?.accessToken;       // next-auth.d.ts 타입 확장 활용
const data = await getRoom(roomId, token);
await startGame(room.id, token);
await leaveRoom(room.id, token);
```

**참고**: `src/types/next-auth.d.ts`에 `Session.accessToken?: string`이 이미 선언되어 있어 별도 타입 캐스팅 불필요.

---

### ISS-003 · WebSocket CheckOrigin — CSRF 취약점

| 항목 | 내용 |
|------|------|
| 심각도 | **Critical (보안)** |
| 증상 | `CheckOrigin: return true` → 모든 출처의 WebSocket 연결 허용 |
| 영향 | CSRF 공격에 무방비 |

**수정**: `CORS_ALLOWED_ORIGINS` 환경 변수 기반 화이트리스트 검증으로 교체 (`ws_handler.go`).

---

### ISS-004 · CORS 미설정 — OPTIONS preflight 404

| 항목 | 내용 |
|------|------|
| 심각도 | **Critical** |
| 증상 | `OPTIONS /api/rooms → 404` |
| 영향 | 브라우저에서 모든 API 호출 차단 |

**수정**: `gin-contrib/cors` 미들웨어 추가, `CORS_ALLOWED_ORIGINS` env var 기반 설정 (`main.go`).

> **참고**: ISS-001 수정(Proxy 방식) 후 REST API는 same-origin이 되어 CORS 불필요. WebSocket은 여전히 CORS 설정 필요.

---

### ISS-005 · SERVER_MODE 기본값 `debug`

| 항목 | 내용 |
|------|------|
| 심각도 | **Major (보안)** |
| 증상 | Gin이 debug 모드로 실행 → 스택 트레이스 노출 |
| 수정 | `config.go` 기본값 `"release"`로 변경 |

---

### ISS-006 · getRooms() 응답 타입 불일치

| 항목 | 내용 |
|------|------|
| 심각도 | **Major** |
| 증상 | `f.filter is not a function` 크래시 |
| 원인 | API 응답 `{ rooms: Room[], total: number }` → 함수가 `Room[]`로 잘못 타입 지정 |
| 수정 | `api.ts` `getRooms()` 반환 구조 수정 |

---

## 2. 수정 파일 목록

| 파일 | 수정 내용 |
|------|-----------|
| `src/frontend/next.config.ts` | rewrite 이중 `/api` 제거, `GAME_SERVER_INTERNAL_URL` 사용 |
| `src/frontend/src/lib/api.ts` | `API_BASE = "/api"` (상대 URL) |
| `src/frontend/src/lib/rankings-api.ts` | `API_BASE = "/api"` (상대 URL) |
| `src/frontend/src/app/room/[roomId]/WaitingRoomClient.tsx` | `session?.accessToken` → API 함수에 전달 |
| `src/game-server/cmd/server/main.go` | CORS 미들웨어 추가 |
| `src/game-server/internal/handler/ws_handler.go` | CheckOrigin 화이트리스트 |
| `src/game-server/internal/config/config.go` | SERVER_MODE 기본값 `release` |
| `src/game-server/internal/handler/room_handler.go` | Name 필드 `max=50` 검증 추가 |
| `src/ai-adapter/src/common/guards/internal-token.guard.ts` | InternalTokenGuard 신규 추가 |
| `src/ai-adapter/src/move/move.controller.ts` | `/move` 엔드포인트 인증 적용 |

---

## 3. 재발 방지 대책

| 대책 | 내용 |
|------|------|
| 아키텍처 원칙 문서화 | 브라우저 API 호출은 반드시 상대 URL(`/api/*`) 사용 |
| `NEXT_PUBLIC_*` 사용 금지 | 서버 내부 URL에는 접두사 없는 env var 사용 (`GAME_SERVER_INTERNAL_URL`) |
| E2E 스모크 테스트 | 로비 → 방 생성 → 대기실 진입까지 CI 파이프라인에 추가 (Sprint 3) |
| WebSocket 전용 env var | `NEXT_PUBLIC_WS_URL`만 `NEXT_PUBLIC_*` 허용 (WS는 프록시 불가) |

---

## 4. 교훈

Next.js + K8s 환경에서 API 통신 설계 시 반드시 구분해야 할 두 레이어:

```
[서버 레이어] auth.ts, next.config.ts, API Routes
 → 서버 전용 env var (GAME_SERVER_INTERNAL_URL)
 → K8s 내부 DNS 사용 가능

[브라우저 레이어] lib/api.ts, lib/rankings-api.ts, 클라이언트 컴포넌트
 → 절대 URL 금지 (K8s 내부 DNS 브라우저 해석 불가)
 → 반드시 상대 URL("/api/*") → Next.js rewrite → 내부 URL
```
