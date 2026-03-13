-- =============================================================================
-- 002_create_rooms.up.sql
-- rooms 테이블 생성
-- rooms는 게임 시작 전 로비 역할. 실제 게임 기록은 games 테이블에 저장.
-- =============================================================================

CREATE TABLE IF NOT EXISTS rooms (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code       VARCHAR(10)  UNIQUE NOT NULL,            -- 4자리 대문자 코드 (예: ABCD)
    name            VARCHAR(100) NOT NULL,
    host_user_id    UUID         NOT NULL REFERENCES users(id),
    max_players     INTEGER      NOT NULL DEFAULT 4
                                 CHECK (max_players BETWEEN 2 AND 4),
    turn_timeout    INTEGER      NOT NULL DEFAULT 60
                                 CHECK (turn_timeout BETWEEN 30 AND 120),
    status          VARCHAR(20)  NOT NULL DEFAULT 'WAITING', -- WAITING | PLAYING | FINISHED | CANCELLED
    game_id         UUID         NULL,                       -- 게임 시작 후 연결
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ  NULL
);

CREATE INDEX IF NOT EXISTS idx_rooms_status     ON rooms (status) WHERE status IN ('WAITING', 'PLAYING');
CREATE INDEX IF NOT EXISTS idx_rooms_host       ON rooms (host_user_id);
CREATE INDEX IF NOT EXISTS idx_rooms_room_code  ON rooms (room_code);
CREATE INDEX IF NOT EXISTS idx_rooms_deleted_at ON rooms (deleted_at) WHERE deleted_at IS NULL;
