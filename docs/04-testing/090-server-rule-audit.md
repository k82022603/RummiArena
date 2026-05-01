# 87 — 서버 룰 라인 레벨 Audit (go-dev Phase B 산출물)

- **작성**: 2026-04-25, go-dev (소스코드 라인 레벨 리뷰 책임 인수)
- **입력 SSOT**: `docs/02-design/55-game-rules-enumeration.md` (V-01~V-19, D-01~D-12)
- **입력 상태 머신**: `docs/02-design/56b-state-machine.md` (서버 invariant)
- **분석 대상**: `src/game-server/internal/engine/`, `internal/handler/ws_handler.go`, `internal/service/game_service.go`
- **모듈화 기준**: `.claude/plans/reflective-squishing-beacon.md` 7원칙
- **절대 금지**: 실제 코드 수정 / 신규 룰 정의 / ai-adapter 측 변경 제안
- **목적**: 현 서버 구현과 SSOT V-* 룰의 매핑 완결도, 미구현 룰, 모듈화 위반을 라인 단위로 식별한다.

---

## 1. V-01 ~ V-19 ↔ engine/service 함수 매핑표

### 1.1 engine 계층 (순수 검증 함수)

| 룰 ID | SSOT 정의 | 구현 파일 | 구현 함수 | 핵심 라인 | 상태 |
|-------|----------|----------|----------|----------|------|
| **V-01** | 세트 유효성(그룹 또는 런) | `engine/validator.go` | `ValidateTileSet` | L:22-46 — `ValidateGroup` + `ValidateRun` 순차 시도. 두 쪽 모두 실패 시 `ErrInvalidSet` 반환 | **구현됨** |
| **V-02** | 세트 크기 3장 이상 | `engine/validator.go` | `ValidateTileSet` | L:23 `if len(ts.Tiles) < 3` 즉시 거부 | **구현됨** |
| **V-02** (그룹 측) | 그룹 최대 4장 | `engine/group.go` | `ValidateGroup` | L:11 `len(tiles) < 3 \|\| len(tiles) > 4` | **구현됨** |
| **V-03** | 랙에서 최소 1장 추가 | `engine/validator.go` | `ValidateTurnConfirm` | L:86-89 `tilesAdded := countTableTiles(after) - countTableTiles(before); if tilesAdded < 1` | **구현됨** |
| **V-04** | 최초 등록 30점 | `engine/validator.go` | `validateInitialMeld` | L:122-162 `addedSet` 부분집합 세트만 스코어링. `score < 30` 거부 | **구현됨** |
| **V-05** | 최초 등록 시 랙 타일만 사용 | `engine/validator.go` | `validateInitialMeld` | L:128-132 beforeCodes[code] > afterCodes[code] 시 `ErrNoRearrangePerm` | **구현됨** |
| **V-06** | 타일 보존(총 수) | `engine/validator.go` | `ValidateTurnConfirm` | L:94-97 총 수 비교. L:111-118 + `validateTileConservation` 코드 빈도 정밀 비교 | **구현됨** |
| **V-06** (코드 빈도) | 코드 수준 빈도 비교 | `engine/validator.go` | `validateTileConservation` | L:182-203 beforeFreq에서 jokerReturnedCodes 차감 후 afterFreq와 비교 | **구현됨** |
| **V-07** | 조커 회수 후 즉시 재사용 | `engine/validator.go` | `validateJokerReturned` | L:165-176 `JokerReturnedCodes`의 각 코드가 `afterCodes`에 존재하는지 확인 | **구현됨** |
| **V-08** | 자기 턴 확인 | `service/game_service.go` | `ConfirmTurn`, `PlaceTiles`, `DrawTile`, `ResetTurn` | 각 함수 내 `state.CurrentSeat != req.Seat` 검사 (L:330, L:267, L:617, L:681) | **구현됨** |
| **V-09** | 턴 타임아웃 | `handler/ws_handler.go` | `startTurnTimer` | L:1223-1305 goroutine 내 `time.After(timeoutSec)` → `HandleTimeout` 호출 | **구현됨** |
| **V-10** | 드로우 파일 소진 | `service/game_service.go` | `DrawTile` | L:626-643 `len(state.DrawPile) == 0` → ConsecutivePassCount 증가, 교착 판정 | **구현됨** |
| **V-11** | 교착 상태(Stalemate) | `service/game_service.go` | `DrawTile` + `finishGameStalemate` | L:637 `ConsecutivePassCount >= activePlayerCount` → `finishGameStalemate` 호출 | **구현됨** |
| **V-12** | 승리(랙 0장) | `service/game_service.go` | `ConfirmTurn` + `finishGame` | L:381-383 `len(rackAfter) == 0` → `finishGame`. `finishGame` L:450-462 | **구현됨** |
| **V-13a** | 재배치 권한(hasInitialMeld) | `engine/validator.go` | `validateInitialMeld` | L:128-132 `!req.HasInitialMeld` 분기에서 beforeCodes 감소 시 `ErrNoRearrangePerm` | **구현됨** |
| **V-13b** | Split(세트 분할) | engine + validator | `ValidateTable` 간접 | Split 후 양쪽 세트가 `ValidateTileSet` 통과하면 묵시적 허용. 명시적 Split 검증 없음 | **간접 구현** |
| **V-13c** | Merge(세트 합병) | engine + validator | `ValidateTable` 간접 | 합병 결과 세트가 V-01/V-02 통과하면 묵시적 허용 | **간접 구현** |
| **V-13d** | Move(타일 이동) | engine + validator | `ValidateTable` + `validateTileConservation` | 출발/도착 세트 모두 검증. V-06 conservation으로 타일 소실 방지 | **간접 구현** |
| **V-13e** | 조커 교체(Joker Swap) | `engine/validator.go` | `validateJokerReturned` | V-07 + V-06 결합. `JokerReturnedCodes` 경로 필수 | **구현됨** |
| **V-14** | 그룹 동색 중복 불가 | `engine/group.go` | `ValidateGroup` | L:27-30 `colorSeen[t.Color]` 중복 검사 → `ErrGroupColorDup` | **구현됨** |
| **V-15** | 런 숫자 연속(1↔13 순환 금지) | `engine/run.go` | `ValidateRun` + `checkRunDuplicates` + `checkRunBounds` | L:60-68(중복), L:70-92(범위). `12-13-1` 순환은 `possibleStart+runLen-1 > 13` 조건으로 차단 | **구현됨** |
| **V-16** | 그룹 색상 enum 정합성 | `engine/tile.go` | `Parse` | L:41-44 `color` switch `{R,B,Y,K}` 외 즉시 에러. ParseAll을 통해 ValidateTurnConfirm 진입 전에 코드 파싱 | **구현됨** |
| **V-17** | 그룹 ID 서버측 발급 | `handler/ws_handler.go` | `processAIPlace` | **L:1061 `tableGroups[i] = service.TilePlacement{Tiles: g.Tiles}` — ID 미할당. V-17 위반.** 상세 §2 | **미구현(버그)** |
| **V-18** | 턴 스냅샷 무결성 | `service/game_service.go` | `PlaceTiles` + `getOrCreateSnapshot` | L:277-289 최초 PlaceTiles 시 rack+table 스냅샷 저장. L:389-399 ConfirmTurn에서 스냅샷 조회/생성. Redis 키 미사용(인메모리) | **부분 구현** |
| **V-19** | WS seq 단조성 | — | — | `WSEnvelope`에 `seq` 필드 있음(ws_message.go L:54), **수신 seq 역순/중복 검증 로직 없음** | **미구현** |

