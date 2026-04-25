# 26b — Frontend 라인 레벨 소스 리뷰

- **작성**: 2026-04-25, frontend-dev (라인 레벨 소스 리뷰 책임 인수)
- **권한 근거**: `/home/claude/.claude/plans/reflective-squishing-beacon.md` — "소스코드 라인 레벨 리뷰 architect 박탈, FE/BE 담당자에게 이관"
- **입력 SSOT**: `docs/02-design/55-game-rules-enumeration.md`, `56-action-state-matrix.md`, `56b-state-machine.md`
- **분석 대상**:
  - `src/frontend/src/app/game/[roomId]/GameClient.tsx` (1,830줄)
  - `src/frontend/src/components/game/GameBoard.tsx` (577줄)
  - `src/frontend/src/store/gameStore.ts` (291줄)
  - `src/frontend/src/lib/dragEnd/dragEndReducer.ts` (688줄)
  - `src/frontend/src/lib/mergeCompatibility.ts` (142줄)
  - `src/frontend/src/lib/tileStateHelpers.ts` (49줄)
- **코드 수정 금지**: 본 문서는 분석 전용. 구현은 다음 sprint 단계에서 수행.

---

## 1. handleDragEnd 분기 ↔ A1~A21 매핑표

SSOT 56 행동 정의 기준으로 GameClient.tsx 730~1287줄 `handleDragEnd` 의 분기를 매핑한다.

### 1.1 명시 매핑 (코드 분기 ↔ A-N 직접 대응)

| A-ID | 행동 정의 | GameClient.tsx 분기 | 라인 범위 | 매핑 상태 |
|------|----------|---------------------|-----------|----------|
| **A1** | 랙 → 보드 새 그룹 드롭 | `treatAsBoardDrop && shouldCreateNewGroup → 새 그룹 생성` | 1180–1211 | 매핑 (불완전) |
| **A2** | 랙 → 보드 기존 pending 그룹 드롭 | `existingPendingGroup 분기, isCompatibleWithGroup 통과 시 병합` | 925–973 | 매핑 |
| **A3** | 랙 → 보드 서버 확정 그룹 드롭 (extend) | `targetServerGroup && freshHasInitialMeld, isCompatibleWithGroup 통과 시 append` | 1026–1072 | 매핑 (A6 혼재 주의) |
| **A4** | 보드 pending → 보드 새 그룹 드롭 (split via new) | 미구현 — `dragSource.kind === "table"` 분기에서 over.id 가 "game-board" / "game-board-new-group" 일 때 경로 없음 | 802–878 | **미매핑 — 폐기 후보** |
| **A5** | 보드 pending → 보드 다른 pending 드롭 (merge pending) | `dragSource.kind === "table"` → `targetGroup` 찾기 → pending/pending 모두 처리되나 UR-14 호환성 체크 없음 (pending→pending 무조건 append) | 833–877 | 부분 매핑 (호환성 미검사) |
| **A6** | 보드 pending → 보드 서버 확정 그룹 드롭 | `dragSource.kind === "table"` → `targetGroup` 찾기 → `freshHasInitialMeld` 통과 시 이동 | 833–877 | 매핑 (INC-T11-DUP 원인 분기) |
| **A7** | 보드 pending → 랙 (회수) | `dragSource.kind === "table"` → `over.id === "player-rack"` → `sourceIsPending` 체크 | 813–830 | 매핑 |
| **A8** | 보드 서버 확정 → 보드 새 그룹 (split server) | `dragSource.kind === "table"` → over.id 가 "game-board"/"game-board-new-group" 일 때 경로 없음 | 802–878 | **미매핑 — 폐기 후보** |
| **A9** | 보드 서버 확정 → 보드 다른 서버 확정 (merge server) | `dragSource.kind === "table"` → `targetGroup` 분기는 처리하나 INC-T11-DUP 원인 (소스 그룹 tile 미제거 버그) | 833–877 | 매핑 (구현 버그 포함) |
| **A10** | 보드 서버 확정 → 보드 pending 그룹 | `dragSource.kind === "table"` → `targetGroup` (pending) 분기 | 833–877 | 매핑 |
| **A11** | 보드 서버 확정 → 랙 (회수) | `dragSource.kind === "table"` → `over.id === "player-rack"` → `!sourceIsPending` → return | 813–815 | 매핑 (올바른 V-06 거절) |
| **A12** | 조커 swap (V-13e) | `swapCandidate 분기, tryJokerSwap 성공 시 처리` | 887–918 | 매핑 |
| **A13** | 랙 내 재정렬 | `handleRackSort` (handleDragEnd 외부) | 1290–1299 | 매핑 (별도 핸들러) |
| **A14** | ConfirmTurn 클릭 | `handleConfirm` (handleDragEnd 외부) | 1317–1425 | 매핑 (별도 핸들러) |
| **A15** | RESET_TURN 클릭 | `handleUndo` (handleDragEnd 외부) | 1427–1445 | 매핑 (별도 핸들러) |
| **A16** | DRAW 클릭 | `handleDraw` / `handlePass` (handleDragEnd 외부) | 1447–1455 | 매핑 (별도 핸들러) |
| **A17** | 드래그 취소 (esc / onDragCancel) | `handleDragCancel` — `setActiveDragCode(null)`, ref 초기화 | 723–728 | 매핑 — **단 state 변경 0 여부는 충족** |
| **A18** | 다른 플레이어 PLACE_TILES 수신 | useWebSocket.ts (handleDragEnd 범위 외) | — | 매핑 위치 분리 |
| **A19** | TURN_START 수신 | useWebSocket.ts → `resetPending()` 호출 (UR-04) | — | 매핑 위치 분리 |
| **A20** | TURN_END 수신 | useWebSocket.ts → TURN_START 와 동일 cleanup | — | 매핑 위치 분리 |
| **A21** | INVALID_MOVE 수신 | useWebSocket.ts → `resetPending()` + ErrorToast | — | 매핑 위치 분리 |

