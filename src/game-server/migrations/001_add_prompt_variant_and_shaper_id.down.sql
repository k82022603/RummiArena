-- Migration: 001_add_prompt_variant_and_shaper_id.down.sql
-- 작성일: 2026-04-20 (Sprint 6 Day 10)
-- 작성자: go-dev
-- 목적: up.sql 롤백 — 추가한 인덱스와 컬럼을 순서대로 제거한다.
-- 실행 환경: PostgreSQL 16
-- 주의: DROP COLUMN 은 되돌릴 수 없다. 반드시 pg_dump 백업 후 실행할 것.
-- 검증 절차: docs/02-design/46-postgres-shaper-id-migration-analysis.md §5 참조

-- ─────────────────────────────────────────────────────────────
-- 1. 인덱스 제거 (컬럼 제거 전에 먼저 삭제해야 함)
-- ─────────────────────────────────────────────────────────────

DROP INDEX IF EXISTS idx_ai_call_logs_variant_shaper;
DROP INDEX IF EXISTS idx_games_variant_shaper;

-- ─────────────────────────────────────────────────────────────
-- 2. ai_call_logs 컬럼 제거
-- ─────────────────────────────────────────────────────────────

ALTER TABLE ai_call_logs
    DROP COLUMN IF EXISTS shaper_id;

ALTER TABLE ai_call_logs
    DROP COLUMN IF EXISTS prompt_variant_id;

-- ─────────────────────────────────────────────────────────────
-- 3. games 컬럼 제거
-- ─────────────────────────────────────────────────────────────

ALTER TABLE games
    DROP COLUMN IF EXISTS shaper_id;

ALTER TABLE games
    DROP COLUMN IF EXISTS prompt_variant_id;

-- ─────────────────────────────────────────────────────────────
-- 롤백 완료 체크 쿼리 (수동 검증용, 주석 해제 후 실행)
-- ─────────────────────────────────────────────────────────────
-- SELECT column_name
-- FROM information_schema.columns
-- WHERE table_name IN ('games', 'ai_call_logs')
--   AND column_name IN ('prompt_variant_id', 'shaper_id');
-- -- 결과가 0건이면 롤백 성공
