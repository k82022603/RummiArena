-- =============================================================================
-- 002_create_rooms.down.sql
-- rooms 테이블 롤백
-- =============================================================================

DROP INDEX IF EXISTS idx_rooms_deleted_at;
DROP INDEX IF EXISTS idx_rooms_room_code;
DROP INDEX IF EXISTS idx_rooms_host;
DROP INDEX IF EXISTS idx_rooms_status;

DROP TABLE IF EXISTS rooms;
