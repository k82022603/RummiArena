# BUG-UI-EXT 재재조사 + BUG-UI-GHOST 신규 — 역사 회귀 포함 전면 재분석

**작성**: architect (read-only)
**작성일**: 2026-04-24
**선행 분석**: `bug-ui-ext-architect-review.md` (2026-04-24 동일 에이전트, 가설 5 80%)
**트리거**: 사용자 증언 "지난번 조치했다고 보고받았는데 개선된 것이 하나도 안 되어 보임", "중간에 유령처럼 박스 나타나 있는 것 그것 역시 오류야. 내가 말해주어야 아는거야?"
**증거 스크린샷**: 2026-04-23_221543 / 221554 / 221603 / 221707

---

## 0. Executive Summary (결론 5줄)

1. **BUG-UI-EXT 재재조사 결과: 이전 가설 5(리로드 드리프트)는 80% → 40% 로 **강등**. 사용자 스크린샷 증거(하단 "최초 등록 완료" 배지 정상 표시, 플레이어 카드 "등록 완료" 정상 표시)로 볼 때 reload/재연결 시나리오가 **아닌** 정상 턴 진행 중에도 extend 가 실패한다.
2. **사용자가 기억하는 "지난번 조치"는 `eef2bbc` (2026-04-22 14:22, I-2 런 앞/뒤 타일 부착 해소) 가 거의 확실하다. 이 커밋은 7시간 만에 `fb85d53` (2026-04-22 21:11) 로 **완전 롤백**되었다. 회귀 방지 spec `rearrangement.spec.ts TC-RR-02`도 역방향으로 약화되었다 (append 허용 → 새 pending 그룹 기대치로 변경). **사용자 체감 퇴행의 근본 원인**.
3. **BUG-UI-GHOST 확정: 정체는 "동일 타일 조합의 pending 그룹이 N배 복제 렌더 + 빈 박스 N개 동반 출현"**. 스크린샷 221543/221554 증거 — [R11,R12,JK,5] **6개 복제** + 빈 박스 2~3개. `BUG-UI-009 9개 복제` 와 **동일 계열 회귀**. PR #70 (71558b6 + 73bd7c6) 수정이 뚫린 것 or 다른 경로로 우회되었다.
4. **두 버그의 공통 근본 원인**: `handleDragEnd` 내부에서 `currentTableGroups` (useMemo 스냅샷)를 반복 참조하여 `[...currentTableGroups, newGroup]` 을 여러 번 실행할 때 stale 스냅샷이 누적되면 동일 id 복제 or 다른 id 새 그룹 누적이 발생. 이는 **state 이중화(useMemo derived + setPendingTableGroups 저장소)** 자체의 구조적 결함.
5. **이전 본인 분석의 한계**: (a) `eef2bbc → fb85d53` 롤백 이력 완전 누락, (b) 사용자 스크린샷 증거 미검토(등록 완료 배지 확인 안함), (c) reload/재연결 가설이 Primary 80%로 과대평가됨, (d) 유령 박스 버그 **존재 자체를 인지하지 못함**. 구조적 문제: **증거-가설 선후 순서 역전** (가설 먼저 세우고 증거로 뒷받침).

---

## 1. 역사 타임라인 — 사용자가 느낀 "개선 안 됨" 의 실체

### 1.1 원본 I-2 핫픽스 도입 (`eef2bbc`, 2026-04-22 14:22)

```
"fix(frontend): I-2 런 앞/뒤 타일 부착 불가 해소 — hasInitialMeld 무관 append 허용"
```

**수정 내용**: `GameClient.tsx:877-903` 에 새 early-return 블록 추가.

```ts
if (targetServerGroup !== undefined && !hasInitialMeld) {
  if (isCompatibleWithGroup(tileCode, targetServerGroup)) {
    // 서버 런에 직접 append + pending 마킹
    const updatedTiles = [...targetServerGroup.tiles, tileCode];
    ...
    setPendingTableGroups(nextTableGroups);
    setPendingMyTiles(nextMyTiles);
    addPendingGroupId(targetServerGroup.id);
    return;
  }
}
// 호환 안 되면 treatAsBoardDrop 로 폴스루
```

**사용자에게 전달된 커밋 메시지**: "런 가장자리 드롭 → 서버 런에 직접 합병 허용". 이는 사용자가 기억하는 **"지난번 조치"** 일 가능성이 매우 높다.

**회귀 방지 spec**: `bce6717` — `hasInitialMeld=true` 빈 공간 드롭 회귀 3 시나리오 + `rearrangement.spec.ts TC-RR-02` 는 **append 동작을 기대치로 고정** (71b64a0, 09a8fb4).