### 1.2 매핑 미달 / 미매핑 분기 (폐기 후보)

| 분기 설명 | 라인 범위 | 미매핑 사유 |
|----------|-----------|------------|
| `A4 / A8: dragSource.kind === "table"` 에서 over.id 가 `"game-board"` 또는 `"game-board-new-group"` 인 경우 | 802–878 | 코드에 해당 분기 없음. 드래그 소스가 테이블 타일인데 보드 빈 공간 / 새 그룹 드롭존에 드롭하면 `no-op` 처리됨 (A4/A8 split 행동 미지원) |
| `treatAsBoardDrop && !shouldCreateNewGroup → lastPendingGroup 에 append` 분기에서 A1 vs A2 혼재 | 1166–1179 | 드래그 소스가 랙인지 테이블인지 구분 없이 동일 경로 진입. `dragSource?.kind === "table"` 는 위 분기에서 이미 return 되므로 여기는 실제로 rack 소스만 올 수 있으나 분기 의도가 코드에서 명시되지 않음 |
| `over.id === "player-rack"` 맨 하단 분기 (1237~1262줄) 에서 `dragSource.kind` 미확인 | 1237–1263 | `dragSource.kind === "table"` 분기에서 이미 player-rack 드롭을 처리하고 return. 여기 도달하는 경우는 "table→rack" 이 아닌 경우. rack→rack 드롭인지 확인 없이 pending 그룹 회수 로직 진입 — A7/A13 혼재 |

### 1.3 A-N 매핑률 계산

- 총 행동: A1~A21 = 21개
- handleDragEnd 내부 직접 매핑: A1~A12, A17 = 13개 (A13~A16, A18~A21은 별도 핸들러/WS 핸들러)
- handleDragEnd 내부 중 완전 매핑: A2, A3, A6, A7, A9, A10, A11, A12, A17 = 9개
- handleDragEnd 내부 중 부분 매핑 / 버그 포함: A1, A5 = 2개
- handleDragEnd 내부 중 미매핑 (폐기 후보): A4, A8 = 2개
- **handleDragEnd 내 A-N 매핑률: 9/13 = 69.2%**
- 전체 A-N 대비 (별도 핸들러 포함 정상 분리): 19/21 = **90.5%**

---

## 2. 모듈화 7원칙 위반 지점

모듈화 7원칙 출처: `/home/claude/.claude/plans/reflective-squishing-beacon.md` §제1원칙.

### 2.1 원칙 1 — SRP 위반 (GameClient.tsx 1,830줄 monolith)

`GameClient.tsx` 는 단일 파일에 다음 책임이 혼재한다:

| 책임 유형 | 포함 라인 | SRP 위반 내용 |
|----------|-----------|--------------|
| 순수 유틸 함수 (도메인) | 64–174 | `classifySetType`, `removeFirstOccurrence`, `tryJokerSwap` — 컴포넌트 컨텍스트 불필요. 모듈 레벨 분리 가능 |
| UI 서브 컴포넌트 | 184–411 | `DrawPileVisual`, `GameEndedOverlay` — 독립 파일로 분리 가능 |
| 충돌 감지 커스터마이징 | 414–427 | `pointerWithinThenClosest` — dnd-kit 설정 분리 가능 |
| WS 이벤트 → state 전이 | useEffect 전체 | WS 구독 + 카운트다운 인터벌 + confirmBusy 락 — 별도 hook |
| 드래그 상태 전이 로직 | 730–1287 | `handleDragEnd` 단일 함수 484줄 — 원칙 1 직접 위반 |
| 액션 핸들러 (confirm/undo/draw/pass) | 1317–1455 | 4개 액션이 동일 컴포넌트 스코프 — 별도 hook 분리 가능 |
| 레이아웃 렌더링 | 1511–1829 | JSX 단일 return 내 헤더/사이드바/메인 모두 인라인 |

