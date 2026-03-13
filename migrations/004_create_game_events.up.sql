-- =============================================================================
-- 004_create_game_events.up.sql
-- game_events, game_snapshots 테이블 생성
-- 참조: docs/02-design/02-database-design.md §2.5, §2.9
-- =============================================================================

-- game_events: 게임 이벤트 로그 (이벤트 소싱 패턴)
CREATE TABLE IF NOT EXISTS game_events (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id     UUID        NOT NULL REFERENCES games(id),
    player_id   UUID        NOT NULL REFERENCES game_players(id),
    turn_number INTEGER     NOT NULL,
    seat        INTEGER     NOT NULL CHECK (seat BETWEEN 0 AND 3),
    event_type  VARCHAR(30)  NOT NULL,    -- PLACE_TILES | DRAW_TILE | REARRANGE | TIMEOUT | GAME_START | GAME_END
    payload     JSONB        NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 복합 인덱스: game_id + turn_number 기준 조회 (복기 기능)
CREATE INDEX IF NOT EXISTS idx_game_events_game   ON game_events (game_id, turn_number);
CREATE INDEX IF NOT EXISTS idx_game_events_player ON game_events (player_id);

-- game_snapshots: 복기용 턴 스냅샷 (FR-009)
-- 매 턴 완료 시 비동기 저장. 4분할 복기 뷰 지원.
-- 보관 정책: 90일 후 자동 아카이브/삭제
CREATE TABLE IF NOT EXISTS game_snapshots (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id          UUID        NOT NULL REFERENCES games(id),
    turn_number      INTEGER     NOT NULL,
    acting_seat      INTEGER     NOT NULL CHECK (acting_seat BETWEEN 0 AND 3),
    action_type      VARCHAR(30)  NOT NULL,    -- PLACE_TILES | DRAW_TILE | REARRANGE | TIMEOUT
    action_detail    JSONB        NOT NULL DEFAULT '{}',
    player_hands     JSONB        NOT NULL DEFAULT '{}',  -- 각 seat별 패 (복기 시 전체 공개)
    table_state      JSONB        NOT NULL DEFAULT '{}',  -- 테이블 위 세트들
    draw_pile_count  INTEGER      NOT NULL DEFAULT 0,
    ai_decision_log  TEXT         NULL,                   -- AI 턴인 경우 판단 근거 요약
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 복합 인덱스: game_id + turn_number 기준 정렬 조회
CREATE INDEX IF NOT EXISTS idx_game_snapshots_game ON game_snapshots (game_id, turn_number);

-- ai_call_logs: AI 모델별 호출 기록 (성능 분석/비교용)
CREATE TABLE IF NOT EXISTS ai_call_logs (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id              UUID        NOT NULL REFERENCES games(id),
    player_id            UUID        NOT NULL REFERENCES game_players(id),
    player_type          VARCHAR(20)  NOT NULL,   -- AI_OPENAI | AI_CLAUDE | AI_DEEPSEEK | AI_LLAMA
    model_name           VARCHAR(100) NULL,
    ai_persona           VARCHAR(30)  NULL,
    ai_difficulty        VARCHAR(20)  NULL,
    ai_psychology_level  INTEGER      NULL,
    turn_number          INTEGER      NOT NULL,
    prompt_tokens        INTEGER      NULL,
    completion_tokens    INTEGER      NULL,
    latency_ms           INTEGER      NULL,
    is_valid_move        BOOLEAN      NULL,
    retry_count          INTEGER      NOT NULL DEFAULT 0,
    error_message        TEXT         NULL,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_call_logs_game      ON ai_call_logs (game_id);
CREATE INDEX IF NOT EXISTS idx_ai_call_logs_player    ON ai_call_logs (player_id);
CREATE INDEX IF NOT EXISTS idx_ai_call_logs_model     ON ai_call_logs (player_type, model_name);

-- elo_history: ELO 레이팅 변경 이력
CREATE TABLE IF NOT EXISTS elo_history (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID        NOT NULL REFERENCES users(id),
    game_id              UUID        NOT NULL REFERENCES games(id),
    rating_before        INTEGER     NOT NULL,
    rating_after         INTEGER     NOT NULL,
    rating_delta         INTEGER     NOT NULL,
    k_factor             INTEGER     NOT NULL DEFAULT 32,
    opponent_avg_rating  INTEGER     NULL,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_elo_history_user ON elo_history (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_elo_history_game ON elo_history (game_id);

-- practice_sessions: 1인 연습 모드 (Stage 1~6)
CREATE TABLE IF NOT EXISTS practice_sessions (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID        NOT NULL REFERENCES users(id),
    game_id      UUID        NOT NULL REFERENCES games(id),
    stage        INTEGER     NOT NULL CHECK (stage BETWEEN 1 AND 6),
    status       VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',   -- ACTIVE | COMPLETED | ABANDONED
    objectives   JSONB        NOT NULL DEFAULT '{}',
    result       JSONB        NULL,
    started_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ  NULL
);

CREATE INDEX IF NOT EXISTS idx_practice_user ON practice_sessions (user_id, stage);
CREATE INDEX IF NOT EXISTS idx_practice_game ON practice_sessions (game_id);

-- system_config: 시스템 설정 키-값 저장소
CREATE TABLE IF NOT EXISTS system_config (
    key         VARCHAR(100) PRIMARY KEY,
    value       TEXT         NOT NULL,
    description TEXT         NULL,
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 초기 설정값
INSERT INTO system_config (key, value, description) VALUES
    ('turn_timeout_sec',              '60',    '턴 타임아웃(초)'),
    ('ai_max_retries',                '3',     'AI 무효 수 재시도 횟수'),
    ('ai_timeout_ms',                 '10000', 'AI 응답 타임아웃(ms)'),
    ('initial_meld_threshold',        '30',    '최초 등록 최소 점수'),
    ('max_rooms',                     '10',    '최대 동시 게임 수'),
    ('snapshot_retention_days',       '90',    '게임 스냅샷 보관 기간(일)')
ON CONFLICT (key) DO NOTHING;