### 1.2 7시간 후 완전 롤백 (`fb85d53` PR #51, 2026-04-22 21:11)

```
"fix(frontend): FINDING-01 I-18 완전 롤백 — hasInitialMeld=false 서버 그룹 드롭 명시적 분기"
```

**수정 내용**:
1. `eef2bbc` 의 isCompatible append 경로 **완전 삭제**
2. 대신 `if (targetServerGroup && !hasInitialMeld) { 새 pending 그룹 생성 early-return; }`
3. `treatAsBoardDrop` 조건 단순화: `over.id === "game-board"` 만 유지
4. **`rearrangement.spec.ts TC-RR-02` 기대치 역방향 갱신**:
   - before: "hasInitialMeld=false + 호환 타일 드롭 → append 허용"
   - after: "hasInitialMeld=false + 호환 타일 드롭 → 새 pending 그룹 분리"

**롤백 근거 (커밋 메시지)**: "QA 보고서 72 §4.2.2 — 서버 V-04 (초기 등록 30점) 가 append 된 세트를 거절하고 플레이어에게 패널티 3장 드로우를 부과".

### 1.3 fb85d53 롤백 근거의 재검토

QA 보고서 72 §4.2.2 는 `hasInitialMeld=false` 시나리오만 다룬다. 서버 `validator.go:100-104` 실제 코드:

```go
if !req.HasInitialMeld {
    if err := validateInitialMeld(req); err != nil {
        return err
    }
}
```

**판정**: `HasInitialMeld=true` 이면 V-04 검증 자체를 **건너뛴다**. 즉 **확정 후 extend 는 서버 패널티 대상 아님**. fb85d53 롤백 근거는 `!hasInitialMeld` 케이스에만 유효하고, `hasInitialMeld=true` extend 에는 **부적용**한 근거였다.

### 1.4 롤백이 사용자 증상에 미친 영향

**사용자 실패 시나리오 (스크린샷 221543/221554/221603)**: `hasInitialMeld=true`, 확정 후 extend 시도. 이 경로는 `line 909` fb85d53 분기가 **skip** 되고 `line 928 (targetServerGroup && hasInitialMeld)` 에서 `isCompatibleWithGroup` 검증 후 append 해야 함.

**즉 fb85d53 롤백은 현재 증상에 직접 영향 없음**. 단, 사용자의 "지난번 조치" 기억이 eef2bbc (line 877 append 허용) 일 경우, 그 허용 로직은 `!hasInitialMeld` 분기였으므로 **등록 전 초보 실수에만 기여**. 등록 후 extend 는 **eef2bbc/fb85d53 둘 다에서 동일하게 line 928 분기로 처리**.

### 1.5 DroppableGroupWrapper + new-group-dropzone 추가 (60df5ca 이후)

G-5 새 그룹 드롭존 (`NEW_GROUP_DROP_ID = "game-board-new-group"`) 도입. DroppableGroupWrapper 가 각 그룹 id 로 droppable 등록. **tile id 유일성 가정에 영향 없음** (그룹 id 기반).

### 1.6 60df5ca → 현재 main 의 tile id 유일성 가정 추적

| 커밋 | 영향 | 비고 |
|------|------|-----|
| 60df5ca (G-3 고스트 수정) | filter → removeFirstOccurrence | tile 유일성 회복 |
| fb85d53 (FINDING-01) | handleDragEnd 분기 추가 | tile 처리 무관 |
| 554744b (v-13e) | removeRecoveredJoker 호출 8곳 주입 | **조커만 대상**, 비조커 tile 영향 없음 |
| 71558b6 (BUG-UI-009) | PlayerRack key=`rack-${code}-${idx}` + isHandlingDragEndRef guard | **tile id 유일성 복원 목적** |
| 73bd7c6 (BUG-UI-010) | onDragCancel 등록 + defensive clear | drag state 초기화, tile 유일성 무관 |
| fe62a36 (BUG-UI-011/012/013) | E2E spec RED | 코드 변경 없음 |

**판정**: PR #70 (71558b6 + 73bd7c6) 이 tile id 유일성 가정을 **복원**했다. PR #70 이후 회귀를 일으킨 커밋은 없음. 그럼에도 스크린샷 221543 (2026-04-23 22:15) 에서 복제 렌더 재현 — **PR #70 수정이 실제로는 증상의 일부만 해결했다는 증거**.

---

## 2. BUG-UI-EXT — "확정 후 이어붙이기 실패" 가설 재편