**SRP 위반 핵심 라인**: `730–1287` (`handleDragEnd` 484줄). 원칙 1의 "1 함수 = 1 책임"을 직접 위반하며 A1~A12 행동 12개를 단일 함수에서 처리한다.

### 2.2 원칙 2 — 순수 함수 우선 위반

| 위치 | 라인 | 위반 내용 |
|------|------|----------|
| `handleDragEnd` 내 `useWSStore.getState().setLastError(...)` 직접 호출 | 791, 958–964, 1056–1061 | 순수 상태 전이 로직 내에 부작용(토스트 발생) 인라인 혼재. 부작용은 명시적 sink 로 격리해야 함 |
| `handleDragEnd` 내 `useGameStore.getState()` 직접 접근 | 764 | 렌더 함수가 아닌 이벤트 핸들러에서 store 직접 접근 — Zustand 안티패턴 |
| `handleConfirm` 내 `setInvalidPendingGroupIds(new Set([group.id]))` | 1349, 1363, 1377 | UI 상태 변경과 서버 전송이 동일 함수에서 발생 |
| `extendLockToastShownRef.current` mutable ref 직접 변경 | 1004–1006 | ref 돌연변이가 순수 드롭 전이 로직에 포함됨 |

### 2.3 원칙 3 — 의존성 주입 위반 (import 직접 결합)

| 위치 | 라인 | 위반 내용 |
|------|------|----------|
| `handleDragEnd` 에서 `useGameStore.getState()` 직접 import + 호출 | 764 | 컴포넌트가 store 에 직접 결합됨. 테스트 시 mock 불가 |
| `handleConfirm` 에서 `useWSStore.getState().setLastError()` 직접 호출 | 1337 | WS store 에 직접 결합. toast 레이어 교체 시 다중 수정 필요 |
| `handleDragEnd` 에서 `validatePendingBlock`, `isCompatibleWithGroup` 직접 import | 43–44 | 의존성 주입 없이 직접 import — 검증 로직 교체 시 컴포넌트 수정 필요 |

### 2.4 원칙 4 — 계층 혼재

```
현재 계층 혼재 상황 (GameClient.tsx):

[UI 계층] ←→ [도메인 로직] ←→ [상태 관리] ←→ [통신]
    ↑               ↑                ↑             ↑
  JSX 렌더       handleDragEnd    Zustand 직접   send() 직접
  (1511~1829)   (730~1287)      getState()     호출 인라인
                                (764)          (1408~1416)
```

올바른 계층 분리 기준에서 위반:
- **UI 계층 (렌더만)**: GameClient JSX 내부에 `isMyTurn` 판정 로직 (`629–639`) — 도메인 로직이 UI 계층에 위치
- **상태 관리 계층**: `gameStore.ts` 의 `resetPending` 은 순수 상태 초기화로 올바름. 단 `pendingGroupIds: new Set<string>()` 를 reset 에서 처리하지 않고 `setPendingGroupIds` 별도 setter 로 분리한 것은 일관성 부족
- **도메인 로직 계층**: `handleConfirm` 내 V-01/V-02/V-14/V-15 클라 미러 검증 (1342–1382줄) 이 WS `send()` 와 동일 함수에 혼재

### 2.5 원칙 5 — 테스트 가능성 부재

| 위치 | 라인 | 위반 내용 |
|------|------|----------|
| `handleDragEnd` | 730–1287 | `useCallback` 으로 감싸인 클로저. 의존성 배열이 `forceNewGroup` 하나뿐이나 내부에서 `useGameStore.getState()` 호출 — Jest 환경에서 직접 단위 테스트 불가 |
| `isMyTurn` IIFE 계산 | 629–639 | `currentPlayerId` + `players` 혼합 로직이 컴포넌트 본체에 인라인 — 분리 후 순수 함수 테스트 가능해야 함 |
| `effectiveHasInitialMeld` useMemo | 491–495 | 컴포넌트 훅 내 도메인 계산 — 순수 함수로 분리 후 단위 테스트해야 함 |

### 2.6 원칙 6 — 수정 용이성 부재

`effectiveHasInitialMeld` 변경 시 동시 수정 필요 지점 7개 (W2-A):
1. `GameClient.tsx:491` — useMemo 선언
2. `GameClient.tsx:774` — handleDragEnd 내 freshHasInitialMeld 계산
3. `GameClient.tsx:833` — 테이블→테이블 재배치 차단
4. `GameClient.tsx:892–893` — P3 조커 교체 조건
5. `GameClient.tsx:1001` — FINDING-01 early-return
6. `GameClient.tsx:1026` — 서버 그룹 append 조건
7. `GameClient.tsx:1679` — GameBoard prop 전달

이는 원칙 6 "룰 변경 시 1~3개 파일만 수정"을 직접 위반한다.

