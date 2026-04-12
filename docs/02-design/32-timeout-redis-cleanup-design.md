# TIMEOUT(80턴 만료) 시 Redis GameState 자동 삭제 설계

- 작성일: 2026-04-12
- 작성자: go-dev (Sprint 6 Day 1 착수용 초안)
- 관련 버그: BUG-GS-005 후속
- 상태: **Draft** — Sprint 6 Day 1 착수 후 구현 계획으로 승격

## 0. 요약 (TL;DR)

> **핵심 발견**: "80턴 만료" 제한은 **서버 코드에 존재하지 않는다**.
> `MAX_TURNS=80`은 `scripts/ai-battle-3model-r4.py:46`에만 정의된 **클라이언트 측 안전장치**이며,
> 스크립트는 80턴 도달 시 `/games/{id}/forfeit`이나 `/games/{id}/end` 같은 API를 호출하지 않고
> **단순히 WebSocket을 close**한다. 서버는 이를 **일반 disconnect**로만 인식한다.
>
> 따라서 "TIMEOUT 시 Redis 삭제 누락"의 본질은
> **"AI 전용 2인 게임에서 2플레이어가 동시에 WS를 끊을 때, Grace Period 만료 → forfeit 경로가 경합하며 cleanupGame이 모든 케이스에서 호출되지 않는 구간"**이다.
>
> 권장 해결: **서버 측 게임 `TurnCount` 상한(기본 120턴, ConfigMap 조정 가능) 도입 + advanceToNextTurn에서 초과 시 finishGameStalemate로 귀결** — 스크립트의 "슬그머니 끊기"에 의존하지 않고 서버가 스스로 종결한다. 보조 방어선으로 Redis TTL 2시간은 이미 존재하므로 유지한다.

---

## 1. 문제 정의

### 1.1 관찰된 증상
- `ai-battle-3model-r4.py`로 2인 AI 대전을 실행하면 80턴에 도달 시 스크립트가 루프를 빠져나와 WS close를 수행한다 (`scripts/ai-battle-3model-r4.py:210`의 `while not game_over and turn_count < MAX_TURNS`).
- 서버는 `/games/{id}` 상태를 `FINISHED`로 전환할 근거가 없어 Redis 키 `game:{gameID}:state`가 TTL 2시간이 만료될 때까지 잔존한다.
- 어제(2026-04-11) BUG-GS-005 수정으로 "GAME_OVER 브로드캐스트 경로"에는 `cleanupGame`이 정상 결선되었으나, 위와 같이 **GAME_OVER가 발생하지 않는 조기 종결 케이스**는 여전히 커버되지 않는다.

### 1.2 실제 흐름 (2인 AI 게임, 스크립트 80턴 조기 종결)
```
[t0]  스크립트: 80턴 도달, WS close (양 seat)
[t1]  서버: ReadPump 반환 → handleDisconnect 호출 (seat 0, seat 1 각각)
        → src/game-server/internal/handler/ws_handler.go:1874
        → SetPlayerStatus(DISCONNECTED), startGraceTimer 등록
[t2]  Grace Period 60초 경과
        → forfeitAndBroadcast(seat 0), forfeitAndBroadcast(seat 1)
        → src/game-server/internal/handler/ws_handler.go:1959
[t3]  forfeitAndBroadcast 내부:
        - ForfeitPlayer(seat 0): activeCount=1 → GameEnded=false (첫 기권)
          → cleanupGame 미호출 (src/game-server/internal/handler/ws_handler.go:1995 if isGameOver 분기 false)
        - ForfeitPlayer(seat 1): activeCount=0 → GameEnded=true → cleanupGame 호출
[t4]  이 흐름이 정상 동작하면 Redis는 삭제되지만, 문제는 seat 0과 seat 1의
      graceTimer goroutine이 **거의 동시**에 fire 되면서 race condition 가능.
      또 Grace Period 내에 aiTurnCancel이 처리되지 않아 AI goroutine이
      ForfeitPlayer가 변경한 state 위에서 여전히 돌아갈 수 있음.
```

