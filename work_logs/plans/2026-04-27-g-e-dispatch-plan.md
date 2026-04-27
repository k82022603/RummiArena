# Sprint 7 W2 Day 4 — G-E 재배치 구현 + RED→GREEN 전환

## Context

Sprint 7 W2 G-B 완료 후, 의도된 RED 4건(EXT-SC1/SC3, V04-SC1/SC3)을 해소하기 위해 G-E(재배치)와 G-F(ConfirmTurn)가 필요하다. 오늘은 G-E를 확실히 완료하고, G-F는 선행 작업만 진행한다.

**핵심 발견**: RED 원인은 (1) dragEndReducer에 A4/A8 split 분기 부재 + (2) E2E fixture에서 `players[].hasInitialMeld` 미설정 (GHOST-SC2와 동일 패턴)의 2중 문제다.

**접근**: 선택지 C — table source의 game-board/game-board-new-group 경로만 dragEndReducer로 위임, 나머지 인라인 코드 유지 (docs/02-design/59 §4.3).

---

## Block 1: E2E RED 진단 확정 (30분)

EXT-SC1/SC3 단일 spec 실행 + console.log로 `freshHasInitialMeld` 값 확인.
예상: players[0].hasInitialMeld가 false/undefined → 루트 hasInitialMeld 무시.

---

## Block 2: dragEndReducer A4/A8 분기 추가 (45분)

**파일**: `src/frontend/src/lib/dragEnd/dragEndReducer.ts`

1. **DragAction 확장** (line 73-80): `SPLIT_PENDING_GROUP` | `SPLIT_SERVER_GROUP` 추가
2. **table→game-board/game-board-new-group 분기 삽입** (line 181 이후, 184 이전):
   - `overId === "game-board" || "game-board-new-group"` 검사
   - `sourceIsPending === true` → A4: source 축소 + 새 pending 그룹 생성
   - `!sourceIsPending && !hasInitialMeld` → reject (initial-meld-required)
   - `!sourceIsPending && hasInitialMeld` → A8: source→pendingGroupIds 전환 + 새 pending 그룹
   - 모든 경로에 `detectDuplicateTileCodes` 방어선 + INV-G3 빈 그룹 제거
3. **RDX-02** (line 231): `[...pendingGroupIds, sourceGroup.id, targetGroup.id]`

예상: +80줄 신규, 1줄 수정

---

## Block 3: A4/A8 단위 테스트 GREEN 전환 (30분)

**파일**:
- `src/frontend/src/lib/dragEnd/__tests__/by-action/A04-pending-to-new.test.ts`
- `src/frontend/src/lib/dragEnd/__tests__/by-action/A08-server-to-new.test.ts`
- `src/frontend/src/lib/dragEnd/__tests__/by-action/A09-server-to-server-merge.test.ts`

변경:
- A4.1: `target-not-found` → `SPLIT_PENDING_GROUP` 성공 (GREEN 전환)
- A8.2: `target-not-found` → `SPLIT_SERVER_GROUP` 성공 (GREEN 전환)
- 신규 TC: A4 직접 split 후 source 축소/새 그룹 검증, A8 PRE_MELD reject
- A09: `output.nextPendingGroupIds.has(sourceGroup.id)` 검증 추가 (RDX-02)
- 기존 2-step TC 유지 (회귀 방지)

---

## Block 4: GameClient table→game-board 위임 (45분)

**파일**: `src/frontend/src/app/game/[roomId]/GameClient.tsx`

삽입 위치: line 856 (`table→rack return`) 직후, line 858 (`table→table 이동`) 직전.

```typescript
// A4/A8: table source에서 game-board/game-board-new-group → reducer 위임
if (over.id === "game-board" || over.id === "game-board-new-group") {
  const result = dragEndReducer({
    tableGroups: freshTableGroups, myTiles: freshMyTiles,
    pendingGroupIds: freshPendingGroupIds,
    pendingRecoveredJokers: freshPendingRecoveredJokers,
    hasInitialMeld: freshHasInitialMeld,
    forceNewGroup: false, pendingGroupSeq: pendingGroupSeqRef.current,
  }, {
    source: { kind: "table", groupId: dragSource.groupId, index: dragSource.index },
    tileCode, overId: String(over.id), now: Date.now(),
  });
  if (!result.rejected) {
    setPendingTableGroups(result.nextTableGroups);
    setPendingMyTiles(result.nextMyTiles ?? freshMyTiles);
    setPendingGroupIds(result.nextPendingGroupIds);
    pendingGroupSeqRef.current = result.nextPendingGroupSeq;
  }
  return;
}
```

**RDX-02 동기 수정** (line 896-902): `sourceGroup.id` 추가 (1줄)

---

## Block 5: E2E fixture players 주입 (30분)