### 2.7 원칙 7 — band-aid 잔존

| 위치 | 라인 | band-aid 내용 | 룰 ID 매핑 여부 |
|------|------|--------------|----------------|
| `detectDuplicateTileCodes` 호출 후 토스트 | 956–964 | "타일 중복 감지 — 되돌리기 후 다시 배치하세요" 사용자 노출 | INV-G2 위반 = 코드 버그. UR-34 금지 토스트. **band-aid** |
| `detectDuplicateTileCodes` 호출 후 토스트 (서버 그룹 append 경로) | 1053–1061 | 동일 | 동일 **band-aid** |
| `isHandlingDragEndRef` / `lastDragEndTimestampRef` ref guard | 737–754 | dnd-kit re-fire 방어 — 56b §4.1 에서 "최후 방어선, 우선 dnd-kit 설정으로 해결" 명시 | 최후 방어선으로 허용 가능하나 근본 해결(dnd-kit Sensors 설정) 선행 필요 |
| `handleConfirm` 내 `unplacedRecoveredJokers` 토스트 | 1336–1340 | "회수한 조커를 같은 턴에 다른 세트에 사용해야 합니다" — UR-25 토스트로 정당. V-07 대응 | **보존 가능** |

---

## 3. 폐기/보존/수정 분류표

### 3.1 GameClient.tsx 영역별 분류

| 영역 | 라인 범위 | 거취 | 룰 ID 근거 | 비고 |
|------|-----------|------|------------|------|
| `classifySetType` | 64–83 | **수정** (이동) | D-04, D-10 | dragEndReducer.ts 에도 동일 함수 존재 — 단일 파일로 통합 필요 (D-10 정책) |
| `removeFirstOccurrence` | 89–92 | **폐기** (이미 `tileStateHelpers.ts` 에 존재) | D-02 | 중복 정의. `tileStateHelpers.ts` 의 것을 import 사용 |
| `tryJokerSwap` | 114–174 | **수정** (이동) | V-07, V-13e | dragEndReducer.ts 에도 동일 함수 존재 — 단일 파일로 통합 |
| `DrawPileVisual` | 184–228 | **수정** (분리) | UR-22, UR-23 | 독립 컴포넌트 파일로 이동 |
| `getPlayerDisplayName` | 230–239 | **수정** (이동) | — | 유틸 파일로 이동 |
| `GameEndedOverlay` | 241–411 | **수정** (분리) | UR-27, UR-28 | 독립 컴포넌트 파일로 이동 |
| `pointerWithinThenClosest` | 414–427 | **수정** (이동) | — | dnd-kit 설정 파일로 분리 |
| `effectiveHasInitialMeld` useMemo | 491–495 | **수정** | V-13a, V-05 | 순수 함수 `computeEffectiveMeld(players, mySeat, hasInitialMeld)` 로 추출 후 7지점 참조 통일 |
| `isMyTurn` IIFE | 629–639 | **수정** | V-08, UR-01 | 순수 함수 `computeIsMyTurn(...)` 로 추출. hook 또는 selector 레벨로 이동 |
| `currentTableGroups` / `currentMyTiles` useMemo | 641–648 | **보존** | — | 클로저 + 파생 값 패턴으로 올바름. 단 freshTableGroups 중복 계산 통일 필요 |
| `allGroupsValid` useMemo | 655–663 | **보존** | V-01, V-02, UR-15 | SSOT 룰 ID 매핑됨. 위치는 적절 |
| `pendingPlacementScore` useMemo | 666–672 | **보존** | V-04, UR-24 | SSOT 룰 ID 매핑됨 |
| `handleDragStart` | 703–717 | **보존** | UR-10 | 간단하고 명확. dragSource ref 기록 |
| `handleDragCancel` | 723–728 | **보존** | UR-17, A17 | state 변경 없음 — 56 §3.18 의 "어떠한 state 변경도 발생해서는 안 됨" 충족 |
| `handleDragEnd` 전체 | 730–1287 | **수정** (분해) | A1~A12 | W2-F ADR 대상. dragEndReducer.ts 로 로직 이전 + 얇은 어댑터 레이어 유지 |
| `handleDragEnd` 내 re-entrancy guard | 737–754 | **보존** (단기) | INV-G2, 56b §4.1 | 최후 방어선. 근본 해결(dnd-kit 설정) 완료 후 제거 검토 |
| `handleDragEnd` 내 `useGameStore.getState()` | 764 | **수정** | — | handleDragEnd 가 순수 reducer 호출로 교체되면 자연 소멸 |
| `handleDragEnd` 내 detectDuplicateTileCodes 토스트 | 956–964, 1053–1061 | **폐기** | INV-G2, UR-34 | UR-34 금지 band-aid 토스트. 코드 수정(handleDragEnd 분해)으로 INV-G2 자체를 없애야 함 |
| FINDING-01 early-return 분기 | 1001–1023 | **보존** (조건부) | V-13a, V-05 | 명세 근거 있음. effectiveHasInitialMeld SSOT 통합 후 7지점 참조 통일 필요 |
| `targetServerGroup && freshHasInitialMeld` extend 분기 | 1026–1072 | **보존** (조건부) | A3, V-13a POST_MELD | BUG-UI-EXT-SC1 회귀 원인 분기. W2-A (effectiveHasInitialMeld 7지점) 해소 후 안정화 |
| `shouldCreateNewGroup` 인라인 로직 | 1096–1164 | **수정** (이동) | A1, D-01 | dragEndReducer.ts `computeShouldCreateNewGroup` 와 동일 로직 — 중복. reducer 에 통합 |
| `handleRackSort` | 1290–1299 | **보존** | A13 | 단순 정렬 핸들러. SRP 충족 |
| `handleConfirm` | 1317–1425 | **수정** | A14, V-01~V-07, UR-15 | 검증 로직(V-01~V-15 클라 미러)을 별도 순수 함수로 추출. send() 호출만 유지 |
| `handleConfirm` 내 V-01/V-02/V-14 클라 미러 검증 | 1342–1382 | **수정** (이동) | V-01, V-02, V-14, V-15, UR-36 | `validateTurnPreCheck(pendingOnlyGroups): ValidationResult` 순수 함수 로 추출 |
| `handleConfirm` 내 detectDuplicateTileCodes 토스트 | 1384–1395 | **보존** (단기) | INV-G2, UR-34 예외 | 서버 전송 직전 마지막 방어선 — UR-34 "사용자 노출 금지" 정신에서 이 위치는 경계선. ConfirmTurn 시점 토스트는 사용자가 직접 요청(클릭)한 시점이므로 노출 허용 가능. 단 "되돌리기 후 다시 배치하세요" 카피는 UR-21 패턴으로 통일 필요 |
| `handleUndo` | 1427–1445 | **보존** | A15, UR-16 | 올바른 구현. `extendLockToastShownRef.current = false` 초기화 포함 |
| `handleDraw` / `handlePass` | 1447–1455 | **보존** | A16, V-10, UR-22 | 단순 WS 전송. V-10 서버 처리 위임으로 올바름 |
| 게임 종료 분기 렌더 (gameEnded / gameStatus) | 1457–1509 | **수정** (분리) | UR-27, UR-28 | `GameEndedOverlay` + 기권 모달 별도 컴포넌트로 이동 |
| JSX 레이아웃 렌더링 전체 | 1511–1829 | **수정** (분해) | — | 헤더/사이드바/메인/랙 영역을 별도 컴포넌트로 분리 |

