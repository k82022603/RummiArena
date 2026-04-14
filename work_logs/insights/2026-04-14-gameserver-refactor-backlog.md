# game-server 리팩터링 백로그 — Sprint 6 Day 3

- 작성일: 2026-04-14
- 작성자: go-dev-1
- 목적: BUG-GS-005 안정화 작업 중 발견한 game-server 코드 품질 개선 후보를 우선순위와 함께 기록한다. **식별만** — 실제 구현은 Sprint 6 Day 4 이후 결정.
- 관련 문서:
  - `docs/04-testing/49-bug-gs-005-stabilization-report.md` (안정화 재검증 보고)
  - `docs/02-design/32-timeout-redis-cleanup-design.md` (Option A 설계)

## 0. 원칙

- **회귀 방지 우선**: 723개 Go 테스트 + 신설 3건 BUG-GS-005 통합 테스트가 가드 역할을 하므로 리팩터링 착수 리스크가 이전보다 낮다.
- **가치 기준**: "읽기 쉬움 vs 바꾸기 쉬움" 기준으로 P1(즉각 이득), P2(중기 이득), P3(기회비용 있음) 3단계 분류.
- **스코프 외**: 기능 추가, 새 아키텍처 도입, 프레임워크 교체는 이 백로그 범위 밖.

---

## 1. 후보 목록 (5건)

| 번호 | 이름 | 우선순위 | 예상 공수 | 리스크 |
|------|------|---------|-----------|--------|
| R-01 | `ws_handler.go` 논리 그룹별 파일 분할 | **P1** | 1.5~2d | 중 |
| R-02 | Redis 키 중앙화(`internal/rediskeys` 패키지) | **P2** | 0.5d | 낮 |
| R-03 | `game_service.go`를 Action/Lifecycle 하위 파일로 분할 | **P2** | 1d | 낮 |
| R-04 | `handleAITurn` 105줄 책임 분리 (AI 요청 구성/응답 분기/에러 귀결) | **P3** | 1d | 중 |
| R-05 | Error wrapping 표준화 — bare `return err` 8곳 %w 감싸기 | **P3** | 0.3d | 낮 |

총 예상 공수: 약 4.3 man-day. Sprint 6 남은 3~4일 기간에 P1+P2 3건 우선 소화 가능.

---

## 2. R-01: `ws_handler.go` 파일 분할 (**P1**)

### 현 상태

- 파일 크기: **2174줄**, **56 함수** (전체 game-server 최대)
- 단일 `WSHandler` 구조체에 WS 업그레이드 / JWT 인증 / 메시지 라우팅 / 게임 액션(place/confirm/draw/reset) / AI 턴 오케스트레이션 / 턴 타이머 / Grace/Forfeit / 브로드캐스트 / ELO / 세션 복원이 모두 엉켜 있다.
- 논리적으로 분리 가능한 그룹이 명확히 보인다:

| 그룹 | 함수 수 | 대략 라인 | 제안 파일명 |
|------|---------|-----------|-------------|
| 업그레이드 + 인증 + JWT 파싱 | 4 | ~240 | `ws_upgrade.go` |
| 메시지 라우팅 + 액션 핸들러 | 9 | ~290 | `ws_actions.go` |
| 브로드캐스트 (turn end / start / game over) | 6 | ~280 | `ws_broadcast.go` |
| AI 턴 오케스트레이션 | 6 | ~280 | `ws_ai_turn.go` |
| 턴 타이머 + `cancelTurnTimer` + Redis 복원 | 7 | ~270 | `ws_timer.go` |
| Grace/Disconnect/Forfeit | 4 | ~200 | `ws_lifecycle.go` |
| 세션 저장/복원 (ws:session:*) | 3 | ~60 | `ws_session.go` |
| ELO 업데이트 | 3 | ~200 | `ws_elo.go` |
| 유틸/순수 함수 | 6 | ~80 | `ws_util.go` (또는 관련 파일에 흡수) |
| 기존 핵심 (구조체, 생성자, cleanupGame) | ~8 | ~350 | `ws_handler.go` (유지) |

### 제안

- `WSHandler` 구조체는 `ws_handler.go`에 유지. 함수는 같은 패키지 내 여러 파일로 분할 (`package handler` 유지).
- 분할 시 반드시 **파일 한 번에 하나씩** 옮기고 각 이동 후 `go test ./...` 전수 실행. 한 번의 대규모 이동은 금지.
- 공개 API는 변경하지 않는다. 외부에서 호출되는 것은 `NewWSHandler`, `HandleWS`, `NotifyGameStarted`, `WithEloRepo`, `WithRedisClient` 뿐이다.

### 장점

