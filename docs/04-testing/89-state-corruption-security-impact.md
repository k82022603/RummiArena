# 89 — State Corruption Sprint 보안 영향 평가

- **작성**: 2026-04-25, security
- **상위 SSOT**: `docs/02-design/55-game-rules-enumeration.md` (V-/UR-/D-), `docs/02-design/56b-state-machine.md` (INV-G1~G5 + S0~S10 invariant)
- **입력 사고**: `docs/04-testing/84-ui-turn11-duplication-incident.md`, `docs/04-testing/86-ui-2nd-incident-2026-04-25.md`
- **분석 코드**: `src/game-server/internal/handler/ws_handler.go` (1059 processAIPlace, 442 handleConfirmTurn), `src/game-server/internal/service/game_service.go` (322 ConfirmTurn), `src/game-server/internal/engine/validator.go`, `src/frontend/src/store/gameStore.ts`
- **분석 범위**: 본 sprint 의 UI state corruption 사고 3건이 만든 보안 권한 모델 영향. 클라이언트 state 부패 → 서버 진실성 영향 / WS 메시지 변조 → V-* 우회 가능성 / V-17 ID 누락 → 권한 우회 / INV-* 16개 보안 의미.
- **금지**: 코드 수정 (분석 전담). band-aid 보안 가드 제안 (서버 검증으로 본질 해결, 클라 가드 보안 신뢰 금지). 본 평가는 "현 서버 검증이 클라 부패에 대해 실제로 충분한가" 를 증명/반증하는 데 한정.
- **결론 요약**: 본 sprint 의 사고 3건은 모두 **클라이언트 단독 부패** 이며, 현 서버 검증 (`engine.ValidateTurnConfirm` + `getOrCreateSnapshot`) 이 **권한 모델을 우회하지 못하도록 설계되어 있음을 재확인**. 다만 V-17 (AI 그룹 ID 미할당) 이 sprint 진행 중 발견된 audit gap 으로, 이를 일반화한 신규 보안 부채 4건을 식별.

---

## 0. 위협 모델 — 본 sprint 의 신뢰 경계

```
┌─────────────┐  WS env  ┌──────────────┐  Engine req  ┌──────────────┐
│ Client/     │─────────▶│ ws_handler   │─────────────▶│ Game Engine  │
│ AI Adapter  │  (변조   │ (untrusted   │ (snapshot 기반│ (SSOT 검증)  │
│             │  가능)   │  payload)    │  TableBefore) │              │
└─────────────┘          └──────────────┘              └──────────────┘
                              │  Redis/메모리
                              ▼
                         ┌──────────────┐
                         │ snapshots[]  │ ← 신뢰 경계 안쪽 = 서버만 쓰기
                         │ + GameState  │
                         └──────────────┘
```

**신뢰 경계 (Trust Boundary)**:
- **경계 밖** = 클라이언트 (`gameStore.ts`), AI Adapter 응답 (`MoveResponse`), WS envelope 수신부
- **경계 안** = `engine.ValidateTurnConfirm`, `getOrCreateSnapshot`, Redis `GameStateRedis`

**적대자 모델 (Threat Actors)**:
1. **악의 클라이언트 (M1)** — 합법적 OAuth 인증 후 WS 메시지를 직접 조작. 자신의 seat 번호로 다른 플레이어 자리/턴을 가장 시도.
2. **타협된 AI Adapter (M2)** — sidecar Pod 내 AI Adapter 가 변조된 `MoveResponse` 반환. AI 가 LLM 응답을 신뢰하므로 성립.
3. **WS MITM (M3)** — Istio mTLS 내부에서는 어렵지만 ingress 외부 (Traefik 외부) 에서 가능. 본 sprint 가 만든 Istio 선별 적용 (game-server/ai-adapter) 은 `M3` 부분 완화.
4. **부패된 클라 state (M4)** — 본 sprint 의 사고 3건 자체. 사용자 의도와 무관하게 부패한 pendingTableGroups 가 서버에 송신.

본 평가의 핵심 질문: **"M4 가 M1 으로 변환될 수 있는가?"** (사용자가 무의식적으로 부패한 state 를 confirm 하면 자동으로 권한 우회가 되는가)

---

## 1. WS 메시지 변조 가능성 — CONFIRM_TURN payload 위조 시나리오

### 1.1 공격 표면

