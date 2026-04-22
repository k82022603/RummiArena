# 결정 로그 (Decision Record)

- **ID**: D-03
- **날짜**: 2026-04-22
- **상태**: 결정 (Proposed → Accepted by 애벌레, 2026-04-22 오후)
- **작성자**: Architect (Opus 4.7 xhigh)
- **연관 계획**: `/home/claude/.claude/plans/d-users-ktds-pictures-faststone-2026-04-indexed-flute.md` §"후속 조치 A" + §"후속 조치: rooms 테이블 상태 결정"
- **연관 이슈**: I-14 (게임 영속저장 0건), I-17 (rooms 전환 결정)
- **연관 PR**: 예정 PR #40 `feat/rooms-postgres-phase1-dual-write`, 기존 PR #38 (백엔드 P0 I-14/I-15)

## 제목

rooms 테이블 PostgreSQL 전환 Phase 1 — Dual-Write (메모리 정본 + PostgreSQL best-effort 사후 기록)

## 배경 (Context)

### 현재 상태

- `src/game-server/internal/model/room.go:59-61` 주석은 설계 의도를 명시한다:
  > "RoomState 인메모리 방 상태 (DB + 런타임 혼합) — Room 모델(model.Room)은 **GORM 영속 레이어용**이지만, **MVP 단계에서는 인메모리에 RoomState 하나로 모든 정보를 관리한다.**"
- `src/game-server/internal/repository/postgres_repo.go:73-101` — `postgresGameRepo.CreateRoom/GetRoom/UpdateRoom/ListRooms` **이미 구현 완료**. 단, `cmd/server/main.go:103` 에서 DI 에 주입되지 않았다.
- `src/game-server/internal/repository/memory_repo.go:13-22` — `MemoryRoomRepository` 만 `NewRoomService` 에 전달되고 있다.
- DB: `rooms` 테이블은 GORM AutoMigrate 로 **이미 존재** (`model/game.go:62-78` `type Room struct`). 실측 count=0.
- `model.Game.RoomID` 는 `*string` nullable. FK 는 `games.room_id → rooms.id` 로 설정되어 있다.

### 문제: I-14 PR #38 의 우회

PR #38 (I-14 게임 영속저장) 에서 `persistGameResult` 가 games 테이블에 INSERT 할 때 **`RoomID` 를 nil 로 설정**했다. 이유: rooms 테이블에 실제 row 가 존재하지 않으므로 FK 위반을 피해야 했다. 그 결과:

- `games.room_id` NULL — 분석 시 게임 ↔ 방 연결 불가
- `games.room_code` NOT NULL 제약 충족을 위해 빈 문자열 `""` 저장 (비정상)
- admin 대시보드에서 "현재 진행 중인 게임" 과 "해당 방 호스트" 의 JOIN 질의 불가

### 왜 지금 전환하는가

1. **실험 플랫폼의 데이터 진실성** — RummiArena 는 LLM 전략 비교·분석 플랫폼. 게임과 방의 관계가 DB 에 기록되지 않으면 사후 분석이 불가능. I-14 는 이미 착수되었으므로 rooms 도 같은 단계에서 정합성 회복.
2. **Stateless 원칙과 충돌 없음** — CLAUDE.md §3 "Stateless 서버: 모든 **게임 상태**는 Redis에 저장" 은 **게임 플레이 런타임 상태**에 한정된다. 방 메타데이터 (호스트, 정원, 생성 시각, 최종 상태) 는 `game_players` 테이블과 동일하게 영속이 자연스럽다.
3. **Pod 재시작 내성** — 현재 `MemoryRoomRepo` 단독 시 Pod 재시작 → 진행 중인 방 전부 유실. Phase 2 에서 rooms 테이블에서 복구 경로를 만들 때 Phase 1 Dual-Write 가 전제조건.
4. **이미 구현된 코드의 활성화** — `PostgresGameRepo.{CreateRoom,GetRoom,UpdateRoom,ListRooms}` 이 작성되어 있고 단위 테스트도 존재. DI 한 줄을 연결하면 되므로 비용 대비 효과가 높다.

## 선택지