---

### 1.2 service 계층 — V-08/V-09/V-10/V-11/V-12 상세 분석

| 함수 | 검증 룰 | 핵심 로직 라인 |
|------|--------|--------------|
| `game_service.go:ConfirmTurn` | V-08, V-03~V-07, V-13a, V-14, V-15 | L:330(V-08), L:353(engine.ValidateTurnConfirm), L:356-363(검증실패→패널티) |
| `game_service.go:DrawTile` | V-08, V-10, V-11 | L:617(V-08), L:626(V-10), L:637(V-11 교착) |
| `game_service.go:PlaceTiles` | V-08, 임시 배치 | L:267(V-08), L:291-303(tilesFromRack ↔ tableGroups 정합성) |
| `game_service.go:ForfeitPlayer` | V-12 간접(활성자 1명 → 자동승리) | L:746-766 |
| `handler/ws_handler.go:startTurnTimer` | V-09 | L:1223-1305 goroutine |

---

## 2. processAIPlace V-17 위반 — 라인 단위 분석

### 2.1 위반 코드 위치

파일: `src/game-server/internal/handler/ws_handler.go`

```
L:1058  func (h *WSHandler) processAIPlace(roomID, gameID string, seat int, resp *client.MoveResponse) {
L:1059      tableGroups := make([]service.TilePlacement, len(resp.TableGroups))
L:1060      for i, g := range resp.TableGroups {
L:1061          tableGroups[i] = service.TilePlacement{Tiles: g.Tiles}  // ID 미할당
L:1062      }
```