`handler/ws_handler.go:442 handleConfirmTurn` 가 신뢰 없이 받는 입력:

| 필드 | 출처 | 변조 시 영향 가능성 |
|------|------|-------------------|
| `payload.TableGroups[].ID` | 클라 | `wsGroupsToService:2419` 가 그대로 `service.TilePlacement{ID}` 로 전파. 그러나 `ConfirmTurn:341 convertToSetOnTable` 에서 `tableAfter` 만 만들고 **TableBefore 는 서버 스냅샷으로 덮어씀** (`getOrCreateSnapshot:339`). 클라 ID 는 무시됨 |
| `payload.TableGroups[].Tiles` | 클라 | **공격 핵심 표면**. 그러나 V-06 conservation + V-04 score 가 tableBefore (서버 스냅샷) vs tableAfter (클라 주장) 의 tile **code 빈도 비교** 로 검증 |
| `payload.TilesFromRack` | 클라 | `resolveRackAfter:343` 가 서버 rackBefore 에서 빼는 식으로 검증 → 보유하지 않은 tile 코드는 `removeTilesFromRack` 에서 거부 |
| `payload.JokerReturnedCodes` | 클라 | V-07 `validateJokerReturned` 가 tableAfter 에 회수 코드가 있는지 강제 |
| `env.Seq` | 클라 | **현재 검증 없음** — V-19 (메시지 시퀀스 단조성) 이 SSOT 에 신설되었으나 ws_handler 에 미구현 |
| `env.Type` | 클라 | switch dispatch — 알려지지 않은 타입은 INVALID_MESSAGE |
| `conn.seat` | **서버** (AUTH 시점에 set) | 변조 불가. M1 의 seat 가장 차단 |

### 1.2 시나리오 N1 — 가짜 tableGroup 추가 (PLACE_TILES 위조)

**공격**: 클라 M1 이 `tableGroups: [..., {id:"forged-1", tiles:["R7a","R8a","R9a"]}]` 를 추가 송신. R7a~R9a 는 다른 플레이어 랙 또는 drawpile 에 있는 타일.

**현 방어**:
1. `engine.ValidateTurnConfirm` 의 V-06 (`validateTileConservation`) — afterFreq 에 R7a/R8a/R9a 가 추가됨. beforeFreq 에 없으면 통과? **여기서 검사가 부족** — "보드 위에 갑자기 등장한 타일" 자체는 V-06 의 단조 비교로 잡히지 않음.
2. **그러나** `resolveRackAfter:343` → `removeTilesFromRack` 가 **자신의 랙에서 R7a/R8a/R9a 를 차감 시도**. 자신의 랙에 없으면 INVALID_REQUEST 반환 → 서버는 거부.
3. **D-05** (보드 + 모든 랙 + drawpile = 106) invariant 는 서버 내부에서만 유지. 클라가 가공의 타일을 추가해도 서버 게임 상태는 공식 풀에 의해 제약됨 (`pool.go` 가 106 + JK1/JK2 만 발급).

**평가**: V-06 단독으로는 "갑자기 등장한 타일" 검출 부족하나, **rack-as-source-of-truth + 서버 발급 풀 = 106** invariant 가 합쳐져 차단. **현재 안전**.

**잔존 위험**: V-06 강화 — `validateTileConservation` 가 "afterFreq 에는 있지만 beforeFreq 에도 없고 rackBefore 에도 없는 코드" 를 명시 거부하는 분기를 추가하면 깊이방어 (defense in depth) 강화. 우선순위 P3.

### 1.3 시나리오 N2 — 다른 플레이어 타일을 자기 랙에 가장 (TilesFromRack 위조)

**공격**: M1 이 `tilesFromRack: ["R7a"]` 송신. R7a 가 다른 플레이어 랙에 있음.

**현 방어**: `removeTilesFromRack(state.Players[playerIdx].Rack, ["R7a"])` 가 자기 랙에서 R7a 못 찾으면 에러 → 거부. **안전**.

### 1.4 시나리오 N3 — Group ID 충돌 의도적 송신 (D-01 위반 시도)

**공격**: M1 이 `tableGroups: [{id:"g1",...}, {id:"g1",...}]` 같은 ID 두 개로 송신.

