# API 설계 (API Design)

## 0. 공통 규칙

### 0.1 공통 에러 응답 포맷

모든 API는 실패 시 아래 형식의 에러 응답을 반환한다.

```json
{
  "error": {
    "code": "INVALID_MOVE",
    "message": "배치한 타일 조합이 유효하지 않습니다.",
    "details": {
      "invalidGroups": ["group-3"]
    }
  }
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| error.code | string | 에러 코드 (머신 리더블) |
| error.message | string | 에러 메시지 (사용자 표시용, 한글) |
| error.details | object | 추가 상세 정보 (선택) |

**주요 에러 코드**:

| 코드 | HTTP Status | 설명 |
|------|-------------|------|
| UNAUTHORIZED | 401 | 인증 실패 / JWT 만료 |
| FORBIDDEN | 403 | 권한 부족 |
| NOT_FOUND | 404 | 리소스 없음 |
| ROOM_FULL | 409 | Room 인원 초과 |
| GAME_ALREADY_STARTED | 409 | 이미 시작된 게임 |
| INVALID_MOVE | 422 | 유효하지 않은 수 |
| NOT_YOUR_TURN | 422 | 자신의 턴이 아님 |
| RATE_LIMITED | 429 | 요청 빈도 초과 |
| INTERNAL_ERROR | 500 | 서버 내부 오류 |

### 0.2 Rate Limiting

| 대상 | 제한 | 설명 |
|------|------|------|
| 인증 API (auth/*) | 10 req/min/IP | 브루트포스 방지 |
| Room 생성 (POST /rooms) | 5 req/min/user | 남용 방지 |
| 게임 액션 (turn:*) | 30 req/min/user | 일반 플레이에 충분 |
| 관리자 API (admin/*) | 60 req/min/user | 관리 작업용 |
| 기타 조회 API | 60 req/min/user | 일반 조회 |

## 1. REST API

### 1.1 인증 (Auth)

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/auth/google` | Google OAuth 로그인 리다이렉트 |
| GET | `/api/auth/google/callback` | OAuth 콜백, JWT 발급 |
| GET | `/api/auth/me` | 현재 사용자 정보 |
| POST | `/api/auth/logout` | 로그아웃 |

#### GET /api/auth/me Response
```json
{
  "id": "uuid",
  "email": "user@example.com",
  "displayName": "애벌레",
  "avatarUrl": "https://...",
  "role": "ROLE_USER",
  "eloRating": 1200
}
```

### 1.2 게임 Room

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/rooms` | Room 생성 |
| GET | `/api/rooms` | Room 목록 조회 |
| GET | `/api/rooms/:id` | Room 상세 조회 |
| POST | `/api/rooms/:id/join` | Room 참가 |
| POST | `/api/rooms/:id/leave` | Room 퇴장 |
| POST | `/api/rooms/:id/start` | 게임 시작 |
| POST | `/api/rooms/:id/add-ai` | AI 플레이어 추가 |

#### POST /api/rooms Request
```json
{
  "playerCount": 4,
  "turnTimeoutSec": 60,
  "aiPlayers": [
    {
      "type": "AI_OPENAI",
      "persona": "shark",
      "difficulty": "expert",
      "psychologyLevel": 3
    },
    {
      "type": "AI_CLAUDE",
      "persona": "fox",
      "difficulty": "expert",
      "psychologyLevel": 3
    }
  ]
}
```

> **turnTimeoutSec**: 30~120초 범위. 범위 밖의 값은 서버에서 거부한다.

#### POST /api/rooms Response
```json
{
  "id": "uuid",
  "roomCode": "ABCD",
  "status": "WAITING",
  "hostUserId": "uuid",
  "playerCount": 4,
  "settings": {
    "turnTimeoutSec": 60,
    "initialMeldThreshold": 30
  },
  "players": [
    { "seat": 0, "userId": "uuid", "type": "HUMAN", "status": "CONNECTED" },
    { "seat": 1, "type": "AI_OPENAI", "persona": "shark", "difficulty": "expert", "psychologyLevel": 3, "status": "READY" },
    { "seat": 2, "type": "AI_CLAUDE", "persona": "fox", "difficulty": "expert", "psychologyLevel": 3, "status": "READY" }
  ],
  "createdAt": "2026-03-11T10:00:00Z"
}
```

#### POST /api/rooms/:id/add-ai Request
```json
{
  "type": "AI_LLAMA",
  "persona": "rookie",
  "difficulty": "beginner",
  "psychologyLevel": 0
}
```

#### GET /api/rooms/:id Response
```json
{
  "id": "uuid",
  "roomCode": "ABCD",
  "status": "WAITING",
  "hostUserId": "uuid",
  "playerCount": 4,
  "settings": { "turnTimeoutSec": 60, "initialMeldThreshold": 30 },
  "players": [
    { "seat": 0, "userId": "uuid", "displayName": "애벌레", "type": "HUMAN", "status": "CONNECTED" },
    { "seat": 1, "type": "AI_OPENAI", "persona": "shark", "difficulty": "expert", "status": "READY" }
  ],
  "createdAt": "2026-03-11T10:00:00Z"
}
```

### 1.3 게임 기록

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/games` | 게임 기록 목록 |
| GET | `/api/games/:id` | 게임 상세 기록 |
| GET | `/api/games/:id/events` | 게임 이벤트 로그 |
| GET | `/api/games/:id/ai-logs` | AI 호출 로그 |