### 2.2 문제 발생 경로

`client.MoveResponse.TableGroups[i]`는 AI 어댑터가 반환한 그룹이며, `ID` 필드는 빈 문자열이다. `service.TilePlacement{Tiles: g.Tiles}`에서 `ID` 필드를 명시하지 않으면 Go 기본값인 `""` 상태로 `ConfirmTurn` → `convertToSetOnTable` → Redis에 적재된다.

### 2.3 결과

`model.SetOnTable.ID = ""`인 그룹이 테이블에 존재하게 된다. 이후 클라이언트의 TURN_END 수신 시 `tableGroups[i].id = ""`로 브로드캐스트된다. 클라이언트가 `pending-` prefix 없는 빈 ID 그룹을 처리할 때 D-01(ID 유니크) 위반 + D-12(pending→server ID 매핑 누락) 복합 위반이 발생한다.

### 2.4 V-17 매핑

SSOT V-17: "모든 테이블 그룹 ID는 서버에서 발급(UUID v4)". AI 배치 경로(`processAIPlace`)에서 `service.TilePlacement.ID`를 `uuid.New().String()`으로 채워야 한다.

### 2.5 비교: Human 경로

`handleConfirmTurn` → `wsGroupsToService` (L:2416-2421):
```
L:2419  result[i] = service.TilePlacement{ID: g.ID, Tiles: g.Tiles}
```
Human 경로는 클라이언트가 전송한 ID(또는 `pending-` prefix)를 그대로 전달한다. `convertToSetOnTable`(game_service.go L:916-931)에서는 전달된 ID를 그대로 사용하며 서버 발급 UUID로 교체하는 로직이 없다.

따라서 Human 경로에서도 서버가 UUID를 직접 발급하지 않는다. V-17 완전 구현을 위해서는 `convertToSetOnTable`이 신규 그룹(pending- prefix 또는 빈 ID)에 대해 UUID를 발급해야 한다.

### 2.6 수정 제안 (분석 전담, 실제 수정은 다음 sprint)

- `processAIPlace` L:1061: `ID: uuid.New().String()` 추가
- `convertToSetOnTable` 또는 `ConfirmTurn` 내부: 빈 ID 또는 `pending-` prefix ID를 새 UUID로 교체하는 로직 추가 (Human/AI 양쪽 통일)

---

## 3. D-* 데이터 무결성 룰 서버측 검증 분석