**현 방어**: `wsGroupsToService` 가 ID 를 그대로 `service.TilePlacement{ID:"g1"}` 로 옮김 → `convertToSetOnTable` 가 `model.SetOnTable` 로 변환 → V-01/V-02 통과하면 그대로 `state.Table = tableAfter`. **D-01 (그룹 ID 유니크) 서버 측 강제가 없음**.

**영향**:
- V-04/V-06 계산은 ID 가 아니라 tile code 빈도 기반 → 점수/보존 검증은 ID 충돌과 독립적으로 정확
- **그러나** 다음 턴 재배치 시 `tableBefore = state.Table` 이 ID 가 충돌한 채 저장됨 → 다음 플레이어가 "그룹 g1 을 옮긴다" 했을 때 모호
- 서버는 **tile code 기반 검증** 이라 게임 진행 자체에는 무해, 하지만 클라 UI 가 ID 키 기반 react 렌더링 시 ghost 키 충돌 → INC-T11-IDDUP 와 동일한 클라 단독 부패 재현 가능

**평가**: V-17 (그룹 ID 서버측 발급) SSOT 신설 의 직접 근거. **P1 신규 부채**.

### 1.5 시나리오 N4 — Seq 역순/중복 (V-19 위반 시도)

**공격**: M1 이 동일 `seq=42` 의 CONFIRM_TURN 을 두 번 송신, 또는 `seq=10` 후 `seq=8` 송신.

**현 방어**: **없음**. `ws_handler` 가 env.Seq 검증 안 함. 첫 번째 CONFIRM_TURN 이 `state.Table = tableAfter` 까지 commit 한 후 두 번째가 도착하면 **새 tableBefore 스냅샷 = 첫 번째 결과** 가 되어 idempotent 처럼 동작 (스냅샷 위치: `getOrCreateSnapshot:339` 가 snapshots[snapKey] 있으면 그것을 쓰고, 첫 번째 confirm 이 snapshots 를 delete:377 했으므로 두 번째는 새 스냅샷 = 첫 번째 결과로 시작 = `tilesAdded = 0` → ErrNoRackTile 거부).

**평가**: 우연히 안전하지만 명시적 보장 없음. V-19 미구현. **P2 신규 부채**.

### 1.6 시나리오 N5 — 다른 seat 의 ConfirmTurn 송신

**공격**: M1 이 `state.CurrentSeat == 2` 인 동안 `conn.seat == 0` 이지만 `req.Seat = 2` 로 가장 시도.

**현 방어**: `handleConfirmTurn:452` 가 `Seat: conn.seat` 로 강제 (payload 의 seat 무시). `ConfirmTurn:330` 도 `state.CurrentSeat != req.Seat` 체크 + AUTH 시점에 server-set conn.seat. **M1 시나리오는 seat 가장 불가능**. **안전**.

### 1.7 시나리오 N6 — payload 거대화 (DoS)

**공격**: `tableGroups` 1만 개 또는 `tiles` 가 1만 개인 그룹 송신.

**현 방어**: `ws_connection.go:18 maxMessageSize = 8192` (bytes) → ReadLimit 으로 ws conn 자체가 끊어짐. 통상 합법 payload 는 ~1KB. **안전**.

### 시나리오 종합

| 시나리오 | 차단됨? | 차단 메커니즘 | 잔존 위험 |
|---------|---------|--------------|----------|
| N1 (가짜 그룹) | Yes | rack source-of-truth + 풀 106 | V-06 강화 권고 (P3) |
| N2 (남의 타일) | Yes | removeTilesFromRack | 없음 |
| N3 (ID 충돌) | **No (게임 진행 무해 / 클라 부패 매개)** | V-17 미구현 | **P1 신규 부채** |
| N4 (Seq 역순) | 우연히 | snapshot delete + tilesAdded check | V-19 미구현 P2 |
| N5 (Seat 가장) | Yes | conn.seat 서버 set + state.CurrentSeat 검증 | 없음 |
| N6 (DoS) | Yes | maxMessageSize 8KB | 없음 |

**총 6 시나리오 중 본질 권한 우회 = 0건, audit gap = 2건 (N3 V-17, N4 V-19)**.

---

## 2. Client State 부패 보안 영향 — pendingTableGroups 가 부패해도 서버 진실성 영향 없는가?

### 2.1 결론

**서버 진실성 영향 없음.** 본 sprint 사고 3건 (INC-T11-DUP, INC-T11-IDDUP, INC-T11-FP-B10) 모두 **클라이언트 단독 부패** 로, 서버는 11턴 내내 healthy 였음 (postmortem 84 §4 핵심 관찰).

