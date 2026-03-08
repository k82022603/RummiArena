# 데이터베이스 설계 (Database Design)

## 1. 저장소 전략

| 저장소 | 용도 | 데이터 특성 |
|--------|------|-------------|
| PostgreSQL | 유저, 전적, AI 호출 로그, 설정 | 영속, 관계형 |
| Redis | 게임 상태, 세션, 턴 정보 | 휘발성, 고속 |

## 2. PostgreSQL 테이블 설계

### 2.1 users (사용자)
```sql
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) UNIQUE NOT NULL,
    display_name  VARCHAR(100) NOT NULL,
    avatar_url    TEXT,
    role          VARCHAR(20) DEFAULT 'ROLE_USER',  -- ROLE_ADMIN, ROLE_USER
    elo_rating    INTEGER DEFAULT 1000,
    is_blocked    BOOLEAN DEFAULT FALSE,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.2 games (게임 기록)
```sql
CREATE TABLE games (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code     VARCHAR(10) UNIQUE NOT NULL,
    status        VARCHAR(20) NOT NULL,  -- WAITING, PLAYING, FINISHED, CANCELLED
    player_count  INTEGER NOT NULL CHECK (player_count BETWEEN 2 AND 4),
    winner_id     UUID REFERENCES users(id),
    turn_count    INTEGER DEFAULT 0,
    started_at    TIMESTAMPTZ,
    finished_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.3 game_players (게임 참가자)
```sql
CREATE TABLE game_players (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id       UUID NOT NULL REFERENCES games(id),
    user_id       UUID REFERENCES users(id),       -- NULL이면 AI
    player_type   VARCHAR(20) NOT NULL,             -- HUMAN, AI_OPENAI, AI_CLAUDE, AI_DEEPSEEK, AI_LLAMA
    seat_order    INTEGER NOT NULL CHECK (seat_order BETWEEN 0 AND 3),
    initial_tiles INTEGER DEFAULT 14,
    final_tiles   INTEGER,
    score         INTEGER,
    is_winner     BOOLEAN DEFAULT FALSE,
    UNIQUE(game_id, seat_order)
);
```

### 2.4 ai_call_logs (AI 호출 로그)
```sql
CREATE TABLE ai_call_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id         UUID NOT NULL REFERENCES games(id),
    player_id       UUID NOT NULL REFERENCES game_players(id),
    model_type      VARCHAR(30) NOT NULL,           -- openai, claude, deepseek, llama
    model_name      VARCHAR(100),                   -- gpt-4o, claude-sonnet-4-20250514, etc.
    turn_number     INTEGER NOT NULL,
    prompt_tokens   INTEGER,
    completion_tokens INTEGER,
    latency_ms      INTEGER,
    is_valid_move   BOOLEAN,
    retry_count     INTEGER DEFAULT 0,
    error_message   TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.5 game_events (게임 이벤트 로그)
```sql
CREATE TABLE game_events (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id       UUID NOT NULL REFERENCES games(id),
    turn_number   INTEGER NOT NULL,
    player_id     UUID NOT NULL REFERENCES game_players(id),
    event_type    VARCHAR(30) NOT NULL,             -- PLACE_TILES, DRAW_TILE, REARRANGE, TIMEOUT
    event_data    JSONB,                            -- 상세 행동 데이터
    created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_game_events_game ON game_events(game_id, turn_number);
```

### 2.6 system_config (시스템 설정)
```sql
CREATE TABLE system_config (
    key           VARCHAR(100) PRIMARY KEY,
    value         TEXT NOT NULL,
    description   TEXT,
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 초기 데이터
INSERT INTO system_config (key, value, description) VALUES
('turn_timeout_sec', '60', '턴 타임아웃(초)'),
('ai_max_retries', '3', 'AI 무효 수 재시도 횟수'),
('ai_timeout_ms', '10000', 'AI 응답 타임아웃(ms)'),
('initial_meld_threshold', '30', '최초 등록 최소 점수'),
('max_rooms', '10', '최대 동시 게임 수');
```

## 3. Redis 데이터 구조

### 3.1 게임 상태
```
Key: game:{gameId}:state
Type: Hash
Fields:
  - status: "PLAYING"
  - currentTurn: 2
  - currentPlayer: 0
  - drawPileCount: 52
  - tableState: JSON (테이블 위 타일 세트들)
TTL: 3600 (1시간, 게임 종료 후 정리)
```

### 3.2 플레이어 타일 (비공개)
```
Key: game:{gameId}:player:{seatOrder}:tiles
Type: List
Value: ["R1", "B5", "Y13", "JK", ...]
TTL: 게임 상태와 동일
```

### 3.3 드로우 파일
```
Key: game:{gameId}:drawpile
Type: List
Value: 셔플된 타일 목록
```

### 3.4 세션 관리
```
Key: session:{sessionId}
Type: Hash
Fields:
  - userId: UUID
  - gameId: UUID (현재 참가 중인 게임)
TTL: 1800 (30분)
```

## 4. 타일 인코딩 규칙

| 코드 | 의미 |
|------|------|
| R | Red (빨강) |
| B | Blue (파랑) |
| Y | Yellow (노랑) |
| K | Black (검정) |
| 1~13 | 숫자 |
| a/b | 동일 타일 구분 (세트 1/세트 2) |
| JK1, JK2 | 조커 1, 조커 2 |

예시: `R7a` = 빨강 7 (세트 a), `B13b` = 파랑 13 (세트 b)

## 5. ER 다이어그램

```
users 1──N game_players N──1 games
                │                  │
                │                  │
                N                  N
          ai_call_logs       game_events
```
