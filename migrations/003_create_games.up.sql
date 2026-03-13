-- =============================================================================
-- 003_create_games.up.sql
-- games, game_players 테이블 생성
-- 참조: docs/02-design/02-database-design.md §2.2, §2.3
-- =============================================================================

-- games: 게임 기록 (Room 1:1 대응, 로비 방과는 별개)
CREATE TABLE IF NOT EXISTS games (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id      UUID        NULL REFERENCES rooms(id),      -- 로비에서 시작한 경우 연결
    room_code    VARCHAR(10)  NOT NULL,
    status       VARCHAR(20)  NOT NULL DEFAULT 'WAITING',    -- WAITING | PLAYING | FINISHED | CANCELLED
    game_mode    VARCHAR(20)  NOT NULL DEFAULT 'NORMAL',     -- NORMAL | PRACTICE
    player_count INTEGER      NOT NULL CHECK (player_count BETWEEN 2 AND 4),
    winner_id    UUID         NULL REFERENCES users(id),     -- 게임 종료 후 채워짐
    winner_seat  INTEGER      NULL CHECK (winner_seat BETWEEN 0 AND 3),
    turn_count   INTEGER      NOT NULL DEFAULT 0,
    settings     JSONB        NOT NULL DEFAULT '{}',         -- turnTimeoutSec, initialMeldThreshold 등
    started_at   TIMESTAMPTZ  NULL,
    ended_at     TIMESTAMPTZ  NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_games_room_id    ON games (room_id);
CREATE INDEX IF NOT EXISTS idx_games_status     ON games (status);
CREATE INDEX IF NOT EXISTS idx_games_started_at ON games (started_at DESC);

-- game_players: 게임 참가자 (HUMAN 또는 AI)
CREATE TABLE IF NOT EXISTS game_players (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id              UUID        NOT NULL REFERENCES games(id),
    user_id              UUID        NULL REFERENCES users(id),  -- NULL이면 AI
    player_type          VARCHAR(20)  NOT NULL,                  -- HUMAN | AI_OPENAI | AI_CLAUDE | AI_DEEPSEEK | AI_LLAMA
    ai_model             VARCHAR(100) NULL,                      -- gpt-4o, claude-sonnet-4-20250514 등 (AI일 때)
    ai_persona           VARCHAR(30)  NULL,                      -- rookie | calculator | shark | fox | wall | wildcard
    ai_difficulty        VARCHAR(20)  NULL,                      -- beginner | intermediate | expert
    ai_psychology_level  INTEGER      NULL CHECK (ai_psychology_level BETWEEN 0 AND 3),
    seat_order           INTEGER      NOT NULL CHECK (seat_order BETWEEN 0 AND 3),
    initial_tiles        INTEGER      NOT NULL DEFAULT 14,
    final_tiles          INTEGER      NULL,
    score                INTEGER      NULL,
    is_winner            BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (game_id, seat_order)
);

CREATE INDEX IF NOT EXISTS idx_game_players_game_id ON game_players (game_id);
CREATE INDEX IF NOT EXISTS idx_game_players_user_id ON game_players (user_id) WHERE user_id IS NOT NULL;