- 코드 리뷰 시 "턴 타이머만 수정"이 파일 단위로 고립 가능 → PR 리뷰 비용 감소
- `go test -run` 패턴 매칭이 더 예측 가능해짐
- 향후 신규 기능(예: 새 WS 메시지 타입) 추가 시 추가할 파일이 명확해진다
- BUG-GS-005 회귀 가드가 이미 있으므로 리팩터링 중 중단점(broken commit)을 줄일 수 있다

### 리스크

- `package handler` 내부 상태 공유: `aiTurnCancels`, `graceTimers`, `timers` 맵이 여러 파일에서 접근한다. 접근 일관성을 위해 get/set 헬퍼를 구조체 메서드로 통일해야 한다 (이미 그런 구조).
- Diff가 커서 git blame이 끊어진다 → git `log --follow` + `.gitattributes`로 blame 유지 필요.
- 동시 작업 중인 브랜치(예: Istio, Playwright 안정화)와 머지 충돌 가능성 → Sprint 6 후반이 아니라 Day 4~5 초반에 수행 권장.

### 수용 기준

- `git diff --stat` 이동 외 변경 0라인 (순수 파일 간 이동만)
- 723개 테스트 전수 PASS
- `gofmt`, `go vet` 클린
- 각 파일이 단일 책임 (파일 상단 주석으로 명시)
- `ws_handler.go` 최종 크기 700줄 이하 목표

---

## 3. R-02: Redis 키 중앙화 (`internal/rediskeys` 패키지) (**P2**)

### 현 상태

현재 Redis 키 prefix가 **7곳에 흩어져 있다**:

| 경로 | 키 prefix | 형식 |
|------|-----------|------|
| `internal/repository/redis_repo.go:33` | `game:` | `game:{id}:state` |
| `internal/handler/ws_handler.go:1348` | `game:` | `game:{id}:timer` |
| `internal/handler/ws_handler.go:1468` | `ws:session:` | `ws:session:{uid}:{rid}` |
| `internal/handler/ws_handler.go:1781,1784` | `ranking:tier:` | `ranking:tier:{tier}` |
| `internal/service/cooldown.go:47` | `cooldown:ai-game:` | `cooldown:ai-game:{uid}` |
| `internal/middleware/rate_limiter.go:134` | `ratelimit:` | `ratelimit:{identity}:{policy}` |

**위험**:
- 키 변경(예: `game:` → `rummikub:game:` 네임스페이스 도입) 시 모든 호출지를 일일이 수정해야 한다.
- `DEL game:*` 같은 wildcard 스크립트를 짜기 위해 모든 prefix를 수동으로 알아내야 한다.
- BUG-GS-005 안정화 과정에서 `game:*`, `room:*`, `ws:session:*` 3종을 확인해야 했는데, 각각을 grep으로 별도 찾아야 했다.

### 제안

신규 패키지 `internal/rediskeys/keys.go` 생성:

```go
package rediskeys

import "fmt"

const (
    PrefixGameState  = "game"
    PrefixWSSession  = "ws:session"
    PrefixRankingTier = "ranking:tier"
    PrefixCooldownAI = "cooldown:ai-game"
    PrefixRateLimit  = "ratelimit"
)

func GameState(gameID string) string   { return fmt.Sprintf("%s:%s:state", PrefixGameState, gameID) }
func GameTimer(gameID string) string   { return fmt.Sprintf("%s:%s:timer", PrefixGameState, gameID) }
func WSSession(userID, roomID string) string {
    return fmt.Sprintf("%s:%s:%s", PrefixWSSession, userID, roomID)
}
func RankingTier(tier string) string   { return fmt.Sprintf("%s:%s", PrefixRankingTier, tier) }
func CooldownAI(userID string) string  { return fmt.Sprintf("%s:%s", PrefixCooldownAI, userID) }
func RateLimit(identity, policy string) string {
    return fmt.Sprintf("%s:%s:%s", PrefixRateLimit, identity, policy)
}
```

그리고 7곳 호출 지점을 `rediskeys.GameState(id)` 등으로 치환.

### 장점

- 키 네임스페이스 변경이 한 곳으로 수렴
- `grep "rediskeys\."`로 모든 Redis 사용지 일괄 조회 가능
- 향후 멀티 테넌시(서버당 prefix) 도입 시 비용 최소화
- 운영 스크립트(`scripts/cleanup-redis.sh` 등)에 패키지 상수 재사용 가능

### 리스크

- **매우 낮음**. 순수 기계적 변경이며, 키 문자열 자체는 그대로다(회귀 0).

### 수용 기준

- `grep -r "fmt.Sprintf(\"game:" game-server/` → 0건
- `grep -r "fmt.Sprintf(\"ws:session:" game-server/` → 0건
- 나머지 4 prefix 동일
- 기존 테스트 723 PASS