### 3.2 GameBoard.tsx 영역별 분류

| 영역 | 라인 범위 | 거취 | 룰 ID 근거 | 비고 |
|------|-----------|------|------------|------|
| `detectDuplicateColors` | 16–39 | **수정** (이동) | V-14, D-09 | `tileStateHelpers.ts` 또는 별도 `tileValidation.ts` 로 이동. V-16 D-09 규칙 매핑됨 |
| `validatePendingBlock` | 52–94 | **보존** | V-01, V-02, V-14, V-15, UR-15 | SSOT 룰 ID 완전 매핑. 조커 span 검증 포함. 외부 export 유지 |
| `DroppableGroupWrapper` | 146–223 | **보존** | UR-13, UR-14, UR-18, UR-19, UX-004 | UX-004 드롭존 색 토큰 올바른 구현. `isDropBlocked` / `isDropAllowed` = V-13a 기반 |
| `NewGroupDropZone` | 228–254 | **보존** | UR-11, A1 | 새 그룹 드롭존 명확하고 단일 책임 |
| `GameBoard` memo 본체 | 265–576 | **수정** (부분) | — | `duplicateColorWarnings` + `pendingBlockValidity` useMemo 는 올바름. 단 JSX 내 `pendingLabelText` IIFE (391~404) 는 별도 함수로 추출 권장 |
| `duplicateColorWarnings` useMemo | 283–294 | **보존** | V-14, D-09 | 메모이제이션 올바름 |
| `pendingBlockValidity` useMemo | 296–304 | **보존** | V-01, V-02, UR-15 | 메모이제이션 올바름 |
| `borderClass` 계산 IIFE | 311–316 | **보존** | UR-18, UR-19 | 시각 피드백 올바름 |

### 3.3 gameStore.ts 영역별 분류

