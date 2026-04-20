-- Migration: 001_add_prompt_variant_and_shaper_id.up.sql
-- 작성일: 2026-04-20 (Sprint 6 Day 10)
-- 작성자: go-dev
-- 목적: v6 ContextShaper (ADR-044) + variant SSOT (ADR-042) 추적을 위해
--       games 테이블에 prompt_variant_id, shaper_id 컬럼을 추가한다.
-- 실행 환경: PostgreSQL 16
-- 실행 시점: Sprint 7 Week 1 (DevOps 협업)
-- 참조:
--   docs/02-design/42-prompt-variant-standard.md §2 표 B
--   docs/02-design/44-context-shaper-v6-architecture.md §7
-- 주의: NULL 허용 컬럼 추가만 — 기존 데이터 손실 없음.

-- ─────────────────────────────────────────────────────────────
-- 1. games 테이블 컬럼 추가
-- ─────────────────────────────────────────────────────────────

-- prompt_variant_id: 어떤 텍스트 variant 로 진행된 게임인지 기록.
--   값 예시: 'v2', 'v3', 'v4', 'v4.1', 'v2-zh'
--   NULL = 컬럼 추가 이전에 생성된 게임 (기존 행 호환)
ALTER TABLE games
    ADD COLUMN IF NOT EXISTS prompt_variant_id VARCHAR(32) NULL;

-- shaper_id: 어떤 ContextShaper 로 진행된 게임인지 기록.
--   값 예시: 'passthrough', 'joker_hinter', 'pair_warmup'
--   DEFAULT 'passthrough' — Sprint 7 이후 신규 게임에는 명시적 값을 기록하나,
--   기존 행은 NULL 유지(기본값이 소급 적용되지 않도록 DEFAULT 를 NOT NULL 없이 사용).
ALTER TABLE games
    ADD COLUMN IF NOT EXISTS shaper_id VARCHAR(32) NULL;

-- ─────────────────────────────────────────────────────────────
-- 2. 복합 인덱스 — variant × shaper 분석 쿼리 가속
--    예: SELECT * FROM games WHERE prompt_variant_id = 'v2' AND shaper_id = 'passthrough'
-- ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_games_variant_shaper
    ON games (prompt_variant_id, shaper_id);

-- ─────────────────────────────────────────────────────────────
-- 3. ai_call_logs 테이블 컬럼 추가 (게임 단위가 아닌 턴 단위 추적 보조)
--    게임 수준 집계는 games 테이블로 충분하나,
--    턴별 variant/shaper 를 독립 추적하면 "어느 턴에 shaper 가 효과를 냈는지"
--    세밀 분석이 가능해진다. Sprint 7 에서 Node Dev 가 MoveResponse 에
--    shaper_id 를 포함시킬 경우 이 컬럼에 기록한다.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE ai_call_logs
    ADD COLUMN IF NOT EXISTS prompt_variant_id VARCHAR(32) NULL;

ALTER TABLE ai_call_logs
    ADD COLUMN IF NOT EXISTS shaper_id VARCHAR(32) NULL;

CREATE INDEX IF NOT EXISTS idx_ai_call_logs_variant_shaper
    ON ai_call_logs (prompt_variant_id, shaper_id);

-- ─────────────────────────────────────────────────────────────
-- 마이그레이션 완료 체크 쿼리 (실행 후 수동 검증용, 주석 해제 후 실행)
-- ─────────────────────────────────────────────────────────────
-- SELECT column_name, data_type, is_nullable, column_default
-- FROM information_schema.columns
-- WHERE table_name IN ('games', 'ai_call_logs')
--   AND column_name IN ('prompt_variant_id', 'shaper_id')
-- ORDER BY table_name, column_name;