#### GET /api/games/:id Response
```json
{
  "id": "uuid",
  "roomCode": "ABCD",
  "status": "FINISHED",
  "gameMode": "NORMAL",
  "turnCount": 28,
  "settings": { "turnTimeoutSec": 60, "initialMeldThreshold": 30 },
  "players": [
    { "seat": 0, "displayName": "애벌레", "type": "HUMAN", "score": 0, "isWinner": true },
    { "seat": 1, "type": "AI_OPENAI", "persona": "shark", "difficulty": "expert", "score": -35, "isWinner": false }
  ],
  "startedAt": "2026-03-11T10:05:00Z",
  "finishedAt": "2026-03-11T10:42:00Z"
}
```

### 1.4 사용자

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/users/me/stats` | 내 통계 |
| GET | `/api/users/ranking` | ELO 랭킹 |

#### GET /api/users/me/stats Response
```json
{
  "userId": "uuid",
  "displayName": "애벌레",
  "eloRating": 1200,
  "totalGames": 42,
  "wins": 18,
  "winRate": 0.4286,
  "avgScore": -12.5,
  "vsAiStats": {
    "AI_OPENAI": { "games": 15, "wins": 6 },
    "AI_CLAUDE": { "games": 10, "wins": 5 }
  },
  "recentEloHistory": [
    { "gameId": "uuid", "ratingBefore": 1180, "ratingAfter": 1200, "delta": 20, "createdAt": "..." }
  ]
}
```

#### GET /api/users/ranking Response
```json
{
  "rankings": [
    { "rank": 1, "userId": "uuid", "displayName": "애벌레", "eloRating": 1200, "totalGames": 42, "winRate": 0.4286 }
  ],
  "total": 50,
  "page": 1,
  "pageSize": 20
}
```

### 1.5 관리자

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/api/admin/rooms` | 활성 Room 목록 | ADMIN |
| DELETE | `/api/admin/rooms/:id` | 게임 강제 종료 | ADMIN |
| GET | `/api/admin/users` | 사용자 목록 | ADMIN |
| PATCH | `/api/admin/users/:id/block` | 사용자 차단/해제 | ADMIN |
| GET | `/api/admin/ai/stats` | AI 모델별 통계 | ADMIN |
| GET | `/api/admin/system/health` | 시스템 상태 | ADMIN |

### 1.6 1인 연습 모드 (Practice)

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/practice/stages` | 스테이지 목록 조회 |
| POST | `/api/practice/start` | 연습 세션 시작 |
| POST | `/api/practice/:id/action` | 연습 중 액션 수행 |
| GET | `/api/practice/stats` | 내 연습 통계 |

#### GET /api/practice/stages Response
```json
{
  "stages": [
    { "stage": 1, "name": "최초 등록", "description": "30점 이상 조합으로 첫 배치 연습", "unlocked": true, "bestScore": 85 },
    { "stage": 2, "name": "런 만들기", "description": "같은 색상 연속 숫자 3개 이상", "unlocked": true, "bestScore": null },
    { "stage": 3, "name": "그룹 만들기", "description": "같은 숫자 다른 색상 3~4개", "unlocked": false, "bestScore": null },
    { "stage": 4, "name": "테이블 재배치", "description": "기존 테이블 타일을 활용한 재배치", "unlocked": false, "bestScore": null },
    { "stage": 5, "name": "조커 활용", "description": "조커를 전략적으로 사용", "unlocked": false, "bestScore": null },
    { "stage": 6, "name": "종합 실전", "description": "AI 1명 상대 자유 대전", "unlocked": false, "bestScore": null }
  ]
}
```

#### POST /api/practice/start Request
```json
{
  "stage": 1
}
```

#### POST /api/practice/start Response
```json
{
  "sessionId": "uuid",
  "gameId": "uuid",
  "stage": 1,
  "objectives": { "targetScore": 30, "description": "30점 이상 조합을 만들어 첫 배치를 완료하세요" },
  "initialState": {
    "myTiles": ["R7a", "R8a", "R9a", "B5a", "B5b", "K5a", "Y3a", "Y4a", "Y5a", "R1a", "B2a", "K12b", "Y11a", "JK1"],
    "tableGroups": [],
    "drawPileCount": 92
  }
}
```

#### POST /api/practice/:id/action Request
```json
{
  "action": "place",
  "tableGroups": [
    { "id": "run-1", "tiles": ["R7a", "R8a", "R9a"], "type": "run" }
  ],
  "tilesFromRack": ["R7a", "R8a", "R9a"]
}
```

#### GET /api/practice/stats Response
```json
{
  "totalSessions": 15,
  "completedStages": [1, 2],
  "stageStats": [
    { "stage": 1, "attempts": 5, "completions": 3, "bestScore": 85, "avgScore": 62 }
  ]
}
```

> **참고**: 연습 모드는 WebSocket을 사용하지 않는다. 실시간 상대가 없으므로 REST API만으로 충분하다. Stage 6(종합 실전)에서 AI 상대와 대전 시에도 서버 내부에서 AI 턴을 처리하고 응답에 포함하여 반환한다.

### 1.7 시스템

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/health` | 헬스 체크 |
| GET | `/ready` | Readiness 체크 |
| GET | `/metrics` | Prometheus 메트릭 |