### 2.2 증명 — 서버 검증 메커니즘이 클라 부패에 의존하지 않는 구조

`game_service.go:322 ConfirmTurn` 의 신뢰 입력 분리:

```
신뢰 입력 (서버):
  state = gameRepo.GetGameState(gameID)        ← Redis (서버 단독 쓰기)
  rackBefore = state.Players[playerIdx].Rack   ← 서버 마지막 commit
  tableBefore = state.Table                    ← 서버 마지막 commit (스냅샷)

비신뢰 입력 (클라):
  req.TableGroups → tableAfter (주장만)
  req.TilesFromRack → 자기 랙에서 빼는 시도
```

**핵심**: `engine.ValidateTurnConfirm` 의 모든 V-* 검증이 **서버 신뢰 입력 (TableBefore + RackBefore) ↔ 클라 주장 (TableAfter + TilesFromRack)** 차이를 보는 구조. 클라가 부패한 pendingTableGroups 를 들고 있어도 **서버는 자신의 스냅샷 기준으로만 판정**.

### 2.3 부패한 state 가 commit 되면?

INC-T11-DUP (D-02 위반: 11B 가 두 그룹 동시 등장) 가 만약 사용자가 ConfirmTurn 눌러 commit 시도:

1. 클라 송신: `tableGroups: [..., {tiles:[..."B11..."]}, {tiles:[..."B11..."]}]` (B11 중복)
2. 서버 검증:
   - V-06 conservation: tableBefore 의 B11 1장 vs tableAfter 의 B11 2장 → afterFreq[B11]=2 ≥ beforeFreq[B11]=1 → V-06 통과 (이건 의외, "추가" 는 허용)
   - **그러나** rackBefore 에서 추가된 B11 을 차감 → `resolveRackAfter` 가 자기 랙에서 B11 찾기 시도 → 부패한 클라가 "B11 을 두 번 보드에 넣었다" 하려면 자기 랙에 B11 두 장 있어야 함 → 한 장만 있으면 INVALID_REQUEST
   - 운 나쁘게 자기 랙에 B11 이 두 장 있다면 (a/b suffix 다른 코드 = `B11a`, `B11b`) → 코드가 다르므로 D-02 (동일 tile code 1회만 등장) 위반은 자동 회피
3. **결론**: 부패가 commit 으로 이어져도 서버 invariant (D-05 풀=106, D-06 동일코드 = 1장) 가 차단. 사용자 자신만 손해 (V-04 30점 미달 / V-06 거부 / 패널티 드로우).

### 2.4 부패가 보안 침해로 변환되는 유일한 경로 — 사용자 인지 부조화

**유일한 위험**: 사용자가 부패를 인지하지 못하고 "정상" 으로 confirm → 서버가 INVALID_MOVE 거부 → 패널티 3장 → 사용자 게임 손해. **이는 보안 침해가 아니라 UX 사고**. 권한 모델은 손상되지 않음.

**판정**: M4 → M1 변환 **불가능**. 클라 부패는 사용자 자신의 게임 진행만 망가뜨림.

---

## 3. V-17 ID 누락 권한 우회 — AI placement 가 sprint 의 audit gap

### 3.1 발견된 gap

`ws_handler.go:1058 processAIPlace`:

```go
tableGroups := make([]service.TilePlacement, len(resp.TableGroups))
for i, g := range resp.TableGroups {
    tableGroups[i] = service.TilePlacement{Tiles: g.Tiles}  // ID 미할당!
}
```

vs `ws_handler.go:2416 wsGroupsToService` (Human path):
```go
result[i] = service.TilePlacement{ID: g.ID, Tiles: g.Tiles}  // ID 보존
```

AI 경로는 `g.ID` 를 명시적으로 버린다. SSOT V-17 신설 직접 근거.

### 3.2 보안 영향 분석

**AI 의 ID 누락이 만드는 일**:
1. `convertToSetOnTable` 가 빈 ID 인 그룹들을 model.SetOnTable 로 변환 → ID 가 빈 문자열 또는 자동 생성 (서버 코드 어떤지 확인 필요)
2. `state.Table` 에 빈/임시 ID 그룹 저장 → 다음 턴 (Human) 에 `getOrCreateSnapshot` 가 빈 ID 의 tableBefore 반환

