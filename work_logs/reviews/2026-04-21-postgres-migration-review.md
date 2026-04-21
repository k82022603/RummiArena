# PostgreSQL 001 마이그레이션 리뷰 — Sprint 7 실행 준비

- **작성일**: 2026-04-21 (Sprint 6 Day 11)
- **작성자**: go-dev (claude-sonnet-4-6)
- **대상 파일**:
  - `src/game-server/migrations/001_add_prompt_variant_and_shaper_id.up.sql`
  - `src/game-server/migrations/001_add_prompt_variant_and_shaper_id.down.sql`
- **참조**:
  - `docs/02-design/42-prompt-variant-standard.md` §2 표 B, §3 표 A
  - `docs/04-testing/63-v6-shaper-final-report.md` Part 1 §1.3
  - `src/game-server/internal/model/game.go` — `Game` 구조체
  - `src/game-server/internal/model/event.go` — `AICallLog` 구조체
  - `src/game-server/internal/infra/database.go` — `AutoMigrate()`
  - `src/game-server/cmd/server/main.go` — `initInfra()`
- **feature branch**: `chore/day11-wrap-up`

---

## Summary — GO / NO-GO 판정

**판정: CONDITIONAL GO**

SQL 파일 자체는 안전하게 작성됐다. `IF NOT EXISTS` 방어, NULL 허용, 인덱스 선후 순서 모두 올바르다. 단, Sprint 7 실행 전 반드시 해결해야 할 **WARN 2건** 이 있다.

1. GORM 모델 2개(`Game`, `AICallLog`)에 신규 필드가 아직 미추가 — AutoMigrate 충돌 위험
2. `down.sql` 에 `BEGIN` / `COMMIT` 트랜잭션 래퍼 부재 — 부분 롤백 시 불일치 상태 잔류 위험

이 두 항목이 해결되면 Sprint 7 Week 1 실행 가능하다.

---

## 리뷰 항목 1 — VARCHAR(32) 적정성

**판정: PASS**

현재 등록된 variant id(표 A, `docs/02-design/42` §3)를 전수 점검했다.

| variant id | 길이 |
|---|---|
| `v2` | 2 |
| `v2-zh` | 5 |
| `v3` | 2 |
| `v3-tuned` | 8 |
| `v4` | 2 |
| `v4.1` | 4 |
| `v5` | 2 |
| `character-ko` | 12 |

최장 `character-ko` 12자. 향후 `v4.1-deepseek-specific` 수준의 서술형 id를 도입하더라도 32자 이내에 충분히 수용된다.

shaper id 3종: `passthrough`(11자), `joker-hinter`(12자), `pair-warmup`(10자). 모두 12자 이하.

향후 5년 내 variant/shaper 식별자가 32자를 초과할 가능성은 낮다. 스키마 변경 비용 대비 여유가 충분하므로 VARCHAR(32) 는 적절하다.

---

## 리뷰 항목 2 — NULL 허용 여부 및 기존 row 처리 전략

**판정: PASS**

두 컬럼 모두 `NULL` 허용으로 선언됐다. 기존 games / ai_call_logs 행에 대해 DDL 실행 즉시 NULL 채움이 적용되므로 데이터 손실 없이 무중단 적용이 가능하다.

SQL 주석(up.sql:26)에 "DEFAULT 를 NOT NULL 없이 사용"한 의도가 명시되어 있다. 이는 기존 행에 `passthrough` 를 소급 적용하지 않겠다는 의도로, 올바른 결정이다. 소급 backfill을 하면 Round 4/5 의 데이터가 실제로는 passthrough(기본 동작)였으나 shaper 미지원 시기 데이터임에도 불구하고 `passthrough` 라고 기록되어 분석 오류를 유발할 수 있다.

**backfill 전략 권고**: Sprint 7 실행 후 Round 4/5 의 games row 에 대해 다음 방침을 권장한다.

- `prompt_variant_id`: Round 4 는 v2(deepseek/openai), v4(claude). Round 5 는 v2(deepseek). 대전 스크립트 실행 당시 ai-adapter 설정을 기준으로 수동 UPDATE 가능하나, **NULL 유지가 더 안전**하다. NULL = "컬럼 도입 이전 데이터" 는 명확한 의미를 갖는다.
- `shaper_id`: Round 4/5 는 ContextShaper 도입 이전이므로 NULL 유지가 유일하게 올바른 선택이다.

