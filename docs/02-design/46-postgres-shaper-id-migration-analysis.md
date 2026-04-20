# 46. PostgreSQL shaper_id + prompt_variant_id 마이그레이션 분석

- 작성일: 2026-04-20 (Sprint 6 Day 10)
- 작성자: go-dev
- 상태: 초안 (Sprint 7 Week 1 실행 전 DevOps 검토 필요)
- 연관 ADR: ADR-042 (prompt-variant-standard), ADR-044 (context-shaper-v6-architecture)
- 마이그 파일: `src/game-server/migrations/001_add_prompt_variant_and_shaper_id.up.sql`
- 롤백 파일: `src/game-server/migrations/001_add_prompt_variant_and_shaper_id.down.sql`

---

## 1. 현재 모델 구조 (영향 분석 대상)

| Struct | 파일 | 테이블명 | 핵심 컬럼 |
|---|---|---|---|
| `model.Game` | `internal/model/game.go` | `games` | id(uuid PK), room_code, status, turn_count, settings(jsonb), winner_id |
| `model.GamePlayer` | `internal/model/player.go` | `game_players` | id, game_id, player_type, ai_model, ai_persona, ai_difficulty |
| `model.AICallLog` | `internal/model/event.go` | `ai_call_logs` | id, game_id, player_id, turn_number, prompt_tokens, latency_ms, retry_count |
| `model.GameEvent` | `internal/model/event.go` | `game_events` | id, game_id, event_type, payload(jsonb) |

**타깃**: `games` (게임 단위 추적) + `ai_call_logs` (턴 단위 추적 보조).  
`game_players`와 `game_events`는 이번 마이그에서 제외 — variant/shaper 는 게임 설정 수준이지 플레이어/이벤트 수준이 아님.

---

## 2. 추가 컬럼 정의

### 2.1 games 테이블

```sql
prompt_variant_id VARCHAR(32) NULL   -- 예: 'v2', 'v3', 'v4', 'v2-zh'
shaper_id         VARCHAR(32) NULL   -- 예: 'passthrough', 'joker_hinter', 'pair_warmup'
```

- 양쪽 모두 NULL 허용 → 마이그 전 기존 행 손실 없음.
- Sprint 7 이후 신규 게임 생성 시 service 레이어에서 명시적으로 설정.
- 복합 인덱스 `idx_games_variant_shaper(prompt_variant_id, shaper_id)` 추가.

### 2.2 ai_call_logs 테이블

```sql
prompt_variant_id VARCHAR(32) NULL
shaper_id         VARCHAR(32) NULL
```

- `games.shaper_id` 와 동일 값을 턴 단위로 복사 저장.
- "어느 턴에 shaper 힌트가 실제로 효과를 냈는지" 세밀 분석 가능.
- Node Dev 가 `MoveResponse.metadata` 에 `shaperUsed` 필드를 추가하는 시점에 game-server 가 이 컬럼에 기록한다(§3 인터페이스 가설 참조).

---

## 3. GORM 모델 수정 범위 (Sprint 7 구현 대상)

### 3.1 model.Game 추가 필드

```go
// internal/model/game.go — Game struct 에 추가
PromptVariantID *string `gorm:"column:prompt_variant_id;type:varchar(32)" json:"promptVariantId,omitempty"`
ShaperID        *string `gorm:"column:shaper_id;type:varchar(32)"         json:"shaperId,omitempty"`
```

포인터 타입(`*string`)을 사용해 NULL 을 명시적으로 표현한다. 빈 문자열과 NULL 을 구분해야 분석 쿼리에서 "미설정"과 "passthrough 명시" 를 구별할 수 있다.

### 3.2 model.AICallLog 추가 필드

```go
// internal/model/event.go — AICallLog struct 에 추가
PromptVariantID *string `gorm:"column:prompt_variant_id;type:varchar(32)" json:"promptVariantId,omitempty"`
ShaperID        *string `gorm:"column:shaper_id;type:varchar(32)"         json:"shaperId,omitempty"`
```

### 3.3 영향 받는 함수 목록

| 계층 | 함수/메서드 | 수정 내용 |
|---|---|---|
| `service/game_service.go` | `StartGame()` (line ~170, `GameStateRedis` 초기화 구간) | 게임 생성 시 룸 설정에서 `PromptVariantID`, `ShaperID` 를 읽어 `model.Game` 에 주입 |
| `repository/postgres_repo.go` | `CreateGame()` | `gorm:"column:..."` tag 로 자동 처리 — 코드 수정 불필요 |
| `repository/postgres_repo.go` | `UpdateGame()` | `db.Save()` 사용 중이므로 자동 처리 — 코드 수정 불필요 |
| `handler/ws_handler.go` | `processAIPlace()` (line ~1016) | `MoveResponse.Metadata` 에서 `ShaperUsed` 를 읽어 `AICallLog` 에 기록 |
| `infra/database.go` | `AutoMigrate()` | 개발 환경용 — GORM tag 로 자동 컬럼 추가. 프로덕션은 SQL 파일 사용 |

