# BUG-DRAW-001 RCA — HUMAN 자기 차례 드로우 버튼 비활성

- **작성일**: 2026-04-29
- **작성자**: frontend-dev-opus (페어 dispatch)
- **우선순위**: P0 (사용자 실측 회귀, 게임 진행 차단)
- **배포**: frontend `day7-923c21b` (P3-3 직후 본 회귀)
- **룰 ID 매핑**: V-08 (자기 턴), V-10 (drawpile), UR-22 (drawEnabled = isMyTurn && !hasPending)

## 1. 사고 요약

사용자(애벌레, seat=2)가 자기 차례에 진입했음에도 **드로우 버튼이 비활성** 상태로 표시되어 액션을 못 함. RESET 버튼을 누르면 정상 회복. Backend 로그상 사용자의 자기 차례 동안 어떤 WS 액션도 도달 안 함 → frontend 자체에서 버튼이 disabled 처리되어 클릭 자체가 막혔음.

게임은 timer expired 누적으로 FORFEIT 종료 (Game `ec620c00-...`).

## 2. 결정적 증거

| 시각(KST) | 턴 | 상태 | 드로우 버튼 |
|----------|----|------|-----------|
| 16:39:20 | #3 애벌레 | 첫 자기 차례 직후 | ActionBar 자체 hidden (isMyTurn=true 인데도 hidden? — Note 1) |
| 16:41:27 | #6 애벌레 | 자기 차례 49s | 비활성 (disabled) |
| 16:42:17 | #7 배진용 | 직전 턴에서 RESET 클릭 후 | **활성으로 회복** ← 결정적 단서 |

> Note 1: 16:39:20 ActionBar hidden 은 별개 이슈일 수 있음 (mySeat 미등록 race 등). 본 RCA 의 1차 표적은 16:41:27 의 disabled 상태이며, 그 메커니즘은 아래 §3 에서 확립함.

Backend WS 로그: `07:39:49 turn timer expired seat=2 (애벌레 첫 차례 60s 만료)` — frontend 가 어떤 액션도 송신 안 했음을 backend 가 확인.

## 3. 근본 원인 (RCA)

### 3.1 호출 체인

```
TURN_START 수신 (useGameSync.ts L52~120)
  → pending.reset()                            // draft = null
  → pending.saveTurnStartSnapshot(myTiles, tableGroups)   // L111
      // saveTurnStartSnapshot 내부 (pendingStore.ts L186~206):
      //   prev = state.draft ?? {
      //     groups: tableGroups,                    // ← 서버 보드의 모든 그룹
      //     pendingGroupIds: new Set<string>(),     // ← 빈 Set
      //     myTiles: rack, ...
      //   }
      //   set draft = { ...prev, turnStartRack: rack, turnStartTableGroups: tableGroups, myTiles: rack }
      // 결과: draft.groups.length > 0, draft.pendingGroupIds.size === 0
  → useTurnActions 의 selectHasPending 평가 (pendingStore.ts L238~240, 수정 전):
      return state.draft !== null && state.draft.groups.length > 0;
      // → true
  → drawEnabled = isMyTurn && !hasPending = true && !true = false
  → ActionBar disabled
```

### 3.2 핵심 결함

`selectHasPending` 의 의미가 "draft 가 존재하고 어떤 groups 든 있는가" 였는데, 실제 의도는 **"내가 이번 턴에 직접 마킹한 pending 그룹이 있는가"** 여야 함.

근거:
- `selectAllGroupsValid` (L246~253): `draft.groups.filter(g => draft.pendingGroupIds.has(g.id))` 로 필터링
- `selectPendingPlacementScore` (L227~233): 동일하게 `pendingGroupIds.has(g.id)` 필터링
- `handleConfirm` (useTurnActions.ts L171): `draft.groups.filter(g => draft.pendingGroupIds.has(g.id))` 동일 패턴
- 즉 "pending 의 진짜 SSOT 는 `pendingGroupIds`" 라는 일관성이 다른 모든 selector 에 있는데 `selectHasPending` 만 어긋나 있었음

### 3.3 P3-3 회귀 여부

엄밀히는 P3-3 직접 회귀 아님. **잠재 결함은 P2b Phase B (커밋 `a3b65ff`, 오늘 새벽 01:09)** 에서 useTurnActions 가 `selectHasPending` 을 사용하기 시작한 시점부터 존재했음. P3-3 시리즈는 이 결함을 새로 만든 것이 아니라 단지 trigger 조건(보드에 다른 플레이어 멜드 존재 + 사용자 자기 차례 진입 + 드래그 안 함)이 사용자 게임에서 처음 누적된 것.

다만 P3-3 의 useIsMyTurn / GameRoom DndContext 이전이 동시기 변경이라 사용자 시점에서는 "P3-3 직후 발생" 으로 인식됨. P2b 까지의 역사를 계측 안 했기 때문.

## 4. 핫픽스

### 4.1 변경 파일

`src/frontend/src/store/pendingStore.ts:238~256`

```ts
// 변경 전 (L238~240)
export function selectHasPending(state: PendingStore): boolean {
  return state.draft !== null && state.draft.groups.length > 0;
}

// 변경 후
export function selectHasPending(state: PendingStore): boolean {
  return state.draft !== null && state.draft.pendingGroupIds.size > 0;
}
```

### 4.2 회귀 방지 테스트

`src/frontend/src/store/__tests__/pendingStore.test.ts` 에 BUG-DRAW-001 케이스 2건 추가:

1. `saveTurnStartSnapshot 직후 pendingGroupIds 빈 Set 이면 selectHasPending = false (UR-22)`
2. `applyMutation 후 pendingGroupIds 채워지면 selectHasPending = true`

### 4.3 사용자 절대 원칙 준수

- 꼼수 / 임시 guard 추가 아님 — selector 의미를 룰(UR-22) 에 일치시킴
- `pendingGroupIds` 는 이미 다른 selector / handleConfirm 가 사용 중인 정식 도메인 SSOT
- 변경 후 `selectHasPending` ↔ `selectAllGroupsValid` ↔ `selectPendingPlacementScore` 가 모두 동일 SSOT 기반 → 일관성 회복

## 5. 검증

| 단계 | 결과 |
|------|------|
| `pendingStore.test.ts` | 25 PASS (BUG-DRAW-001 2건 GREEN 포함) |
| `useTurnActions.test.ts` | 8 PASS |
| 전체 Jest | **636 / 636 PASS** (이전 614 → +22, 본 RCA 외 P3-3 시리즈 합산 증가분 포함) |
| TypeScript | (별도 build 단계에서 검증 필요 — 본 dispatch 시간 내 미실행) |
| E2E rule spec | 본 RCA 시간 내 미실행 — 후속 권고 |

## 6. 의미적 영향 분석

`selectHasPending` 호출자 (수정 후 의미: "사용자가 이번 턴에 마킹한 pending 그룹이 1개 이상"):

| 호출자 | 위치 | 영향 |
|--------|------|------|
| `useTurnActions` reactive subscribe | useTurnActions.ts:125 | drawEnabled / resetEnabled / confirmEnabled 계산. **자기 차례 시작 직후 drawEnabled=true 회복** (의도 일치). |
| `useTurnActions.handleDraw` 내부 가드 | useTurnActions.ts:225 | 동일 효과. drawEnabled 동기화. |
| `selectConfirmEnabled` 자체 호출 | pendingStore.ts:263 | confirmEnabled 사전조건. 사용자 마킹된 그룹이 있어야 확정 가능 (이미 선조건). 변화 없음 의미적으로 정확. |

**resetEnabled 영향**: `resetEnabled = hasPending`. 변경 후엔 사용자가 드래그 후에만 RESET 활성. 자기 차례 시작 직후 (드래그 안 한 상태) 에서는 RESET 도 비활성 — 이는 게임룰상 "되돌릴 게 없음" 이 정확. 사용자가 16:42:17 에 RESET 활성으로 본 것은 직전 턴에 드래그가 있었기 때문 (스크린샷 16:42:07 에 호버된 상태로 RESET 활성 표시).

## 7. 후속 위생 작업 권고

### 7.1 본 RCA 와 무관한 별개 의문 (Note 1)

16:39:20 의 ActionBar 전체 hidden 은 isMyTurn=false 로 평가된 것으로 추정. 첫 자기 차례 진입 race 가능성 (mySeat 미등록 + currentSeat 도달 순서 등). frontend-dev (Sonnet) 가 분석 중인 "버그 2 AI 턴 UX 인지" 와 부분 겹칠 가능성 — 페어 sonnet 결과 대조 필요.

### 7.2 일관성 추가 정리 (별개 PR 권고)

- `useTurnActions.handleConfirm` L159 의 `draft.groups.length === 0` early return 도 `pendingGroupIds.size === 0` 로 통일 가능 (현재는 의미적으로만 어긋날 뿐 동작 영향 없음 — `pendingOnlyGroups` 필터링이 그 다음 단계에 있어서)
- `saveTurnStartSnapshot` 가 `prev=null` 분기에서 `groups: tableGroups` 로 초기화하는 패턴 자체를 재검토 가치 있음. `groups: []` 로 두고 turnStartTableGroups 만 보존하는 것이 더 명료할 수 있으나, dragEndReducer 가 draft.groups 를 보드 전체로 보고 mutation 하는 패턴에 의존할 수 있어 영향 분석 필요. 본 핫픽스 범위 외.

### 7.3 RISK / 룰 SSOT 갱신

- RISK-07 후보: "selector 의미 분기 (groups.length vs pendingGroupIds.size) 가 핵심 활성 조건에 영향" — game-analyst 와 협의 후 67-risk-catalog.md 에 추가 권고
- UR-22 정의가 코드 수준으로 정확히 매핑됐는지 55/56 SSOT 와 cross-check 권고

## 8. 배포

본 dispatch 에서는 **코드 패치 + Jest GREEN 까지만 수행**. 빌드 / K8s rollout 은 메인 세션에서 결정.

권고:
- TypeScript 빌드 1회 후 frontend 이미지 재빌드 (Kaniko 또는 로컬 docker)
- `day7-{새 commit hash}` 태그
- ConfigMap 무영향 (timeout chain 변경 없음)
- 배포 후 self-play harness 1회로 hasPending 의도 확인 권고 (사용자 직접 재현 요청 금지)

## 9. 변경 라인 요약

| 파일 | 라인 | 변경 |
|------|------|------|
| `src/frontend/src/store/pendingStore.ts` | L238~256 | `selectHasPending` 의미 수정 + JSDoc 보강 (BUG-DRAW-001) |
| `src/frontend/src/store/__tests__/pendingStore.test.ts` | +44 lines | 회귀 방지 테스트 2건 추가 |

총 변경: ~50 라인. P0 핫픽스 범위 적합.