---

## 4. R-03: `game_service.go` 분할 (**P2**)

### 현 상태

- 파일 크기: **981줄**, **35 함수**
- 단일 파일에 게임 생성(`newGame`) / 조회(`GetGameState`, `GetRawGameState`) / 액션(`PlaceTiles`, `ConfirmTurn`, `DrawTile`, `ResetTurn`, `ForfeitPlayer`) / 종료(`finishGame`, `finishGameStalemate`) / 턴 상한(`checkTurnLimit`) / 유틸(`tileScore`, `advanceTurn`, `countActivePlayers`, `removeTilesFromRack`, `convertToSetOnTable`)이 섞여 있다.
- `package service` 내 다른 파일(`turn_service.go` 132줄, `room_service.go` 464줄, `cooldown.go` 72줄)은 크기가 작지만 `game_service.go`만 비대칭적으로 크다.

### 제안

하나의 `gameService` 구조체는 유지하되, 메서드/함수를 논리별 파일로 분할:

| 파일 | 내용 | 예상 크기 |
|------|------|----------|
| `game_service.go` | 구조체, 생성자, 옵션, 공통 헬퍼 | ~250줄 |
| `game_service_lifecycle.go` | `newGame`, `finishGame`, `finishGameStalemate`, `checkTurnLimit`, `advanceToNextTurn`, `penaltyDrawAndAdvance` | ~280줄 |
| `game_service_actions.go` | `PlaceTiles`, `ConfirmTurn`, `DrawTile`, `ResetTurn` | ~300줄 |
| `game_service_player.go` | `ForfeitPlayer`, `SetPlayerStatus`, `countActivePlayers` | ~120줄 |
| `game_service_util.go` | `tileScore`, `advanceTurn`, `removeTilesFromRack`, `convertToSetOnTable`, `findPlayerBySeat` | ~100줄 |

### 장점

- 파일별 < 300줄 — 코드 리뷰 시 mental scrolling 감소
- `checkTurnLimit`과 `finishGameStalemate`가 같은 파일에 묶여 BUG-GS-005 경로가 물리적으로 가까워짐
- 리팩터링 이후 `_test.go` 파일도 같은 구조로 분할 가능 (선택적)

### 리스크

- **낮음**. 순수 파일 이동. R-01과 같은 구조 이동이므로 방식 재사용 가능.

### 수용 기준

- R-01과 동일한 기계적 검증
- 723 테스트 PASS
- `git log --follow`로 각 함수의 history 추적 가능

---

## 5. R-04: `handleAITurn` 책임 분리 (**P3**)

### 현 상태

`handleAITurn` (ws_handler.go:863-967, **105줄**)이 다음 책임을 모두 가진다:

1. 턴 타이머 취소 (`cancelTurnTimer`)
2. AI 어댑터 timeout context 구성 (`aiAdapterTimeoutSec + 60s 버퍼`)
3. `aiTurnCancels` 맵 register + defer delete (BUG-GS-005)
4. `MoveRequest` 페이로드 빌드 (opponents, tableGroups, initial meld 등)
5. `aiClient.GenerateMove` 호출
6. 에러 분류 (`AI_ERROR` / `AI_RATE_LIMITED` / `AI_COST_LIMIT` / `AI_TIMEOUT`)
7. 게임 종료 확인 (BUG-GS-005)
8. Action 분기 (`place` / `draw` / 기타 → `forceAIDraw`)

→ 단일 함수가 "5개의 when, 3개의 why"를 가진다 (Uncle Bob 기준).

### 제안

다음 3개 함수로 분리:

```go
// buildAIMoveRequest 상태로부터 MoveRequest와 timeout context를 구성한다.
func (h *WSHandler) buildAIMoveRequest(gameID string, player *model.PlayerState, state *model.GameStateRedis) (*client.MoveRequest, context.Context, context.CancelFunc)

// classifyAIError err를 forceAIDraw에 전달할 reason 코드로 분류한다.
func classifyAIError(err error, ctxErr error) (reason string, shouldForceDraw bool)

// dispatchAIAction place/draw/other로 분기하여 해당 handler를 호출한다.
func (h *WSHandler) dispatchAIAction(roomID, gameID string, seat int, resp *client.MoveResponse)
```

`handleAITurn`은 최종적으로 40~50줄로 축소.

### 장점

- 각 조각을 단위 테스트하기 쉬워진다 (`classifyAIError` 특히 순수 함수로 분리 가능)
- BUG-GS-005 취소 경로가 더 명확히 보인다

### 리스크