---

## 4. AI Adapter 인터페이스 가설 (Sprint 7 통합 전 가정)

현재 `client.MoveMetadata` (내부 file: `internal/client/ai_client.go`, line 95~103) 에는 `ShaperUsed` 필드가 없다. Node Dev 는 Day 11~12 에 다음 변경을 검토 중이다.

**가정 A — MoveResponse.metadata 확장**:

```go
// 가정: Node Dev 가 추가하는 필드
type MoveMetadata struct {
    // 기존 필드 유지
    ModelType        string `json:"modelType"`
    PromptVariantID  string `json:"promptVariantId,omitempty"` // 추가 예정
    ShaperID         string `json:"shaperId,omitempty"`         // 추가 예정
    // ...
}
```

**game-server 처리 흐름 (가정 기반)**:

```
ai-adapter POST /move 응답
  └─ MoveResponse.Metadata.ShaperID
       └─ ws_handler.processAIPlace()
            ├─ AICallLog.ShaperID = resp.Metadata.ShaperID    (턴 단위)
            └─ game.ShaperID (게임 시작 시 1회 설정, 턴마다 재설정 X)
```

**인터페이스 계약 전제**: ai-adapter 가 `shaperUsed`를 응답에 포함하지 않으면 game-server 는 게임 설정 시점의 값을 그대로 사용한다. 두 값이 다를 경우(멀티 플레이어 게임에서 플레이어마다 다른 shaper) `ai_call_logs.shaper_id` 가 실제 적용 값, `games.shaper_id` 는 기본값을 뜻한다.

**Day 12 검토 항목**: Node Dev 분석 메모와 `MoveMetadata` 확장 범위 정렬.

---

## 5. 마이그 실행 시점 및 절차 (권장)

### 5.1 실행 시점: Sprint 7 Week 1 (2026-04-28~)

**근거**:
1. Sprint 6 는 Day 11~14 에 PR 4/5 마감 + Istio 검증이 집중되어 있어 DB 스키마 변경 리스크를 피한다.
2. Node Dev 의 `MoveResponse` 확장 작업(가정 A)과 동시 릴리즈해야 end-to-end 추적이 가능하다. 스키마만 먼저 배포하면 컬럼은 존재하지만 모두 NULL 인 채로 남는다 — 허용되는 상태.
3. K8s ConfigMap 에 `SHAPER_ID_ENABLED=true` 피처 플래그를 추가해 점진적 활성화 가능.

### 5.2 실행 절차

```
1. pg_dump rummikub > backup_pre_migration_$(date +%Y%m%d).sql
2. psql rummikub < src/game-server/migrations/001_add_prompt_variant_and_shaper_id.up.sql
3. 검증 쿼리 실행 (up.sql 하단 주석 참조)
4. game-server 재배포 (GORM AutoMigrate 는 개발 환경 전용 — 프로덕션은 SQL 파일 우선)
```

---

## 6. Rollback 시나리오

### 6.1 down.sql 검증 절차

```
1. (스테이징 환경에서 먼저 실행)
   psql rummikub_staging < migrations/001_add_prompt_variant_and_shaper_id.down.sql
2. 검증 쿼리로 컬럼 미존재 확인 (down.sql 하단 주석 참조)
3. 프로덕션 적용 — games/ai_call_logs 에서 shaper_id, prompt_variant_id 컬럼이 제거됨
```

### 6.2 롤백 안전성

- `DROP COLUMN IF EXISTS` 사용으로 컬럼이 없는 상태에서 실행해도 에러 없음.
- `DROP INDEX IF EXISTS` 순서가 `DROP COLUMN` 보다 선행 — PostgreSQL 은 컬럼 삭제 시 의존 인덱스를 자동 삭제하나, 명시적 순서 보장으로 멱등성 확보.
- 롤백 후 기존 게임 데이터는 유지됨(NULL 컬럼 추가만 했으므로 DOWN 시 데이터 손실은 해당 컬럼 값만).

---

## 7. 미결 사항 (Day 12 검토)

| # | 항목 | 담당 | 기한 |
|---|---|---|---|
| M-1 | `MoveResponse.metadata` 에 `shaperUsed` 필드 추가 범위 확정 | Node Dev | Day 12 |
| M-2 | `GamePlayer` 단위 shaper_id 필요 여부 (멀티 플레이어 시나리오) | architect | Sprint 7 |
| M-3 | `SHAPER_ID_ENABLED` 피처 플래그 ConfigMap 반영 | DevOps | Sprint 7 Week 1 |
| M-4 | PostgreSQL `CHECK CONSTRAINT` 추가 여부 (허용 값 제한) | go-dev | Sprint 7 |

> M-4 예시: `ADD CONSTRAINT chk_shaper_id CHECK (shaper_id IN ('passthrough', 'joker_hinter', 'pair_warmup'))` — 런타임 입력 오류 차단. 단, 새 shaper 추가 시 마이그가 추가로 필요해지므로 Sprint 7 에서 결정.
