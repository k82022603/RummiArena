-- =============================================================================
-- 003_create_games.down.sql
-- games, game_players 테이블 롤백
-- =============================================================================

DROP INDEX IF EXISTS idx_game_players_user_id;
DROP INDEX IF EXISTS idx_game_players_game_id;
DROP TABLE IF EXISTS game_players;

DROP INDEX IF EXISTS idx_games_started_at;
DROP INDEX IF EXISTS idx_games_status;
DROP INDEX IF EXISTS idx_games_room_id;
DROP TABLE IF EXISTS games;