### 1.3 누수 조건 (Redis 관점)
- **조건 A**: 2인 AI 게임의 플레이어가 모두 `PlayerType=AI_*`이면 `handleDisconnect`가 불릴 때 seat에 해당하는 WS 연결이 존재하지 않을 수도 있다 (AI는 WS를 직접 소유하지 않음). 스크립트가 AI 플레이어용 WS를 대리로 여는 구조를 재확인해야 함 (TBD: `ai-battle-3model-r4.py` 추가 조사).
- **조건 B**: `finishGameStalemate`(src/game-server/internal/service/game_service.go:435) 경로는 `broadcastGameOverFromState` → `cleanupGame`으로 이어지므로 안전하다. 하지만 교착 판정은 드로우 파일 소진 또는 전원 연속 패스 시에만 발동하므로, 80턴 도달 시점(대부분 드로우 파일이 아직 남아있음)에는 트리거되지 않는다.
- **조건 C**: 서버가 재시작되면서 타이머 복원 로직(`src/game-server/internal/handler/ws_handler.go:1413` 주변)이 동작하지만, `cleanupGame`이 걸려야 할 "이미 끝났어야 했던 게임" 판정 기준이 없다.

---

## 2. 현재 코드 상태 (Fact-check)

### 2.1 서버 측 턴 카운트 관련
| 항목 | 위치 | 비고 |
|------|------|------|
| `TurnCount` 필드 | `src/game-server/internal/model/tile.go:46`, `src/game-server/internal/model/game.go:48` | Redis GameStateRedis + DB Game 모두 존재, default 0 |
| `TurnCount++` (총 4곳) | `src/game-server/internal/service/game_service.go:502, 537, 603, 716` | ConfirmTurn / penaltyDraw / DrawTile / ForfeitPlayer |
| 턴 상한 검사 | **없음** | grep `MaxTurn|TurnLimit|turn.*>.*[0-9]` → 매치 0건 |
| `TurnNumber` (wire) | `src/game-server/internal/handler/ws_message.go:142,152,160` | WS 페이로드/DB 이벤트에만 사용, 상한 없음 |

### 2.2 클라이언트 측 턴 상한 (참고용)
| 항목 | 위치 |
|------|------|
| `MAX_TURNS = 80` | `scripts/ai-battle-3model-r4.py:46` |
| 루프 탈출 조건 | `scripts/ai-battle-3model-r4.py:210` |
| 루프 탈출 후 서버 호출 | **없음** — WS close만 수행 |

### 2.3 BUG-GS-005 수정 범위 (어제 작업)
| 함수 | 위치 | cleanupGame 호출 |
|------|------|------------------|
| `cleanupGame` (신설) | `src/game-server/internal/handler/ws_handler.go:1333` | cancelAITurn + DeleteGameState |
| `cancelAITurn` (신설) | `src/game-server/internal/handler/ws_handler.go:1322` | AI goroutine context cancel |
| `aiTurnCancels` map | `src/game-server/internal/handler/ws_handler.go:96-97` | sync.Mutex 보호 |
| `handleAITurn`의 register | `src/game-server/internal/handler/ws_handler.go:880-887` | defer delete 포함 |
| `broadcastGameOver` (conn 있음) | `src/game-server/internal/handler/ws_handler.go:808` | cleanupGame 호출 |
| `broadcastGameOverFromState` | `src/game-server/internal/handler/ws_handler.go:1564` | cleanupGame 호출 |
| `forfeitAndBroadcast` (isGameOver 분기) | `src/game-server/internal/handler/ws_handler.go:1997` | cleanupGame 호출 (isGameOver==true 시에만) |

### 2.4 Redis TTL
| 항목 | 위치 | 값 |
|------|------|------|
| `gameStateTTL` 상수 | `src/game-server/internal/repository/redis_repo.go:14` | `2 * time.Hour` |
| `SaveGameState`에서 적용 | `src/game-server/internal/repository/redis_repo.go:41` | 매 저장마다 TTL 리셋 |
| `DeleteGameState` | `src/game-server/internal/repository/redis_repo.go:63` | 정상 동작 확인 |

### 2.5 Grace Period 경로
| 항목 | 위치 | 비고 |
|------|------|------|
| `handleDisconnect` | `src/game-server/internal/handler/ws_handler.go:1874` | 게임 중이면 DISCONNECTED + Grace 시작 |
| `gracePeriodDuration` 상수 | (TBD: 상수 정의 위치) | 기본 60초 추정 |
| `startGraceTimer` | `src/game-server/internal/handler/ws_handler.go:1920` | 만료 시 forfeitAndBroadcast |
| `forfeitAndBroadcast` | `src/game-server/internal/handler/ws_handler.go:1959` | `ForfeitPlayer` 결과 기반 |
| `ForfeitPlayer` | `src/game-server/internal/service/game_service.go:664` | activeCount<=1일 때만 `GameEnded=true` |

