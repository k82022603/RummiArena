# BUG-UI-EXT (신규) — 확정 후 이어붙이기 실패 재조사

**작성**: architect (read-only, PR #73 사용자 증언 기반 재조사)
**작성일**: 2026-04-24
**대상 증언**: PR #73 comment (2026-04-24T01:36:11Z, 애벌레)
> "내 타일로 30점 이상 새 멜드를 만들면 후 확정" 후 "기존 멜드에 이어붙이려 시도했으나 안됨". 그러나 AI는 되는 것 같음
**선행 분석**: `docs/04-testing/73-finding-01-root-cause-analysis.md` (FINDING-01 RCA)

---

## 결론 3줄 (Executive Summary)

1. **FINDING-01 분석은 "부분적으로 맞음 + 치명적 맥락 누락"**. `hasInitialMeld=false` 에서 FINDING-01 early-return 블록(line 909~926) 이 새 pending 그룹을 생성하는 로직은 정상. 문제는 **`hasInitialMeld` 루트 state 가 false 로 잘못 남아있는 상태에서도 이 블록이 발동**한다는 점이며, FINDING-01 은 이 잔존 false 원인을 조사하지 않았다.
2. **단일 루트 원인(확도 80%)**: `useGameStore.hasInitialMeld` 루트 state 는 **오직 `TURN_END` 수신 + `payload.seat === mySeat` 일 때만** 갱신된다. `GAME_STATE` 핸들러, `AUTH_OK`, 초기화 경로 모두 이 필드를 갱신하지 않는다. **WS 재연결 / 페이지 리로드 / 초기 스폰샷 복원** 이 발생하면 루트는 `false` 로 남고, `players[mySeat].hasInitialMeld=true` 와 **불일치**한다.
3. **AI 는 프론트 state 를 거치지 않고** `processAIPlace` 로 서버 `ConfirmTurn` 을 직접 호출하기 때문에 영향을 받지 않는다. Engine validator (`validator.go:100`) 는 Redis 상의 `HasInitialMeld=true` 를 권위 소스로 쓰므로 AI 경로는 정상. 인간 경로만 프론트 루트 state 오염에 의해 차단된다.

---

## 1. 조사 범위 + 이전 분석의 한계

### 1.1 기존 FINDING-01 분석 (문서 73번) 의 가정

- 시나리오: `hasInitialMeld=false + 서버 그룹 드롭` 은 "최초 등록 전 잘못 드롭" 으로 간주.
- 해결책: early-return 으로 새 pending 그룹 생성 (line 909~926, 현재 배포됨).
- 회귀 방지: `hotfix-p0-i2-run-append.spec.ts` SC1/SC2 가드.

### 1.2 사용자 증언이 드러낸 허점

사용자는 **"30점 확정 성공 후 extend 실패"** 라 증언. 즉 `hasInitialMeld` 가 **이미 true 였어야 하는 시나리오** 에서 실패. 이는 FINDING-01 이 상정한 "false → 잘못 드롭" 가정과 **정반대**.

FINDING-01 RCA §2.4 에는 "모순의 가능한 설명" 으로 (A1~A3) 3가지 후보를 들었으나, 실험 조건 (hasInitialMeld=false 명시 주입) 이 **테스트 fixture 에 의해 고정**되어 있어 "true 여야 하는데 false 인 이유" 자체를 조사하지 않았다. **실 사용 환경의 state 드리프트** 는 범위 밖이었다.

---

## 2. 가설 전수 검증

### 2.1 가설 1 — 확정(Confirm) 버튼 클릭이 서버 `hasInitialMeld` 갱신 안 함

**결론: 반증. 서버는 정상 갱신.**

- `src/game-server/internal/service/game_service.go:361-362`:
  ```go
  if !state.Players[playerIdx].HasInitialMeld && len(req.TilesFromRack) > 0 {
      state.Players[playerIdx].HasInitialMeld = true
  }
  ```
  — 서버 `ConfirmTurn` 검증 통과 후 Redis state 에 명시적으로 true 기록. 이후 `advanceToNextTurn` 에서 state 저장.
- `src/game-server/internal/handler/ws_handler.go:718-754` `broadcastTurnEnd`:
  - `state.Players[playerIdx].HasInitialMeld` (방금 true 갱신된 값) 를 **TURN_END payload 에 포함**하여 전체 방에 브로드캐스트.
- Engine validator `src/game-server/internal/engine/validator.go:100-104`:
  ```go
  if !req.HasInitialMeld {
      if err := validateInitialMeld(req); err != nil {
          return err
      }
  }
  ```
  — `HasInitialMeld=true` 이면 V-04(30점) / V-13a(재배열 금지) 를 **완전히 스킵** → 서버는 extend 를 규칙으로 거부하지 않음.

**결론**: 서버 경로는 완결성 있다. 실패 원인은 서버가 아님.

---

### 2.2 가설 2 — 프론트 `hasInitialMeld` state 가 턴 종료 시 리셋됨

**결론: 부분 성립 → 더 강한 원인 발견 (가설 5 참조).**

- `src/frontend/src/store/gameStore.ts:127` 초기값: `hasInitialMeld: false`.
- `src/frontend/src/store/gameStore.ts:212-218` `resetPending()`: **이 함수는 pending* 만 건드림**. `hasInitialMeld` 건드리지 않음 → **OK**.
- `src/frontend/src/store/gameStore.ts:220` `reset()`: **전체 state 를 `initialState` 로 재설정** → `hasInitialMeld=false`. 게임 종료/로비 이동 시 호출되므로 정상.
- TURN_START (`useWebSocket.ts:184-202`): `resetPending()` 만 호출, `hasInitialMeld` 건드리지 않음 → **OK**.

"리셋 버그" 는 명시적으로는 **없음**. 그러나 **"갱신 누락"** 이 더 심각한 원인 (가설 5).

---

### 2.3 가설 3 — extend 경로에 추가 조건 (`hasInitialMeld` 외)

**결론: 반증. 추가 차단 조건 없음.**

`GameClient.tsx:928-974` 분기 (`targetServerGroup && hasInitialMeld`) 를 정독한 결과:
- `isCompatibleWithGroup` 호환성 체크 (line 929) — 호환 안 되면 새 그룹 (정상).
- `updatedTiles = [...targetServerGroup.tiles, tileCode]` (line 949) — append 수행.
- `detectDuplicateTileCodes` 중복 감지 (line 957) — 중복 시 경고 후 return (정상 방어).
- `addPendingGroupId(targetServerGroup.id)` (line 969) — 서버 그룹을 pending 으로 마킹.

V-13e 조커 재드래그 커밋 `554744b` 도 `removeRecoveredJoker` 호출만 추가. extend 차단 로직 추가 없음.

FINDING-02 (PR #57) 는 `practice-board` 관련이라 실 게임 경로에 영향 없음.

**결론**: line 928 블록은 `hasInitialMeld=true` 이기만 하면 정상적으로 extend 수행.

---

### 2.4 가설 4 — 서버 검증이 `ErrNoRearrangePerm` 외 다른 에러로 막음

**결론: 반증. `HasInitialMeld=true` 에서 V-05/V-13a 스킵.**

- `validator.go:79-119` `ValidateTurnConfirm`:
  - V-01/V-02/V-14/V-15 (set validity): extend 는 기존 유효 set 에 정상 append → 통과.
  - V-03 (tilesAdded ≥ 1): 랙에서 타일 이동했으므로 통과.
  - V-06 (tile count conservation): 기존 서버 타일이 그대로 유지 → 통과.
  - V-05 (initial meld 전 table 변경 금지): `!HasInitialMeld` 일 때만 검사 → 확정 후 skip.
  - V-13a (재배열 금지): `validateInitialMeld` 내부 → `!HasInitialMeld` skip.
  - V-07 (joker returned): 조커 회수 없으면 통과.
- `validator.go:111-116` `validateTileConservation`: 기존 타일 frequency 유지 확인 → extend 는 append-only 라 통과.

**결론**: `HasInitialMeld=true` 상태의 인간 extend 는 서버에서 통과. 즉 서버 입장에서 인간/AI 비대칭 없음.

---

### 2.5 가설 5 (보강) — 프론트 루트 `hasInitialMeld` 가 재연결/리로드 시 갱신 안 됨 ★주범

**결론: 확정. 확도 80%.**

루트 state 갱신 지점 전수 조사 (`grep -rn "hasInitialMeld" src/frontend/src/`):

| 지점 | 갱신 타겟 | 조건 |
|------|---------|-----|
| `useWebSocket.ts:157` | `players[].hasInitialMeld` | GAME_STATE 수신 시 매 플레이어 |
| `useWebSocket.ts:238` | `players[].hasInitialMeld` | TURN_END 수신 시 `payload.seat` 플레이어 |
| `useWebSocket.ts:248` | **`state.hasInitialMeld` (루트)** | TURN_END + **`isMySeatTurn`** 조건 하에만 |
| `gameStore.ts:156` | `state.hasInitialMeld` (setter) | 외부에서 호출하는 코드 없음 (dead code) |

**즉 루트 `hasInitialMeld` 루트 state 는 `TURN_END` + 내가 방금 턴을 끝낸 경우에만 갱신된다**.

#### 2.5.1 결함 시나리오 A (재연결)

1. 플레이어 A: 30점 확정 → 서버 `HasInitialMeld=true` → TURN_END(seat=A, hasInitialMeld=true) → **루트 true** 반영.
2. WS 끊김 (wifi 전환, 잠금모드 등). 프론트 전체 state **메모리에는 남아있음** (Zustand store 유지).
3. 재연결 → 서버가 `GAME_STATE` 를 보냄 → **루트는 기존 true 가 그대로 유지** → **이 경우 문제 없음**.

따라서 **순수 WS 재연결만으로는 false drift 재현 불가**.

#### 2.5.2 결함 시나리오 B (페이지 리로드 / 새 탭)

1. 플레이어 A: 확정 → 루트 true.
2. **F5 새로고침** 또는 **새 탭에서 게임 URL 접근** → Zustand store 메모리 초기화 → 루트 `hasInitialMeld=false` (initialState).
3. WS 연결 → `GAME_STATE` 수신 → `setPlayers()` 만 호출 (`useWebSocket.ts:152-177`). **루트 갱신 없음** → 루트 `false` 잔존.
4. 사용자 턴 도달. UI 상 `PlayerCard` 는 `player.hasInitialMeld=true` 를 기반으로 **"등록 완료"** 표시. 사용자는 "이제 extend 가능하다" 고 판단.
5. 서버 그룹에 랙 타일 드래그 → `handleDragEnd:909` `targetServerGroup && !hasInitialMeld` **발동** → **새 pending 그룹 생성** (extend 아님).
6. 사용자가 본 증상: "서버 그룹은 그대로 + 옆에 새 그룹 생성". 이는 **"이어붙이기 실패"** 로 인지됨. 확정 시도하면 pending 그룹이 단독 멜드가 되어 V-04 (30점) 검증 → 단일 타일 멜드는 보통 30점 미달 → 서버 페널티 3장 드로우.

#### 2.5.3 결함 시나리오 C (새 턴에서 TURN_END 미반영)

`TURN_END payload.seat === state.mySeat` 조건이 실패하는 경우:
- 예: 상대 턴 종료 시에도 TURN_END 는 수신되지만 `payload.seat !== mySeat` → 루트 갱신 skip.
- 이론상 내가 확정 직후 TURN_END(seat=나) 가 오면 갱신되지만, **그 직전에 뭔가 race** 있다면?

`useWebSocket.ts:205` 의 setState 콜백 내부 `state.mySeat` 참조는 React state 최신값 보장. AUTH_OK 가 먼저 와서 `setMySeat(seat)` 가 완료된 후에만 TURN_END 가 와도 문제없음.

**reload 없이도 한 가지 드리프트 가능성**: `AUTH_OK` 직후 `GAME_STATE` 가 오기 전에 `TURN_END` 가 먼저 와버리는 레이스. 서버 순서상 `AUTH_OK → GAME_STATE → (turn events)` 가 보장되어야 하지만, Hub 브로드캐스트가 이 순서를 엄격히 지키는지는 별도 검증 필요. **낮은 확률** 이지만 가능성 있음.

---

### 2.6 가설 6 (신규) — dnd-kit drop target 오매핑

**결론: 반증. `groupsDroppable` prop 이 드래그 중 항상 true.**

- `GameClient.tsx:1537` `groupsDroppable={isMyTurn && (isDragging || !!pendingTableGroups)}` — 드래그 중이면 자동으로 모든 서버 그룹이 droppable 등록.
- `GameBoard.tsx:153` `useDroppable({ id: groupId })` — 서버/pending 구분 없이 `group.id` 로 등록.
- `pointerWithinThenClosest` collision detection — pointer 내부 + 미매칭 시 closestCenter 로 fallback. over.id 매핑은 정상.

---

## 3. 최종 루트 원인 (확도)

| 가설 | 평가 | 확도 |
|-----|------|-----|
| 1 서버 갱신 누락 | 반증 | 0% |
| 2 프론트 명시적 리셋 | 반증 | 5% |
| 3 extend 분기 숨은 조건 | 반증 | 0% |
| 4 서버 validator 추가 에러 | 반증 | 0% |
| **5 루트 `hasInitialMeld` GAME_STATE 미반영 (리로드/재연결)** | **확정** | **80%** |
| 5b TURN_END 레이스 (AUTH_OK 전) | 이론상 가능 | **10%** |
| 6 dnd-kit over.id 오매핑 | 반증 | 0% |

**Primary**: 가설 5 (리로드/새 탭 시 루트 state 오염).
**Secondary**: 가설 5b (WS 이벤트 레이스).

---

## 4. 재현 시나리오 (Playwright E2E 스펙 후보)

### 4.1 SC-EXT-RELOAD-01 (가설 5 검증, 재현 가능성 ★★★★★)

```
사전 조건:
  - 2인 게임 (Human A + AI B)
  - A 가 랙 초기 7장, 서버 보드에 run [Y5,Y6,Y7] 이 AI 배치 완료 상태 가정
  - A 의 랙에 [R10, R11, R12] (run 30점) + [Y8] 포함

시나리오:
  1. A 가 [R10, R11, R12] 를 게임 보드 빈 공간에 drop → pending 그룹 생성
  2. 확정 버튼 클릭 → TURN_END 수신 → 루트 hasInitialMeld=true
  3. AI 턴 → AI 가 임의 배치 또는 draw
  4. A 턴 재개 (여기까지는 정상)
  5. 여기서 페이지 F5 새로고침 (또는 새 탭에서 같은 방 URL 오픈)
  6. AUTH_OK → GAME_STATE 수신. players[0].hasInitialMeld=true 이지만 루트 false
  7. A 가 랙의 Y8 을 서버 run [Y5,Y6,Y7] 위로 drag&drop
  8. 기대 (수정 후): 서버 run 이 [Y5,Y6,Y7,Y8] 로 extend + pending 마킹
     실제 (현재 버그): 서버 run 4장 그대로 + pending 단독 그룹 [Y8] 생성 ★
  9. 확정 시도 → 서버 V-04 검증: Y8 단독 멜드 8점 < 30 → 페널티 3장

검증 포인트:
  - page.evaluate(() => window.__gameStore.getState().hasInitialMeld)
    === players[0].hasInitialMeld 일치 여부
  - groupCount === 1 (이어붙이기 성공) vs 2 (새 그룹 오폴스루)
```

### 4.2 SC-EXT-RELOAD-02 (가설 5b 검증, 재현 가능성 ★★)

```
사전 조건: 동일
시나리오:
  1~4 동일
  5. 프론트 WS ws.close(1001) 강제 절단 → 재연결 경로
     - 재연결 시 서버가 AUTH_OK → GAME_STATE 만 보냄
     - TURN_END 없음 → 루트 hasInitialMeld 갱신 기회 없음
  6. 루트는 이전 true 값이 유지되는지 확인 (메모리에 남음)
     → reload 가 아닌 순수 재연결은 문제없을 것

기대: PASS — 가설 5 는 reload 에만 해당, 재연결은 메모리 유지 덕분에 안전.
```

### 4.3 SC-EXT-AI-BASELINE (AI 비대칭 부재 확인)

```
시나리오:
  - AI 가 hasInitialMeld=true 상태에서 extend 시도
  - processAIPlace → ConfirmTurn → validator.go:100 HasInitialMeld=true skip
  - 결과: extend 성공

기대: AI 는 프론트 state 를 거치지 않으므로 영향 없음 (사용자 증언과 일치)
```

---

## 5. 수정 방향 (BUG-UI-EXT 신규 티켓)

### 5.1 최소 수정 (권고) — frontend-dev 담당

**파일**: `src/frontend/src/hooks/useWebSocket.ts`
**위치**: `GAME_STATE` 케이스 (line 142~183)

**수정 내용**: `setPlayers` 이후 **내 플레이어의 `hasInitialMeld` 를 루트 state 에도 반영**.

```ts
case "GAME_STATE": {
  const payload = msg.payload as GameStatePayload;
  setGameState({ ... });
  setMyTiles(payload.myRack);
  setPlayers(payload.players.map(...));

  // ★ 신규: 내 시트의 hasInitialMeld 를 루트로 동기화
  const me = payload.players.find((p) => p.seat === useGameStore.getState().mySeat);
  if (me) {
    useGameStore.setState({ hasInitialMeld: me.hasInitialMeld });
  }

  if (payload.drawPileCount === 0) setIsDrawPileEmpty(true);
  break;
}
```

**주의**: `useGameStore.getState().mySeat` 호출 시점 — `AUTH_OK` 핸들러가 먼저 `setMySeat(seat)` 를 수행했다고 가정. 만약 `GAME_STATE` 가 `AUTH_OK` 전에 올 가능성이 있다면 `payload` 에서 `mySeat` 을 추출하는 방식도 고려 (현재 payload 스키마 확인 필요).

### 5.2 대안 수정 — 아키텍처 개선 (장기)

**단일 진실 소스 (SSOT) 원칙**: 루트 `hasInitialMeld` state 를 **제거**하고, `handleDragEnd` 등에서 `players[mySeat].hasInitialMeld` 를 직접 참조한다.

```ts
// GameClient.tsx 수정 예시
const hasInitialMeld = useGameStore((state) =>
  state.players.find((p) => p.seat === state.mySeat)?.hasInitialMeld ?? false
);
```

장점:
- state 이중화 제거 → 드리프트 원천 차단.
- WS 이벤트 누락/레이스에 강건.

단점:
- 기존 `setHasInitialMeld` 호출 지점 제거 필요 (현재 dead code 로 보이지만 전수 확인 필요).
- `gameStore.ts` 의 `hasInitialMeld` 필드 + setter 제거 → 테스트/E2E bridge 변경 영향 확인.

**권고**: Sprint 7 Week 2 내 §5.1 최소 수정 먼저 배포 → Sprint 8 리팩터링 티켓으로 §5.2 검토.

### 5.3 보강: FINDING-01 블록 유지 여부

현재 `GameClient.tsx:909-926` early-return 블록은 "`hasInitialMeld=false` 에서 서버 그룹에 잘못 드롭" 을 **새 그룹으로 전환** 하는 가드. §5.1 수정 후에도 **유지** 하는 게 안전 (부주의한 초기 등록 시 패널티 방지).

단, §5.1 이 배포되면 **이 블록 발동 빈도는 급감** 할 것이므로 E2E 에서 `hotfix-p0-i2-run-append.spec.ts` 가 `hasInitialMeld=false` 를 명시적으로 강제 주입하는 setup 을 유지해야 의미있는 가드가 된다.

---

## 6. Phase 2 인수 가이드

### 6.1 담당자

| 작업 | 담당 | 파일 + 라인 | 추정 |
|-----|------|-------------|-----|
| §5.1 GAME_STATE 루트 동기화 | **frontend-dev** | `src/frontend/src/hooks/useWebSocket.ts:142-183` | 1h |
| §5.1 유닛 테스트 추가 | frontend-dev | `src/frontend/src/hooks/__tests__/useWebSocket.test.ts` (신규) | 2h |
| SC-EXT-RELOAD-01 Playwright | **qa** | `src/frontend/e2e/bug-ui-ext-reload.spec.ts` (신규) | 3h |
| §5.2 리팩터링 ADR 검토 | **architect** (본인) | `docs/02-design/XX-hasinitialmeld-ssot.md` | 2h (Sprint 8) |

### 6.2 검증 체크리스트

- [ ] `npm --prefix src/frontend test -- useWebSocket` — 새 유닛 테스트 PASS
- [ ] `npx playwright test bug-ui-ext-reload.spec.ts --workers=1` — 신규 스펙 PASS
- [ ] `npx playwright test hotfix-p0-i2-run-append.spec.ts` — FINDING-01 가드 회귀 없음 확인
- [ ] `npx playwright test regression-pr41-i18-i19.spec.ts` — REG-PR41-I18-04/05 PASS 유지
- [ ] K8s 배포 후 수동 재현: 30점 확정 → F5 → extend 정상 동작 확인

### 6.3 UI 페어 코딩 의무 (2026-04-23 스코프 재편)

**architect + frontend-dev 페어** 필수. PR 코멘트에 architect 리뷰 증거 남길 것 (Sprint 7 Scope 재편 정책 §D).

---

## 7. 연관 리스크 (조사 중 부수 발견)

### 7.1 `setHasInitialMeld` dead code

`gameStore.ts:156` 의 setter 는 외부에서 호출하는 코드가 없다 (`grep -rn setHasInitialMeld src/frontend/src/` → 정의부만). §5.1 수정 시 이 setter 를 **활용**하거나 **제거** 여부 결정 필요.

### 7.2 `INVALID_MOVE` 롤백 시 hasInitialMeld 후처리 없음

`useWebSocket.ts:308-321` `INVALID_MOVE` 핸들러는 `resetPending()` 만 호출. 확정 시도 실패 후 서버 `HasInitialMeld=false` 유지인데 클라이언트는 그대로 → 다음 시도 시 일관성 유지. 현재로서는 버그 없음이지만 §5.2 SSOT 리팩터 시 명시 검증 필요.

### 7.3 `TURN_END` `isMySeatTurn` 조건 재검토

`useWebSocket.ts:206,248` — `payload.seat === state.mySeat` 일 때만 루트 갱신. 이 조건 하에서는 **내가 턴을 끝냈을 때** 의 hasInitialMeld 값만 반영된다. 상대가 턴을 끝낸 TURN_END 에도 내 hasInitialMeld 는 변경되지 않으므로 (내가 확정하지 않는 한 false 유지가 정상) 로직상 맞음. 단, 상대 턴에서도 `payload.hasInitialMeld` 는 "방금 턴 끝낸 플레이어" 값이지 "나" 값이 아니라는 점을 명확히 주석으로 기록할 가치 있음.

### 7.4 E2E bridge `window.__gameStore` 에서 `hasInitialMeld` 강제 주입 테스트 유효성

`hotfix-p0-i2-run-append.spec.ts` 같은 E2E 가 **`hasInitialMeld=false` 를 강제 주입**해서 FINDING-01 블록을 테스트한다. §5.1 수정 후에도 이 강제 주입 방식은 유효 (바로 다음 GAME_STATE 가 오기 전까지 false 유지됨). 단, §5.2 SSOT 리팩터 시 강제 주입이 무효가 되므로 fixture 설계 변경 필요.

---

## 8. 이전 분석 (FINDING-01 RCA) 재평가

FINDING-01 RCA §2.4 에서 (B) "근본 원인 불명 + 증상 명확" 으로 결론지었다. 이번 재조사 결과 이 미결 잔존은 **실 사용 환경의 리로드/재연결 시나리오를 테스트 fixture 가 커버하지 못했던 것** 이다. `docs/04-testing/72` 가드 테스트는 `__gameStore.setState({hasInitialMeld: false})` 를 직접 주입하여 FINDING-01 블록 발동 조건을 **만든** 것이지, **왜 실제 사용자에서 그 조건이 발생했는지** 는 추적하지 않았다.

→ **교훈**: E2E setup 에서 "강제로 상태 만들기" 는 분기 테스트엔 유효하나, **state drift 원인 조사** 에는 부적합. 부검 보고서 (post-mortem) 가 아니라 **reproduction analysis** 가 필요했다.

---

## 9. 참고

- PR #73 comment: https://github.com/k82022603/RummiArena/pull/73#issuecomment-4309788982
- FINDING-01 RCA: `docs/04-testing/73-finding-01-root-cause-analysis.md`
- QA PR#41/#42 회귀: `docs/04-testing/72-pr41-42-regression-test-report.md`
- 핵심 소스 라인:
  - `src/frontend/src/hooks/useWebSocket.ts:142-183` (GAME_STATE 핸들러)
  - `src/frontend/src/hooks/useWebSocket.ts:203-285` (TURN_END 핸들러)
  - `src/frontend/src/store/gameStore.ts:121-142` (initialState)
  - `src/frontend/src/app/game/[roomId]/GameClient.tsx:909-926` (FINDING-01 분기)
  - `src/frontend/src/app/game/[roomId]/GameClient.tsx:928-974` (extend 분기)
  - `src/game-server/internal/service/game_service.go:320-376` (ConfirmTurn)
  - `src/game-server/internal/engine/validator.go:77-119` (ValidateTurnConfirm)
  - `src/game-server/internal/handler/ws_handler.go:884-989` (handleAITurn)
  - `src/game-server/internal/handler/ws_handler.go:1037-1091` (processAIPlace)