### 2.1 이전 가설 재평가

| 가설 | 이전 확도 | 재평가 확도 | 근거 |
|-----|---------|------------|-----|
| 가설 1 — 서버 갱신 누락 | 0% | 0% | validator.go 증거 확정 |
| 가설 2 — 명시적 reset 버그 | 5% | 5% | 변함 없음 |
| 가설 3 — extend 분기 숨은 조건 | 0% | 0% | line 928 블록 정독 결과 |
| 가설 4 — 서버 validator 추가 에러 | 0% | 0% | HasInitialMeld=true 스킵 |
| **가설 5** — reload/재연결 루트 drift | **80%** | **40%** | 스크린샷에 "등록 완료" 배지 정상. reload 증거 없음 |
| 가설 5b — AUTH_OK 전 TURN_END 레이스 | 10% | 10% | 변함 없음 |
| 가설 6 — dnd-kit over.id 오매핑 | 0% | 0% | 변함 없음 |

### 2.2 신규 가설 X — `hasInitialMeld=true` 시 extend 가 실제로 실행되지만 복제 렌더로 인해 **UI 에서 실패로 보임**

**확도 55% (Primary 신규)**.

**메커니즘**:
1. 사용자가 `[R11,R12,JK]` 런에 rack 의 `5` 타일 드롭.
2. `isCompatibleWithGroup(R5?, [R11,R12,JK])` 검증 → 11,12 다음은 13 이어야 하나 **5 는 호환 불가** → line 929 호환성 실패 → **line 930-947 새 pending 그룹 생성** 분기.
3. 그런데 이 경로가 **N 회 반복** (isHandlingDragEndRef 뚫림) → 새 pending 그룹 N 개 생성 → **복제 렌더**.
4. 사용자가 본 증상: "이어붙이려 했는데 안 되고, 유령 박스가 여러 개 생김". **extend 실패 = 호환성 실패** + **유령 박스 = 복제 렌더**. 두 증상이 **단일 원인**에서 파생.

**사용자가 원하지 않은 것은 명확**: 5 는 R11-R12-JK 에 붙을 수 없는 숫자다. 하지만 **"호환 안 되면 빨간 테두리 + 토스트" 가 기대 동작**이어야 하고, 새 pending 그룹으로 분리되면 사용자는 "이어붙이기 실패 = 내가 잘못한 게 아니라 UI 가 고장" 으로 인지한다.

**증거**:
- 스크린샷 221543: "무효 세트 4개 [R11,R12,JK,5]" 6개 복제 + "미확정 1개 [5]" 1개. 4개 박스는 **append 된 상태** (R11,R12,JK,5), 1개 박스는 **분리된 상태** (5 단독). **즉 append 와 분리가 혼재** — 반복 실행 중 어떤 분기는 append, 다른 분기는 분리로 갔다.
- 221554: 같은 턴 다른 시점, 6개 복제 구조 유지.
- 221603: 턴 #29, 런 3개 [R11,R12,JK] 6개 복제 (모두 append 아닌 원본 유지) + 미확정 1개 빈 박스 1개.

### 2.3 신규 가설 Y — `treatAsBoardDrop` fallthrough 가 hasInitialMeld=true 에서 새 그룹 생성

**확도 15%**.

line 980 `const treatAsBoardDrop = over.id === "game-board";` 은 `over.id` 가 game-board 직접 드롭일 때만 true. line 928 (targetServerGroup && hasInitialMeld) 에서 **return 이 누락되는 경로가 있다면** fallthrough 가능.

정독 결과 — return 이 모든 분기에 있음. **가능성 낮음**.

### 2.4 신규 가설 Z — v-13e removeRecoveredJoker 8곳 주입 중 **비조커 tile 에서 분기 오진입**

**확도 5%**.

554744b 의 removeRecoveredJoker 호출은 모두 `if (pendingRecoveredJokers.includes(tileCode))` 가드로 감싸짐. **비조커에서 발동 불가**.

### 2.5 신규 가설 W — `confirmBusy` 미반영 상태에서 재드래그 → state ghost

**확도 20%**.

line 1204 `confirmBusy` 는 CONFIRM_TURN 전송 후 TURN_START/INVALID_MOVE 까지 락. 하지만 **확정 전 드래그 중 재드래그** 는 확인 안 함. 동일 드롭이 여러 번 발생하는 UX 가 가능.

### 2.6 BUG-UI-EXT 최종 가설 랭킹