## 2. WebSocket 프로토콜

### 2.1 연결

**방법 A (URL query, 하위 호환)**:
```
ws://host/ws?token={JWT}&roomId={roomId}
```

**방법 B (권장, auth 이벤트 방식)**:
```
ws://host/ws?roomId={roomId}
```
연결 후 첫 메시지로 인증 이벤트를 전송한다:
```json
{
  "event": "auth",
  "data": { "token": "{JWT}" }
}
```

> **권장**: 방법 B를 사용한다. URL query에 JWT를 포함하면 서버 로그, 프록시 로그, 브라우저 히스토리에 토큰이 노출될 수 있다. 서버는 양쪽 방식 모두 지원하되, 클라이언트는 auth 이벤트 방식을 기본으로 사용한다. auth 이벤트 미수신 시 5초 후 연결을 종료한다.

### 2.2 서버 → 클라이언트 이벤트

| Event | 설명 | Payload |
|-------|------|---------|
| `game:state` | 전체 게임 상태 동기화 | 게임 전체 상태 |
| `game:started` | 게임 시작 | 초기 타일, 턴 순서 |
| `turn:start` | 턴 시작 알림 | 현재 플레이어, 남은 시간 |
| `turn:action` | 플레이어 행동 결과 | 배치/드로우 결과 |
| `turn:timeout` | 턴 타임아웃 | 자동 드로우 결과 |
| `game:ended` | 게임 종료 | 승자, 점수 |
| `player:joined` | 플레이어 입장 | 플레이어 정보 |
| `player:left` | 플레이어 퇴장 | 플레이어 ID |
| `player:reconnected` | 재연결 | 플레이어 ID |
| `ai:thinking` | AI 사고 중 | 모델 타입 |
| `error` | 에러 | 에러 메시지 |

### 2.3 클라이언트 → 서버 이벤트

| Event | 설명 | Payload |
|-------|------|---------|
| `turn:place` | 타일 배치/재배치 | 테이블 상태 변경 |
| `turn:draw` | 타일 드로우 | - |
| `turn:undo` | 턴 내 되돌리기 | - |
| `turn:confirm` | 턴 확정 | - |

### 2.4 타일 배치 Payload 예시
```json
{
  "event": "turn:place",
  "data": {
    "tableGroups": [
      {
        "id": "group-1",
        "tiles": ["R3a", "B3a", "K3b"],
        "type": "group"
      },
      {
        "id": "run-1",
        "tiles": ["Y5a", "Y6a", "Y7b", "Y8a"],
        "type": "run"
      }
    ],
    "tilesFromRack": ["R3a", "Y8a"]
  }
}
```

## 3. AI Adapter 내부 API

### 3.1 행동 요청

```
POST /ai/generate-move
```

#### Request
```json
{
  "gameId": "abc-123",
  "playerType": "AI_OPENAI",
  "modelName": "gpt-4o",
  "persona": "shark",
  "difficulty": "expert",
  "psychologyLevel": 3,
  "gameState": {
    "tableGroups": [...],
    "myTiles": ["R1a", "B5b", ...],
    "otherPlayers": [
      { "seat": 1, "tileCount": 8 },
      { "seat": 2, "tileCount": 5 }
    ],
    "drawPileCount": 30,
    "turnNumber": 12,
    "hasInitialMeld": true
  }
}
```

#### Response
```json
{
  "action": "place",
  "tableGroups": [...],
  "tilesFromRack": ["R1a", "B5b"],
  "reasoning": "상대 타일이 5개로 적어 공격적으로 배치",
  "latencyMs": 842,
  "tokensUsed": { "prompt": 450, "completion": 120 }
}
```

### 3.2 LangChain/LangGraph 연동 옵션

직접 API 호출과 LangChain/LangGraph 중 Sprint 4 PoC에서 결정.

| 방식 | 장점 | 단점 |
|------|------|------|
| 직접 API 호출 | 가볍고 의존성 적음, 디버깅 쉬움 | 복잡한 추론 구현 수동 |
| LangChain | 프롬프트 관리, 출력 파서 내장 | 의존성 증가 |
| LangGraph | 상태 기반 다단계 추론, 재배치 탐색에 강점 | 학습 비용, 복잡도 |

**결정 시점**: Sprint 4 (AI Adapter 구현) 시작 전 PoC 비교