- **중간**. AI 경로는 7종 테스트(`ws_ai_timer_test.go`, `ws_cleanup_test.go`)로 커버되지만 실제 AI 어댑터와의 상호작용은 E2E 테스트가 아닌 stub 기반이다. 시그니처를 잘못 바꾸면 stub 업데이트가 일거리가 된다.
- `handleAITurn`이 고루틴으로 실행되기 때문에 context 생명주기를 정확히 옮겨야 한다.

### 수용 기준

- 723 테스트 PASS
- 각 분리 함수가 godoc 주석 + 단위 테스트 보유
- `ws_ai_timer_test.go`가 새 시그니처로 갱신되어도 테스트 로직이 동일

---

## 6. R-05: Error wrapping 표준화 (**P3**)

### 현 상태

`grep "return err$"` 결과 **8건**의 bare `return err`가 존재 (대부분 `game-server/internal/` 하위).
전체 `fmt.Errorf(... %w ...)` wrapping은 **80건**으로 표준 패턴은 확립되어 있다 (90% 이상 컴플라이언스).

### 제안

남은 8개 bare `return err`에 대해:
- 외부 호출 경계(`main`, 패키지 경계)이면 → `fmt.Errorf("{package}: {operation}: %w", err)` 패턴으로 감싸기
- 동일 패키지 내부 호출에서 정보 추가가 불필요한 경우 → 주석으로 의도 명시 (`// 상위에서 이미 컨텍스트를 추가함`)

### 장점

- 로그 추적성 향상 (스택이 아닌 context chain으로 추적)
- `errors.Is/As` 패턴 일관성

### 리스크

- **낮음**. 단, wrapping 메시지가 테스트 어설션에 노출되는 경우 깨질 수 있음. 발생 시 개별 수정.

### 수용 기준

- `grep -rn "return err$" game-server/internal/` 결과 0건 (또는 주석 설명 포함)
- 723 테스트 PASS

---

## 7. 소비 우선순위 제안

### Sprint 6 Day 4~5 (권장)

1. **R-02 (Redis 키 중앙화)** — 0.5일. 가장 낮은 리스크로 가장 즉각적 이득. BUG-GS-005 후속 "운영 스크립트 작성"에 즉시 쓰인다.
2. **R-05 (Error wrapping)** — 0.3일. mechanical change. R-02와 같은 PR에 묶어도 무방.

### Sprint 6 Day 6~7

3. **R-03 (`game_service.go` 분할)** — 1일. R-02가 완료되면 import 경로가 단순해져 R-03의 diff가 작아진다.

### Sprint 7 또는 이후

4. **R-01 (`ws_handler.go` 분할)** — 1.5~2일. 가장 큰 개선이지만 가장 큰 diff. Istio 작업이 정리되고 Playwright 안정화가 끝난 뒤 안정적인 main 브랜치에서 별도 sprint에 진행 권장.
5. **R-04 (`handleAITurn` 분리)** — R-01과 함께 착수 (같은 파일에서 작업). 단독 수행은 효율이 낮다.

### 총 공수 배분

| 시기 | 항목 | 공수 |
|------|------|------|
| Sprint 6 Day 4~5 | R-02 + R-05 | ~0.8d |
| Sprint 6 Day 6~7 | R-03 | ~1d |
| Sprint 7 | R-01 + R-04 | ~2.5d |
| **합계** | | ~4.3d |

---

## 8. 비대상 (No-op 판정)

다음은 task 원문 memo에서 언급되었으나 현재 코드에서 **이미 충분히 정리되어 있어** 추가 리팩터링이 불필요하다:

| 항목 | 판정 근거 |
|------|----------|
| `handlers/room_service.go` 분할 (600줄 기준) | 실제 `internal/service/room_service.go`는 **464줄** — 임계치 미달, 논리적으로도 응집도 높음 |
| `engine/validator.go` 중복 로직 제거 | 실제 **256줄**, 함수 10개, 책임 분리 명확(`ValidateTileSet`/`ValidateTable`/`ValidateTurnConfirm`) — 중복 없음 |
| `realtime/hub.go` snapshot 패턴 일반화 | 실제 경로는 `internal/handler/ws_hub.go`이며, SEC-REV-008로 이미 snapshot-then-iterate + defer-recover 완전 적용됨 — 추가 일반화 불필요 |

---

## 9. 의사결정 기록

- **Day 3 진행 범위**: 식별만. R-01~R-05 중 어느 하나도 Day 3에 구현하지 않음.
- **근거**: BUG-GS-005 안정화가 Day 3의 명시된 Done 기준이었고, 리팩터링은 Day 4 이후 결정 대상. 회귀 가드를 먼저 확보하는 것이 리팩터링의 전제조건이라는 판단.
- **다음 액션**: Day 4 아침 스탠드업에서 팀 리드와 R-02 착수 여부 합의. R-02 + R-05는 half-day PR 하나로 묶어 제안.