| 영역 | 라인 범위 | 거취 | 룰 ID 근거 | 비고 |
|------|-----------|------|------------|------|
| `pendingTableGroups` / `pendingMyTiles` / `pendingGroupIds` / `pendingRecoveredJokers` 구조 | 56–76 | **보존** | D-12, V-17, V-07 | pending 상태 4종이 하나의 원자 단위로 관리되어야 함. 현재는 개별 setter — 원칙 4 계층 분리를 위해 `pendingDraft: PendingDraftState` 로 통합 고려 |
| `addRecoveredJoker` 중복 push guard | 194 | **보존** | V-07 | `WARN-03` guard 올바름 |
| `resetPending` | 242–248 | **보존** | UR-04, A19, A20 | TURN_START 수신 시 pendingGroupIds 포함 4종 일괄 리셋. SSOT 56b §1 S1 invariant 충족 |
| `setPendingGroupIds` atomic setter | 189 | **보존** | D-01, INV-G1 | BUG-UI-EXT 수정 4 산출물. atomic 교체 올바름 |
| E2E 브리지 window 노출 | 284–290 | **보존** | — | `NEXT_PUBLIC_E2E_BRIDGE` 조건부. 보안 위험 없음 |
| `hasInitialMeld` 루트 상태 | 48–49 | **수정** | V-13a | players[mySeat].hasInitialMeld 와 중복. W2-A 해소 시 루트 hasInitialMeld 를 derived 로 교체 또는 제거 후보 |

### 3.4 lib 파일 영역별 분류

| 파일 | 영역 | 거취 | 룰 ID 근거 |
|------|------|------|------------|
| `mergeCompatibility.ts` | `classifyKind` | **보존** | D-10 (type 힌트 참고용, 타일 내용으로 검증) — D-10 정책 완전 구현 |
| `mergeCompatibility.ts` | `isCompatibleAsGroup` | **보존** | V-14, V-01 — D-09 (existingColors.has 패턴 올바름, "joker" 문자열 비교 없음) |
| `mergeCompatibility.ts` | `isCompatibleAsRun` | **보존** | V-15, V-01 — 런 경계 (1~13) 올바른 범위 체크 |
| `mergeCompatibility.ts` | `isCompatibleWithGroup` export | **보존** | UR-14 — 드롭 호환성 단건 판정 SSOT |
| `mergeCompatibility.ts` | `computeValidMergeGroups` export | **보존** | UR-10 — 드래그 중 호환 그룹 집합 계산 |
| `tileStateHelpers.ts` | `removeFirstOccurrence` | **보존** | D-02 — GameClient.tsx 중복 정의 삭제 후 이것으로 통일 |
| `tileStateHelpers.ts` | `detectDuplicateTileCodes` | **보존** | INV-G2 — 최후 방어선으로 유지. band-aid 토스트 생성 금지 |

---

## 4. dragEndReducer 보존 평가

`src/frontend/src/lib/dragEnd/dragEndReducer.ts` (688줄, 2026-04-24 22:30 작성)

### 4.1 SSOT 행동 매트릭스 대비 매핑

| A-ID | reducer 분기 | 라인 범위 | SSOT 56 정합성 |
|------|------------|-----------|----------------|
| A1 | `rack → game-board: shouldCreateNewGroup → 새 그룹` | 561–587 | 정합 |
| A2 | `rack → pending-compat: merge` | 405–428 | 정합 |
| A3 | `rack → server-compat: merge (hasInitialMeld)` | 465–520 | 정합 |
| A4 | **미구현** — `table → game-board` 경로 없음 | — | **SSOT 미매핑** |
| A5 | `table → table` (pending→pending 포함) — 단 pending 간 호환성 체크 없음 | 239–292 | 부분 정합 (SSOT A5 = COMPAT 시만 허용이나 코드에서 pending→pending은 호환성 skip) |
| A6 | `table → table (pending → server)` | 239–292 | 정합 (INC-T11-DUP 원인인 "출발 그룹 tile 미제거" 버그는 수정됨 — `updatedSourceTiles.splice` 있음) |
| A7 | `table → rack (pending only)` | 207–237 | 정합 |
| A8 | **미구현** — `table → game-board / game-board-new-group` 경로 없음 | — | **SSOT 미매핑** |
| A9 | `table → table (server → server)` | 239–292 | 정합. `incompatible-merge` reject 있음 |
| A10 | `table → table (server → pending)` | 239–292 | 정합 |
| A11 | `table → rack (!sourceIsPending → cannot-return-server-tile)` | 207–210 | 정합. V-06 올바른 거절 |
| A12 | `rack → joker-swap:ok` | 333–368 | 정합. V-07 위반 감지는 handleConfirm 레이어 책임으로 위임 |
| A16 draw 시 pending 존재 | `pending 그룹 존재 시 거절` 분기 없음 | — | **SSOT 미매핑** — SSOT 56 §3.17: "pending 그룹 존재 시 거절" |

### 4.2 오류/누락 정정 필요 목록