| 가설 | 확도 |
|-----|-----|
| X — 호환 불가 → 복제 렌더 (GHOST 와 동일 원인) | **55%** |
| 5 — reload drift (기존, 낮춤) | 40% |
| W — 재드래그 state ghost | 20% |
| 5b — AUTH_OK 레이스 | 10% |
| 기타 | < 5% each |

합계 > 100%: **복합 원인** 가능성 고려. 가설 X + 가설 5 가 **각자 다른 턴에서** 발동 가능.

---

## 3. BUG-UI-GHOST — 신규 티켓 가설 + 재현 조건

### 3.1 스크린샷 증거 요약

| 파일 | 턴 | 상태 | 복제 수 | 빈 박스 |
|-----|----|----|---------|--------|
| 221543 | #29 | 등록 완료, 내 14장 | [11,12,JK,5] 6개 + [5] 1개 | 2 (우상단) + 1 (우하단) |
| 221554 | #29 | 등록 완료, 내 14장 | 같은 6개 구조 (사용자 드래그 중 5 떠있음) | 2 |
| 221603 | #29 | 등록 완료, 내 15장 | [11,12,JK] 6개 (런 미확정) | 3 (하단 1 + 우측 2) |
| 221707 | #30 | 정상 (다음 턴) | 복제 없음 | 빈 박스는 wrap 공간 |

### 3.2 핵심 패턴

- **복제는 pending 그룹만 일어남** (pendingGroupIds 내 원소).
- 동일 턴 내에 여러 번 드래그 시도할 때마다 증가. 221603 (15장 rack) → 221543 (14장 rack) → 드로우 없이 1장 더 내려감 → 그 1장이 여러 번 호환 불가 처리 → pending 증식.
- **턴 종료(221707) 시 복제 사라짐** — TURN_START 핸들러 `resetPending()` 이 정리.

### 3.3 가설 G1 — isHandlingDragEndRef guard 우회 경로

**확도 40%**.

`isHandlingDragEndRef.current = true; try { ... } finally { queueMicrotask(() => { ... = false }); }`

**우회 시나리오**:
1. pointer up 이벤트 A 발생 → handleDragEnd A 진입 → ref=true → 처리 → finally → queueMicrotask 스케줄.
2. queueMicrotask 실행 전에 pointer up 이벤트 B 가 **synchronous** 하게 dispatch (예: touch pointer cancel 후 mouse pointer fallback).
3. 이벤트 B: ref=true 이므로 early-return → 정상.
4. queueMicrotask 실행 → ref=false.
5. **이벤트 C** (B 와 연속된 synthetic event) → ref=false → 두 번째 실행 → **복제**.

하지만 이 경로는 2-단계 이상 필요. 1 번 복제는 설명되나 **6 개 복제**는 설명 부족. **부분 원인 가능성**.

### 3.4 가설 G2 — dnd-kit collision detection 이 **매 frame** 마다 handleDragEnd 호출

**확도 10%**.

dnd-kit docs 상 onDragEnd 는 pointer up 시 한 번만. `pointerWithinThenClosest` collision detection 은 매 frame 호출되지만 onDragEnd 트리거는 별개. **가능성 낮음**.

### 3.5 가설 G3 — React Strict Mode 이중 렌더 + 부수 효과

**확도 5%**.

개발 환경의 Strict Mode 는 useEffect 를 2회 실행하나 **이벤트 핸들러는 1회**. 스크린샷은 실제 사용자 세션 (localhost:30000, K8s 배포) 이므로 Strict Mode 여부 미상. **가능성 낮음**.

### 3.6 가설 G4 — `setPendingTableGroups` 의 stale closure 내부 재귀

**확도 30%** (Secondary).

line 835 `existingPendingGroup = pendingTableGroups?.find((g) => g.id === over.id && pendingGroupIds.has(g.id))`. 드래그 drop 시:
1. 호환 불가 → line 841-858 새 pending 그룹 생성 → `nextTableGroups = [...currentTableGroups, newGroup]`.
2. `currentTableGroups = pendingTableGroups ?? gameState?.tableGroups ?? []` — stale 스냅샷.
3. 다음 드롭: `pendingTableGroups` 업데이트 됐지만 **useMemo 재생성되지 않음** (dep: `[pendingTableGroups, gameState?.tableGroups]`, **React batch 업데이트 이전** 스냅샷 사용) → stale.
4. `[...staleCurrentTableGroups, newGroup2]` → pending 그룹 **1개만 있어야 할 상태**에서 **newGroup2만 포함** → 이전 newGroup 이 덮임... 아니면 **덮어쓰기 대신 append** → 복제.