| 옵션 | 내용 | 장점 | 단점 |
|------|------|------|------|
| **A. 현상 유지 (MVP 의도 존중)** | DI 안 함. PR #38 의 `RoomID=nil` TODO 를 Sprint 7 Week 2+ 로 연기 | 변경 0, 리스크 0 | 데이터 진실성 부재 지속. 실험 플랫폼 가치 훼손. admin 대시보드 JOIN 불가 |
| **B. MVP → production 전환 (Phase 1 Dual-Write)** ← **채택** | 메모리 정본 유지, PostgreSQL 은 best-effort 사후 기록. `NewRoomService` 시그니처 확장 | Stateless 원칙 충실, I-14 FK 정상화, Phase 2 전제조건 확보, 코드 이미 존재 | RoomService 시그니처 변경 → 테스트 호출부 16곳 수정. best-effort 실패 시 메모리-DB 불일치 가능 (허용 리스크) |
| **C. 불필요로 판정 후 제거** | `model.Room`, `PostgresGameRepo.CreateRoom/*`, rooms 테이블 전부 삭제 | dead code 청소 | 설계자의 "미래 전환" 의도 소멸. 실험 데이터 영속화 경로 자체가 사라짐 |
| **B'. Postgres-Primary 전면 전환 (Phase 2 직행)** | 메모리 폐기, Redis 경유 read-through cache only | 단일 진실 소스 | 리스크 크다 (Pod 재시작 복구 로직 + 동시성 제어). Phase 1 검증 없이 진행 시 프로덕션 위험 |

## 결정

**옵션 B 채택** — Phase 1 Dual-Write 를 이번 Sprint 에 구현한다. Phase 2 (Postgres-Primary) 는 Sprint 이관.

### Dual-Write 핵심 설계 원칙

1. **메모리가 정본 (source of truth)** — 모든 조회 (`GetRoom`, `ListRooms`, `JoinRoom` 등) 는 `MemoryRoomRepo` 에서만 읽는다. Phase 1 에서 PostgreSQL 은 **조회 경로에 개입하지 않는다**.
2. **PostgreSQL 은 best-effort 사후 기록** — 메모리 저장 성공 후 비동기/인라인으로 DB 쓰기 시도. 실패 시 `log.Error` + continue. 게임 진행을 절대 차단하지 않는다.
3. **트랜잭션 경계는 per-method** — Phase 1 은 다단계 트랜잭션을 도입하지 않는다 (CreateRoom + StartGame 을 하나의 트랜잭션으로 묶지 않음). Phase 2 에서 도입 검토.
4. **nil 허용 DI** — `gameRepo == nil` 이면 Dual-Write 자동 스킵. 테스트/개발 환경 (DB 미연결) 에서 기존 동작 유지.

## 근거

1. **리스크 분리**: Phase 1 은 "쓰기만 추가" 하고 "읽기는 건드리지 않는다". 읽기 경로 리스크 = 0. 쓰기 실패 시에도 게임은 계속 진행되므로 프로덕션 사고 가능성 최소.
2. **테스트 친화**: `nil` 전달로 기존 16개 호출부의 동작을 완전 보존. 신규 시그니처는 추가 파라미터만 받는 순수 확장 (하위 호환).
3. **I-14 정합성 복구**: PR #38 의 `RoomID=nil` 우회를 이번 기회에 해소. `persistGameResult` 가 실제 `rooms.id` 를 참조하도록 동시 수정.
4. **Phase 2 로드맵의 전제조건**: Postgres-Primary 전환 시 "rooms 테이블이 실시간으로 작성되고 있다" 가 전제. Phase 1 을 통해 검증된 상태에서 Phase 2 로 진입하는 것이 안전.
5. **CLAUDE.md §6 인증/프로필 분리 원칙과 합치**: rooms 의 host 관계 역시 user_id 참조만 가진다 (프로필 덮어쓰기 없음).
6. **옵션 C (제거) 기각 근거**: 이미 테스트와 스키마가 존재. 제거는 설계 자산 손실이며, 실험 플랫폼의 사후 분석 기능 자체를 포기하는 것.