| 번호 | 분기 | 문제 | 근거 |
|------|------|------|------|
| RDX-01 | `table → table` (A5 pending→pending) | `isCompatibleWithGroup` 체크 없이 무조건 append — INCOMPAT 타일을 pending 그룹에 합칠 수 있음 | SSOT 56 §3.6 A5: COMPAT 시만 허용 |
| RDX-02 | A4 / A8 미구현 | table 타일 드래그 → board/new-group 드롭 시 `rejectWith("no-drop-position")` 으로 낙착 | SSOT 56 §3.5/§3.9 A4/A8: hasInitialMeld 무관 허용 |
| RDX-03 | A16 draw 시 pending 존재 | reducer 외부 — A16은 handleDragEnd 범위 아님. 그러나 SSOT 56 §3.17 의 "pending 그룹 존재 시 거절"은 ActionBar 레이어에서 처리해야 함. reducer 에 포함할 필요 없음 | 단 문서화 필요 |
| RDX-04 | `rack → server-preinitial` 경고 | `warning: "extend-lock-before-initial-meld"` 반환하나 GameClient 에서 소비 시 `extendLockToastShownRef` 로직과 연동되어야 함 — 연결 확인 필요 | D-12, FINDING-01 |
| RDX-05 | `classifySetType` / `tryJokerSwap` 중복 | GameClient.tsx 64~174 와 동일 함수 2개 정의 — D-10 원칙: 함수는 1곳에만 | 원칙 6 위반 |

### 4.3 dragEndReducer 보존 판정

**판정: 조건부 보존 (수정 후 보존)**

근거:
- A1~A3, A6~A12 (GameClient handleDragEnd 핵심 분기) 에 대해 올바른 순수 함수 구현 존재
- `detectDuplicateTileCodes` 방어선을 각 분기 직전에 적용 — INV-G2 보호 충족
- `DragReducerState`, `DragInput`, `DragOutput` 타입 정의가 SSOT 56 상태 차원 (S-turn 제외)과 1:1 매핑
- 단 RDX-01 (A5 호환성 미검사), RDX-02 (A4/A8 미구현), RDX-05 (중복 함수) 수정 필요
- GameClient.tsx 의 `handleDragEnd` 를 reducer 호출로 교체할 때 이 파일이 핵심 로직을 담아야 함

---

## 5. 신규 모듈 제안

architect ADR 수령 전 라인 레벨 시점에서 "이 코드는 X 모듈로 가야" 제안. ADR 이후 최종 확정.

### 5.1 즉시 분리 가능 (ADR 불필요)

| 현재 위치 | 제안 파일 | 포함 함수/로직 | 근거 |
|----------|----------|--------------|------|
| `GameClient.tsx:64–83` (중복) + `dragEndReducer.ts:25–35` (중복) | `src/lib/tileClassify.ts` | `classifySetType(tiles: TileCode[]): GroupType` 단일 소스 | D-10, 원칙 2 |
| `GameClient.tsx:114–174` (중복) + `dragEndReducer.ts:46–102` (중복) | `src/lib/jokerSwap.ts` | `tryJokerSwap(groupTiles, rackTile)` 단일 소스 | V-13e, 원칙 6 |
| `GameClient.tsx:629–639` | `src/lib/turnUtils.ts` | `computeIsMyTurn(currentPlayerId, players, effectiveMySeat, currentSeat)` 순수 함수 | V-08, 원칙 2 |
| `GameClient.tsx:491–495` | `src/lib/turnUtils.ts` | `computeEffectiveMeld(players, mySeat, hasInitialMeld)` 순수 함수 | V-13a, 원칙 6 (7지점 → 1지점) |
| `GameClient.tsx:1342–1382` | `src/lib/confirmValidator.ts` | `validateTurnPreCheck(pendingOnlyGroups): { valid: boolean; errorGroupId?: string; errorMessage?: string }` | V-01/02/14/15, UR-36 |

### 5.2 ADR 후 분리 (W2-F ADR 대상)

| 현재 위치 | 제안 파일 | 내용 | 의존 ADR |
|----------|----------|------|----------|
| `GameClient.tsx:730–1287` + `dragEndReducer.ts` | `src/lib/dragEnd/dragEndReducer.ts` 개선판 | A1~A12 핸들러 완전 분기. GameClient 는 얇은 어댑터 레이어 (`useDragEndHandler` hook) 만 유지 | W2-F |
| `GameClient.tsx:703–717, 723–728, 730–1287` | `src/hooks/useDragHandlers.ts` | `handleDragStart`, `handleDragCancel`, `handleDragEnd` 3개 핸들러를 단일 custom hook 으로 | W2-F |
| `GameClient.tsx:1317–1425` | `src/hooks/useTurnActions.ts` | `handleConfirm`, `handleUndo`, `handleDraw`, `handlePass` 4개 액션 핸들러 | W2-F |
| `GameClient.tsx:1511–1829` JSX 분해 | `src/components/game/GameHeader.tsx`, `GameSidebar.tsx`, `GameMain.tsx`, `RackArea.tsx` | 레이아웃 4 분할 | W2-F ADR 후 |

### 5.3 상태 관리 재설계 제안 (W2-B, W2-A 연동)

