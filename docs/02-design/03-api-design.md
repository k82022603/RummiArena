# API 설계 (API Design)

## 1. REST API

### 1.1 인증 (Auth)

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/auth/google` | Google OAuth 로그인 리다이렉트 |
| GET | `/api/auth/google/callback` | OAuth 콜백, JWT 발급 |
| GET | `/api/auth/me` | 현재 사용자 정보 |
| POST | `/api/auth/logout` | 로그아웃 |

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

#### Room 생성 요청 예시
```json
{
  "playerCount": 4,
  "turnTimeoutSec": 60,
  "aiPlayers": [
    { "type": "AI_OPENAI", "strategy": "aggressive" },
    { "type": "AI_CLAUDE", "strategy": "balanced" }
  ]
}
```

### 1.3 게임 기록

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/games` | 게임 기록 목록 |
| GET | `/api/games/:id` | 게임 상세 기록 |
| GET | `/api/games/:id/events` | 게임 이벤트 로그 |
| GET | `/api/games/:id/ai-logs` | AI 호출 로그 |

### 1.4 사용자

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/api/users/me/stats` | 내 통계 |
| GET | `/api/users/ranking` | ELO 랭킹 |

### 1.5 관리자

| Method | Endpoint | 설명 | 권한 |
|--------|----------|------|------|
| GET | `/api/admin/rooms` | 활성 Room 목록 | ADMIN |
| DELETE | `/api/admin/rooms/:id` | 게임 강제 종료 | ADMIN |
| GET | `/api/admin/users` | 사용자 목록 | ADMIN |
| PATCH | `/api/admin/users/:id/block` | 사용자 차단/해제 | ADMIN |
| GET | `/api/admin/ai/stats` | AI 모델별 통계 | ADMIN |
| GET | `/api/admin/system/health` | 시스템 상태 | ADMIN |

### 1.6 시스템

| Method | Endpoint | 설명 |
|--------|----------|------|
| GET | `/health` | 헬스 체크 |
| GET | `/ready` | Readiness 체크 |
| GET | `/metrics` | Prometheus 메트릭 |

## 2. WebSocket 프로토콜

### 2.1 연결
```
ws://host/ws?token={JWT}&roomId={roomId}
```

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
  "modelType": "openai",
  "modelName": "gpt-4o",
  "strategy": "aggressive",
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