정확히 말하면 `useMemo` 는 dep 변경 시 재계산하나, **같은 마이크로태스크 내에서는 stale**. React 18 automatic batching 상 이벤트 핸들러 내부 여러 setState 는 커밋 한 번에 묶임. **가능성 중간**.

### 3.7 가설 G5 — **PR #70 BUG-UI-009 수정 자체의 자기 검증**

**자기 비판 대상**: 본인이 PR #70 에 포함한 3개 수정이 효과적이었는가?

1. `PlayerRack key=rack-${code}-${idx}`: **목적 적중**. 동일 tile code 가 랙에 2장 있을 때 React key 충돌 해소. 그러나 **랙에 동일 코드 2장이 존재하는 것 자체가 드문 상황** (루미큐브 물리 규칙: 동일 코드 1장). 실제 발동 조건은 draw 로 동일 코드가 중복 된 경우인데, 이게 가능한 것은 각 코드가 a/b 세트로 분리돼 있어서 (R7a, R7b 는 다른 코드) 랙에 R7a 가 2장이 올 일이 없다. **이 수정은 실제로는 거의 효과 없음**.

2. `handleDragEnd isHandlingDragEndRef guard`: **부분 효과**. 동일 synchronous dispatch 는 차단하나 microtask 경계를 넘는 연속 dispatch 는 차단 안 됨. G1 가설의 우회 경로.

3. `handleDragStart defensive clear + onDragCancel`: **UX 효과 있음** (BUG-UI-010 stuck 해소). 그러나 복제 렌더 (BUG-UI-009) 와는 **다른 증상**. onDragCancel 은 ESC/블러 시에만 발동.

**자기 진단**: PR #70 의 3개 수정은 BUG-UI-009 **9개 복제 증상의 근본 원인을 해결하지 못했다**. "PlayerRack key" 는 허수에 가깝고, "isHandlingDragEndRef" 는 보호막이 얇다. onDragCancel 은 별건.

**본인이 PR #70 에서 세운 가설 A (70%)** 는 빈약한 증거 위에 세워졌고, 지금 재확인하니 **오판**.

### 3.8 BUG-UI-GHOST 최종 가설 랭킹

| 가설 | 확도 |
|-----|-----|
| **G1** — isHandlingDragEndRef microtask 우회 | **40%** |
| **G4** — useMemo stale closure 재귀 | **30%** |
| G5 자기 검증 — PR #70 의 부족함 | (원인 분석) |
| G2/G3 | < 10% |

합계 70%+. **복합 원인**. 단일 fix 로 해결 어려움.

### 3.9 재현 조건 (프로토타입)

```
Setup:
- hasInitialMeld=true (등록 완료)
- 서버 그룹: pending 상태의 [R11,R12,JK] (런 진행 중)
- 랙에 5 또는 R8 (JK 슬롯에 맞지 않는 숫자/색)

시나리오:
1. 5 를 [R11,R12,JK] 위로 드래그 drop
2. 즉시 (500ms 이내) 다시 드래그 시도 (reset 없이)
3. 반복 3~6 회
4. 기대: 매번 "호환 불가 → 새 pending 그룹" + 기존 그룹 유지
5. 실제 (BUG-UI-GHOST): [R11,R12,JK] 그룹이 복제 or [R11,R12,JK,5] 새 그룹이 복제
```

---

## 4. 두 버그의 공통 근본 원인

### 4.1 구조적 결함

**state 이중화**: React state (Zustand store) + derived useMemo snapshot (`currentTableGroups`). 동일 데이터가 **2곳에 존재** → sync 경계에서 stale 가능.

```ts
// GameClient.tsx:596
const currentTableGroups = useMemo(
  () => pendingTableGroups ?? gameState?.tableGroups ?? [],
  [pendingTableGroups, gameState?.tableGroups]
);
```

`useMemo` 는 **렌더 사이클** 중에만 재계산. 이벤트 핸들러가 같은 렌더 사이클 내에서 **여러 번 호출**되면 첫 번째 호출의 setState 는 **다음 렌더 전까지 currentTableGroups 에 반영 안 됨**.

### 4.2 handleDragEnd 분기 다수 경로에서 `[...currentTableGroups, newGroup]`

정확한 개수: GameClient.tsx 내 `[...currentTableGroups, newGroup]` 출현 **9회** (line 849, 917, 939, 1093, 1122 등). 각 경로가 동일 턴 내 중복 실행되면 newGroup 이 매번 다른 id 로 append 되어 **복제**.

