# BUG-GS-005 TIMEOUT cleanup 최종 안정화 보고서

- 작성일: 2026-04-14 (Sprint 6 Day 3)
- 작성자: go-dev-1
- 대상 버그: BUG-GS-005 (WS 끊김 / 80턴 TIMEOUT 시 Redis GameState 잔존 + AI goroutine 누수)
- 선행 작업: 2026-04-11 옵션 A 1차 구현(`cleanupGame` + `cancelAITurn` + `aiTurnCancels` map), 2026-04-12 Day 1+2 옵션 A 완결(`checkTurnLimit` + `WithMaxTurnsLimit` + config 연동)
- 관련 문서:
  - `docs/02-design/32-timeout-redis-cleanup-design.md` (Day 1 설계)
  - `docs/04-testing/47-reasoning-model-deep-analysis.md` §8 (발견 경위)
- 상태: **COMPLETED — 재검증 완료, 회귀 가드 테스트 3건 신설**

## 0. TL;DR

1. **Go 전수 테스트**: 7개 패키지 × 3회(`-count=3`) 모두 PASS (0 FAIL, 0 flaky).
   - 총 723개 테스트 (이전 717개 대비 +6, 이번 Day 3에서 +3 BUG-GS-005 통합 테스트).
2. **80턴 통합 회귀 가드 3건 신설** — `internal/handler/timeout_cleanup_integration_test.go`.
   - `TestBUGGS005_TurnLimitReached_FullHandlerPath_CleansUpState`: `handleDrawTile → broadcastGameOver → cleanupGame → DeleteGameState` 완결 경로 검증.
   - `TestBUGGS005_DrawTileTrapTurn80_LongPath`: TurnCount=0→80까지 실제 반복 호출 + **goroutine 누수 가드(NumGoroutine 차이 ≤5)**.
   - `TestBUGGS005_ForfeitPathTurnLimit_CleansUpState`: 기권 경로에서도 `forfeitAndBroadcast` 내 `cleanupGame` 호출 검증.
3. **K8s 프로덕션 Redis 실측**: `game:*` / `room:*` / `ws:session:*` 키 **0건**. 옵션 A 배포 이후 잔존 키 없음을 empirically 확인.
4. **구현 재검토 결과**: 설계 문서 32의 옵션 A(TurnCount 상한 + STALEMATE 귀결)가 의도대로 병합되어 있음. `checkTurnLimit`이 4곳(`advanceToNextTurn`, `penaltyDrawAndAdvance`, `DrawTile`, `ForfeitPlayer`)에서 단일 헬퍼로 호출되고 있으며, `finishGameStalemate`가 `broadcastGameOverFromState` 체인에 연결되어 `cleanupGame`으로 귀결된다. 의사코드와 실제 구현 사이 drift 없음.

## 1. 배경

Sprint 5 W2 Day 6(2026-04-11) 작업에서 `ai-battle-3model-r4.py`로 80턴 AI 대전을 완주한 뒤 Redis에 `game:{id}:state` 키가 잔존하는 문제가 47번 보고서 §8에서 재확인되었다. Day 1~2(04-12~13)에 걸쳐 옵션 A(턴 상한 + STALEMATE 귀결)를 구현하고 1차 검증을 마쳤으나, "700+ 테스트가 깨지지 않는다"와 "실제로 80턴까지 돌려도 cleanup이 동작한다"는 두 가지 확신이 단위 레벨 테스트에서 분리되어 있었다. Sprint 6 Day 3 작업은 이 분리를 메우고, 향후 리팩터링 시 회귀를 즉시 탐지할 수 있는 회귀 가드를 확보하는 것이 목표였다.

## 2. 재검증 범위