---

## 3. 커버된 경로 vs 미커버 경로

### 3.1 BUG-GS-005 수정으로 커버되는 경로
1. 정상 종료(승리 조건 충족) → `finishGame` → `broadcastGameOver*` → `cleanupGame`
2. 교착(드로우 파일 소진/전원 패스) → `finishGameStalemate` → `broadcastGameOverFromState` → `cleanupGame`
3. 최후 1인만 남을 때까지 기권 연쇄 → 마지막 `ForfeitPlayer`에서 `GameEnded=true` → `cleanupGame`
4. 3턴 연속 부재(S8.2) → `checkAbsentTurnAndForfeit` → `forfeitAndBroadcast` → (활성 1명 이하면) `cleanupGame`

### 3.2 미커버(누수 가능) 경로
1. **2인 AI 게임에서 양 플레이어가 거의 동시에 WS를 끊는 경우** — seat 0 Grace 타이머 만료로 `ForfeitPlayer(0)`가 돌 때 이미 seat 1도 DISCONNECTED이지만 *아직 forfeit 되지 않은* 상태. `countActivePlayers`는 "FORFEITED가 아닌" 모두를 active로 세므로 activeCount=2로 계산되어 `GameEnded=false` 반환 가능성. (TBD: `countActivePlayers` 정확한 판정 로직 확인)
2. **서버 재시작 직전 게임 상태** — `game:{id}:state` 키만 남은 상태로 pod 재시작 시 복원이 불완전하면 그대로 고아화. 현재 복원 코드는 타이머만 다루고 있어 `cleanupGame`을 능동적으로 호출할 수단이 없다.
3. **스크립트가 에러로 중단** — Python 예외로 스크립트가 즉시 죽으면 WS close조차 전송되지 않을 수 있다. 이때는 TCP keepalive 만료(수 분)까지 서버가 disconnect를 감지하지 못한다.
4. **게임 상태 `PLAYING` 유지 중 80턴이 넘어가는 정상 흐름** — 어떤 AI가 극단적으로 많은 턴을 소비하는 케이스. 현재는 종결 트리거가 없어 이론적으로 무한히 진행될 수 있다. 실제로는 드로우 파일 소진으로 자연 종결되지만 "80턴 만료 시점에 종결"이라는 요구는 서버에 존재하지 않는다.

---

## 4. 설계안

### 4.1 옵션 A — 서버 측 TurnCount 상한 + finishGameStalemate 귀결 (**권장**)

**핵심 아이디어**: `advanceToNextTurn` (`src/game-server/internal/service/game_service.go:498`) 또는 그 직전 호출자에서 `state.TurnCount > MaxTurnsLimit` 체크를 삽입한다. 초과 시 `finishGameStalemate(state)`를 호출하여 **교착 종료와 동일한 경로**로 귀결시킨다. `finishGameStalemate`는 이미 `cleanupGame`을 호출하는 `broadcastGameOverFromState`와 연결되어 있으므로 Redis 정리가 자동으로 이뤄진다.

**장점**
- 기존 `finishGameStalemate` 경로 재사용 → 신규 코드 최소
- cleanup 로직 중복 없음 (단일 진입점 유지)
- 스크립트 제한과 서버 제한이 일치하면 80턴 동일 종결 — 테스트 결정론성 향상
- `IsStalemate=true, endType="STALEMATE"`로 클라이언트가 구분 가능

**단점**
- "정상 게임에서 상한 도달"을 "STALEMATE"로 분류하는 것은 의미론적으로 미묘 → 새 `endType="TURN_LIMIT"` 도입 검토 필요
- `MaxTurnsLimit` 기본값 선택 (80 vs 120 vs 200)에 대한 합의 필요

**신규 코드 예시 (의사코드)**
```go
// config.go
cfg.Game.MaxTurnsLimit = viper.GetInt("GAME_MAX_TURNS_LIMIT") // 기본 120

// game_service.go — advanceToNextTurn 내부
func (s *gameService) advanceToNextTurn(state *model.GameStateRedis) (*GameActionResult, error) {
    nextSeat := advanceTurn(state)
    state.CurrentSeat = nextSeat
    state.TurnStartAt = time.Now().Unix()
    state.TurnCount++

    if s.maxTurnsLimit > 0 && state.TurnCount >= s.maxTurnsLimit {
        return s.finishGameStalemate(state) // endType=STALEMATE로 귀결
    }
    // ... 기존 save 로직
}
```

