-- =============================================================================
-- 001_create_users.up.sql
-- users 테이블 생성
-- 참조: docs/02-design/02-database-design.md §2.1
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    google_id    VARCHAR(255) UNIQUE NOT NULL,
    email        VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    avatar_url   TEXT,
    role         VARCHAR(20)  NOT NULL DEFAULT 'ROLE_USER',   -- ROLE_USER | ROLE_ADMIN
    elo_rating   INTEGER      NOT NULL DEFAULT 1000,
    is_blocked   BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at   TIMESTAMPTZ  NULL
);

-- 자주 조회되는 컬럼 인덱스
CREATE INDEX IF NOT EXISTS idx_users_email      ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_google_id  ON users (google_id);
CREATE INDEX IF NOT EXISTS idx_users_elo_rating ON users (elo_rating DESC);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users (deleted_at) WHERE deleted_at IS NULL;