## 설계 (Implementation Design)

### 1. RoomService 시그니처 변경

```go
// src/game-server/internal/service/room_service.go

// AS-IS
func NewRoomService(
    roomRepo repository.MemoryRoomRepository,
    gameRepo repository.MemoryGameStateRepository,
) RoomService { ... }

// TO-BE
func NewRoomService(
    roomRepo repository.MemoryRoomRepository,
    gameStateRepo repository.MemoryGameStateRepository,
    pgGameRepo repository.GameRepository, // nil 허용
) RoomService { ... }
```

**내부 struct**:

```go
type roomService struct {
    roomRepo   repository.MemoryRoomRepository
    gameRepo   repository.MemoryGameStateRepository
    pgGameRepo repository.GameRepository // nil 가능
    gameState  *gameService
    cooldown   CooldownChecker
}
```

**네이밍 주의**: 기존 `gameRepo` 필드는 `MemoryGameStateRepository` 용어이고, 신규 `pgGameRepo` 는 `repository.GameRepository` (PostgreSQL) 이다. 혼동을 피하기 위해 기존 `gameRepo` 를 `gameStateRepo` 로 리네임 권장 (go-dev 구현 시 별건 refactor 로 판단).

### 2. Conversion layer

**파일**: `src/game-server/internal/service/room_converter.go` (신규)

```go
package service

import (
    "github.com/k82022603/RummiArena/game-server/internal/model"
)

// roomStateToModel RoomState(인메모리) → model.Room(GORM 영속) 변환.
// Phase 1 은 Players/SeatStatus 를 저장하지 않는다 (스키마 확장 없음).
// Phase 2 에서 JSONB 컬럼으로 Players snapshot 추가 검토.
func roomStateToModel(state *model.RoomState) *model.Room {
    return &model.Room{
        ID:          state.ID,
        RoomCode:    state.RoomCode,
        Name:        state.Name,
        HostUserID:  state.HostID,
        MaxPlayers:  state.MaxPlayers,
        TurnTimeout: state.TurnTimeoutSec,
        Status:      state.Status,
        GameID:      state.GameID,
        CreatedAt:   state.CreatedAt,
        UpdatedAt:   state.UpdatedAt,
    }
}
```

**필드 매핑 표**:

| RoomState 필드 | model.Room 필드 | 비고 |
|----------------|-----------------|------|
| `ID` (string) | `ID` (uuid) | 직접 매핑 |
| `RoomCode` | `RoomCode` | 직접 매핑, UNIQUE INDEX |
| `Name` | `Name` | 직접 매핑 |
| `HostID` | `HostUserID` | **필드명 다름** 주의 |
| `Status` (RoomStatus) | `Status` | 직접 매핑 |
| `MaxPlayers` | `MaxPlayers` | 직접 매핑 |
| `TurnTimeoutSec` | `TurnTimeout` | **필드명 다름** 주의 |
| `GameID` (*string) | `GameID` (*string) | 직접 매핑 |
| `CreatedAt` | `CreatedAt` | 직접 매핑 |
| `UpdatedAt` | `UpdatedAt` | 직접 매핑 |
| `Players []RoomPlayer` | — | **Phase 1 미매핑** (Phase 2 JSONB 검토) |

**FK 주의**: `model.Room.HostUserID` 는 `users.id` 를 참조한다. 게스트 사용자 (`qa-테스터-xxx` 등 non-UUID) 가 CreateRoom 을 호출하면 FK 위반. 해결:
- (A) `hostUserId` 가 유효 UUID 가 아니면 `roomStateToModel` 이 `nil` 반환 → DB 쓰기 스킵 (best-effort 원칙 적용)
- (B) `users.id` FK 를 nullable 로 바꾸는 건 별건 스키마 변경

**go-dev 에 권장**: 옵션 (A) 채택. `isValidUUID(state.HostID)` 로 선판단. `persistGameResult` 와 동일한 처리 패턴 (`model/handler/ws_handler.go:1979-1985`).

### 3. Mutation 포인트별 DB 액션 정의