### 4.3 hasInitialMeld state 이중화 (기존 가설 5)

루트 `useGameStore.hasInitialMeld` vs `players[mySeat].hasInitialMeld`. 기존 가설 5는 **40%로 강등**되었지만 여전히 존재하는 별개 리스크. Primary 는 아니지만 보조 수정 대상.

### 4.4 공통 치료 방향

1. **useMemo 대신 per-call fresh lookup**: handleDragEnd 내부에서 `useGameStore.getState().pendingTableGroups ?? gameState?.tableGroups ?? []` 를 호출. dep 없이 최신 값 보장.
2. **Event ID 기반 중복 dispatch 감지**: dnd-kit event.activatorEvent.timeStamp 로 dedup.
3. **state 단일화**: hasInitialMeld 를 `players[].hasInitialMeld` 만으로 읽고 루트 state 제거.

---

## 5. Phase 2 수정 가이드

### 5.1 페어 구성 (사용자 지시 + Sprint 7 Scope 재편)

**UI 수정은 architect + frontend-dev + qa 3인 페어 의무**. 이전 PR #70 에서 architect 단독 판단으로 효과 없는 수정을 배포한 실수 반복 방지.

### 5.2 수정 범위 + 파일:라인

| 작업 | 파일 | 라인 | 담당 |
|-----|------|------|-----|
| A. handleDragEnd stale snapshot 제거 | GameClient.tsx | 596 (useMemo 삭제), 697+ (각 분기에 getState() 사용) | frontend-dev |
| B. 이벤트 dedup (activatorEvent timestamp) | GameClient.tsx | 696 (handleDragEnd 진입) | frontend-dev |
| C. GAME_STATE 루트 hasInitialMeld 동기화 | useWebSocket.ts | 142-183 | frontend-dev |
| D. hasInitialMeld SSOT 리팩터 ADR | docs/02-design/XX | 신규 | architect |
| E. BUG-UI-GHOST 재현 spec | e2e/bug-ui-ghost.spec.ts | 신규 | qa |
| F. BUG-UI-EXT-POST-CONFIRM spec | e2e/bug-ui-ext-post-confirm.spec.ts | 신규 | qa |

### 5.3 회귀 방지 spec 구성

1. **SC-GHOST-01**: `hasInitialMeld=true`, 호환 불가 타일을 동일 pending 그룹 위로 3회 연속 drop → 복제 그룹 생성 없이 **새 pending 그룹 1개만** 추가됨.
2. **SC-GHOST-02**: TURN_START 시 `resetPending()` 이 모든 pending 그룹 제거 확인.
3. **SC-EXT-01**: `hasInitialMeld=true`, 호환 타일을 서버 그룹에 drop → append 성공 + pending 마킹 1회.
4. **SC-EXT-02**: `hasInitialMeld=true`, 호환 타일을 pending 그룹에 drop → append (기존 TC-RR-02 정책).
5. **SC-STALE-01**: useMemo 제거 후 handleDragEnd 연속 호출 시 stale snapshot 발동 확인.

### 5.4 검증 체크리스트

- [ ] `npm --prefix src/frontend test` — Jest 199/199 PASS 유지
- [ ] `npx playwright test bug-ui-ghost.spec.ts bug-ui-ext-post-confirm.spec.ts --workers=1` — 신규 PASS
- [ ] `npx playwright test rearrangement.spec.ts regression-pr41-i18-i19.spec.ts hotfix-p0-i2-run-append.spec.ts` — 기존 PASS 유지
- [ ] K8s 배포 후 사용자 수동 재현: 턴 #29~#30 시나리오 직접 플레이테스트

### 5.5 롤백 경로

변경 커밋 1~3개. 각 커밋 단위 `git revert`. 최악의 경우 현재 main 상태로 복원.

---

## 6. 이전 본인 분석의 한계 자기 비판

### 6.1 역사 이력 누락의 구조적 이유

**지적 루틴**: architect 에이전트는 코드를 볼 때 **현재 main HEAD** 만 본다. git log 를 능동적으로 추적하지 않는다.

**문제**: 사용자가 "지난번 조치" 라 말했을 때, `eef2bbc → fb85d53` 7시간 롤백 이력을 **수동으로 찾아보지 않고** 현재 코드만 보고 가설 수립.

**개선책**:
1. 사용자 증언에 "지난번/이전" 단어 있으면 `git log --grep` 필수 실행
2. 코드 수정 전에 파일 단위 `git log --all --oneline -- <path>` 로 최근 10 커밋 이력 확인
3. **역방향 회귀 방지 spec 변경** (기대치 자체가 뒤집힌 경우) 을 주목

