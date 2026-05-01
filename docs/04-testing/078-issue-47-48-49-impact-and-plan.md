# Issue #47 / #48 / #49 — 영향 분석 및 수정 계획서

- **작성일**: 2026-04-22 (Sprint 7 Day 1)
- **작성자**: architect agent (Opus 4.7 xhigh)
- **대상 이슈**: #47 (V-SPRINT7-RACE-01), #48 (V-SPRINT7-RACE-02), #49 (FINDING-02)
- **출력 성격**: Read-only 영향 분석 + 수정 계획. **코드 수정 없음**.
- **참조 문서**:
  - `docs/04-testing/73-finding-01-root-cause-analysis.md` (architect 원 판정)
  - `docs/04-testing/74-warn-items-impact-assessment.md` (WARN 평가)

---

## 1. Executive summary

| Issue | 제목 | 판정 | 사유 요약 |
|-------|------|------|-----------|
| #47 | LeaveRoom PLAYING guard | **PROCEED** | 2h, 깨끗한 서버 측 방어 계층. checkDuplicateRoom 자기 호출(L478)과 충돌 없음을 확인 |
| #48 | handleConfirm in-flight lock | **PROCEED** | 1h, 순수 클라이언트 state, WS 계약 변경 없음. PR #51(A3/A4) 위에 깔끔히 얹힘 |
| #49 | day11 fixture 결함 | **ALTERNATIVE (옵션 A)** | 옵션 B는 PracticeBoard 리팩터 150+ LOC, 옵션 A 는 30 LOC. 설계 관점에서 practice 모드에 pending 개념 불필요 |

전체 소요 시간: **3h ~ 4h** (병렬 실행 시 실질 2h)

---

## 2. Issue #47 — V-SPRINT7-RACE-01 LeaveRoom PLAYING guard

### 2.1 Current state

**파일**: `src/game-server/internal/service/room_service.go` L302-350

```go
func (s *roomService) LeaveRoom(roomID, userID string) (*model.RoomState, error) {
	room, err := s.roomRepo.GetRoom(roomID)
	// ...
	if room.Status == model.RoomStatusFinished || room.Status == model.RoomStatusCancelled {
		return nil, &ServiceError{Code: "INVALID_REQUEST", ...}
	}
	// PLAYING 체크 없음 → race window
```

**발견된 유의사항** (architect 분석):

1. **Self-call at L478** — `checkDuplicateRoom` 는 WAITING 방에 참가 중인 사용자가 새 방을 만들 때 기존 방에서 자동 퇴장시키기 위해 `s.LeaveRoom(existingRoomID, userID)` 를 호출한다. 이 경로는 **WAITING** 방만 대상으로 가드된다(L475-479). PLAYING 가드를 추가해도 이 self-call 은 WAITING 상태에서만 실행되므로 영향 없음.
2. **Frontend caller** (`WaitingRoomClient.tsx` L245) — 실패해도 로비로 이동하도록 try/catch 로 감싸져 있어(L246) 새 에러 코드가 새어 나와도 UX 깨지지 않음.
3. **RoomHandler** (`room_handler.go` L191-204) — ServiceError 를 그대로 상태 코드로 매핑하므로 409 반환 동작 자연스러움.

### 2.2 Proposed fix

`room.Status == model.RoomStatusPlaying` 일 때 `GAME_IN_PROGRESS` 에러로 차단. **단, 호스트는 취소(forfeit) 로직으로 별도 경로를 이미 가진다** — LeaveRoom 은 "대기실 방 나가기" 용도로 의미를 좁힌다.

```go
// PLAYING 상태에서는 LeaveRoom 차단 (V-SPRINT7-RACE-01)
// 게임 진행 중 이탈은 FORFEIT 경로를 통해서만 허용한다.
if room.Status == model.RoomStatusPlaying {
	return nil, &ServiceError{
		Code:    "GAME_IN_PROGRESS",
		Message: "게임 진행 중에는 방을 나갈 수 없습니다. 기권 기능을 이용하세요.",
		Status:  409,
	}
}
```

에러 코드는 **`GAME_IN_PROGRESS`** 신설. 409 Conflict.

### 2.3 Risk level

