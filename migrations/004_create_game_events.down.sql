-- =============================================================================
-- 004_create_game_events.down.sql
-- game_events, game_snapshots, ai_call_logs, elo_history, practice_sessions,
-- system_config 테이블 롤백
-- =============================================================================

DROP INDEX IF EXISTS idx_practice_game;
DROP INDEX IF EXISTS idx_practice_user;
DROP TABLE IF EXISTS practice_sessions;

DROP INDEX IF EXISTS idx_elo_history_game;
DROP INDEX IF EXISTS idx_elo_history_user;
DROP TABLE IF EXISTS elo_history;

DROP INDEX IF EXISTS idx_ai_call_logs_model;
DROP INDEX IF EXISTS idx_ai_call_logs_player;
DROP INDEX IF EXISTS idx_ai_call_logs_game;
DROP TABLE IF EXISTS ai_call_logs;

DROP INDEX IF EXISTS idx_game_snapshots_game;
DROP TABLE IF EXISTS game_snapshots;

DROP INDEX IF EXISTS idx_game_events_player;
DROP INDEX IF EXISTS idx_game_events_game;
DROP TABLE IF EXISTS game_events;

DROP TABLE IF EXISTS system_config;