**파일**:
- `src/frontend/e2e/rule-extend-after-confirm.spec.ts` (setupExtendAfterConfirm)
- `src/frontend/e2e/rule-initial-meld-30pt.spec.ts` (setupInitialMeldScenario)

변경: `store.setState`에 `players` 배열 명시:
```javascript
players: [
  { seat: 0, displayName: 'Test', hasInitialMeld: true/false, handCount: N },
  { seat: 1, displayName: 'AI', handCount: 14, isAI: true },
],
```

---

## Block 6: Jest 전체 회귀 + E2E 실행 (60분)

```bash
cd src/frontend && npx jest --passWithNoTests
npx playwright test e2e/rule-extend-after-confirm.spec.ts e2e/rule-initial-meld-30pt.spec.ts --workers=1
```

기대: Jest 547+ PASS, EXT-SC1/SC3/V04-SC3 GREEN (3건), V04-SC1 RED 유지 (G-F 범위).

---

## Block 7 (시간 허용 시): G-F ConfirmTurn 선행 (30분)

`ActionBar`에 `pendingStore.selectConfirmEnabled` 연결, V04-SC1 GREEN 준비.

---

## 의존성 그래프

```
Block 1 (진단) ───┐
                   ├─→ Block 2 (reducer) ─┬─→ Block 3 (unit tests)  ─┐
Block 5 (fixture) ─┘                      ├─→ Block 4 (GameClient)  ─┼─�� Block 6 (회귀)
                                          └─→ Block 8 (A09 RDX-02)  ─┘        │
                                                                       Block 7 (G-F)
```

Block 1+5는 병렬 가능. Block 3+4는 Block 2 이후 병렬 가능.

---

## 에이전트 dispatch 계획

| Phase | 에이전트 | Block | mode |
|-------|---------|-------|------|
| Phase 1 | qa + game-analyst | Block 1 진단 + A4/A8 엣지 교차검증 | bypassPermissions |
| Phase 2 | frontend-dev | Block 2+3+4 (순차) | bypassPermissions |
| Phase 2 (병렬) | qa | Block 5 E2E fixture | bypassPermissions |
| Phase 3 | qa | Block 6 회귀 테스트 | bypassPermissions |
| Phase 4 (선택) | frontend-dev | Block 7 G-F 선행 | bypassPermissions |

---

## 커밋 전략 (5건)

1. `feat(dragEnd): A4 SPLIT_PENDING_GROUP + A8 SPLIT_SERVER_GROUP 분기 [V-13a,V-13b,D-12]`
2. `fix(dragEnd): RDX-02 table→table source pending 마킹 [V-17,D-01]`
3. `feat(GameClient): table→game-board A4/A8 reducer 위임 [59 §4.3,F-05,F-06]`
4. `test(by-action): A04/A08/A09 직접 split GREEN 전환 [A4,A8,INV-G2]`
5. `fix(e2e): EXT/V04 fixture players.hasInitialMeld 주입 [EXT-SC1,EXT-SC3,V04-SC3]`

---

## 검증 (E2E)

- [ ] Jest: 547+ PASS (기존 545 + A4/A8 신규 TC)
- [ ] EXT-SC1 GREEN (rack→server run append)
- [ ] EXT-SC3 GREEN (rack→server run 앞 append)
- [ ] V04-SC3 GREEN (PRE_MELD server drop → 새 pending 분리)
- [ ] EXT-SC4 GREEN or SKIP (반복 drop 복제 방지)
- [ ] V04-SC1 RED 유지 (G-F 범위, 내일)
- [ ] 기존 10 E2E PASS 유지 (회귀 없음)
- [ ] `pnpm build` 성공 (TS 에러 없음)

## 수정 대상 파일

| 파일 | Block | 변경 |
|------|-------|------|
| `src/frontend/src/lib/dragEnd/dragEndReducer.ts` | 2 | A4/A8 ��기 +80줄, RDX-02 1줄 |
| `src/frontend/src/app/game/[roomId]/GameClient.tsx` | 4 | table→game-board 위임 +25줄, RDX-02 1줄 |
| `src/frontend/src/lib/dragEnd/__tests__/by-action/A04-pending-to-new.test.ts` | 3 | GREEN 전환 + 신규 TC |
| `src/frontend/src/lib/dragEnd/__tests__/by-action/A08-server-to-new.test.ts` | 3 | GREEN 전환 + 신규 TC |
| `src/frontend/src/lib/dragEnd/__tests__/by-action/A09-server-to-server-merge.test.ts` | 3 | RDX-02 검증 추��� |
| `src/frontend/e2e/rule-extend-after-confirm.spec.ts` | 5 | players fixture 주입 |
| `src/frontend/e2e/rule-initial-meld-30pt.spec.ts` | 5 | players fixture 주입 |