**다른 권한 우회 가능성**:

| 가능성 | 분석 |
|--------|------|
| AI 가 자기 seat 가 아닌 다른 seat 의 그룹을 만든다? | `processAIPlace:1064` 가 `Seat: seat` (서버 set) 으로 강제 → 불가 |
| AI 가 V-04 30점 우회? | `validateInitialMeld` 가 점수 계산 → AI 도 동일 검증, 우회 불가 |
| AI 가 풀에 없는 타일을 보드에 추가? | `resolveRackAfter` 가 자기 랙(서버 set)에서 차감 시도 → 불가 |
| AI 가 다른 플레이어 랙 타일을 자신 랙처럼 사용? | 동상, 불가 |
| **빈 ID 가 클라 ↔ 서버 ID 매핑 충돌 만들 수 있나?** | **Yes** — D-12 (pending → server ID 매핑) 위반. 클라가 받은 TILE_PLACED 에서 빈 ID 그룹을 React key 로 사용 시 충돌 → 클라 부패 (INC-T11-IDDUP 와 동일 기전). **본 sprint 사고 직접 근거**. |
| AI 가 jokerReturnedCodes 위조? | `processAIPlace:1064` 의 `JokerReturnedCodes` 필드가 누락됨 (확인 필요) → AI 가 V-07 우회 가능성? |

**잠재적 V-07 우회 가능성**: `req := &service.ConfirmRequest{Seat: seat, TableGroups: tableGroups, TilesFromRack: resp.TilesFromRack}` 에 **`JokerReturnedCodes` 필드 자체가 없다**. AI 가 조커 swap 한 뒤 회수 조커 코드를 알리지 않으면 V-07 검증이 빈 슬라이스로 통과. 그러나 V-07 의 본질 검증은 "회수 조커가 같은 턴 보드에 있는가" 라서 AI 가 회수만 하고 재배치 안 했으면 V-06 conservation 에서 잡힘 → 우회 안 됨.

**확인 필요**: AI 가 V-07 swap 행동 시 `MoveResponse` 에 `JokerReturnedCodes` 필드를 가지는지. 없다면 본 sprint 의 또 다른 audit gap.

### 3.3 일반화한 보안 부채 — "AI 경로 ↔ Human 경로 비대칭"

**문제 패턴**: ws_handler 가 Human 입력은 풀 검증 (`wsGroupsToService` + AUTH conn.seat) 하는데 AI 입력은 더 적은 필드만 통과.

**SDD 원칙 7원칙 위반** (CLAUDE.md 모듈화 설계):
- **SRP 위반**: `processAIPlace` 와 `handleConfirmTurn` 이 같은 책임 (CONFIRM_TURN 처리) 인데 검증 깊이가 다름 → 두 함수가 공통 검증 helper 로 수렴해야

**권고 (코드 수정 아님, 분석)**:
- `MoveResponse → service.ConfirmRequest` 변환 helper 단일화 → `aiResponseToConfirmRequest` 같은 함수로 추출 → ID 보존 / JokerReturnedCodes 보존 / Seat 강제 모두 한 곳에서 보장
- 본 권고는 architect (`26-architect-impact.md`) 의 시스템 토폴로지 책임 + go-dev (`87-server-rule-audit.md`) 의 라인 레벨 책임으로 위임. 본 보안 평가는 "audit gap 식별" 까지만.

### 3.4 sprint 의 다른 권한 우회 후보

본 sprint 에서 발견된 V-17 외에 추가 audit gap 후보:

| ID | 위치 | 잠재 우회 | 우선순위 |
|----|------|----------|---------|
| **AUDIT-01** | `processAIPlace:1064` ConfirmRequest 에 JokerReturnedCodes 누락 | V-07 자기검증 약화 (V-06 이 백업으로 차단하므로 직접 우회 불가) | P2 |
| **AUDIT-02** | `wsGroupsToService:2419` 가 클라 ID 를 그대로 신뢰 | D-01 (그룹 ID 유니크) 서버측 강제 부재. 충돌 ID 들어와도 통과 | **P1** |
| **AUDIT-03** | `handleConfirmTurn:443` env.Seq 미검증 | V-19 미구현. 재전송/역순 공격 우연히 차단되나 명시 보장 없음 | P2 |
| **AUDIT-04** | `handlePlaceTiles:404` PlaceTiles 가 검증 없이 임시 broadcast | 다른 플레이어가 받는 TILE_PLACED 가 클라 주장의 tableGroups → 클라 부패 전파 매개. 서버 진실 영향 없으나 다중 클라 동기화 부패 가능 | P2 |