### 4.2 옵션 B — handleDisconnect에서 2인 AI 게임 즉시 cleanup

**핵심 아이디어**: `handleDisconnect` (`src/game-server/internal/handler/ws_handler.go:1874`)에서 Grace Period를 시작하기 전에 "활성 HUMAN이 0명인가?"를 검사. 모두 AI면 더 기다릴 이유가 없으므로 즉시 `broadcastGameOverFromState` + `cleanupGame`.

**장점**
- AI 대전 시나리오에 특화 — 스크립트 요구 정확히 매치
- Grace Period를 건너뛰어 즉각적인 정리

**단점**
- Grace Period의 목적(일시적 네트워크 단절 복구)과 충돌
- `activePlayer` 판정 기준이 `PlayerType` 의존 → 향후 스펙 변경에 민감
- 옵션 A와 달리 "정상 게임이 80턴 넘어가는 이론적 케이스"는 여전히 미해결

### 4.3 옵션 C — Redis TTL만 단축 (수동 개입 최소화)

**핵심 아이디어**: `gameStateTTL`을 2시간 → 10분 정도로 단축. 별도 로직 없이 "누수되면 어차피 곧 만료"로 운영.

**장점**
- 코드 변경 최소 (상수 1개)
- 100% 안전장치

**단점**
- 정상 플레이 중에도 10분 내 활동 없으면 키가 사라져 게임 유실 → **서비스 품질 심각 저하**
- 장기 사색 AI(DeepSeek Run3의 356초 최대 응답)와 충돌 위험
- 근본 원인 해결 아님

### 4.4 옵션 비교 매트릭스

| 기준 | A (TurnCount 상한) | B (Disconnect 즉시 cleanup) | C (TTL 단축) |
|------|-------------------|----------------------------|-------------|
| 구현 난이도 | 낮음 | 중간 | 매우 낮음 |
| 회귀 위험 | 낮음 (기존 경로 재사용) | 중간 (Grace 로직 간섭) | 높음 (정상 게임 유실) |
| AI 대전 완결성 | O | O | X |
| 정상 게임 안전성 | O | O | X |
| 스크립트와 의미 일치 | O | △ | X |
| 테스트 커버리지 영향 | +2~3 케이스 | +2 케이스 | -1 케이스 |

---

## 5. 권장안

**옵션 A 채택** (TurnCount 상한 + finishGameStalemate 귀결) + **옵션 B 부분 적용**(전원 AI + 전원 DISCONNECTED인 경우 Grace 스킵).

근거:
1. 옵션 A는 **서버 자체적으로 게임을 완결**시킨다는 점에서 가장 견고하다. 스크립트의 "슬그머니 끊기"에 의존하지 않는다.
2. 옵션 B는 보조적으로 적용하여 "어차피 스크립트가 끊은 AI 전용 게임"을 60초 기다리지 않고 즉시 종결 → 테스트 속도 향상과 경합 조건 완화 효과. 단 이 부분은 **옵션 A가 먼저 도입된 후** 적용한다.
3. 옵션 C는 **현 상태 유지**. 2시간 TTL은 마지막 안전망으로서 충분. 단축하지 않는다.
4. 새 `endType="TURN_LIMIT"` 도입은 **스코프 외**로 분리 (Sprint 6 Day 2 이후). 초기에는 `STALEMATE`로 귀결시켜 클라이언트 변경 없이 진행.

---

## 6. 구현 스텝 (Sprint 6 Day 1)

### Phase 1 — 옵션 A 구현 (예상 2~3시간)
1. **config.go**: `GAME_MAX_TURNS_LIMIT` 환경 변수 추가 (기본 120, 0이면 제한 없음).
   - `src/game-server/internal/config/config.go` 해당 viper 블록에 추가
2. **game_service.go**: `gameService` 구조체에 `maxTurnsLimit int` 필드 추가, 생성자 시그니처 확장.
   - `src/game-server/internal/service/game_service.go`
3. **advanceToNextTurn 수정**: `state.TurnCount++` 직후 상한 검사 삽입, 초과 시 `finishGameStalemate(state)` 반환.
   - `src/game-server/internal/service/game_service.go:498`