| 현재 문제 | 제안 | 근거 |
|----------|------|------|
| `pendingTableGroups`, `pendingMyTiles`, `pendingGroupIds`, `pendingRecoveredJokers` 4종이 개별 setter 로 분리 — atomic 갱신 보장 불가 | `gameStore.ts` 에 `pendingDraft: PendingDraftState | null` 단일 슬롯으로 통합. `setPendingDraft(draft: PendingDraftState | null)` 단일 setter | INV-G1/G2/G5, 56b §3.2 S1 invariant |
| `hasInitialMeld` 루트 상태 + `players[].hasInitialMeld` 이중 관리 | `hasInitialMeld` 루트 제거 후 `selectEffectiveMeld(state)` selector 로 대체 | V-13a, W2-A |

---

## 6. 모듈화 7원칙 Self-Check

| 원칙 | 현행 코드 준수 여부 | 주요 위반 지점 |
|------|-------------------|--------------| 
| 1. SRP | 미준수 | GameClient.tsx 1830줄 monolith. handleDragEnd 484줄 |
| 2. 순수 함수 우선 | 부분 준수 | dragEndReducer.ts 순수 구현됨. GameClient handleDragEnd 는 부작용 혼재 |
| 3. 의존성 주입 | 미준수 | `useGameStore.getState()` 직접 호출 (764줄) |
| 4. 계층 분리 | 부분 준수 | lib 파일들은 올바름. GameClient 는 UI/도메인/통신 혼재 |
| 5. 테스트 가능성 | 부분 준수 | dragEndReducer.ts 단위 테스트 가능. GameClient handleDragEnd 직접 테스트 불가 |
| 6. 수정 용이성 | 미준수 | effectiveHasInitialMeld 7지점 분산 (W2-A) |
| 7. band-aid 금지 | 부분 준수 | detectDuplicateTileCodes 토스트 (956–964) band-aid 잔존. 신규 가드/토스트 없음 |

---

## 7. 결론 요약

### 폐기 대상 (라인 기준)
- `GameClient.tsx:89–92` `removeFirstOccurrence` 중복 정의 (21줄)
- `GameClient.tsx:956–964` detectDuplicateTileCodes band-aid 토스트 (9줄) — INV-G2 코드 수정으로 해소
- `GameClient.tsx:1053–1061` 동일 band-aid 토스트 (9줄)
- `dragEndReducer.ts:25–35` classifySetType 중복 (11줄) — lib 통합 후 제거
- `dragEndReducer.ts:46–102` tryJokerSwap 중복 (57줄) — lib 통합 후 제거
- **소계: 약 107줄**

### 수정 대상 (라인 기준)
- `GameClient.tsx:64–83` classifySetType (이동, 20줄)
- `GameClient.tsx:114–174` tryJokerSwap (이동, 61줄)
- `GameClient.tsx:184–411` UI 서브 컴포넌트 (분리, 228줄)
- `GameClient.tsx:491–495` effectiveHasInitialMeld (순수 함수 추출 + 7지점 통일, 5줄 → 호출부 7줄)
- `GameClient.tsx:629–639` isMyTurn (순수 함수 추출, 11줄)
- `GameClient.tsx:730–1287` handleDragEnd (reducer 어댑터로 교체, 484줄 → ~50줄 어댑터)
- `GameClient.tsx:1317–1425` handleConfirm (검증 로직 분리, 109줄 → ~30줄 dispatcher)
- `GameClient.tsx:1511–1829` JSX 레이아웃 (컴포넌트 분해, 319줄 → 각 ~80줄 4개)
- `dragEndReducer.ts` RDX-01~RDX-05 수정 (~50줄 수정)
- **소계: 약 1,287줄 수정 대상**

### 보존 대상 (라인 기준)
- `mergeCompatibility.ts` 142줄 전체
- `tileStateHelpers.ts` 49줄 전체
- `gameStore.ts` 핵심 구조 (~220줄, hasInitialMeld 루트 제거 후)
- `GameBoard.tsx:52–94` validatePendingBlock, `146–254` DroppableGroupWrapper/NewGroupDropZone
- `GameClient.tsx` handleDragCancel, handleRackSort, handleUndo, handleDraw, handlePass 등 단순 핸들러 (~80줄)
- `dragEndReducer.ts` 핵심 분기 (RDX 수정 후 ~520줄)
- **소계: 약 1,061줄**

### A-N 매핑률
- handleDragEnd 내 매핑률: **69.2%** (9/13)
- 전체 A-N (별도 핸들러 포함): **90.5%** (19/21)
- 미매핑 행동: A4 (pending split → new group), A8 (server split → new group) — 구현 필요

---

*작성: frontend-dev, 2026-04-25 (분석 전용 — 코드 수정 없음)*
*다음 단계: architect ADR (컴포넌트 분해/인터페이스) + W2-A/W2-F 구현 dispatch*