- **LOW**. 서버 측 방어 추가만, 기존 정상 경로 변경 없음.
- **Breaking change flag**: 없음. 현재 정상 UI(WaitingRoomClient)는 PLAYING 상태에서 LeaveRoom 호출을 발생시키지 않는다. GameClient 의 기권/종료 경로는 LeaveRoom 대신 `FinishRoom` 또는 WS 이벤트를 사용한다.
- **잠재 회귀**: `room_service_test.go` 기존 테스트(L118)는 WAITING 방에서 퇴장 → 영향 없음.

### 2.4 Verification plan

**신규 테스트 3건** (`room_service_test.go`):

1. `TestLeaveRoom_RejectsPlayingStatus` — CreateRoom → JoinRoom(2인) → StartGame → LeaveRoom(호스트/게스트) → **모두 409 GAME_IN_PROGRESS 반환**.
2. `TestLeaveRoom_AllowsWaitingStatus` — 기존 회귀 보호. WAITING 에서 정상 퇴장.
3. `TestCheckDuplicateRoom_StillWorksOnWaiting` — WAITING 방 자동 퇴장 경로(L478) 회귀 방지.

기존 E2E 에 끼칠 영향 없음 (UI에서 PLAYING 중 LeaveRoom 버튼 노출 없음).

### 2.5 Estimated duration

**2h** (분석/계획 완료, 구현 30m + 테스트 60m + 검증 30m).

### 2.6 Recommended agent

**go-dev** (sonnet-4-6).

### 2.7 Branch naming

`fix/issue-47-leave-room-playing-guard`

---

## 3. Issue #48 — V-SPRINT7-RACE-02 handleConfirm in-flight lock

### 3.1 Current state

**파일**: `src/frontend/src/app/game/[roomId]/GameClient.tsx` L1139-1240 (handleConfirm)

```tsx
const handleConfirm = useCallback(() => {
  if (!pendingTableGroups) return;
  if (!pendingMyTiles) return;
  // ... 검증 로직 ...
  send("PLACE_TILES", { ... });
  send("CONFIRM_TURN", { ... });
}, [...]);
```

**발견된 사실**:

1. **No in-flight lock**. 버튼은 `!isMyTurn || !hasPending || !allGroupsValid` 으로만 비활성화됨 (`ActionBar.tsx` L124). ACK 대기 상태는 없음.
2. **TURN_END → pending reset** 은 TURN_START 핸들러에서 이루어짐 (주석 L1136-1138). 따라서 서버가 TURN_END 보내기 전에 사용자가 확정 버튼을 재클릭하면 동일한 PLACE_TILES + CONFIRM_TURN 이 중복 발사됨.
3. **서버 측**: 중복 CONFIRM_TURN 은 이미 서버 턴이 넘어간 상태에서 오면 INVALID_MOVE 로 반려됨 → ErrorToast 1회 노출. 실제 게임 진행은 깨지지 않음.
4. **Auth/세션/WS 전역 상태**: `useWSStore` 는 connected/lastError/disconnectedPlayers 만 관리. in-flight 개념 미존재 → 추가는 로컬 state 로 국한.

### 3.2 Proposed fix

**로컬 `confirmBusy` state + 두 해제 경로**.

```tsx
const [confirmBusy, setConfirmBusy] = useState(false);

const handleConfirm = useCallback(() => {
  if (confirmBusy) return;               // [1] 중복 클릭 차단
  if (!pendingTableGroups) return;
  if (!pendingMyTiles) return;
  // ... 기존 검증 ...

  setConfirmBusy(true);                  // [2] 전송 직전 락
  send("PLACE_TILES", { ... });
  send("CONFIRM_TURN", { ... });
}, [confirmBusy, ...]);

// 락 해제 — TURN_START(성공) 또는 INVALID_MOVE(실패) 후
useEffect(() => {
  if (!pendingTableGroups && confirmBusy) {
    setConfirmBusy(false);               // [3] reset 트리거 후 해제
  }
}, [pendingTableGroups, confirmBusy]);
```

**ActionBar 에 prop 추가**:

```tsx
<ActionBar
  ...
  confirmBusy={confirmBusy}
  onConfirm={handleConfirm}
/>

// ActionBar.tsx
disabled={!isMyTurn || !hasPending || !allGroupsValid || confirmBusy}
```