| Method | 메모리 액션 | DB 액션 | 조건부 스킵 |
|--------|-------------|---------|-------------|
| `CreateRoom` | `roomRepo.SaveRoom(room)` | `pgGameRepo.CreateRoom(ctx, roomStateToModel(room))` | HostUserID 비-UUID → 스킵 |
| `JoinRoom` | `roomRepo.SaveRoom(room)` | `pgGameRepo.UpdateRoom(ctx, roomStateToModel(room))` | 메모리 INSERT 스킵된 room → UPDATE 도 no-row 에러 → log.Warn |
| `LeaveRoom` | `roomRepo.SaveRoom(room)` | `pgGameRepo.UpdateRoom(ctx, roomStateToModel(room))` | 호스트 퇴장 시 Status=CANCELLED 도 같은 UPDATE 로 반영 |
| `SetReady` | *현재 RoomService 미구현* | — | — |
| `StartGame` | `roomRepo.SaveRoom(room)` (Status=PLAYING, GameID 설정) | `pgGameRepo.UpdateRoom(ctx, roomStateToModel(room))` | — |
| `FinishRoom` | `roomRepo.SaveRoom(room)` (Status=FINISHED) | `pgGameRepo.UpdateRoom(ctx, roomStateToModel(room))` | — |
| `DeleteRoom` | `roomRepo.DeleteRoom(id)` | **Phase 1 범위 밖** — GORM soft-delete (`DeletedAt`) 는 Phase 2. 현재는 UPDATE Status=CANCELLED 로 유지 | — |
| `ClearActiveRoomForUser` | 메모리 매핑 제거만 | DB 쓰기 없음 (user-room 매핑은 DB 스키마에 없음) | — |

**`SetReady` 는 인터페이스에 선언만 있고 아직 구현되지 않았다** (`room_service.go` 에 실제 메서드 없음). Phase 1 에서 신설하지 않는다.

### 4. best-effort 에러 처리

```go
// CreateRoom 말미 예시
if err := s.roomRepo.SaveRoom(room); err != nil {
    return nil, fmt.Errorf("room_service: save room: %w", err)
}

// best-effort DB 쓰기 — 실패해도 요청은 성공
if s.pgGameRepo != nil {
    if dbRoom := roomStateToModel(room); dbRoom != nil {
        ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
        defer cancel()
        if err := s.pgGameRepo.CreateRoom(ctx, dbRoom); err != nil {
            // log.Error 만, 에러 반환 금지
            log.Printf("room_service: postgres create room best-effort failed: %v", err)
        }
    }
}
```

**로깅**: go-dev 구현 시 패키지 로거 주입 여부 판단. 현재 `RoomService` 는 logger 필드가 없으므로, 최소 변경으로 `log.Printf` 사용 권장. zap logger 주입은 별건 refactor.

**타임아웃**: 3초 (게임 진행 체감 영향 최소화). DB slow 발생 시에도 3초 뒤 포기하고 메모리 성공 반환.

### 5. Transaction boundary

**Phase 1 범위**: per-method 단일 statement only.
- `CreateRoom` 은 rooms INSERT 1건만
- `StartGame` 은 rooms UPDATE 1건만 (games INSERT 는 Phase 2 범위에서 같이 추가 검토)
- 다단계 트랜잭션 (rooms + games 동시 INSERT) 은 도입하지 않음 — 이는 Phase 2 의 명시적 스코프

**근거**: Phase 1 목적은 "쓰기 경로 존재성 검증". 정합성 강화는 Phase 2.

### 6. FK 정상화: `persistGameResult` 수정 (I-14 wire)

**파일**: `src/game-server/internal/handler/ws_handler.go:1944-1972`

현재:
```go
game := &model.Game{
    ID:          state.GameID,
    Status:      model.GameStatusFinished,
    // RoomID: nil,  // FK 우회
    // RoomCode: "",
    ...
}
```

Phase 1 이후:
```go
// WS 연결 context 로부터 conn.roomID 획득 (이미 존재하는 필드)
// persistGameResult 시그니처에 roomID 추가 필요
game := &model.Game{
    ID:          state.GameID,
    RoomID:      &roomID,           // rooms 테이블에 row 존재 → FK 유효
    RoomCode:    room.RoomCode,     // roomSvc.GetRoom(roomID) 으로 조회
    ...
}
```