| D-ID | SSOT 정의 | 서버 구현 파일:라인 | 상태 |
|------|----------|------------------|------|
| **D-01** | 그룹 ID 유니크 | 미구현 — `convertToSetOnTable`(game_service.go L:916-931)은 ID 충돌 검사 없음 | **미구현** |
| **D-02** | 동일 tile code 보드 1회만 등장 | `validateTileConservation` (validator.go L:182-203)이 사라진 타일은 검출하나, 중복 추가는 `ValidateTable`(V-01/V-02)에서 걸리지 않음. D-02 명시 검증 없음 | **간접 구현** |
| **D-03** | 빈 그룹 금지 | `ValidateTileSet` L:23 `len(ts.Tiles) < 3`이 빈 그룹을 V-02로 거부. 단 `< 3` 이라 1~2장도 거부되어 빈 그룹은 묵시 차단 | **간접 구현** |
| **D-04** | tile code 형식 정규식 | `engine/tile.go:Parse` L:32-63 — JK1/JK2, `{R,B,Y,K}{1-13}{a,b}` 검증 | **구현됨** |
| **D-05** | 보드+랙+drawpile = 106 | 서버측 invariant 검증 없음. `newGame`에서 `GenerateDeck` 106장으로 시작하지만 런타임 중 보존 검증 미구현 | **미구현** |
| **D-06** | 동일 색·숫자 2장 (a/b 접미) | `engine/tile.go:GenerateDeck` L:89-112에서 a/b 각 1회 생성으로 보장. 런타임 중 D-06 위반 검증 없음 | **초기 생성 보장** |
| **D-07** | JK1, JK2 정확히 2장 | `GenerateDeck` L:108-109에서 2장 생성. 런타임 중 검증 없음 | **초기 생성 보장** |
| **D-08** | 조커 wildcard(V-04 점수 계산) | `validator.go:groupScore` L:42-62, `runScore` L:105-153 — 조커 값 추론 구현됨 | **구현됨** |
| **D-09** | 색상 enum {R,B,Y,K} | `engine/tile.go:Parse` L:41-44 — switch 내 4색 외 거부 | **구현됨** |
| **D-10** | tableGroup.type 힌트 참고용 | `stateTableToWSGroups`(ws_handler.go L:2424-2448) — 비조커 숫자 단일 여부로 group/run 타입 추론. hints는 참고용 | **구현됨** |
| **D-11** | WS envelope 4필드 필수 | `ws_connection.go:ReadPump` L:212-214 JSON 파싱 실패 시 에러 반환. 개별 필드 null 체크 미구현 | **부분 구현** |
| **D-12** | pending→server ID 매핑 | `processAIPlace` L:1061 ID 미할당(V-17와 동일 근본 원인). Human 경로도 `convertToSetOnTable` 내 pending→UUID 교체 없음 | **미구현** |

---

## 4. V-19 WS seq 단조성 미구현 평가

### 4.1 현황 확인

`ws_message.go` L:51-56:
```go
type WSEnvelope struct {
    Type      string          `json:"type"`
    Payload   json.RawMessage `json:"payload"`
    Seq       int             `json:"seq"`
    Timestamp string          `json:"timestamp"`
}
```

`WSEnvelope.Seq` 필드는 구조체에 존재한다.

`ws_connection.go` L:212-257: `ReadPump`에서 JSON 언마샬 후 `handler(c, &env)`로 직접 디스패치. seq 역순/중복 검사 없음.

`ws_handler.go:handleMessage` L:374-398: switch로 타입 분기. env.Seq 미참조.

`ws_connection.go` S2C 방향(seqNum L:38-39): 서버→클라이언트 seq는 단조 증가로 관리됨. 단 클라이언트→서버 방향 seq 검증 없음.

### 4.2 결론

V-19는 수신(C2S) seq 검증이 없다. PLACE_TILES / CONFIRM_TURN에 대해 역순/중복 seq 거부 로직이 전혀 존재하지 않는다. 구조체 필드만 있고 동작은 미구현 상태.

### 4.3 위험

재전송된 PLACE_TILES(낮은 seq)를 서버가 유효한 신규 요청으로 처리할 수 있다. 특히 타임아웃 재전송 시나리오에서 중복 배치가 발생할 수 있으나 `ValidateTurnConfirm`의 V-03(랙 최소 1장 추가)이 2차 방어선으로 일부 차단 가능하다.

---

## 5. 모듈화 7원칙 위반 지점

### 5.1 위반 1 — SRP 위반: ws_handler.go 2457줄 Monolith

`src/game-server/internal/handler/ws_handler.go` (2457줄)에 다음 책임이 혼재한다:

| 책임 영역 | 함수 | 라인 범위 |
|----------|------|---------|
| WS 인증/연결 관리 | `authenticate`, `handleDisconnect` | L:254-336, L:2154-2192 |
| 게임 액션 핸들러 (Human) | `handlePlaceTiles`, `handleConfirmTurn`, `handleDrawTile`, `handleResetTurn` | L:404-597 |
| AI 턴 오케스트레이터 | `handleAITurn`, `processAIPlace`, `processAIDraw`, `forceAIDraw` | L:905-1166 |
| AI 상태 관리 | `incrementForceDrawCounter`, `resetForceDrawCounter` | L:1170-1214 |
| 브로드캐스트 헬퍼 | `broadcastTurnEnd`, `broadcastTurnStart`, `broadcastGameOver` 등 8개 | L:723-897, L:1559-1664 |
| 턴 타이머 관리 | `startTurnTimer`, `cancelTurnTimer`, `restoreTimerIfNeeded` | L:1223-1508 |
| Grace Period | `startGraceTimer`, `checkAbsentTurnAndForfeit`, `forfeitAndBroadcast` | L:1307-2326 |
| Redis 세션/타이머 저장 | `saveSessionToRedis`, `saveTimerToRedis` 등 | L:1395-1554 |
| ELO 업데이트 | `updateElo`, `updateEloRedis` | L:1754-1941 |
| 영속화 | `persistGameResult` | L:1947-2083 |
| 변환 헬퍼 | `wsGroupsToService`, `stateTableToWSGroups`, 기타 | L:2416-2457 |

SRP 위반: 단일 파일에 인증, 게임 로직, AI 오케스트레이션, ELO, DB 영속화, 타이머 관리가 모두 들어있다.

**모듈화 기준 §1(단일 책임 원칙) 위반.**

### 5.2 위반 2 — 순수 함수 원칙 위반: handler 내 비즈니스 로직

`handler/ws_handler.go`의 AI 오케스트레이터(`handleAITurn` L:905-1010)가 game state 조회, AI 호출, 상태 변경, 브로드캐스트를 단일 함수 내에서 수행한다. 순수 함수로 분리 불가하며 부작용이 명시적으로 격리되지 않는다.

`tileScoreFromCode` (L:1720-1738)는 `engine/tile.go`의 `tileScore` (game_service.go L:518-527)와 동일 로직이 handler 패키지에 복사되어 있다. 코드 중복 + 계층 원칙 위반.

**모듈화 기준 §2(순수 함수 우선), §4(계층 분리) 위반.**

### 5.3 위반 3 — handler → service 책임 누설

`incrementForceDrawCounter` (ws_handler.go L:1170-1203)가 `state.Players[playerIdx].ConsecutiveForceDrawCount`를 직접 변경하고 `SaveGameState`를 호출한다. 상태 변경은 service 계층 책임인데 handler가 직접 수행한다.

**모듈화 기준 §4(계층 분리) 위반.**

### 5.4 위반 4 — V-17 미구현에 의한 수정 용이성 저하

`processAIPlace` L:1061에서 ID를 할당하지 않는 버그는 `convertToSetOnTable` (game_service.go L:916-931)이 ID를 그대로 통과시키는 구조와 결합되어 있다. ID 발급 책임이 어느 계층(handler/service/repository)인지 명세되지 않아 수정 시 여러 계층을 동시에 수정해야 한다.

**모듈화 기준 §6(수정 용이성) 위반.**

### 5.5 위반 5 — D-11 envelope 검증 불완전

`ReadPump` L:212-214에서 JSON 파싱 성공만 확인하고 `type`, `seq`, `timestamp` 필드의 null/zero 값 검증이 없다. D-11("WS envelope 4필드 모두 필수")이 코드로 표현되지 않음. SSOT 룰 ID 매핑 없는 불완전 검증.

**band-aid 금지 원칙(§7) 경계 사례 — 검증 미구현이므로 band-aid 아니지만 SSOT 미반영.**

---

## 6. 폐기/보존/수정 분류표

### 6.1 engine 패키지

| 함수/파일 | 거취 | 룰 ID 근거 | 비고 |
|---------|------|-----------|------|
| `tile.go:Parse` | **보존** | V-16, D-04, D-09 | 완전 구현, 테스트 완비 |
| `tile.go:GenerateDeck` | **보존** | D-05, D-06, D-07 | 초기 보장 완료 |
| `validator.go:ValidateTurnConfirm` | **보존** | V-01~V-07, V-13a, V-14, V-15 | 핵심 검증 함수. 순수 함수 원칙 충족 |
| `validator.go:validateInitialMeld` | **보존** | V-04, V-05, V-13a | 완전 구현 |
| `validator.go:validateJokerReturned` | **보존** | V-07, V-13e | 완전 구현 |
| `validator.go:validateTileConservation` | **보존** | V-06, D-02 | 코드 빈도 비교 정밀 구현 |
| `group.go:ValidateGroup` | **보존** | V-01, V-02, V-14 | 완전 구현 |
| `run.go:ValidateRun` | **보존** | V-01, V-02, V-15 | 완전 구현 |
| `pool.go:TilePool` | **보존** | D-05, D-06, D-07 | 초기 분배 완전 구현 |