**대안 검토 및 기각**:
- ❌ Ref-based lock (useRef) — state 변경으로 버튼 disabled 재렌더 필요.
- ❌ Promise.race with timeout — WS `send` 는 fire-and-forget. timeout 없이 TURN_START/INVALID_MOVE 이벤트 기반 해제가 더 정확.
- ❌ useWSStore 에 globalBusy 추가 — handleConfirm 한 곳만 필요. 지역 state 로 스코프 최소화.

### 3.3 Risk level

- **LOW**. 기존 로직 변경 없음, 순수 가산.
- **Breaking change flag**: 없음. ActionBar prop 추가는 optional prop으로 설계 (`confirmBusy?: boolean`).
- **잠재 회귀**: `confirmBusy` 해제 조건이 잘못되면 버튼 영구 disabled 위험. effect 의존성에 `pendingTableGroups` 포함 필수. 테스트로 방어.

### 3.4 Verification plan

**Jest 단위 테스트 2건** (ActionBar.test.tsx):
1. `confirmBusy=true` 일 때 확정 버튼 disabled.
2. `confirmBusy=false` + 기존 조건 만족 시 enabled.

**Playwright E2E 1건** (신규 `hotfix-confirm-busy.spec.ts`):
- 확정 버튼 연속 2회 클릭 시 WS 메시지 카운트 = 2 (PLACE_TILES + CONFIRM_TURN). 기존 구현에서는 4가 나와야 회귀 감지 가능.
- 단, WS mock 설정이 복잡하므로 Jest 로 대체 가능.

### 3.5 Estimated duration

**1h** (구현 20m + 테스트 25m + 검증 15m).

### 3.6 Recommended agent

**frontend-dev** (sonnet-4-6).

### 3.7 Branch naming

`fix/issue-48-confirm-busy-lock`

---

## 4. Issue #49 — FINDING-02 day11 fixture 결함 (특별 분석)

### 4.1 Current state

**실패 테스트 3건** (`src/frontend/e2e/day11-ui-bug-fixes.spec.ts`):

| 테스트 | 기대 | 실제 동작 | 원인 |
|--------|------|-----------|------|
| T-B1-01 | 보드 첫 타일 드롭 후 "미확정" 라벨 표시 | 라벨 미표시 | PracticeBoard → GameBoard 에 `pendingGroupIds` prop 미전달 → `isPending=false` → 라벨 `return null` |
| T-BNEW-01 | 단일 타일 드롭 시 "미확정" 라벨 | 라벨 미표시 | 동일 |
| T7-02 | `R1a` 드래그 후 확정 버튼 disabled | `dragTileToBoard` 에서 `R1a` 타일 locator 못 찾음 → timeout / silent fail | stage 1 hand 에 `R1a` 없음 (`["R7a", "B7a", "Y7a", "K7a", "R3a", "B5a"]`) |

### 4.2 코드 검증 (증거)

**GameBoard.tsx L313, L333** (라벨 렌더 조건):
```tsx
const isPending = pendingGroupIds.has(group.id);
// ...
const pendingLabelText = (() => {
  if (!isPending) return null;   // ← practice 모드에서 항상 null
  // ...
})();
```

**PracticeBoard.tsx L353-359** (prop 전달):
```tsx
<GameBoard
  tableGroups={tableGroups}
  isMyTurn
  isDragging={isDragging}
  groupsDroppable
  className="flex-1 min-h-[180px]"
  // ← pendingGroupIds 미전달 → default Set<string>() (빈 세트)
/>
```

### 4.3 Option A vs B vs C 평가

#### Option A — 테스트 기대치 수정 (권장)

테스트를 "practice 모드에서는 미확정 라벨이 없다" 라는 설계 사실에 맞춰 재작성한다.

- **수정 범위**: `day11-ui-bug-fixes.spec.ts` 3개 테스트만.
- **LOC**: ~30 lines (삭제 + 보드 타일 존재 DOM 검사로 대체).
- **PracticeBoard/GameBoard 변경**: 없음.
- **설계 정합성**: 높음. Practice 모드는 서버 없이 로컬 검증만 하므로 "서버 미확정" 개념 자체가 부적절.
- **리스크**: 매우 낮음. Practice-mode-only UI 테스트로 축소.

#### Option B — PracticeBoard 리팩터

PracticeBoard 에 pending/committed 개념 도입. 타일 드롭 → pending → "확정" 버튼 → committed.