**시그니처 변경**:
```go
// AS-IS
func (h *WSHandler) persistGameResult(state *model.GameStateRedis, endType string)

// TO-BE
func (h *WSHandler) persistGameResult(state *model.GameStateRedis, endType string, roomID string)
```

**호출부 4곳** (`ws_handler.go:864, 1626, 2271` + `ws_persist_test.go` 7곳):
- 3곳 모두 `conn.roomID` 를 이미 보유 → `conn.roomID` 전달
- 테스트 파일 7곳: `""` 혹은 테스트 전용 UUID 전달

**RoomCode 조회**: `room, _ := h.roomSvc.GetRoom(roomID)` 로 획득 후 `room.RoomCode` 사용. 조회 실패 시 fallback 으로 `""` (현재 동작 유지).

### 7. main.go DI 변경

**파일**: `src/game-server/cmd/server/main.go:103`

```go
// AS-IS
roomSvc := service.NewRoomService(roomRepo, gameStateRepo)

// TO-BE
var pgGameRepo repository.GameRepository // nil
if db != nil {
    pgGameRepo = repository.NewPostgresGameRepo(db)
}
roomSvc := service.NewRoomService(roomRepo, gameStateRepo, pgGameRepo)
```

**기존 로직 보존**: 파일 148번 라인 전후에 `if db != nil` 블록이 이미 있다 (`practiceRepo`, `rankingRepo`, `adminRepo` 초기화). 같은 패턴으로 `pgGameRepo` 도 배치하는 것이 자연스럽다. 단 WSHandler 가 이미 pgGameRepo 를 참조하고 있을 가능성이 있으므로 go-dev 가 중복 생성 회피 여부 확인 필요.

## 시그니처 변경 마이그레이션 전략

`NewRoomService(` 호출부 전수 조사 결과 **총 16곳**.

### main.go (1곳)
- `src/game-server/cmd/server/main.go:103` → `pgGameRepo` 실제 주입

### e2e tests (6곳)
- `src/game-server/e2e/room_lifecycle_test.go:55, 84, 112, 145, 163`
- `src/game-server/e2e/game_flow_test.go:47`

### integration tests (7곳)
- `src/game-server/internal/handler/timeout_cleanup_integration_test.go:38`
- `src/game-server/internal/handler/ws_cleanup_test.go:29`
- `src/game-server/internal/handler/ws_handler_ai_test.go:46`
- `src/game-server/internal/handler/ws_ai_timer_test.go:57` (구조체 리터럴 필드)
- `src/game-server/internal/handler/ws_game_start_test.go:26, 125, 178, 251`
- `src/game-server/internal/handler/ws_persist_test.go:94`

### unit tests (2곳)
- `src/game-server/internal/service/room_service_test.go:16, 320`

**마이그레이션 액션**:
1. 테스트/e2e 15곳 → 3번째 인자 `nil` 추가 (DB 없이 돌아가던 테스트는 기존 동작 그대로)
2. main.go 1곳 → 실제 `pgGameRepo` 주입
3. `room_service_test.go` 에 **신규 테스트 5건** 추가 (mock `GameRepository` 사용)

**IDE 자동화 권장**: `gopls rename` 혹은 `ast-grep` 으로 일괄 처리. 수동 변경 시 `go build ./...` + `go vet ./...` 로 누락 방지.

## 검증 계획 (Verification)

### Unit Tests (go-dev 담당)

**파일**: `src/game-server/internal/service/room_service_test.go` (추가)

```go
// Mock GameRepository
type mockGameRepo struct {
    CreateRoomCalls []*model.Room
    UpdateRoomCalls []*model.Room
    FailNext        bool
}

func (m *mockGameRepo) CreateRoom(ctx context.Context, room *model.Room) error {
    if m.FailNext {
        m.FailNext = false
        return errors.New("simulated postgres failure")
    }
    m.CreateRoomCalls = append(m.CreateRoomCalls, room)
    return nil
}
// ...
```