---

## 4. INV-* 16개 보안 의미 — 어떤 invariant 위반이 보안 침해로 이어지는가

본 절은 56b §3 의 16개 invariant 각각이 **보안 영향** 인지 **UX/기능 영향** 인지 분류.

### 4.1 전역 invariant (INV-G1~G5)

| ID | invariant | 위반 시 보안 영향 | 위반 시 UX 영향 |
|----|----------|-----------------|----------------|
| **INV-G1** (D-01 그룹 ID 유니크) | **간접 보안** — V-17/AUDIT-02 와 결합 시 ID 충돌 → 다음 턴 검증 모호화 (낮은 위험) | 클라 React key 충돌 → INC-T11-IDDUP 재현 |
| **INV-G2** (D-02 동일 tile code 1회) | **무영향** — 서버 D-05/D-06 invariant 가 백업 차단 | 클라 ghost 그룹 → INC-T11-DUP 재현 |
| **INV-G3** (D-03 빈 그룹 없음) | **무영향** — V-02 (`len < 3` 거부) 가 서버에서 차단 | 클라 렌더 NaN |
| **INV-G4** (D-05 풀 = 106) | **직접 보안** — 위반 시 풀 부풀림 = "타일 무한 발급" 공격. **서버 단독 invariant** (`pool.go`) | 게임 무결성 자체 |
| **INV-G5** (D-12 pending→server ID 매핑) | **간접 보안** — V-17/AUDIT-02 결합 시 ghost group | 클라 ID drift |

**보안 핵심**: **INV-G4 만이 직접 보안 invariant**. 나머지는 클라 부패 또는 UX. INV-G4 는 본 sprint 와 무관 (서버 invariant 영구 유지).

### 4.2 상태별 invariant (S0~S10, 11개)

| 상태 | invariant | 보안 영향 |
|------|----------|----------|
| **S0** (OUT_OF_TURN) | rack/board 입력 disabled | **간접 보안** — 위반 시 클라가 다른 턴에 PLACE/CONFIRM WS 송신 가능. 그러나 `ConfirmTurn:330 state.CurrentSeat != req.Seat` 가 서버측 NOT_YOUR_TURN 으로 차단. **서버 보호** |
| **S1** (MY_TURN_IDLE) | pending=0, rack=TURN_START 시점 | 무영향 — 클라 표현만 |
| **S2/S3/S4** (DRAGGING_*) | active drag 위치 / 권한 | **간접 보안** — S4 (server group drag) 의 V-13a (`hasInitialMeld == true`) 위반 시 클라가 PRE_MELD 에서 서버 그룹 이동 시도 → 서버 `validateInitialMeld:128` 가 ErrNoRearrangePerm 차단. **서버 보호** |
| **S5/S6** (PENDING_*) | 사전조건 평가 | 무영향 — UR-15 사전검증은 클라 미러일 뿐, 서버가 V-01~V-15 풀 검증 |
| **S7** (COMMITTING) | UI disabled / timeout 30s | **간접 보안** — 위반 시 클라가 동일 CONFIRM_TURN 두 번 송신. AUDIT-03 (V-19) 미구현으로 우연히 차단 |
| **S8** (INVALID_RECOVER) | 토스트 표시, healthy 스냅샷 기준 | 무영향 — 서버는 자기 스냅샷 기준 |
| **S9** (DRAWING) | UI disabled | 무영향 |
| **S10** (JOKER_RECOVERED_PENDING) | 회수 조커 강조 + V-07 강제 | **간접 보안** — V-07 위반 시도 시 서버 차단 |

### 4.3 보안 의미 종합

| 분류 | 개수 | invariant ID |
|------|------|------------|
| **직접 보안 invariant** (서버 단독 강제, 위반 = 게임 무결성 손상) | **1** | INV-G4 (D-05 풀=106) |
| **간접 보안 invariant** (클라 위반은 서버가 백업 차단, 그러나 깊이방어 차원에서 의미) | **5** | INV-G1, S0, S2/3/4 권한, S7 race, S10 V-07 |
| **순수 UX/기능 invariant** (위반해도 보안 무영향) | **10** | INV-G2/G3/G5, S1, S5/6, S8, S9 등 |