- **수정 범위**:
  - PracticeBoard.tsx: 신규 state `pendingGroupIds: Set<string>`, drop 시 추가, reset 시 비우기.
  - GameBoard prop 전달.
  - 확정 핸들러에서 pendingGroupIds 정리.
  - 모든 스테이지 E2E 흐름 영향 (확정 버튼 UX 변경 가능성).
- **LOC**: ~120~150 lines + 기존 practice E2E 회귀 리스크.
- **설계 정합성**: 낮음. Practice 는 단일 플레이어 로컬 연습이며 서버 round-trip 없다. "미확정" 은 서버 검증 대기 상태를 시각화하는 장치 → practice 에서는 잘못된 의미 전달.
- **리스크**: 중. 기존 practice E2E (StageSelector, TutorialOverlay, Stage 1~6 완주 테스트) 회귀 가능성.

#### Option C — T7-02 타일 코드 교체 (부분 적용)

T7-02 만 `R1a` → `R7a` (stage 1 실제 hand) 로 교체. B-1/B-NEW 는 별도 처리 필요.

- **수정 범위**: 1줄.
- **LOC**: 1 line.
- **적용성**: T7-02 에만 국한. B-1/B-NEW 는 여전히 FAIL.

### 4.4 권장 — **Option A + C 결합**

**근거**:
1. 설계 정합성: Practice 모드는 "서버 미확정" 개념 불필요. Option B 는 practice 의 도메인 의미를 왜곡.
2. 비용 효율: Option A 30 LOC vs Option B 150 LOC. 5배 차이.
3. 안전성: 기존 practice 스테이지 스펙 회귀 리스크 제거.
4. 테스트 본래 목적 달성: "day11 UI 버그 수정 검증" — 버그 자체는 이미 수정됐고, 테스트 fixture 만 stage 1 실제 환경에 맞추면 된다.

### 4.5 구체적 수정안

**B-1 (T-B1-01, T-B1-02)** — 기대치 변경:

```tsx
// 기존: await expect(pendingLabel).toBeVisible();
// 변경: 타일이 보드에 배치됐음을 확인 (role="img" 카운트)
const boardTiles = page.locator('section[aria-label="게임 테이블"] [role="img"]');
await expect(boardTiles).toHaveCount(1, { timeout: 3000 });  // 첫 드롭 후 1개
```

**B-NEW (T-BNEW-01, T-BNEW-02)** — 기대치 변경:

```tsx
// T-BNEW-01: 단일 타일 드롭 시 그룹 라벨 "그룹" 또는 "런" 단독 (미확정 suffix 없음)
const groupLabel = page.locator('section[aria-label="게임 테이블"]').locator('text=/^(그룹|런)$/');
await expect(groupLabel.first()).toBeVisible({ timeout: 3000 });

// T-BNEW-02: 같은 색 연속 드롭 → 보드 타일 2개
const boardTiles = page.locator('section[aria-label="게임 테이블"] [role="img"]');
await expect(boardTiles).toHaveCount(2, { timeout: 3000 });
```

**T7-02** — 타일 코드 교체:

```tsx
// 기존: await dragTileToBoard(page, "R1a");
// 변경: stage 1 실제 hand 에 있는 R7a
await dragTileToBoard(page, "R7a");
// 나머지 assertion 동일 (1개 타일이므로 클리어 불가 → 확정 disabled)
```

### 4.6 PracticeBoard 리팩터 LOC 추정 (Option B 기각 근거)

| 수정 항목 | 예상 LOC |
|-----------|----------|
| `pendingGroupIds: Set<string>` state 추가 + clear/add 핸들러 | ~30 |
| handleDragEnd 3경로(기존그룹추가/새그룹/보드→랙)에 pendingGroupIds 업데이트 | ~40 |
| handleConfirm 성공 시 pendingGroupIds 비우기 + committed 로직 | ~30 |
| handleReset / handleUndo 경로에 초기화 추가 | ~15 |
| GameBoard prop 전달 + 검증 | ~10 |
| 기존 practice E2E 회귀 수정 (StageSelector/Tutorial 플로우) | ~25 |
| **합계** | **~150 LOC** |

### 4.7 Risk level

- **VERY LOW** (Option A+C). 테스트 전용 수정, 프로덕션 코드 변경 없음.

### 4.8 Verification plan

