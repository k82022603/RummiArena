# game-server E2E 테스트

`src/game-server/e2e/` 는 `httptest.NewServer` + 인메모리 레포지터리로 외부 의존성 없이 돌아가는 통합 테스트 모음이다. PostgreSQL/Redis/AI adapter 를 실제 기동하지 않는다.

## 구성 파일

| 파일 | 범위 |
|------|------|
| `game_flow_test.go` | 공통 테스트 헬퍼(buildTestRouter, issueDevToken, doRequest, decodeJSON) + 전체 게임 흐름 시나리오 |
| `room_lifecycle_test.go` | FinishRoom 멱등성/NOT_FOUND/ListRooms 필터 시나리오 |
| `ws_multiplayer_test.go` | 2 Human 플레이어 WebSocket 게임 시나리오 |
| `rooms_persistence_test.go` | **D-03 Phase 1 Dual-Write 통합 검증** (mock PostgreSQL 호출 이력 assertion) |

## 실행

```bash
cd src/game-server
go test ./e2e/... -count=1 -timeout 90s        # 전체
go test ./e2e/... -run TestRoomsPersistence -v # Phase 1 Dual-Write 만
```

## D-03 rooms-persistence 검증 — 두 갈래

D-03 Phase 1 Dual-Write 는 **Go 통합 테스트** (off-box) + **bash 검증 스크립트** (in-cluster) 두 갈래로 검증한다. 범위가 겹치지 않는다.

### (1) Go 통합 테스트 — `rooms_persistence_test.go`

- **대상**: `service.RoomService` → mock `repository.GameRepository` 경로를 HTTP 경계를 거쳐 검증
- **전제**: DB/Redis/K8s 불필요, `go test` 만으로 실행
- **시나리오 3건**:
  1. `TestRoomsPersistence_FullFlow_HTTPBoundary` — Create → Join → Start → Finish 흐름에서 mock 호출 시퀀스가 [CreateRoom, UpdateRoom(WAITING), UpdateRoom(PLAYING), UpdateRoom(FINISHED)] 임을 확인
  2. `TestRoomsPersistence_GuestHost_HTTPSkipsDB` — 비-UUID 호스트는 FK 방어로 mock 호출 0건
  3. `TestRoomsPersistence_CreateRoomFailure_HTTPStillSucceeds` — mock 이 첫 CreateRoom 에서 error 반환해도 HTTP 201 + log.Printf 로 best-effort 실패 기록

### (2) bash 검증 스크립트 — `scripts/verify-rooms-persistence.sh`

실제 K8s 클러스터에 배포된 PostgreSQL 을 조회하여 ADR §"검증 계획" 의 SQL 4가지 + bonus stale 가드를 실행.

#### 사전 조건
1. `kubectl` 가 PATH 에 존재하고 대상 클러스터에 인증되어 있어야 한다
2. `namespace=rummikub` 에 `deploy/postgres` 와 `deploy/game-server` 가 모두 Running
3. game-server 이미지가 `feat/rooms-postgres-phase1-impl` 브랜치 기반 (main.go 에서 pgGameRepo 주입 + ws_handler persistGameResult 3-arg 마이그레이션 완료)
4. AI vs AI 1판 배치가 이미 실행 완료된 상태 (rooms/games 에 최소 1건의 row 가 있어야 의미 있음)

#### 실행
```bash
# 자동 선택 (최근 updated_at 기준 최근 방)
./scripts/verify-rooms-persistence.sh

# 특정 방 지정
./scripts/verify-rooms-persistence.sh --room-id 12345678-1234-4123-8123-1234567890ab

# 도움말
./scripts/verify-rooms-persistence.sh --help
```

#### 기대 출력 (PASS 케이스)
```
=== D-03 Phase 1 Dual-Write 배포 후 검증 ===
namespace=rummikub deploy=deploy/postgres user=rummikub db=rummikub

[1/5] rooms 테이블 INSERT 검증
  PASS — SELECT count(*) FROM rooms (1 >= 1)
  INFO — 자동 선택 room_id=...

[2/5] rooms.status=FINISHED 검증
  PASS — SELECT status FROM rooms WHERE id=$1 (=FINISHED)

[3/5] games.room_id NOT NULL 검증 (I-14 FK 정상화)
  games total=N, games with room_id=NULL: M
  PASS — SELECT count(*) FROM games WHERE room_id IS NULL AND recent (=0)

[4/5] rooms-games JOIN (FK 유효성)
  PASS — SELECT count(*) FROM rooms r JOIN games g ON g.room_id = r.id (1 >= 1)

[5/5] Bonus — stale 데이터 가드 (최근 10분 이내 방 >= 1)
  PASS — SELECT count(*) FROM rooms WHERE created_at > NOW()-INTERVAL '10 minutes' (1 >= 1)

========================================
  결과: PASS=5 / FAIL=0
========================================
```

#### 종료 코드
- `0` — 전체 PASS
- `1` — assertion FAIL 1건 이상
- `2` — 환경 오류(kubectl 없음, 클러스터 접근 불가, pg_isready 실패 등)

#### FAIL 시 점검 포인트
스크립트 자체가 종료 시 출력하지만 요약:
1. main.go 에 pgGameRepo 주입 확인 (`kubectl logs deploy/game-server | grep "rooms dual-write"`)
2. AI vs AI 배치가 실제 완료되었는지 확인
3. 호스트가 UUID 형식인지 확인 (게스트 non-UUID 는 DB 쓰기 스킵이 정상 동작)
4. persistGameResult 가 roomID 를 전달받는지 (I-14 wire 회귀 여부 확인)
5. rooms/games 테이블이 AutoMigrate 되었는지 확인

## 연관 문서

- ADR: `work_logs/decisions/2026-04-22-rooms-postgres-phase1.md`
- DB 설계: `docs/02-design/02-database-design.md` §2
- 통합 테스트 전략: `docs/04-testing/05-integration-test-plan-v2.md`