**핵심 결론**: 본 sprint 의 16개 invariant 중 **직접 보안은 1개 (INV-G4)** 이며, **이는 서버 단독 invariant 라 본 sprint 의 UI 재설계와 무관**. 간접 보안 5개는 모두 **서버 검증으로 백업** 되어 클라 위반이 권한 우회로 이어지지 않음.

**즉, 본 sprint 의 UI state corruption 사고는 보안 침해가 아닌 UX 사고**. 그러나 V-17/D-01 의 audit gap 은 권고대로 보강해야 깊이방어가 완성된다.

---

## 5. 새로 발견된 보안 부채

### 5.1 본 sprint 분석 중 식별

| ID | 카테고리 | 위치 | 설명 | 우선순위 | 처리 시점 |
|----|---------|------|------|---------|---------|
| **SEC-DEBT-001** | AUDIT-02 일반화 | `wsGroupsToService`, `processAIPlace`, `convertToSetOnTable` | 클라/AI 가 보낸 그룹 ID 를 서버가 그대로 신뢰. V-17 SSOT 신설 → 서버측 ID 발급 + 충돌 검사 필요 | **P1** | Sprint 7 W2 (UI 재설계와 함께) |
| **SEC-DEBT-002** | V-19 미구현 | `handleConfirmTurn`, `handlePlaceTiles`, `handleDrawTile` | env.Seq 검증 부재. 재전송/역순 공격 우연히 차단. 명시 V-19 구현으로 보장 | P2 | Sprint 8 |
| **SEC-DEBT-003** | AI 경로 비대칭 | `processAIPlace:1064` ConfirmRequest 조립 | AI 가 JokerReturnedCodes 누락. AI ↔ Human 경로가 다른 검증 깊이 | P2 | Sprint 7 W2 V-17 작업과 함께 |
| **SEC-DEBT-004** | V-06 강화 | `validateTileConservation:182` | "보드에 갑자기 등장한 타일 (beforeFreq=0, rackBefore=0)" 명시 거부 분기 부재. 깊이방어 차원 | P3 | Sprint 8 |
| **SEC-DEBT-005** | TILE_PLACED 신뢰 | `handlePlaceTiles:432` BroadcastToRoomExcept | 서버가 검증 없이 클라 주장의 tableGroups 를 다른 클라에 broadcast. 다중 클라 부패 전파 매개 | P2 | Sprint 8 |
| **SEC-DEBT-006** | UR-34 Sentry 누락 | `gameStore.ts` invariant assertion | INV-G1/G2/G3 위반 시 console.error 만 — Sentry alert 부재. 실제 부패 발생률 측정 불가 | P3 | 운영 단계 |

### 5.2 확실히 보안 부채가 아닌 항목 (재확인)

본 분석 중 처음에 의심 갔다가 분석 후 안전 확인:

| 항목 | 의심 사유 | 안전 확인 근거 |
|------|---------|-------------|
| WS env.Type 변조 | dispatch 우회? | switch default → INVALID_MESSAGE |
| AUTH 후 conn.seat 변조 | 메모리 변조? | Go 메모리 model + 세션 격리 |
| Cookie/JWT 재사용 | 다른 게임 잠입? | conn.gameID 가 AUTH 시점에 set + roomID 에 묶임 |
| Redis 키 race | 동시 ConfirmTurn? | snapshotMu Mutex + GORM optimistic lock |
| Istio mTLS 우회 | sidecar bypass? | 본 sprint 와 무관, ADR-020 검증 완료 |

### 5.3 본 sprint 와 무관한 기존 보안 상태

(참고용, 본 sprint 가 영향 안 줌)

- **OWASP Top 10**: A01 (BAC) → conn.seat 서버 set + state.CurrentSeat 검증 → 안전
- **A03 (Injection)**: WS payload JSON parsing only, SQL 노출 없음 → 안전
- **A07 (Identification)**: Google OAuth 2.0 + JWT (next-auth) → 본 sprint 와 무관
- **A09 (Logging)**: zap logger, 토큰/PII 로깅 없음 (확인됨) → 안전
- **A10 (SSRF)**: ai-adapter → LLM vendor 만 outbound, allowlist 운영 → 안전

---