4. **penaltyDrawAndAdvance 수정**: 동일한 검사 삽입 (`src/game-server/internal/service/game_service.go:537` 근처).
5. **DrawTile 수정**: 동일한 검사 삽입 (`src/game-server/internal/service/game_service.go:603` 근처).
6. **ForfeitPlayer 수정**: 동일한 검사 삽입 (`src/game-server/internal/service/game_service.go:716` 근처).
7. **Helm chart**: `helm/charts/game-server/values.yaml`의 `env` 섹션에 `GAME_MAX_TURNS_LIMIT: 120` 추가.
8. **ConfigMap 반영**: K8s ConfigMap template에 포함.

### Phase 2 — 옵션 B 부분 적용 (예상 1시간)
1. **handleDisconnect**: 게임 진행 중(`conn.gameID != ""`) 분기에서 "활성 HUMAN==0 && 활성 AI 연결==0" 검사 후 즉시 `broadcastGameOverFromState` 호출.
   - `src/game-server/internal/handler/ws_handler.go:1883` 근처
2. 단, Grace Period 내 재연결을 허용하는 기존 UX를 해치지 않도록 "전원 AI 게임" 조건을 엄격히 적용.

### Phase 3 — 검증 (예상 1시간)
1. `go test ./...` 전체 실행
2. `scripts/ai-battle-3model-r4.py`로 실제 대전 1회 (DeepSeek 단일 모델)
3. `redis-cli KEYS "game:*:state"`로 잔존 키 확인

---

## 7. 테스트 계획

### 7.1 신규 Go 테스트 케이스

**파일**: `src/game-server/internal/service/game_service_test.go`

1. **`TestAdvanceToNextTurn_TurnLimitReached_FinishesAsStalemate`**
   - Given: `maxTurnsLimit=10`으로 생성한 gameService, TurnCount=9인 상태
   - When: `advanceToNextTurn` 호출
   - Then: 반환값의 `GameEnded=true`, `GameState.Status=Finished`, `IsStalemate=true`, `ErrorCode="STALEMATE"`
   - 추가 검증: Redis (memoryGameStateRepo)에서 state가 Finished로 저장됨

2. **`TestDrawTile_TurnLimitReached_FinishesAsStalemate`**
   - Given: 동일 설정, TurnCount=9, DrawPile≥1
   - When: `DrawTile` 호출
   - Then: 타일은 뽑되 즉시 게임 종결

3. **`TestForfeitPlayer_TurnLimitNotTriggered_OnMidGame`**
   - Given: `maxTurnsLimit=100`, TurnCount=5, 3인 게임에서 1명 기권
   - When: `ForfeitPlayer` 호출
   - Then: `GameEnded=false`, TurnCount만 증가, 게임 계속 진행
   - 이유: 회귀 방지 — 기권이 불필요하게 TURN_LIMIT을 트리거하지 않음을 확인

**파일**: `src/game-server/internal/handler/ws_cleanup_test.go`

4. **`TestHandleDisconnect_AllAIGame_ImmediateCleanup`** (옵션 B)
   - Given: 2인 AI 게임, 양 seat의 PlayerType=AI_*
   - When: 한 연결의 `handleDisconnect` 호출 후 다른 연결도 `handleDisconnect`
   - Then: 두 번째 호출 이후 즉시 Redis state 삭제 (Grace 60초 대기 없이)

### 7.2 통합 시나리오 (scripts)
- `scripts/ai-battle-3model-r4.py`를 `--max-turns 10`으로 실행하여 빠른 재현 — 종료 후 Redis에 `game:*:state` 키가 0개여야 함

### 7.3 회귀 테스트
- 기존 689개 Go 테스트 전수 통과
- 특히 `TestFinishGameStalemate_*` 계열이 기존 동작을 유지하는지 확인

---

## 8. 리스크

### 8.1 기술 리스크
| 리스크 | 영향 | 완화 |
|--------|------|------|
| advanceToNextTurn/DrawTile/penaltyDrawAndAdvance/ForfeitPlayer 4곳의 중복 삽입 누락 | TurnCount 상한 우회 | 헬퍼 함수 `checkTurnLimit(state)` 추출 후 공통 호출 |
| `finishGameStalemate`가 IsStalemate=true로 분기시켜 클라이언트 UI가 "실제 교착"과 "턴 초과"를 구분 못함 | UX 혼란 | 향후 `TurnLimitReached` 플래그 추가 (Sprint 6 Day 2+) |
| 옵션 B 적용 시 "전원 AI 연결 == 전원 DISCONNECTED" 판정 race condition | 조기 cleanup으로 남은 goroutine이 사라진 state에 접근 | `aiTurnCancels` 맵 확인 후 cleanupGame 호출, cleanupGame 이미 cancelAITurn 포함 |
| `MaxTurnsLimit=120`이 실제 플레이에는 짧을 수 있음 (루미큐브 한 판 평균 30~60턴 but 긴 게임 100+) | 정상 게임 조기 종결 | 초기값을 **200**으로 상향 검토, ConfigMap으로 외부화했으므로 운영 중 조정 가능 |