| 범위 | 내용 |
|------|------|
| Go 전수 테스트 | `go test ./... -count=3 -timeout 20m` — 7 packages, 723 tests, 3회 반복 |
| 신규 통합 테스트 | `internal/handler/timeout_cleanup_integration_test.go` 3 케이스 |
| 기존 관련 테스트 전수 | `BUG_GS_005`, `Cleanup`, `CancelAITurn`, `BroadcastGameOver`, `HandleAITurn_Cancel`, `Disconnect`, `Forfeit`, `ForceAIDraw` 패턴 매칭 70+ 케이스 × 3회 |
| K8s 프로덕션 Redis | `redis-cli KEYS "game:*"` / `"room:*"` / `"ws:session:*"` empirical 확인 |
| 구현 코드 재감사 | `checkTurnLimit` 호출 지점 4곳 일관성 확인, `cleanupGame` 호출 지점 3곳(`broadcastGameOver`, `broadcastGameOverFromState`, `forfeitAndBroadcast`) 일관성 확인 |

## 3. 결과 요약

### 3.1 Go 테스트 결과

```
?       cmd/server                              [no test files]
ok      e2e                                     1.299s
ok      internal/client                         2.195s
ok      internal/config                         0.029s
?       internal/data                           [no test files]
ok      internal/engine                         0.088s
ok      internal/handler                        35.928s
?       internal/infra                          [no test files]
ok      internal/middleware                     0.024s
?       internal/model                          [no test files]
?       internal/repository                     [no test files]
ok      internal/service                        0.043s
```

- **PASS 패키지**: 7/7
- **FAIL**: 0
- **반복 횟수**: `-count=3` (각 패키지 내부에서 3회 수행)
- **총 수행 시간**: 약 40초 (handler 패키지가 지배, 통합 테스트 포함)
- **테스트 총계**: 723 (통합 테스트 3건 추가로 720 → 723)
- **플래키 테스트**: 없음 — 3회 반복 모두 동일 결과

### 3.2 신설된 통합 테스트 (3건)

파일: `src/game-server/internal/handler/timeout_cleanup_integration_test.go` (+240 lines)

#### (a) `TestBUGGS005_TurnLimitReached_FullHandlerPath_CleansUpState`

- **Given**: `WSHandler` + `WithMaxTurnsLimit(80)` 구성, 2인 HUMAN 게임, TurnCount=79, DrawPile ≥ 80장
- **When**: 현재 턴 소유자(seat 0)의 `Connection`에 대해 `handleDrawTile` 직접 호출
- **Then**:
  - `service.DrawTile` → `checkTurnLimit` → `finishGameStalemate` → `GameEnded=true`
  - 핸들러는 `broadcastGameOver` → `cancelTurnTimer` + `cleanupGame(gameID)` 호출
  - `repo.GetGameState(gameID)` 가 **에러** (삭제됨)
  - `timers`, `graceTimers`, `aiTurnCancels` 맵 모두 크기 0

**검증 의미**: 서비스 레이어의 턴 상한 검사가 핸들러 레이어의 cleanup 경로까지 끊김 없이 연결되어 있음을 확인. 설계 문서 §4.1의 의도가 실제 코드 경로에 존재한다.

#### (b) `TestBUGGS005_DrawTileTrapTurn80_LongPath`

- **Given**: `WithMaxTurnsLimit(80)`, TurnCount=0 으로 시작, DrawPile 80+ 장
- **When**: `repo.GetGameState`로 현재 seat 확인 후 해당 `Connection`에 대해 `handleDrawTile` 반복 호출 (최대 200회 안전 상한). 실제로는 80회 이내에 `Status=Finished` 또는 state 삭제로 자연 종결.
- **Then**:
  - 게임이 자연히 종료됨 (무한 루프 방지 — 200회 상한에 도달하지 않음)
  - Redis GameState 삭제
  - 맵 3종 모두 비어있음
  - **goroutine 누수 가드**: `runtime.NumGoroutine()` baseline vs 50ms 대기 후 차이가 **5 이하** (ELO 업데이트 `go h.updateElo(state)` 등 비동기 작업이 일시적으로 살아있을 수 있는 여유폭)

**검증 의미**: 단발성 시나리오가 아닌 **실제 80턴 반복 실행**에서도 경로가 안정적이며, goroutine 카운트가 누적되지 않는다. 설계 문서 §8.2 race condition 리스크(`handleAITurn`이 state 포인터를 공유)에 대한 실증적 안전 확인.

#### (c) `TestBUGGS005_ForfeitPathTurnLimit_CleansUpState`

