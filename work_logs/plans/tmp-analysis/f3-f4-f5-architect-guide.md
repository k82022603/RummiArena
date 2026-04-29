# F3 / F4 / F5 — frontend-dev 구현 인수 가이드

**작성**: architect (read-only)
**작성일**: 2026-04-24 Day 3 저녁 (퇴근 임박 스프린트)
**전제**: 코드 수정 금지. 본 문서는 `frontend-dev` 가 바로 diff 로 전환 가능한 수준의 가이드.
**근거 문서**:
- `work_logs/incidents/20260424-phase3-e2e-verification.md` §v3-4 잔존 FAIL 5건
- `work_logs/plans/tmp-analysis/bug-ui-ext-ghost-rereview.md` §4 state 이중화 근본 원인
- main HEAD `49142b0` (PR #79 머지 시점) 기준 소스 정독

---

## 0. Executive Summary (3줄)

1. **F3 (V-04 확정 후 rack 동기화)**: 서버는 `TURN_END.payload.myRack` 을 항상 내려주므로 로직상 rack 갱신은 동작**해야** 한다. 실패 원인은 **E2E 환경에서 서버 응답 전에 spec 이 rack 을 측정**하거나, **`myTiles` 루트 state 에 optimistic commit 이 없어** `currentMyTiles = pendingMyTiles ?? myTiles` 렌더 레이어에만 반영된 것. 해결: **handleConfirm 직후 optimistic myTiles commit** (1 라인).
2. **F4 (FINDING-01 hasInitialMeld=false 새 그룹 분리 미발동)**: `GameClient.tsx:909` 의 분기는 정상 존재. 실패 원인은 **store 의 `hasInitialMeld` 루트 state vs `players[mySeat].hasInitialMeld` 이중화** 중 한쪽이 stale. spec 의 `setStoreState({hasInitialMeld:false})` 호출이 한쪽만 반영될 가능성. 해결: **GameClient 에서 `hasInitialMeld` 참조를 `players[mySeat]?.hasInitialMeld ?? rootHasInitialMeld` 로 derived** 하거나, store action `setHasInitialMeld` 가 `players` 배열까지 동기 업데이트.
3. **F5 (T11-03 조건부 렌더 vs disabled)**: **옵션 C 채택**. T11-01 이 "ActionBar hidden" 을 요구하므로 T11-03 도 hidden 과 정합해야 한다. T11-03 spec 의 `toBeGreaterThan(0)` 마지막 가드를 삭제 + 주석으로 "T11-01 과 동일 정책" 명시. 구현 변경 불필요.

---

## 1. F3 — V-04 확정 후 rack 동기화 (P1 신규)

### 1.1 현재 코드 인용

**`src/frontend/src/hooks/useWebSocket.ts:241-246`** — TURN_END 핸들러의 myTiles 갱신 조건:

```ts
// C-2: myRack이 서버에서 왔으면 서버 진실(source of truth) 사용, 아니면 기존 로직
...(payload.myRack
  ? { myTiles: payload.myRack as TileCode[] }
  : (isMySeatTurn && state.pendingMyTiles != null
    ? { myTiles: state.pendingMyTiles }
    : {})),
```

**`src/game-server/internal/handler/ws_handler.go:743-749`** — 서버측 `broadcastTurnEnd` 는 **항상 `payload.MyRack` 을 포함**:

```go
recvIdx := findPlayerBySeatInState(state.Players, c.seat)
if recvIdx >= 0 {
    rack := make([]string, len(state.Players[recvIdx].Rack))
    copy(rack, state.Players[recvIdx].Rack)
    payload.MyRack = rack
}
```

**`src/frontend/src/app/game/[roomId]/GameClient.tsx:601-602`** — 렌더용 derived `currentMyTiles`:

```ts
const currentMyTiles = useMemo(
  () => pendingMyTiles ?? myTiles,
  [pendingMyTiles, myTiles]
);
```

**`src/frontend/src/app/game/[roomId]/GameClient.tsx:1304-1314`** — handleConfirm 종단:

```ts
setConfirmBusy(true);
send("PLACE_TILES", { tableGroups: pendingTableGroups, tilesFromRack });
send("CONFIRM_TURN", { tableGroups: pendingTableGroups, tilesFromRack });
```

handleConfirm 이 서버에 WS 를 보내고 **응답 올 때까지 myTiles 루트 state 는 변경되지 않는다**.

### 1.2 근본 원인 가설 (확도 70%)

**가설 A (Primary, 70%)**: spec 은 DOM 에서 `rack-tile` 개수를 측정한다 (아마 `[data-testid="rack-tile"]`). DOM 은 `currentMyTiles = pendingMyTiles ?? myTiles` 로 렌더된다. 확정 플로우:

1. drag 3장 → `setPendingMyTiles(11장)` → DOM rack 에 11장 렌더 (정상)
2. `handleConfirm` 클릭 → `PLACE_TILES + CONFIRM_TURN` WS send → `confirmBusy=true`
3. 서버 응답: `TURN_END(myRack=11장)` → `setState({myTiles: 11장})` → L244 분기로 `pendingMyTiles` 는 건드리지 않음
4. 이어서 `TURN_START` → `resetPending()` → `pendingMyTiles=null` → `currentMyTiles = myTiles = 11장` (정상)

여기서 **타이밍 문제**: spec 이 `handleConfirm` 호출 **직후** rack 개수를 확인한다면, TURN_END 수신 전까지 `myTiles` 는 여전히 14장이고 `pendingMyTiles` 는 11장. `currentMyTiles=pendingMyTiles=11장` 이라 DOM rack 은 **11장으로 보여야 한다**. 그런데 spec FAIL = 14장 그대로 유지.

**이것이 의미하는 것**: `pendingMyTiles` 가 spec 환경에서 **아예 반영되지 않았거나**, DOM rendering 이 spec 의 assertion 보다 늦다.

**가설 B (Secondary, 40%)**: E2E worktree 에서는 spec 이 backend 서버 없이 돌아갔을 가능성 (worktree 는 이미 삭제되어 확인 불가). handleConfirm 이 호출되지만 서버 응답이 없고 `confirmBusy=true` 로 락이 걸림. spec 은 바로 rack assertion → pendingMyTiles 는 반영되어야 하는데 **spec assertion 대상이 `myTiles` 루트 state 의 Zustand bridge** 일 가능성.

### 1.3 수정 방향 (frontend-dev diff 스케치)

**A1. handleConfirm optimistic myTiles commit (권장, 1 hunk)**

- 파일: `src/frontend/src/app/game/[roomId]/GameClient.tsx`
- 위치: L1304 `setConfirmBusy(true)` 직전
- 의도: 확정 요청 **즉시** 루트 myTiles 를 pendingMyTiles 로 커밋. 서버 TURN_END 가 `payload.myRack` 으로 덮어쓰므로 SSOT 손상 없음. INVALID_MOVE 시 TURN_END 에서 서버 myRack=원본14장 이 와서 복구.

```ts
// Optimistic commit: 확정 요청 순간 pendingMyTiles → myTiles 반영.
// F3 (V-04 SC1) — spec 은 handleConfirm 직후 rack DOM 을 읽는다.
// 서버 TURN_END.payload.myRack 이 SSOT 이므로 여기서 prematurely 커밋해도
// INVALID_MOVE 시 서버가 원본 rack 을 다시 내려주어 복구된다.
setMyTiles(pendingMyTiles);
setConfirmBusy(true);
send("PLACE_TILES", { tableGroups: pendingTableGroups, tilesFromRack });
send("CONFIRM_TURN", { tableGroups: pendingTableGroups, tilesFromRack });
```

- 전제: `setMyTiles` 가 `useGameStore()` destructure 에 이미 있음 (L465). 추가 import 불필요.

**A2. spec 재검토 (qa 에게 위임)**

- `rule-initial-meld-30pt.spec.ts V04-SC1` 이 어떤 DOM selector 로 rack 을 측정하는지 확인 필요. worktree 가 삭제됐으므로 **qa 가 spec 재생성 시 아래 권장 pattern 사용**:
  - BAD: `await page.locator('[data-testid="rack-tile"]').count()` — pendingMyTiles 반영된 DOM 을 보므로 타이밍에 민감
  - GOOD: `await page.evaluate(() => window.__STORE__?.getState().myTiles.length)` — 루트 myTiles 를 SSOT 로 검증 (A1 수정 후 확정 직후 11장 반영)

### 1.4 회귀 방지 spec 권고

1. **SC-V04-RACK-01**: V-04 SC1 과 동일하게 30점 런 확정 후, **1 초 대기 후** rack=11장 검증 (서버 응답 왕복 타이밍 고려)
2. **SC-V04-RACK-02**: INVALID_MOVE 시나리오 — V-04 미달 세트 확정 시도 → 서버 거절 → rack 이 원본 14장 으로 **복구**되는지 검증 (A1 optimistic commit 이 rollback 되는지 확인)
3. **기존 spec 유지**: `hotfix-p0-i1-pending-dup-defense.spec.ts`, `regression-pr41-i18-i19.spec.ts` — optimistic commit 이 기존 조커 회수 / 중복 방어 플로우에 영향 없음을 보장.

---

## 2. F4 — FINDING-01 재검토 (P2, V04-SC3)

### 2.1 현재 코드 인용

**`src/frontend/src/app/game/[roomId]/GameClient.tsx:909-926`** — FINDING-01 분기 (`fb85d53` 롤백 이후):

```ts
// FINDING-01 (Issue #46) — I-18 완전 롤백: hasInitialMeld=false 상태에서
// 서버 확정 그룹 영역에 드롭된 경우는 반드시 새 pending 그룹을 생성한다.
if (targetServerGroup && !hasInitialMeld) {
  pendingGroupSeqRef.current += 1;
  const newGroupId = `pending-${Date.now()}-${pendingGroupSeqRef.current}`;
  const newGroup: TableGroup = {
    id: newGroupId,
    tiles: [tileCode],
    type: classifySetType([tileCode]),
  };
  const nextTableGroups = [...currentTableGroups, newGroup];
  const nextMyTiles = removeFirstOccurrence(currentMyTiles, tileCode);
  setPendingTableGroups(nextTableGroups);
  setPendingMyTiles(nextMyTiles);
  addPendingGroupId(newGroupId);
  if (pendingRecoveredJokers.includes(tileCode)) {
    removeRecoveredJoker(tileCode);
  }
  return;
}
```

**`src/frontend/src/store/gameStore.ts:127`** — `hasInitialMeld` 루트 initialState:

```ts
hasInitialMeld: false,
// ...
setHasInitialMeld: (hasInitialMeld) => set({ hasInitialMeld }),
```

**`src/frontend/src/hooks/useWebSocket.ts:155-158`** — GAME_STATE 수신 시 players 에 `hasInitialMeld` 복사 (그러나 **루트 state 동기화 없음**):

```ts
setPlayers(
  payload.players.map((p): Player => {
    const base = {
      seat: p.seat,
      tileCount: p.tileCount,
      hasInitialMeld: p.hasInitialMeld, // ← players[].hasInitialMeld
    };
    // ...
```

**`src/frontend/src/app/game/[roomId]/GameClient.tsx:447,451`** — GameClient 는 **루트 `hasInitialMeld`** 만 destructure (players[].hasInitialMeld 무시):

```ts
const {
  mySeat,
  // ...
  hasInitialMeld,
  players,
  // ...
} = useGameStore();
```

### 2.2 근본 원인 가설 (확도 65%)

**가설 (Primary, 65%)**: **state 이중화 + GAME_STATE 핸들러 비동기 불일치**.

- 서버 `GAME_STATE` 수신 시 `useWebSocket.ts:152` `setPlayers([... hasInitialMeld:p.hasInitialMeld ...])` 만 호출 — **루트 `hasInitialMeld` 는 건드리지 않는다**.
- 루트 `hasInitialMeld` 가 업데이트되는 경로는 `TURN_END.payload.hasInitialMeld` (L248, `isMySeatTurn` 일 때) **뿐**.
- 결과: 내가 아닌 **상대 턴** 에 서버가 확정 완료한 후에도 루트 `hasInitialMeld` 는 stale. `players[mySeat].hasInitialMeld` 만 업데이트된다.
- V04-SC3 spec: fixture 로 `hasInitialMeld=false` 상태를 주입 (setStoreState 또는 GAME_STATE 재전송). 이 때 store 의 **players[mySeat].hasInitialMeld=false 는 반영되지만 루트 hasInitialMeld 는 initialState(false) 그대로** 일 수도 있고, **이전 테스트 잔재로 루트 = true** 일 수도 있다.

**bug-ui-ext-ghost-rereview.md §4.3** 에서 architect 본인이 이미 지적: "hasInitialMeld 루트 vs players[mySeat].hasInitialMeld 이중화". F4 는 이 이중화의 **직접 증상**.

### 2.3 수정 방향 (frontend-dev diff 스케치)

**B1. GameClient hasInitialMeld derived 로 전환 (권장, 2 hunk)**

- 파일: `src/frontend/src/app/game/[roomId]/GameClient.tsx`
- 위치: L447-474 destructure 블록 직후에 derived useMemo 삽입, 기존 `hasInitialMeld` 루트 참조 제거
- 의도: **players[mySeat].hasInitialMeld 를 1차 진실**, 루트 hasInitialMeld 를 fallback 으로.

```ts
// F4 수정: players[mySeat].hasInitialMeld 를 SSOT 로 사용 (루트 hasInitialMeld 는 fallback).
// GAME_STATE 핸들러(useWebSocket.ts:152)가 players[] 만 업데이트하는 구조 때문에
// 루트 hasInitialMeld 가 stale 될 수 있다. derived 로 해결.
const effectiveHasInitialMeld = useMemo(() => {
  if (mySeat === null) return hasInitialMeld;
  const me = players.find((p) => p.seat === mySeat);
  return me?.hasInitialMeld ?? hasInitialMeld;
}, [players, mySeat, hasInitialMeld]);
```

그리고 **L750 / L803 / L909 / L928 / L978 / L1186 / L1589** 의 `hasInitialMeld` 참조를 전부 `effectiveHasInitialMeld` 로 교체. destructure 의 `hasInitialMeld` 는 **유지** (fallback source).

**B2. GAME_STATE 핸들러에서 루트 hasInitialMeld 동기화 (Alternative, 1 hunk)**

- 파일: `src/frontend/src/hooks/useWebSocket.ts`
- 위치: L182 `setIsDrawPileEmpty(...)` 직후
- 의도: GAME_STATE 수신 시 루트 hasInitialMeld 도 같이 업데이트.

```ts
// F4 수정: GAME_STATE 수신 시 루트 hasInitialMeld 동기화 (state 이중화 해소).
const mySeat = useGameStore.getState().mySeat;
if (mySeat !== null) {
  const me = payload.players.find((p) => p.seat === mySeat);
  if (me) {
    useGameStore.setState({ hasInitialMeld: me.hasInitialMeld });
  }
}
```

**권장**: **B1 + B2 둘 다 적용**. B1 은 읽기 경로 방어, B2 는 쓰기 경로 동기화. 각자 독립 PR 로 분리 가능.

### 2.4 회귀 방지 spec 권고

1. **SC-F4-01**: 게임 시작 직후 `hasInitialMeld=false` 상태에서 AI 의 서버 확정 런 위에 내 랙 타일 drop → 새 pending 그룹 1 개 생성 + 기존 서버 그룹 유지 (groupCount=2)
2. **SC-F4-02**: TURN_END 로 내 `hasInitialMeld` 가 true 로 전환된 후 동일 drop 시 **L928 분기**로 이동하여 append 또는 호환 폴스루. B1 effective derived 가 정상 동작하는지 검증
3. **SC-F4-03**: spec 의 setStoreState 를 **players[mySeat].hasInitialMeld + root hasInitialMeld 둘 다** 주입 (기존 spec 의 한쪽만 setState 하는 패턴이 무효화되지 않도록 문서화)

---

## 3. F5 — T11-03 정합성 결정 (P3)

### 3.1 현재 코드 인용

**`src/frontend/e2e/turn-sync.spec.ts:44-70`** — T11-01: AI 턴 중 ActionBar `toBeHidden`:

```ts
const actionBar = page.locator('[aria-label="게임 액션"]');
await expect(actionBar).toBeHidden({ timeout: 3_000 });
```

**`src/frontend/e2e/turn-sync.spec.ts:96-121`** — T11-03: AI 턴 중 되돌리기 + 새 그룹 disabled + 최소 1 렌더:

```ts
for (const btn of [undoBtn, newGroupBtn]) {
  const cnt = await btn.count();
  if (cnt > 0) {
    await expect(btn.first()).toBeDisabled({ timeout: 3_000 });
  }
}
const totalCount = (await undoBtn.count()) + (await newGroupBtn.count());
expect(totalCount).toBeGreaterThan(0);
```

### 3.2 근본 원인 (결정 대상)

T11-01 은 ActionBar **hidden** 요구. T11-03 의 `toBeGreaterThan(0)` 는 버튼이 **최소 1개 렌더** 요구. **spec 자체의 자기 모순** — ActionBar 가 hidden 되면 그 안의 되돌리기/새 그룹 버튼도 `count()=0` 이 되어 T11-03 가 실패한다.

PR #78 의 `isMyTurn` SSOT 는 T11-01 / T11-02 를 GREEN 으로 만드는 방향 (ActionBar 전체 hidden). T11-03 의 마지막 가드는 이 방향과 **호환되지 않는다**.

### 3.3 최종 결정: **옵션 C**

**근거**:
- T11-01 / T11-02 와 정합성 유지 필수 (동일 test.describe 블록).
- a11y 관점: AI 턴 중 플레이어 액션 영역 자체를 보여주지 않는 것이 **인지 부하 낮음**. 스크린 리더도 "내 차례 아님" 정보는 상단 turn indicator 에서 충분히 전달.
- 구현 최소 변경: GameClient 는 이미 PR #78 에서 `isMyTurn` SSOT 로 ActionBar hidden 구현. **spec 만 수정** 하면 됨.

**spec 수정 내용** (qa 또는 frontend-dev 1 hunk):

```ts
// 수정 전
const totalCount = (await undoBtn.count()) + (await newGroupBtn.count());
expect(totalCount).toBeGreaterThan(0);

// 수정 후
// F5 결정: T11-01 ActionBar hidden 정책과 정합. AI 턴에는 버튼 전체 미렌더가 정상.
// totalCount=0 이어도 FAIL 이 아니다 (T11-01 이 이미 hidden 을 검증).
// 되돌리기/새 그룹 버튼이 렌더된 경우에만 disabled 검증 (방어적).
// totalCount 가드 삭제.
```

### 3.4 회귀 방지 spec 권고

1. **T11-01/02/03 정합성**: 셋 다 "AI 턴 = 액션 영역 미노출 OR 전부 disabled" 원칙 준수. T11-03 가드 삭제 후 한 번 더 전수 검토.
2. **SC-F5-01 (신규, 턴 전환 경계)**: AI 턴 → 내 턴 전환 시점에 ActionBar 가 hidden → visible + 버튼 전부 enabled 로 1 프레임 이내 전환. 기존 race condition 방어.
3. **구현 검증 불필요**: PR #78 `isMyTurn` SSOT 이미 배포. spec 수정만으로 GREEN 전환 가능.

---

## 4. 통합 — frontend-dev 인수 체크리스트

### 4.1 수정 파일 + 라인 목록

| # | 파일 | 라인 | 작업 | 예상 diff 규모 |
|---|------|------|------|----------------|
| 1 | `src/frontend/src/app/game/[roomId]/GameClient.tsx` | 1304 (handleConfirm) | F3 A1 — `setMyTiles(pendingMyTiles)` 선행 | +2 lines |
| 2 | `src/frontend/src/app/game/[roomId]/GameClient.tsx` | 474 (destructure 직후) | F4 B1 — `effectiveHasInitialMeld` useMemo 추가 | +10 lines |
| 3 | `src/frontend/src/app/game/[roomId]/GameClient.tsx` | 750, 803, 909, 928, 978, 1186, 1589 | F4 B1 — `hasInitialMeld` → `effectiveHasInitialMeld` 7곳 replace | 7 hunks |
| 4 | `src/frontend/src/hooks/useWebSocket.ts` | 182 (GAME_STATE 말미) | F4 B2 — 루트 hasInitialMeld 동기화 | +8 lines |
| 5 | `src/frontend/e2e/turn-sync.spec.ts` | 119-120 | F5 — `toBeGreaterThan(0)` 가드 삭제 + 주석 | -2 lines, +3 lines |

**총 5 파일 hunk**. 단일 PR 에 묶어도 되고 F3/F4/F5 별 3 PR 로 분리해도 됨. **F4 는 architect + frontend-dev 페어 의무** (Sprint 7 UI 수정 페어 정책).

### 4.2 검증 순서

1. **F5 먼저**: spec 수정 1 hunk 이므로 가장 빠르게 GREEN. T11-01/02/03 3 TC 전수 PASS 확인.
2. **F3 다음**: `setMyTiles(pendingMyTiles)` 1 hunk. `rule-initial-meld-30pt V04-SC1` PASS + `rearrangement.spec.ts`, `hotfix-p0-*` 회귀 0.
3. **F4 마지막** (페어 필수): B1 + B2 조합. effective derived 적용 후 Jest (gameStore 단위) + Playwright (V04-SC3, rearrangement, ghost) 전수.

### 4.3 검증 명령

```bash
# Jest (frontend store + hook 단위)
cd src/frontend && npm test -- --watchAll=false

# Playwright 핵심 경로 (F3/F4/F5 검증 + 회귀 방지)
npx playwright test turn-sync.spec.ts rule-initial-meld-30pt.spec.ts \
  rearrangement.spec.ts regression-pr41-i18-i19.spec.ts \
  hotfix-p0-i1-pending-dup-defense.spec.ts \
  hotfix-p0-i2-run-append.spec.ts \
  hotfix-p0-i4-joker-recovery.spec.ts \
  meld-dup-render.spec.ts --workers=1
```

### 4.4 롤백 경로

- F3: 1 hunk 단순 revert.
- F4: B1/B2 를 별도 PR 로 쪼개면 각자 revert 가능. 만약 B1 이 기존 조커/재배치 경로에 부작용이 있으면 B2 만 유지하고 B1 롤백 → 동작 근접.
- F5: spec 수정만이므로 revert 즉시 복구.

---

## 5. architect 자기 비판 + 다음 액션

### 5.1 이번 분석의 한계

- **E2E worktree `/tmp/rummi-phase3-e2e-v3` 삭제 완료** → spec 원본 확인 불가. F3/F4 원인 가설은 main 코드 정독 + Phase 3 report §v3-4 설명만으로 구성. spec 실제 DOM selector 확인은 frontend-dev 가 직접 재현 시 필요.
- **F4 가설 확도 65% 는 bug-ui-ext-ghost-rereview.md §4.3 state 이중화 가설과 동일 계열**. PR #76 에서 이미 지적됐으나 아직 수정 안 된 항목. F4 는 **동일 근본 원인의 미수정 증상**.
- **F3 가설 확도 70%** 이지만 실제 spec 이 `[data-testid="rack-tile"]` DOM 을 보는지, Zustand store bridge 를 보는지 미확인. A1 optimistic commit 은 **두 방식 모두 커버** 하므로 안전한 선택.

### 5.2 다음 architect 검토 대상 (Week 2)

- **state 이중화 전수 감사 ADR** (bug-ui-ext-ghost-rereview.md §5.2 D 항목) — F4 수정이 임시봉합이므로 근본 리팩터 필요
- **SSOT 원칙 ADR** — 루트 hasInitialMeld 제거 or players[] 제거 중 택일. Sprint 8 후보
- **E2E worktree 보존 정책** — QA 세션 종료 후 worktree 삭제 시 spec 원본 확인 불가 → 다음 architect/frontend-dev 리뷰 차단. devops 재검토 필요

---

## 6. 참조

- **PR #76** — pendingGroupIds atomic + useMemo stale 제거 (BUG-UI-EXT/GHOST)
- **PR #78** — isMyTurn SSOT + UX-004 배너/토스트 (BUG-UI-011/013)
- **PR #79** — PlayerRack aria-label 원복 (v2 재앙 해소)
- **bug-ui-ext-ghost-rereview.md §4.3** — state 이중화 근본 원인 원문
- **Phase 3 Stage 1 재검증 §v3-4** — F1/F2/F3/F4/F5 잔존 FAIL 5건 원인 가설 원문
- **docs/02-design/31-game-rule-traceability.md** V-04 / §6.2 재배치 — 게임룰 ↔ 소스코드 추적 (수정 시 동기화 의무)
