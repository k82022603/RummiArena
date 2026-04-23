#!/usr/bin/env bash
# apply-postgres-001-migration.sh
# PostgreSQL 001 마이그레이션 실행 스크립트
#
# 목적:
#   games + ai_call_logs 테이블에 prompt_variant_id, shaper_id 컬럼 추가
#   (NULL 허용 — 기존 데이터 손실 없음)
#
# 참조:
#   src/game-server/migrations/001_add_prompt_variant_and_shaper_id.up.sql
#   docs/02-design/46-postgres-shaper-id-migration-analysis.md §5
#
# 사용법:
#   ./scripts/apply-postgres-001-migration.sh [--dry-run] [--rollback]
#
# 전제조건:
#   - kubectl 접근 가능 (K8s postgres pod에 psql exec 권한)
#   - KUBECTL 환경변수 미설정 시 기본 kubectl 사용
#
# 안전장치:
#   1. pg_dump 백업 실행 후 마이그레이션
#   2. 컬럼 이미 존재 시 IF NOT EXISTS 로 무해하게 스킵
#   3. --dry-run: SQL만 출력, 실제 실행 없음
#   4. --rollback: down.sql 실행 (DROP COLUMN IF EXISTS 사용)

set -euo pipefail

KUBECTL="${KUBECTL:-/mnt/c/Program Files/Docker/Docker/resources/bin/kubectl.exe}"
NAMESPACE="rummikub"
DB_USER="rummikub"
DB_NAME="rummikub"
MIGRATION_UP="src/game-server/migrations/001_add_prompt_variant_and_shaper_id.up.sql"
MIGRATION_DOWN="src/game-server/migrations/001_add_prompt_variant_and_shaper_id.down.sql"

DRY_RUN=false
ROLLBACK=false

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --rollback) ROLLBACK=true ;;
    *) echo "Unknown argument: $arg"; exit 1 ;;
  esac
done

# postgres pod 이름 자동 탐색
POSTGRES_POD=$("$KUBECTL" get pod -n "$NAMESPACE" -l app=postgres -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
if [ -z "$POSTGRES_POD" ]; then
  echo "ERROR: postgres pod not found in namespace $NAMESPACE"
  exit 1
fi
echo "Target pod: $POSTGRES_POD"

# dry-run 모드
if [ "$DRY_RUN" = "true" ]; then
  echo "=== DRY RUN mode — SQL to be executed ==="
  if [ "$ROLLBACK" = "true" ]; then
    cat "$MIGRATION_DOWN"
  else
    cat "$MIGRATION_UP"
  fi
  echo ""
  echo "=== Pre-migration column check (dry-run) ==="
  "$KUBECTL" exec -n "$NAMESPACE" "$POSTGRES_POD" -- psql -U "$DB_USER" -d "$DB_NAME" -c "
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name IN ('games', 'ai_call_logs')
  AND column_name IN ('prompt_variant_id', 'shaper_id')
ORDER BY table_name, column_name;
"
  echo "DRY RUN complete. No changes made."
  exit 0
fi

# rollback 모드
if [ "$ROLLBACK" = "true" ]; then
  echo "=== ROLLBACK: applying down.sql ==="
  echo "WARNING: DROP COLUMN is irreversible. Proceeding..."
  MIGRATION_SQL="$MIGRATION_DOWN"
else
  # 백업 (up 마이그레이션 전)
  BACKUP_FILE="backup_pre_001_migration_$(date +%Y%m%d_%H%M%S).sql"
  echo "=== Step 1: pg_dump backup → $BACKUP_FILE ==="
  "$KUBECTL" exec -n "$NAMESPACE" "$POSTGRES_POD" -- pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP_FILE"
  echo "Backup saved: $BACKUP_FILE ($(wc -c < "$BACKUP_FILE") bytes)"
  MIGRATION_SQL="$MIGRATION_UP"
fi

# 마이그레이션 실행
echo "=== Step 2: Applying $MIGRATION_SQL ==="
"$KUBECTL" exec -n "$NAMESPACE" "$POSTGRES_POD" -- psql -U "$DB_USER" -d "$DB_NAME" < "$MIGRATION_SQL"

# 검증 쿼리
echo "=== Step 3: Verification ==="
"$KUBECTL" exec -n "$NAMESPACE" "$POSTGRES_POD" -- psql -U "$DB_USER" -d "$DB_NAME" -c "
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name IN ('games', 'ai_call_logs')
  AND column_name IN ('prompt_variant_id', 'shaper_id')
ORDER BY table_name, column_name;
"

# 인덱스 확인
echo "=== Step 4: Index verification ==="
"$KUBECTL" exec -n "$NAMESPACE" "$POSTGRES_POD" -- psql -U "$DB_USER" -d "$DB_NAME" -c "
SELECT indexname, tablename, indexdef
FROM pg_indexes
WHERE indexname IN ('idx_games_variant_shaper', 'idx_ai_call_logs_variant_shaper')
ORDER BY tablename;
"

# 기존 행 영향 확인 (games 행 수)
echo "=== Step 5: Existing data check ==="
"$KUBECTL" exec -n "$NAMESPACE" "$POSTGRES_POD" -- psql -U "$DB_USER" -d "$DB_NAME" -c "
SELECT
  (SELECT COUNT(*) FROM games) AS total_games,
  (SELECT COUNT(*) FROM games WHERE prompt_variant_id IS NULL) AS games_null_variant,
  (SELECT COUNT(*) FROM ai_call_logs) AS total_ai_call_logs,
  (SELECT COUNT(*) FROM ai_call_logs WHERE prompt_variant_id IS NULL) AS ai_logs_null_variant;
"

if [ "$ROLLBACK" = "true" ]; then
  echo "=== ROLLBACK complete ==="
else
  echo "=== Migration 001 applied successfully ==="
  echo "Backup file: $BACKUP_FILE"
fi