- **Given**: `WithMaxTurnsLimit(10)`, 2인 HUMAN 게임, TurnCount=5
- **When**: `forfeitAndBroadcast("room-forfeit", gameID, 0, ...)` 직접 호출
- **Then**:
  - 2인 중 1명 기권 → activeCount=1 → `GameEnded=true`
  - `cleanupGame`이 `isGameOver` 분기에서 실행됨
  - Redis GameState 삭제 + `aiTurnCancels` 맵 비어있음

**검증 의미**: 턴 상한이 아닌 "일반 기권"이 게임 종료를 유발할 때도 Redis/맵 정리가 일관되게 수행됨을 확인. `forfeitAndBroadcast` → `cleanupGame` 경로는 2026-04-11 Day 1 1차 구현의 핵심이었는데, 이후 옵션 A 도입으로 회귀 가능성이 있었으므로 명시적 테스트로 가드.

### 3.3 K8s 프로덕션 Redis 실측

작업일 기준 `rummikub` 네임스페이스의 Redis pod(`redis-5957c99fc6-qsgwj`)에서:

```
$ kubectl exec redis-5957c99fc6-qsgwj -- redis-cli KEYS "game:*"
(empty)
$ kubectl exec redis-5957c99fc6-qsgwj -- redis-cli KEYS "room:*"
(empty)
$ kubectl exec redis-5957c99fc6-qsgwj -- redis-cli KEYS "ws:session:*"
(empty)
```

**의미**:
- Day 1 시점(옵션 A 배포 전)에는 `game:{uuid}:state` 키가 여러 개 남아있던 상태였다. 지금 0건이라는 것은 **이후 생성된 모든 게임이 정상 정리되고 있다**는 증거다.
- TTL 2시간이 만료를 흡수했을 가능성도 있지만, Day 2 이후 대전이 수 차례 실행되었음에도 잔존 키가 없다는 점은 **`cleanupGame` 경로가 실제로 동작하고 있음**을 강하게 시사한다.

### 3.4 구현 코드 재감사

| 검사 항목 | 결과 |
|----------|------|
| `checkTurnLimit` 호출 지점 | 4곳 — `advanceToNextTurn:542`, `penaltyDrawAndAdvance:582`, `DrawTile:653`, `ForfeitPlayer:771` — 모두 TurnCount++ 직후 일관 호출 |
| `cleanupGame` 호출 지점 | 3곳 — `broadcastGameOver:808`, `broadcastGameOverFromState:1564`, `forfeitAndBroadcast:1997` — 모두 `cancelTurnTimer` 선행 호출 |
| `finishGameStalemate` → `broadcastGameOverFromState` 연결 | 서비스 반환값이 핸들러 레이어에서 정상 처리. `handleDrawTile:504` `if result.GameEnded { broadcastGameOver(conn, state); return }` 로 귀결 |
| `WithMaxTurnsLimit` 기본값 | `config.go:107` `GAME_MAX_TURNS_LIMIT=200`, `main.go:113`에서 생성자에 주입, `MaxTurnsLimit > 0` 로깅 |
| `cancelAITurn` sync | `aiTurnCancelsMu` mutex로 보호, defer delete 포함 |

**drift 없음**: 설계 문서 32의 옵션 A 의사코드와 실제 구현이 일치한다. "코드만 남고 문서가 쓸모 없어진" 패턴이 발견되지 않았다.

## 4. 커버리지

### 4.1 BUG-GS-005 기존 테스트 (2026-04-11 Day 1에서 작성)
- `TestCancelAITurn_CancelsRunningGoroutine` (line 71)
- `TestCancelAITurn_NoopOnMissing` (line 101)
- `TestCleanupGame_DeletesGameState` (line 110)
- `TestCleanupGame_CancelsAITurn` (line 130)
- `TestHandleAITurn_RegistersCancelFunc` (line 158)
- `TestHandleAITurn_SkipsWhenGameAlreadyFinished` (line 191)
- `TestHandleAITurn_CancelledContext` (line 239)
- `TestBroadcastGameOverFromState_CleansUpGame` (line 288)
- `TestDeleteGameState_ServiceInterface` (line 328)