### 6.2 service 패키지

| 함수 | 거취 | 룰 ID 근거 | 비고 |
|------|------|-----------|------|
| `ConfirmTurn` | **수정** | V-08, V-17 | 서버 UUID 발급 로직 추가 필요 (`convertToSetOnTable` 또는 ConfirmTurn 내부) |
| `convertToSetOnTable` | **수정** | V-17, D-01, D-12 | 빈 ID / `pending-` prefix → UUID 발급 로직 추가 필요 |
| `PlaceTiles` | **보존** | V-08 | 임시 배치 검증 충분 |
| `DrawTile` | **보존** | V-08, V-10, V-11 | 교착 판정 포함 완전 구현 |
| `finishGameStalemate` | **보존** | V-11 | 최저 점수 승자 판정 완전 구현 |
| `validateInitialMeld`, `validateJokerReturned`, `validateTileConservation` | **보존** | V-04~V-07 | engine 계층. 이동 불필요 |
| `tileScore` | **통합** | — | `engine/tile.go:Score()` 또는 shared 함수로 통합 (handler 복사본 `tileScoreFromCode` 제거 대상) |

### 6.3 handler 패키지

| 함수 | 거취 | 룰 ID 근거 | 비고 |
|------|------|-----------|------|
| `processAIPlace` | **수정** | V-17, D-12 | L:1061 `ID: uuid.New().String()` 추가 |
| `handleAITurn` | **수정(계층 분리)** | SRP | AI 오케스트레이터 로직을 별도 `service.AITurnService` 또는 `ai_orchestrator.go`로 분리 권장 |
| `incrementForceDrawCounter` | **수정(계층 분리)** | SRP | 상태 변경은 service 계층으로 이동. handler는 결과만 수신 |
| `tileScoreFromCode` | **폐기** | — | `engine/tile.go:Parse().Number` 또는 service.tileScore로 대체 |
| `authenticate`, `parseJWT` | **보존** | D-11(부분) | 인증 경로. envelope 필드 검증 보강 고려 |
| `broadcastTurnEnd`, `broadcastTurnEndFromState` | **통합 검토** | SRP | 두 함수가 동일한 TURN_END 페이로드를 구성. Connection 유무로만 분기. 공통 페이로드 빌더 추출 권장 |
| `startTurnTimer` | **분리 검토** | V-09 | 별도 `timer_manager.go`로 추출 권장 |
| `saveSessionToRedis`, `saveTimerToRedis`, `restoreTimerIfNeeded` | **분리 검토** | V-18, V-09 | Redis 저장 로직은 별도 `ws_redis_store.go`로 추출 권장 |
| `updateElo`, `updateEloRedis`, `persistGameResult` | **분리(P1)** | — | 게임 종료 후처리. `game_finalize.go` 또는 별도 서비스로 분리 권장 |
| `stateTableToWSGroups`, `wsGroupsToService`, `buildTableGroups` | **보존** | — | 변환 헬퍼. 현재 위치 유지 가능하나 `ws_convert.go`로 파일 분리 권장 |

---

## 7. V-18 턴 스냅샷 무결성 — 부분 구현 상세

SSOT V-18: "서버는 `Redis: game:{gameId}:snapshot:{turnNum}` 에 tableBefore 스냅샷을 저장".

현재 구현은 Redis가 아닌 인메모리(`gameService.snapshots` map, game_service.go L:107)에 저장한다:

```go
// game_service.go L:107
snapshots  map[string]*turnSnapshot // key: gameID+":"+seat
```

`turnSnapshot`은 rack과 table만 보관(L:99-102). `turnNum`은 키에 포함되지 않고 `snapshotKey = gameID+":"+seat`(L:989)만 사용.