### 8.2 경합 조건
- `advanceToNextTurn` 내 TurnCount 증가와 상한 검사 사이에 다른 goroutine이 state를 수정할 수 있는가?
  - → `gameService`는 Redis를 단일 저장소로 사용하며 `SaveGameState`가 원자적이다.
  - → 단, Go in-memory에서 `state` 포인터를 공유하는 AI goroutine이 있으면 race 발생 가능 → handleAITurn이 state를 복사하는지 확인 필요 (TBD)

### 8.3 엣지 케이스
1. `maxTurnsLimit=0` (제한 없음) 시 기존 동작 유지 — 필수 테스트
2. 첫 턴에 `maxTurnsLimit=1`로 설정 시 무한 루프/즉시 종결 정합성
3. `ConfirmTurn` 성공 후 승리(`finishGame`)와 상한 초과가 동시 발생 시 승리 우선 — 현재 코드는 `len(rackAfter)==0` 검사가 먼저이므로 안전하나 명시적 테스트 필요

---

## 9. 범위 외 (Out of Scope)

- 스크립트 측 `MAX_TURNS` 제거 — 스크립트는 **자신의 안전장치**를 유지
- 새 WS 이벤트 `GAME_TURN_LIMIT_REACHED` 도입 — 초기에는 STALEMATE로 통합, 향후 UX 분리 시 추가
- Redis TTL 단축 (옵션 C) — 기각
- DB `games.turn_count` 실시간 동기화 — 별도 이슈 (현재는 게임 종료 시 1회 저장)
- Grace Period 재구성 — 현 60초 유지
- Istio sidecar 도입 후 재검증 — Sprint 6 Phase 5에서 진행

---

## 10. 후속 작업 (Sprint 6 Day 2+)

- `endType="TURN_LIMIT"` 신규 이벤트 도입 (클라이언트 연계 필요)
- `GameRoom.TurnLimitSec` 필드를 방 생성 시 커스터마이즈 가능하도록 확장
- `TurnLimitReached` 메트릭을 SonarQube/Prometheus에 노출
- BUG-GS-005/006 회귀 방지 E2E 시나리오 추가 (Playwright)

---

## 부록 A — 파일 레퍼런스 요약

| 범주 | 파일 | 주요 라인 |
|------|------|-----------|
| 모델 | `src/game-server/internal/model/tile.go` | 46 (TurnCount) |
| 모델 | `src/game-server/internal/model/game.go` | 48 (TurnCount) |
| 서비스 | `src/game-server/internal/service/game_service.go` | 417 (finishGame), 435 (finishGameStalemate), 498 (advanceToNextTurn), 513 (penaltyDrawAndAdvance), 554 (DrawTile), 664 (ForfeitPlayer), 732 (SetPlayerStatus) |
| 핸들러 | `src/game-server/internal/handler/ws_handler.go` | 96-97 (aiTurnCancels), 805 (broadcastGameOver), 863 (handleAITurn), 1211 (HandleTimeout 호출), 1322 (cancelAITurn), 1333 (cleanupGame), 1561 (broadcastGameOverFromState), 1874 (handleDisconnect), 1920 (startGraceTimer), 1959 (forfeitAndBroadcast) |
| 리포지토리 | `src/game-server/internal/repository/redis_repo.go` | 14 (gameStateTTL=2h), 36 (SaveGameState), 63 (DeleteGameState) |
| 테스트 | `src/game-server/internal/handler/ws_cleanup_test.go` | 109 (TestCleanupGame_DeletesGameState), 129 (TestCleanupGame_CancelsAITurn), 288 (TestBroadcastGameOverFromState_CleansUpGame) |
| 스크립트 | `scripts/ai-battle-3model-r4.py` | 46 (MAX_TURNS=80), 210 (loop), 528 (--max-turns arg) |