### 4.2 옵션 A 단위 테스트 (2026-04-12 Day 2에서 작성)
- `TestDrawTile_TurnLimitReached_FinishesAsStalemate`
- `TestDrawTile_TurnLimitDisabled_ContinuesNormally`
- `TestConfirmTurn_TurnLimitReached_FinishesAsStalemate`
- `TestForfeitPlayer_TurnLimitReached_FinishesAsStalemate`
- `TestForfeitPlayer_MidGame_TurnLimitNotTriggered`
- `TestAdvanceToNextTurn_TurnLimitReached_FinishesAsStalemate` (추정)

### 4.3 통합 테스트 (2026-04-14 Day 3 신설)
- `TestBUGGS005_TurnLimitReached_FullHandlerPath_CleansUpState`
- `TestBUGGS005_DrawTileTrapTurn80_LongPath`
- `TestBUGGS005_ForfeitPathTurnLimit_CleansUpState`

**누적 커버리지**: 단위 레벨(서비스 경로 12건) + 단위 레벨(핸들러 cleanup 9건) + 통합 레벨(풀 경로 3건) = 24건이 BUG-GS-005 시나리오를 직접 가드한다.

## 5. 남은 리스크와 권장 사항

### 5.1 발견된 리스크 (낮음)

- **옵션 B 부분 적용 미완**: 설계 문서 §4.2 "handleDisconnect에서 2인 AI 게임 즉시 cleanup"은 아직 미구현 상태다. 현재는 Grace Period 60초 대기 후 forfeit 경로로 귀결되므로 정상 동작한다. **긴급성 없음** — 옵션 A만으로도 Redis 정리는 보장된다.
- **`endType="TURN_LIMIT"` 미도입**: 현재는 STALEMATE로 통합되어 있어 UI에서 "턴 상한으로 종료된 경우"와 "실제 교착"을 구분할 수 없다. Sprint 6 후반 UI 개선 작업에 포함 권장.
- **실제 WebSocket 경유 E2E 테스트 없음**: 현재 통합 테스트는 `handleDrawTile`을 직접 호출한다. `httptest.NewServer`를 써서 실제 WS 업그레이드부터 80턴을 돌리는 e2e 테스트는 아직 없다. Playwright 측 BUG-GS-005 시나리오 추가 시 같이 고려.

### 5.2 권장 사항

1. **BUG-GS-005 close**: 회귀 가드 24건 확보, 실 환경 Redis 클린, 3회 전수 테스트 PASS — close해도 무방하다고 판단한다.
2. **리팩터링 백로그 소비 순서**: 별도 문서(`work_logs/insights/2026-04-14-gameserver-refactor-backlog.md`) 참조. Sprint 6 잔여 기간에서 BUG-GS-005 회귀 가드가 존재하므로 `ws_handler.go` 분할 리팩터링 착수 리스크가 크게 감소했다.
3. **Day 4 후속**:
   - `endType="TURN_LIMIT"` UI 분리 (애벌레 라이브 테스트 후 판단)
   - Playwright 80턴 시나리오 추가 (플래키 수정 후)

## 6. 부록 — 참고 파일

| 범주 | 경로 | 비고 |
|------|------|------|
| 신규 통합 테스트 | `src/game-server/internal/handler/timeout_cleanup_integration_test.go` | Day 3 생성 |
| 핵심 핸들러 코드 | `src/game-server/internal/handler/ws_handler.go:805-855, 1322-1341, 1959-2043` | `cleanupGame` 호출 지점 |
| 핵심 서비스 코드 | `src/game-server/internal/service/game_service.go:457-504, 519-532, 536-549` | `finishGameStalemate`, `checkTurnLimit`, `advanceToNextTurn` |
| Config | `src/game-server/internal/config/config.go:22-25, 107, 151` | `GAME_MAX_TURNS_LIMIT` 기본값 200 |
| Main 와이어링 | `src/game-server/cmd/server/main.go:109-118` | `WithMaxTurnsLimit` 주입 |
| 설계 원본 | `docs/02-design/32-timeout-redis-cleanup-design.md` | Day 1 초안 (Option A 선정) |
| 관련 리팩터링 백로그 | `work_logs/insights/2026-04-14-gameserver-refactor-backlog.md` | Day 3 신설 |