신규 테스트 5건:
1. `TestRoomService_CreateRoom_WritesToPostgres` — CreateRoom 후 `mock.CreateRoomCalls` 길이 1 + 필드 매핑 검증 (HostID→HostUserID, TurnTimeoutSec→TurnTimeout)
2. `TestRoomService_StartGame_UpdatesRoomStatusPlaying` — StartGame 후 mock UpdateRoom 수신 + Status=PLAYING + GameID 설정됨
3. `TestRoomService_FinishRoom_UpdatesRoomStatusFinished` — FinishRoom 후 mock UpdateRoom + Status=FINISHED
4. `TestRoomService_DualWrite_PostgresFailure_MemoryStillSucceeds` — mock.FailNext=true 설정 후 CreateRoom → 반환값 성공 + 메모리 조회 성공 + 에러 로그 존재
5. `TestRoomService_PgGameRepoNil_SkipsDualWrite` — `NewRoomService(roomRepo, gameStateRepo, nil)` → CreateRoom 성공 (기존 테스트와 동일 동작 보장)

### Integration Test (qa 담당)

**파일**: `src/frontend/e2e/rooms-persistence.spec.ts` (신규) 또는 bash 스크립트

AI vs AI 1판 대전 후 PostgreSQL 검증:
```sql
-- 1. rooms 테이블에 row 최소 1건
SELECT count(*) FROM rooms;  -- >= 1

-- 2. 해당 방의 status 가 FINISHED
SELECT status FROM rooms WHERE id = '<room_id>';  -- 'FINISHED'

-- 3. games.room_id 가 실제 rooms.id 참조
SELECT g.id, g.room_id, r.id AS rid FROM games g
JOIN rooms r ON g.room_id = r.id;  -- row 반환

-- 4. games.room_code 가 빈 문자열 아님
SELECT room_code FROM games WHERE id = '<game_id>';  -- not ''
```

### Best-effort Failure Test (go-dev 담당)

- PostgreSQL 재현 방식: mock repository 가 error 반환
- 실환경 재현 (옵션): PG 컨테이너 중지 → CreateRoom 호출 → 메모리 성공 확인 → log.Error 출력 확인 → 게임 플레이 정상 진행

### Pre-Merge 체크리스트 (devops 담당)

1. `cd src/game-server && go test ./... -count=1 -race` → 전수 PASS (기존 689 + 신규 5 = 694)
2. `go build ./...` → 컴파일 에러 0
3. `go vet ./...` → 경고 0
4. 로컬 K8s 재배포 → rooms 테이블 row 실측
5. AI vs AI 1판 smoke → 위 SQL 검증 4건 전부 PASS
6. Rollback 드라이런: `main.go:103` 3번째 인자만 `nil` 로 바꾸면 Phase 1 이전 동작으로 즉시 복귀 확인

## 롤백 계획 (Rollback Plan)

**목표**: 프로덕션 이슈 발생 시 코드 1줄 변경으로 즉시 Phase 1 비활성화.

### 즉시 롤백 (1분)
```go
// src/game-server/cmd/server/main.go:103
roomSvc := service.NewRoomService(roomRepo, gameStateRepo, nil) // pgGameRepo → nil
```

이 한 줄로 dual-write 가 즉시 비활성화된다. `pgGameRepo == nil` 분기가 DB 쓰기를 스킵한다. 재빌드/재배포만 필요.

### DB 마이그레이션 롤백 불필요
- rooms 테이블은 이미 AutoMigrate 로 존재 (전환 전에도 존재했음)
- Phase 1 은 스키마 변경 없음 → `*.down.sql` 없음
- 이미 쓰인 row 는 그대로 두어도 무해 (읽기 경로가 없으므로 아무도 안 읽음)

### 부분 롤백 (persistGameResult 만)
I-14 FK 정상화 부분만 문제가 있을 경우:
```go
// ws_handler.go:1954 (persistGameResult)
game := &model.Game{
    ID:       state.GameID,
    RoomID:   nil,    // 임시로 nil 복구
    RoomCode: "",
    ...
}
```

## 영향 범위

