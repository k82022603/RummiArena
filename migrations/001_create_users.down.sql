-- =============================================================================
-- 001_create_users.down.sql
-- users 테이블 롤백
-- =============================================================================

DROP INDEX IF EXISTS idx_users_deleted_at;
DROP INDEX IF EXISTS idx_users_elo_rating;
DROP INDEX IF EXISTS idx_users_google_id;
DROP INDEX IF EXISTS idx_users_email;

DROP TABLE IF EXISTS users;