소급 UPDATE 는 선택사항이며, 분석 쿼리에서 `WHERE prompt_variant_id IS NOT NULL` 필터를 사용하면 NULL 행을 자연스럽게 제외할 수 있다.

---

## 리뷰 항목 3 — 인덱스 전략

**판정: PASS (단, 단일 인덱스 보완 권고)**

현재: `(prompt_variant_id, shaper_id)` 복합 인덱스 1개.

**적합한 조회 패턴**: `WHERE prompt_variant_id = 'v2' AND shaper_id = 'passthrough'` — 복합 인덱스로 커버.

**누락된 패턴**: `WHERE prompt_variant_id = 'v3'` (shaper 무관) 단일 variant 집계. PostgreSQL BTree 인덱스는 선두 컬럼으로만 범위 스캔이 가능하므로, `prompt_variant_id` 단독 필터는 복합 인덱스의 선두 컬럼이므로 **이미 커버된다**. 즉 단일 인덱스를 별도로 추가하지 않아도 된다.

**누락된 패턴**: `WHERE shaper_id = 'joker-hinter'` (variant 무관) — 이 경우 복합 인덱스의 선두 컬럼이 아니므로 풀 스캔 발생. 그러나 ai_call_logs 는 현재 최대 수천 건 수준이므로 성능 영향은 무시 가능하다. Sprint 8 이후 데이터가 수십만 건에 도달하면 단일 `shaper_id` 인덱스 추가를 검토하면 된다.

**결론**: 현재 데이터 규모에서 복합 인덱스만으로 충분. PASS.

---

## 리뷰 항목 4 — down.sql 롤백 완전성

**판정: WARN**

순서는 올바르다: 인덱스 DROP → ai_call_logs 컬럼 DROP → games 컬럼 DROP. PostgreSQL 에서 컬럼 DROP 전에 해당 컬럼의 인덱스를 먼저 삭제해야 하는 제약은 없으나(DDL이 자동 처리), 명시적으로 인덱스를 먼저 삭제하는 순서는 명확성 측면에서 올바른 관행이다.

**발견된 문제**: `down.sql` 에 트랜잭션(`BEGIN` / `COMMIT`) 이 없다. 4개의 `ALTER TABLE DROP COLUMN` 중 중간에 실패하면 부분 롤백 상태가 남는다. 예를 들어 `ai_call_logs.shaper_id` 는 삭제됐는데 `games.prompt_variant_id` 는 잔류하는 상황이 발생할 수 있다.

**권고 수정** (SQL 파일은 이번 리뷰 범위에서 수정 금지이므로 Sprint 7 실행 담당자에게 전달):

```sql
BEGIN;
DROP INDEX IF EXISTS idx_ai_call_logs_variant_shaper;
DROP INDEX IF EXISTS idx_games_variant_shaper;
ALTER TABLE ai_call_logs DROP COLUMN IF EXISTS shaper_id;
ALTER TABLE ai_call_logs DROP COLUMN IF EXISTS prompt_variant_id;
ALTER TABLE games DROP COLUMN IF EXISTS shaper_id;
ALTER TABLE games DROP COLUMN IF EXISTS prompt_variant_id;
COMMIT;
```

동일하게 `up.sql` 에도 트랜잭션 래퍼를 권장한다. `ADD COLUMN` 과 `CREATE INDEX` 는 DDL 이므로 PostgreSQL 16 에서 트랜잭션 내 실행이 가능하다.

---

## 리뷰 항목 5 — GORM 모델 대응

**판정: FAIL (Sprint 7 실행 전 수정 필수)**

`src/game-server/internal/model/game.go` 의 `Game` 구조체와 `src/game-server/internal/model/event.go` 의 `AICallLog` 구조체를 확인했다. **두 구조체 모두 `prompt_variant_id`, `shaper_id` 필드가 없다.**

`src/game-server/internal/infra/database.go` 의 `AutoMigrate()` 는 서버 시작 시 항상 호출된다(`cmd/server/main.go:76`). GORM AutoMigrate 는 구조체에 없는 컬럼을 삭제하지는 않지만, SQL 마이그레이션으로 추가된 컬럼을 GORM 레이어에서 읽고 쓰려면 반드시 구조체에 필드가 있어야 한다.

**구체적 문제**:

1. `games` 테이블에 `prompt_variant_id` 컬럼이 생겼더라도, `Game` 구조체에 필드가 없으면 `gameSvc` 가 게임 생성/종료 시 해당 컬럼에 값을 기록할 수 없다.
2. `ai_call_logs` 테이블에 `shaper_id` 컬럼이 생겼더라도, `AICallLog` 구조체에 필드가 없으면 WS 핸들러에서 AI 호출 로그 저장 시 해당 컬럼에 기록되지 않는다.
3. AutoMigrate 가 `Game` 구조체를 기준으로 스키마를 재동기화할 때, SQL 마이그레이션으로 추가된 컬럼이 구조체에 없으므로 AutoMigrate 는 아무 동작도 하지 않는다. 컬럼은 존재하지만 사용되지 않는 dead column 상태가 된다.

**필요한 수정 — Game 구조체** (`src/game-server/internal/model/game.go`):

```go
// Sprint 7: v6 ContextShaper + variant SSOT 추적 (001 마이그레이션 대응)
// NULL = 마이그레이션 이전 게임. docs/02-design/42 §2 표 B, docs/02-design/44 §7
PromptVariantID *string `gorm:"column:prompt_variant_id;type:varchar(32)" json:"promptVariantId,omitempty"`
ShaperID        *string `gorm:"column:shaper_id;type:varchar(32)"        json:"shaperId,omitempty"`
```

**필요한 수정 — AICallLog 구조체** (`src/game-server/internal/model/event.go`):

```go
// Sprint 7: v6 ContextShaper + variant SSOT 추적 (001 마이그레이션 대응)
PromptVariantID *string `gorm:"column:prompt_variant_id;type:varchar(32)" json:"promptVariantId,omitempty"`
ShaperID        *string `gorm:"column:shaper_id;type:varchar(32)"        json:"shaperId,omitempty"`
```

`*string` (포인터) 을 사용하는 이유: SQL NULL 을 Go 의 `nil` 로 정확히 표현하기 위함. `string` 을 사용하면 NULL 이 빈 문자열로 처리된다.

GORM 모델 수정 후 AutoMigrate 와의 관계: AutoMigrate 는 구조체 필드를 보고 해당 컬럼이 없으면 추가하려 한다. SQL 마이그레이션으로 이미 컬럼이 존재하면 AutoMigrate 는 스킵한다(`IF NOT EXISTS` 동등 동작). 즉 SQL 마이그레이션 실행 후 GORM 모델 수정 → 서버 재시작 순서에서 충돌은 발생하지 않는다.

---

## 리뷰 항목 6 — AutoMigrate vs Manual Migration 전략

**판정: PASS (현재 전략 적절, 주의사항 있음)**

`database.go:63` 주석에 명시됐다: "SQL 마이그레이션 파일(migrations/)과 병행하여 개발 환경에서 편의상 사용한다. 프로덕션에서는 SQL 마이그레이션 파일만 사용할 것."

이 이중 전략은 다음 전제 하에 올바르다.

1. **개발 환경**: AutoMigrate 가 빠른 반복 개발을 지원. GORM 모델이 SQL 마이그레이션과 동기화된 상태면 충돌 없음.
2. **프로덕션 (K8s)**: SQL 마이그레이션 파일만 사용. DevOps 가 `psql -f 001_add_...up.sql` 형태로 적용.

**주의사항**: 현재 서버 시작 시 AutoMigrate 가 항상 호출된다(`initInfra` 내 `infra.AutoMigrate`). 프로덕션 K8s 배포에서도 AutoMigrate 가 실행되므로, GORM 모델이 SQL 마이그레이션보다 선행되면 AutoMigrate 가 먼저 컬럼을 추가하고 SQL 마이그레이션이 `IF NOT EXISTS` 로 스킵하는 경우가 발생한다. 이는 기능상 문제없으나, 마이그레이션 파일의 의미가 희석된다.

**권고 (선택사항)**: `APP_ENV=production` 일 때 AutoMigrate 를 건너뛰는 환경변수(`DISABLE_AUTO_MIGRATE=true`)를 추가하면 개발/프로덕션 전략이 더 명확히 분리된다. Sprint 7 범위에 포함할지는 DevOps 판단에 맡긴다.

---

## 리뷰 요약표