### 코드 변경 파일
- `src/game-server/internal/service/room_service.go` — NewRoomService 시그니처, struct 필드, CreateRoom/JoinRoom/LeaveRoom/StartGame/FinishRoom 에 best-effort DB 쓰기 추가
- `src/game-server/internal/service/room_converter.go` — 신규 (roomStateToModel)
- `src/game-server/internal/service/room_service_test.go` — 호출부 2곳 + 신규 테스트 5건
- `src/game-server/cmd/server/main.go` — pgGameRepo 주입
- `src/game-server/internal/handler/ws_handler.go` — persistGameResult 에 roomID 파라미터 추가, game.RoomID/RoomCode 실제 값 설정
- `src/game-server/internal/handler/ws_persist_test.go` — persistGameResult 호출부 7곳
- `src/game-server/internal/handler/ws_*_test.go` — NewRoomService 호출부 7곳
- `src/game-server/e2e/room_lifecycle_test.go` + `game_flow_test.go` — 6곳

**총**: 프로덕션 3개 파일 + 테스트 7개 파일 = 10개 파일

### DB 스키마 영향
- **없음**. rooms 테이블은 AutoMigrate 로 이미 존재. 마이그레이션 신규 작성 불필요.
- `rooms.host_user_id → users.id` FK 제약은 유지. 게스트 사용자 (non-UUID) 에 대한 스킵 처리로 우회.

### 관측성/모니터링
- 신규 로그: `room_service: postgres create room best-effort failed: ...` / `... update room best-effort failed: ...`
- 운영 대시보드에 rooms 테이블 row 증가 지표 추가 권장 (devops Sprint 7 Week 2)

### 성능 영향
- 각 mutation 에 DB 쓰기 1건 추가 (3초 타임아웃). 최악 3초 지연되지만 best-effort 이므로 타임아웃 후 성공 처리.
- 일반 케이스: 로컬 K8s 기준 <10ms. 사용자 체감 영향 거의 없음.

### 보안 영향
- 신규 공격 표면 없음. 기존 `MemoryRoomRepo` 와 동일한 입력 검증 통과 후에만 DB 쓰기 시도.
- CLAUDE.md §6 (인증/프로필 분리) 원칙 준수 — host 정보는 UserID 참조만 저장, DisplayName 은 rooms 스키마에 없음.

## Phase 2 범위 (명시적 제외)

이 ADR 범위 밖. 후속 Decision Log 에서 다룸.

- Pod 재시작 시 rooms 테이블에서 active 방 (WAITING/PLAYING) 복구 경로
- 메모리 → Postgres-Primary 역전환 (Redis/메모리는 read-through cache)
- Players/SeatStatus JSONB 컬럼 추가 (스키마 변경)
- 다단계 트랜잭션 (CreateRoom + StartGame 원자성 보장)
- 정합성 복구 로직 (메모리-DB drift 감지 시 재동기화)

## 후속 과제

- [ ] **go-dev + qa 병렬 착수** (이 ADR 승인 직후)
- [ ] **pm**: I-17 GitHub Issue 상태 "Decided" 로 업데이트, PR #38 description 수정
- [ ] **devops**: 로컬 K8s 재배포 + DB smoke 검증
- [ ] Phase 2 Kick-off 시점 결정 (Sprint 8 또는 이후)
- [ ] `docs/02-design/02-database-design.md` §2 에 rooms 테이블 정식 추가 (MVP 꼬리표 제거)
- [ ] `docs/02-design/31-game-rule-traceability.md` 에 rooms-games FK 관계 반영

## 참고 문헌

- CLAUDE.md §3 (Stateless 서버), §6 (인증/프로필 분리)
- `docs/02-design/02-database-design.md` §2 (게임 관련 테이블 설계)
- `docs/02-design/28-istio-selective-mesh-design.md` (Phase 분리 원칙의 선례)
- `work_logs/decisions/D01-wslconfig-memory.md`, `D02-v2-prompt-common-standard.md` (D-NN 포맷 선례)
- `work_logs/decisions/2026-04-19-task20-task21-roadmap.md` (Phase 분리 작업 흐름의 선례)