### 6.2 증거-가설 선후 역전

**이전 분석 패턴**: "reload 가 원인일 것 같다" → 코드 읽고 반증 → 수정 가설 세움 → 확도 80%.

**실제 해야 했던 것**: 사용자 스크린샷 먼저 보기 → "등록 완료 배지가 정상" 확인 → reload 가설 배제 → 다른 원인 탐색.

**교훈**: **증거 먼저, 가설 나중**. 특히 실측 사용자 증언이 있을 때.

### 6.3 유령 박스 버그 인지 실패

사용자가 말하기 전까지 **유령 박스 증상 자체를 발견하지 못했음**. 스크린샷 221543 은 세션에서 이미 언급됐는데, 본인이 이미지를 안 열어봤다.

**교훈**: PR 조사 시 **관련 스크린샷 전체를 Read 로 열기** 가 필수. 글자 증언만으로 판단 금지.

### 6.4 PR #70 에서 세운 가설에 대한 사후 자기 검증 부족

본인이 PR #70 에서 "PlayerRack key idx 추가 = 가설 A 70%" 로 판단했으나, 사후에 검증했으면 **루미큐브 tile code 설계 (a/b 세트 구분)** 상 랙에 동일 코드 2장이 발생할 일이 거의 없다는 것을 깨달았을 것.

**교훈**: 에이전트가 제시한 확도에는 **근거 문서 링크** 또는 **계산식** 필수. 감 확도 금지.

### 6.5 "커밋 3개 전 신호 울려야" 라던 반성 반복

2026-04-23 Day 2 reflection report 에서 본인이 "커밋 3개 전에 신호 울렸어야 했다" 고 반성했으나, **이번에도 PR #70 머지 후 동일 버그 재현까지 1일 만에 사용자가 발견**. 구조적 원인:

1. **E2E 테스트가 실제 사용자 시나리오 안 커버**: BUG-UI-009 재현 spec 은 fixture 로 상태 주입. 실 플레이테스트의 "턴 #29 확정 완료 후 호환 불가 타일 반복 드롭" 시나리오 미커버.
2. **PR 머지 후 플레이테스트 의무 없음**: merge gate 에 자동 smoke + E2E 만. **사용자 직접 플레이** 는 없음.
3. **architect 가 frontend-dev 와 페어 코딩 의무인데 실무상 architect 단독 결정 사례** (PR #70): 사용자가 Sprint 7 Scope 재편 때 UI 페어 의무화했으나 적용 지연.

**구조적 개선안**:
- PR merge gate 에 "사용자 플레이테스트 pass" 수동 게이트 (Day 3 merge gate 10종 정책 포함 여부 확인)
- architect 단독 코드 수정 금지, 모든 PR 에 frontend-dev + qa 리뷰 필수
- PR 본문에 "재현 시나리오 + 사용자 관점 기대 동작" 필수 기재

---

## 7. 핵심 질문 답변 (사용자 요구)

### Q1. 사용자가 "확정 후" 말한 상황에서 reload 없이도 재현되는 경로가 있는가?

**답: 예**. 스크린샷 증거 (221543 등) 에 "최초 등록 완료" 배지 정상 표시 + 턴 진행 정상. reload 없이 **턴 #29 정상 플레이 중 extend 시도 실패**. 따라서 이전 가설 5 (reload drift) 는 **Primary 가 아님**. Primary 는 가설 X (호환 불가 → 복제 렌더) + G1/G4 (stale snapshot + guard 우회).

### Q2. eef2bbc 가 수정한 가장자리 append 동작이 현재 main 에서 살아있는가 아니면 fb85d53 에 의해 완전히 죽었는가?

**답: 완전히 죽었음**. fb85d53 (line 909-926) 이 eef2bbc 의 append 경로를 완전 삭제하고 "새 pending 그룹 early-return" 으로 대체. 현재 main GameClient.tsx:909-926 확인 결과 eef2bbc 의 isCompatibleWithGroup append 블록은 **존재하지 않음**. 단, **이 경로는 `!hasInitialMeld` 만 영향** 이므로 hasInitialMeld=true extend 증상에는 직접 영향 없음. 사용자의 "지난번 조치" 기억은 eef2bbc 가 거의 확실하나, 현재 증상의 직접 원인은 **다른 것**.

### Q3. BUG-UI-GHOST 가 본인 PR #70 수정(PlayerRack key idx + handleDragEnd guard + onDragCancel)의 부작용인가, 아니면 별개 이슈인가?

**답: 부작용 아닌 미해결 잔존 증상**. PR #70 의 3개 수정은 본래 BUG-UI-009 "9개 복제" 를 해결하려 했으나, 자기 검증 결과:
- PlayerRack key idx: 루미큐브 설계상 효과 거의 없음
- handleDragEnd guard: microtask 경계 우회 가능 (G1)
- onDragCancel: 별건 (BUG-UI-010 stuck)

**BUG-UI-GHOST 는 BUG-UI-009 의 미해결 잔존**. 별개 이슈가 아니라 **동일 증상의 재발견**.

### Q4. PR #51 본문의 근거 "QA 보고서 72 §4.2.2 서버 패널티" 는 현재도 유효한가?

**답: 부분 유효**. 서버 `validator.go:100-104` 에서 `!HasInitialMeld` 일 때만 `validateInitialMeld` 호출. 즉:
- `hasInitialMeld=false` + 서버 그룹에 append → V-04 실패 → penaltyDrawAndAdvance(3장) **발동** (QA 72 §4.2.2 근거 **유효**)
- `hasInitialMeld=true` + 서버 그룹에 append → V-04 스킵 → 정상 extend **허용** (패널티 **없음**)

PR #51 롤백은 `!hasInitialMeld` 케이스에만 효과. 현재 사용자 증상 (hasInitialMeld=true extend 실패) 은 PR #51 효과 영역 밖. PR #51 자체를 되돌릴 필요는 없으나, **PR #51 의 근거가 현재 증상을 커버한다는 주장은 오도**.

---

## 8. 다음 액션 아이템

### 8.1 즉시 (Day 3, 2026-04-24 내)

- [ ] **BUG-UI-GHOST 신규 이슈 생성** (HIGH): 스크린샷 221543/221554/221603 첨부
- [ ] **BUG-UI-EXT-POST-CONFIRM** 이슈 생성 (HIGH): 가설 X 근거 기재
- [ ] PR #73 본인 코멘트 업데이트 (사과 + 재조사 결과)
- [ ] architect + frontend-dev + qa 3인 페어 킥오프

### 8.2 Sprint 7 Week 2 (2026-05-02 까지)

- [ ] §5.2 수정 A/B/C 배포
- [ ] §5.3 회귀 방지 spec 5종 GREEN
- [ ] 사용자 수동 플레이테스트 PASS (턴 #29 시나리오 재현 실패 확인)
- [ ] §5.2 D — hasInitialMeld SSOT ADR 초안

### 8.3 Sprint 8

- [ ] §5.2 D — SSOT 리팩터 실구현
- [ ] state 이중화 전수 감사 (useMemo derived vs store)
- [ ] merge gate 에 "사용자 플레이테스트 체크박스" 추가 (Day 3 merge gate 10종 정책과 통합)

---

## 9. 참고

- PR #73 코멘트 본인 이전: https://github.com/k82022603/RummiArena/pull/73#issuecomment-4309849885
- 스크린샷:
  - 2026-04-23_221543 — BUG-UI-GHOST 6개 복제 증거
  - 2026-04-23_221554 — 동일 턴 드래그 진행 중
  - 2026-04-23_221603 — 동일 턴 런 미확정 6개 복제
  - 2026-04-23_221707 — 정상 턴 대조군
  - 2026-04-24_101614 — 기권 종료 화면 (턴 #29 시점 아님)
- 핵심 커밋:
  - eef2bbc — I-2 append 허용 (롤백됨)
  - fb85d53 (PR #51) — I-18 완전 롤백
  - 60df5ca — G-3 고스트 tile id 유일성
  - 71558b6 (PR #70) — BUG-UI-009 부분 수정
  - 73bd7c6 (PR #70) — BUG-UI-010 onDragCancel
- 핵심 파일 + 라인:
  - `src/frontend/src/app/game/[roomId]/GameClient.tsx:596` useMemo currentTableGroups
  - `src/frontend/src/app/game/[roomId]/GameClient.tsx:696-1168` handleDragEnd
  - `src/frontend/src/app/game/[roomId]/GameClient.tsx:909-974` FINDING-01 + extend 분기
  - `src/frontend/src/components/game/GameBoard.tsx:311-492` tableGroups.map 렌더
  - `src/frontend/src/hooks/useWebSocket.ts:142-183` GAME_STATE 핸들러
  - `src/frontend/src/store/gameStore.ts:127` hasInitialMeld initialState
  - `src/game-server/internal/engine/validator.go:100-104` HasInitialMeld 검증 게이트