| 항목 | 판정 | 핵심 근거 |
|---|---|---|
| 1. VARCHAR(32) 적정성 | PASS | 현재 최장 id 12자, 향후 32자 이내 충분 |
| 2. NULL 허용 및 기존 row 처리 | PASS | NULL 허용 전략 올바름, backfill은 NULL 유지 권장 |
| 3. 인덱스 전략 | PASS | 복합 인덱스가 단독 variant 필터도 커버, 현 규모에서 충분 |
| 4. down.sql 롤백 완전성 | WARN | 트랜잭션 래퍼(`BEGIN`/`COMMIT`) 부재, 부분 실패 시 불일치 위험 |
| 5. GORM 모델 대응 | FAIL | `Game`, `AICallLog` 구조체에 필드 미추가 — Sprint 7 실행 전 필수 수정 |
| 6. AutoMigrate vs Manual 전략 | PASS | 현재 전략 적절, 프로덕션 분리 옵션 선택사항 |

---

## 권장 수정 (Sprint 7 실행 담당자 전달)

### 필수 (FAIL 항목 해결)

**수정 1**: `src/game-server/internal/model/game.go` `Game` 구조체에 필드 추가

```go
// 기존 CreatedAt 필드 위에 추가
PromptVariantID *string `gorm:"column:prompt_variant_id;type:varchar(32)" json:"promptVariantId,omitempty"`
ShaperID        *string `gorm:"column:shaper_id;type:varchar(32)"        json:"shaperId,omitempty"`
```

**수정 2**: `src/game-server/internal/model/event.go` `AICallLog` 구조체에 필드 추가

```go
// 기존 CreatedAt 필드 위에 추가
PromptVariantID *string `gorm:"column:prompt_variant_id;type:varchar(32)" json:"promptVariantId,omitempty"`
ShaperID        *string `gorm:"column:shaper_id;type:varchar(32)"        json:"shaperId,omitempty"`
```

### 권장 (WARN 항목 개선, SQL 파일은 이미 확정됐으므로 실행 시 주의사항으로 처리)

down.sql 실행 시 수동으로 트랜잭션 내에서 실행할 것:

```bash
psql -c "BEGIN; \i 001_add_prompt_variant_and_shaper_id.down.sql; COMMIT;"
```

또는 다음 Sprint 에서 `001_add_...down.sql` 파일에 `BEGIN;` / `COMMIT;` 추가.

---

## 실행 계획 (Sprint 7 Week 1)

1. **사전 준비** (go-dev, Sprint 6 마감 전)
   - `Game` + `AICallLog` GORM 모델 필드 추가 (수정 1, 2)
   - 모델 수정에 따른 관련 테스트 업데이트 (Go 689개 PASS 유지)
   - `chore/day11-wrap-up` 브랜치 또는 별도 `feat/sprint7-db-migration` 브랜치에서 작업

2. **백업** (DevOps, Sprint 7 Day 1 오전)
   - `pg_dump -U rummikub rummikub > rummikub_pre_001_$(date +%Y%m%d).sql`
   - 백업 파일 로컬 + 별도 경로 이중 저장

3. **마이그레이션 적용** (DevOps, Sprint 7 Day 1 오전)
   - K8s 게임 서버 스케일 0 (진행 중 게임 없음 확인 후)
   - `psql -U rummikub rummikub -f src/game-server/migrations/001_add_prompt_variant_and_shaper_id.up.sql`
   - 검증 쿼리 실행 (up.sql:58~62 주석 해제 후 실행):
     ```sql
     SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_name IN ('games', 'ai_call_logs')
       AND column_name IN ('prompt_variant_id', 'shaper_id')
     ORDER BY table_name, column_name;
     ```
   - 4행 반환 확인 (games 2개 + ai_call_logs 2개)

4. **서버 재배포** (DevOps, Sprint 7 Day 1 오전)
   - GORM 모델 필드 추가가 포함된 게임 서버 이미지 빌드 + 배포
   - K8s 스케일 복원 (1 replicas)
   - 헬스체크: `curl http://game-server/health`

5. **롤백 리허설** (Sprint 7 Day 1 오후, 스테이징 환경)
   - 스테이징 DB 에 up.sql 적용 후 down.sql 실행
   - `BEGIN; \i down.sql; COMMIT;` 트랜잭션 래퍼 적용
   - down.sql:39~43 검증 쿼리로 0건 반환 확인

6. **롤백 기준** (프로덕션)
   - 서버 재배포 후 5분 내 헬스체크 실패 → 즉시 down.sql 실행 + 이전 이미지 복원
   - 마이그레이션 단독 실패(서버 기동 전) → down.sql 실행 후 원인 분석