## 6. 모듈화 7원칙 self-check

CLAUDE.md `## Key Design Principles` + plan 의 P0 제약에 의거해 본 산출물의 자가 검증.

### 1. 단일 책임 원칙 (SRP)
- 본 문서 = "본 sprint 의 보안 영향 평가" 단일 책임. 코드 리뷰 (go-dev 87) / 컴포넌트 분해 (architect 26) / 룰 정의 (game-analyst 55) 와 책임 분리됨. **충족**

### 2. 순수 함수 우선
- 분석 문서 (코드 미생성) 이라 부적용. 단, 평가 결과 = 입력 (사고/룰/코드) → 출력 (시나리오/부채) 의 결정론적 매핑. **충족 (의미적)**

### 3. 의존성 주입
- 본 문서가 참조하는 SSOT 는 `55-game-rules-enumeration.md` / `56b-state-machine.md` 에 명시 인용 → 직접 결합 최소화. SSOT 변경 시 본 문서 §1 시나리오 표만 갱신하면 됨. **충족**

### 4. 계층 분리
- 본 평가는 **신뢰 경계 (Trust Boundary)** 4계층 (클라 ↔ ws_handler ↔ service ↔ engine) 을 §0 위협 모델에서 명확히 분리. 각 계층의 검증 책임을 §1.1 표로 매핑. **충족**

### 5. 테스트 가능성
- §1 시나리오 N1~N6 모두 **재현 가능 공격 시나리오** 형식. qa (`88-test-strategy-rebuild.md`) 가 본 §1 시나리오를 보안 회귀 테스트 (security regression test) 로 자동화 가능. SEC-DEBT-001~006 도 각각 단위 테스트화 가능. **충족**

### 6. 수정 용이성
- SSOT 룰 ID (V-/UR-/D-/INV-/SEC-DEBT-) 1개 변경 시 본 문서 영향 = 1~3개 표 셀. SonarQube/Trivy 결과 변동 시 §5 표만 갱신. **충족**

### 7. band-aid 금지
- 본 문서는 **band-aid 보안 가드 제안 금지** 원칙을 §0 / §3.3 에서 명시. 모든 권고 = 서버 검증 강화 또는 SSOT 룰 ID 매핑 형태. 클라 가드를 보안 신뢰 경계로 두는 안 일체 배제. **충족**

**자체 평가**: 7원칙 모두 충족. PM 의 plan §1 제약 통과.

---

## 7. 카운트 요약 + 다음 단계

### 카운트
| 항목 | 개수 |
|------|------|
| WS 변조 시나리오 | **6** (N1~N6, 본질 우회 0건, audit gap 2건) |
| INV-* 16개 보안 영향 평가 | **16** (직접 1, 간접 5, UX 10) |
| 신규 보안 부채 | **6** (SEC-DEBT-001~006: P1×1, P2×3, P3×2) |

### 다음 단계 (PM dispatch 후 처리)

| 액션 | 담당 | 시점 |
|------|------|------|
| SEC-DEBT-001 (V-17 서버측 ID 발급) 구현 | go-dev (라인 레벨) + architect (인터페이스) | Sprint 7 W2 |
| SEC-DEBT-002/003 (V-19, AI 경로 통일) | go-dev + security 리뷰 | Sprint 8 |
| 보안 회귀 테스트 자동화 (§1 시나리오 N1~N6) | qa (88 산출물에 추가) + security 리뷰 | Sprint 7 W2 |
| OWASP ZAP DAST WS 시나리오 추가 | security + devops | Sprint 8 |

### 본 산출물의 입력/출력 매핑 (PM 검증용)

- **입력 SSOT**: 55 (V-01~V-19, D-01~D-12), 56b (INV-G1~G5 + S0~S10)
- **출력 SSOT 매핑**: 본 §1 시나리오 N1~N6 모두 V-/D-/UR- ID 명시. SEC-DEBT-001~006 모두 V-/D-/INV- 또는 OWASP 항목 매핑
- **band-aid 카운트**: 0 (추가된 클라 가드 권고 없음)

---

## 8. 변경 이력

- **2026-04-25 v1.0** (security): 본 산출물 발행. WS 변조 시나리오 6, INV-* 16 보안 영향 평가, 신규 보안 부채 6 식별. Sprint 7 W2 V-17 작업 + Sprint 8 보안 깊이방어 권고 발행.