1. `npx playwright test e2e/day11-ui-bug-fixes.spec.ts` 3건 PASS 확인.
2. 기존 PASS 테스트(T-B1/B-NEW/T7 외) 회귀 없음 확인.
3. Full E2E 스위트 (Jest + Playwright) 통과.

### 4.9 Estimated duration

- **Option A+C**: **1.5h** (수정 30m + E2E 검증 + 회귀 40m + 문서 20m).
- Option B 는 **4~6h**.

### 4.10 Recommended agent

**qa** (Opus 4.7 xhigh — 테스트 설계 의도 판단 필요) + **frontend-dev** (sonnet-4-6, 수정 실행).

### 4.11 Branch naming

`fix/issue-49-day11-fixture`

---

## 5. Parallel execution matrix

| 이슈 | 파일 디렉토리 | 에이전트 | 의존성 | 병렬 가능? |
|------|---------------|----------|--------|-----------|
| #47 | `src/game-server/` | go-dev | — | ✅ |
| #48 | `src/frontend/src/app/game/` + `components/game/ActionBar.tsx` | frontend-dev | — | ✅ |
| #49 | `src/frontend/e2e/` | qa + frontend-dev | — | ⚠️ #48 과 디렉토리 겹침 |

### 5.1 Worktree 분리 전략

**권장 구성**:

```
/mnt/d/Users/KTDS/Documents/06.과제/RummiArena           (main)
/mnt/d/Users/KTDS/Documents/06.과제/RummiArena-i47       (worktree: fix/issue-47-leave-room-playing-guard)
/mnt/d/Users/KTDS/Documents/06.과제/RummiArena-i48-49    (worktree: fix/issue-48-49-frontend-batch)
```

- #47: 완전 독립 (game-server 전용) → 병렬 가능.
- #48 + #49: **frontend 영역 중복** (특히 #48 이 ActionBar.tsx 건드리고 #49 가 practice E2E 만 건드리지만, 같은 frontend 빌드 사이클). 같은 worktree 에서 **순차 실행** 또는 별도 worktree 2개.

**Simplest path**: worktree 2개 (#47 단독, #48+#49 batch). PR 은 각자 분리.

### 5.2 PR 분리 전략

- **PR A**: #47 — backend only, 작고 명확.
- **PR B**: #48 — frontend logic only.
- **PR C**: #49 — E2E fixture only.

(또는 #48+#49 한 PR 로 묶어도 가능하나, 리뷰 관점에서 분리 권장)

---

## 6. "Go now" vs "Need user decision"

### 6.1 Go now (architect 권한 내 즉시 진행)

- ✅ **#47** — 설계 명확, 에러 코드 `GAME_IN_PROGRESS` 신설 정당화됨. go-dev 할당.
- ✅ **#48** — 설계 명확, ActionBar prop 추가 scope 명확. frontend-dev 할당.
- ✅ **#49 Option A+C** — 테스트 fixture 수정만. 프로덕션 코드 무변경. qa+frontend-dev 할당.

### 6.2 Need user decision

- ❓ **Practice 모드 "pending" 도입 여부** (향후 로드맵 판단) — Option B 를 채택하지 않는다는 것은 "practice 는 서버 round-trip 없는 단일 플레이어 연습" 이라는 설계 고정을 의미. 향후 "practice 모드에서도 확정 플로우를 연습시켜야 한다" 는 요구가 생기면 별도 리팩터 검토 필요. 현 시점 사용자 확인 없이 Option A 로 가도 무방 (설계 원 의도가 그러했음).
- ❓ **#47 커버리지 — FORFEIT/기권 경로 전면 점검 여부** — LeaveRoom 을 PLAYING 에서 차단하면 "게임 중 나가기" UX 는 모두 FORFEIT 로 몰림. FORFEIT UI/로직이 충분한지는 Sprint 7 별도 점검 과제. **이번 PR 범위는 가드 추가로 한정 권장**.

---

## 7. 부록 — 향후 연관 작업

- Sprint 7 Week 2: FORFEIT 경로 완결성 점검 (#47 후속)
- Sprint 7 Week 2: `pendingGroupIds` 가 practice 에서 의미 없다는 사실을 `docs/02-design/` 에 명시 (설계 문서화)
- Sprint 8 후보: ActionBar disabled 상태 전수 점검 (confirmBusy 외 다른 race 존재 여부)

---

**문서 끝.**