**결론**: V-18의 Redis 저장 + turnNum 키 요건은 미충족. 기능적 롤백은 동작하나 Pod 재시작 시 스냅샷이 소실된다. 단일 Pod 운영에서는 무해하지만, 다중 Pod / 재시작 시나리오에서 ResetTurn이 실패할 수 있다.

---

## 8. 서버 invariant ↔ 코드 매핑 (docs/02-design/56b-state-machine.md §3)

| Invariant | 서버 구현 | 비고 |
|----------|----------|------|
| **INV-G1** D-01 그룹 ID 유니크 | 미구현 (서버) | `convertToSetOnTable`에 ID 충돌 검사 없음 |
| **INV-G2** D-02 tile code 보드 1회 | `validateTileConservation` 간접 보호 | 중복 추가는 V-01/V-02 통과 가능. 명시 검증 없음 |
| **INV-G3** D-03 빈 그룹 없음 | `ValidateTileSet` L:23 묵시적 차단 | `len < 3` → 빈 그룹 ERR_SET_SIZE |
| **INV-G4** D-05 타일 총계 106 | 미구현 | 런타임 검증 없음 |
| **INV-G5** D-12 pending→server ID | 미구현 (Human+AI 양쪽) | V-17과 동일 근본 원인 |

---

## 9. 요약

### 9.1 매핑률

| 카테고리 | 총 룰 | 완전 구현 | 간접/부분 | 미구현(버그) |
|---------|------|---------|---------|------------|
| V-01~V-15 | 19 (V-13a~e 포함) | 15 | 3 (V-13b/c/d) | 1 (V-17) |
| V-16~V-19 (신규) | 4 | 1 (V-16) | 1 (V-18) | 2 (V-17, V-19) |
| D-01~D-12 | 12 | 5 | 4 | 3 (D-01, D-05, D-12) |
| **합계** | 35 | 21 | 8 | **6** |

**V-* 매핑률: 16/23 = 69.6% 완전 구현, 3/23 간접, 4/23 미구현/부분**

### 9.2 P0 미구현 룰 (게임 진행 차단 잠재성)

1. **V-17** — `processAIPlace` L:1061 ID 미할당 → AI 그룹 빈 ID 적재 (INC-T11-IDDUP의 서버측 원인)
2. **D-12** — Human/AI 양쪽 pending→UUID 교체 미구현 → ghost group 발생 가능

### 9.3 P1 미구현 룰

3. **V-19** — WS seq 단조성 검증 없음 → 재전송 중복 처리 가능성
4. **V-18** — 스냅샷 Redis 미적재 → Pod 재시작 시 ResetTurn 실패

### 9.4 P2 (구조적 문제)

5. **D-01** — 서버측 그룹 ID 유니크 검사 없음
6. **D-05** — 타일 총계 106 런타임 검증 없음
7. `ws_handler.go` 2457줄 SRP 위반 — 11개 책임 혼재
8. `tileScoreFromCode` handler 복사본 — engine 코드 중복

---

## 10. 모듈화 7원칙 self-check

| 원칙 | 현 코드 충족 여부 | 위반 위치 |
|------|--------------|---------|
| 1. SRP | **미충족** | `ws_handler.go` 2457줄 11-책임 혼재 |
| 2. 순수 함수 우선 | **미충족** | `handleAITurn` 부작용 미분리, `tileScoreFromCode` 중복 |
| 3. 의존성 주입 | **충족** | `NewWSHandler` opts 패턴, nil 허용 injectable |
| 4. 계층 분리 | **부분 미충족** | `incrementForceDrawCounter` handler→state 직접 변경 |
| 5. 테스트 가능성 | **부분 충족** | engine 순수 함수 테스트 완비. handler 통합 테스트 부재 |
| 6. 수정 용이성 | **미충족** | V-17 수정 시 handler/service/model 3-계층 동시 수정 필요 |
| 7. band-aid 금지 | **충족** | engine 검증 함수는 룰 ID 기반. handler 레벨 ad-hoc 체크 없음 |

---

## 변경 이력

- **2026-04-25 v1.0**: go-dev Phase B 산출물 발행. V-* 매핑 69.6%, 미구현 룰 4개(V-17/V-19/V-18/D-01/D-12), 폐기/보존/수정 분류 완료.
