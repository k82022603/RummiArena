# 74. WARN Items Impact Assessment (PR #41 / #42 Regression Plan §11)

- **작성일**: 2026-04-22 (Sprint 7 D+1)
- **작성자**: architect (Opus 4.7 xhigh)
- **브랜치**: `hotfix/finding-01-i18-rollback-2026-04-23` (read-only 평가)
- **목적**: `docs/04-testing/71-pr41-42-regression-test-plan.md` §11.2 에 Flagged 된 4개 WARN 항목의 **심각도·수정 시급성**을 판정하여 main 세션의 triage 를 지원한다.
- **범위**: READ-ONLY — 코드 수정 없음, 브랜치 생성 없음.
- **SSOT 준수**: `docs/02-design/31-game-rule-traceability.md`, `docs/02-design/30-error-management-policy.md`

---

## 1. Executive Summary

| 집계 | 건수 | 항목 |
|------|------|------|
| **FIX NOW (Sprint 7 Day 1~2)** | **1건** | WARN-03 (조커 중복 push 방어) — 5분 S-size 패치 |
| **Sprint 7 backlog** | **2건** | WARN-01 (LeaveRoom/StartGame race), WARN-02 (TURN_END race) |
| **Permanent WONTFIX + docs** | **1건** | WARN-04 (게스트 방 DB 미기록) — ADR 필요 |
| **총계** | **4건** | — |

### 1.1 한 줄 요약

- **WARN-01**: 이론적 race 는 있으나 현재 비-UUID HostID 가 실무상 없고 best-effort pg 경로라서 **사용자 영향 invisible**. Sprint 7 backlog 에 race 재현 단위 테스트 추가.
- **WARN-02**: TURN_END 수신 시 `resetPending` 이 **TURN_START 에서만** 호출됨. 2초 fallback 도 있어 실제 race window 는 매우 좁음. 현 증상 없음 → backlog.
- **WARN-03**: `addRecoveredJoker` 가 중복 push 를 막지 않음 — **잠재적 데드락**. `filter(.includes)` 는 `indexOf/splice` 로 1장씩 제거되므로 중복 2회 push 시 1회 배치로도 여전히 차단됨. **FIX NOW 권고** (S-size).
- **WARN-04**: 게스트 방이 DB rooms 에 안 남는 것은 **FK 설계상 정상**. admin 현재 UI 는 memory repo 만 조회하므로 **현 UX 영향 없음**. 향후 DB-backed admin 도입 시 재평가 — ADR 필요.

### 1.2 Cross-WARN 상호작용 리스크

- **WARN-02 ↔ WARN-03**: TURN_END → (race window) → pendingRecoveredJokers 중복 push 시나리오가 이론적으로 가능. 단 TURN_END 경로에서는 `pendingRecoveredJokers` 에 쓰기가 없음 (store 단계 조회). 상호작용 무시 가능.
- **WARN-01 ↔ WARN-04**: 둘 다 PG Dual-Write best-effort 실패 경로. 게임 진행 차단 없음 + 공통 로그 포맷 (`room_service: postgres ... best-effort failed`). 장애 식별 용이.

---

## 2. WARN-01 — `LeaveRoom during StartGame` race

### 2.1 실제 재현 가능성: **theoretical**

- **근거**: `src/game-server/internal/service/room_service.go` L302~350 (LeaveRoom) + L355~400 (StartGame).
- 둘 다 `s.roomRepo.GetRoom(roomID)` 으로 메모리 repo 조회. memory_repo 는 `sync.RWMutex` (repository/memory_repo.go L25, L41 `Lock()`). **GetRoom + SaveRoom 두 호출 사이에는 락이 해제된다** (transactional 아님).
- 따라서 다음 interleaving 이 논리적으로 가능:
  1. StartGame goroutine A: `GetRoom()` → status=WAITING 확인 → gameService.newGame() (락 밖)
  2. LeaveRoom goroutine B: `GetRoom()` → 호스트 퇴장 → status=CANCELLED → `SaveRoom()`
  3. StartGame A: `SaveRoom()` (status=PLAYING 덮어씀)
- 하지만 **실제 호출 경로**에서 HTTP handler 가 동일 roomID 에 대해 StartGame(호스트) + LeaveRoom(호스트)를 **동시에 발사**할 수 있는 UI 경로는 확인되지 않음. 게스트 UI 는 StartGame 권한이 없고, 호스트 UI 는 "방 나가기" 버튼이 게임 시작 버튼과 동시 클릭 불가.
- **직접 공격 벡터**: curl 수동 공격자가 정확한 타이밍에 두 요청을 동시 발사하면 재현 가능 — 그러나 영향 = 방 상태 불일치 (게임은 이미 시작됨 + room.Status=CANCELLED → 방에는 못 들어감). 심각한 게임 무결성 파괴는 아님.

### 2.2 사용자 영향: **invisible** (공격 시나리오만 annoyance)

- 정상 사용자 경로에서는 발생 불가
- pg Dual-Write 는 best-effort (L104 `pgBestEffortUpdateRoom`) 이므로 게임 흐름 차단 없음
- **실측 로그**: 프로덕션에서 "room_service: postgres update room best-effort failed" 로그가 반복 발생한 이력 없음 (현 Sprint 7 시작 전 devops smoke 5/5 clean)

### 2.3 수정 비용: **M** (half-day)

- **옵션 A (정합성 전면 개편)**: RoomService 에 `sync.Mutex` per-room 도입 → GetRoom+Save 를 transactional 로 감싸기. 변경 지점 = StartGame, LeaveRoom, JoinRoom, FinishRoom 4개. 예상 4~5시간.
- **옵션 B (최소 방어)**: LeaveRoom 내에서 `room.Status != WAITING` 체크 엄격화. 현재 L308 `RoomStatusFinished || RoomStatusCancelled` 만 차단. **PLAYING 상태에서도 LeaveRoom 금지하면 race 제거 가능** (기권은 WS 경로 사용). 예상 1시간.

### 2.4 권고: **Sprint 7 backlog** (P2, W1 말)

- 옵션 B 를 기본 권고. 단 PLAYING 중 LeaveRoom 금지 시 "기권" UX 가 막히지 않는지 확인 필요 (기존 FORFEIT 경로는 WS 로 `handleForfeit` 다른 핸들러 호출).
- Sprint 7 backlog 에 `V-SPRINT7-RACE-01` 이슈 등록:
  - 범위: room_service.go LeaveRoom PLAYING-block + 단위 테스트 race 시뮬레이션 (`mockPgRepo.createRoomCalls` 순서 검증)
  - 담당: go-dev (구현) + architect (설계 리뷰)

### 2.5 FIX NOW 시 담당 에이전트

N/A (backlog)

---

## 3. WARN-02 — `TURN_END` WS race

### 3.1 실제 재현 가능성: **very theoretical**

- **근거**: `src/frontend/src/hooks/useWebSocket.ts` L184~282.
- TURN_END 리듀서는 `gameState.tableGroups`, `players[].tileCount`, `myTiles` (서버값 우선) 등을 업데이트하지만 **`pendingMyTiles`/`pendingTableGroups`/`pendingRecoveredJokers` 는 건드리지 않음**.
- `resetPending()` 호출은 오직 TURN_START (L192) + BUG-WS-001 fallback (L276, 2초 대기) + AI_THINKING fallback (L436) 에서만.
- 따라서 race window = "사용자가 `handleConfirm` 버튼을 눌러 WS `CONFIRM_TURN` 송신 중, 서버에서 TURN_END 응답이 도착 → TURN_START 가 뒤이어 도착 → `resetPending()` 실행" 의 아주 짧은 구간 (<200ms 예상).
- **실제 문제는 `CONFIRM_TURN` 송신 이후 `resetPending` 이 TURN_START 올 때까지는 pending 유지**. 이 사이 사용자가 **다시 handleConfirm 버튼을 누를 수 있는가?** — `handleConfirm` 안에 이중 차단 없음. 다만 TURN_END 수신으로 `currentSeat` 이 다음 사람으로 바뀌므로, `isMyTurn` 기반 UI 비활성화가 일어남 (확정 버튼 disabled).

### 3.2 사용자 영향: **invisible → annoyance (이중 클릭 시)**

- 정상 흐름: 확정 클릭 → WS 송신 → (네트워크 RTT) → TURN_END → TURN_START → resetPending.
- 비정상 흐름: 확정 클릭 → 반응 없다고 재클릭 → TURN_END 도착과 겹침 → 2번째 CONFIRM_TURN 이 서버 INVALID_MOVE 반환 (다른 플레이어 턴이므로) → ErrorToast 표시.
- 영향 = ErrorToast 한 번 노출 (UX 손상 경미, 실데이터 무결성 파괴 없음).
- **Playwright 재현 불가 이유 정확**: WS 메시지 순서를 mock 으로 재현해야 하는데 mock 시뮬레이션 밖.

### 3.3 수정 비용: **S** (<2h)

- `handleConfirm` 진입 시 `isConfirmInFlight` state 추가. WS ACK (TURN_END 또는 INVALID_MOVE) 수신 시까지 버튼 disabled.
- 변경 파일 1개: `src/frontend/src/app/game/[roomId]/GameClient.tsx`. 약 15라인.
- 단위 테스트: Jest 2건 (flight 중 2번째 확정 차단 / INVALID_MOVE 수신 시 해제).

### 3.4 권고: **Sprint 7 backlog** (P3, W1~W2)

- 현 증상 없음 + Playwright 재현 어려움. SKILL `ui-regression` 실측 바탕으로 추가 증상 발견 시 FIX NOW 로 승격.
- Sprint 7 backlog 에 `V-SPRINT7-RACE-02` 이슈 등록:
  - 범위: GameClient.tsx handleConfirm in-flight lock + Jest 단위 2건
  - 담당: frontend-dev (구현)

### 3.5 FIX NOW 시 담당 에이전트

N/A (backlog)

---

## 4. WARN-03 — `pendingRecoveredJokers` 중복 push 가능성

### 4.1 실제 재현 가능성: **possible** (엣지 시나리오에서 높음)

- **근거**: `src/frontend/src/store/gameStore.ts` L166~178.
- `addRecoveredJoker(code)` 는 **guard 없이 `push`**: `[...state.pendingRecoveredJokers, code]`. `removeRecoveredJoker` 는 `indexOf` + `splice(idx, 1)` 로 **1회 제거**.
- **재현 시나리오**:
  1. 사용자가 서버 런 `[R5, JK1, R7]` 에 R6 를 드롭 → `tryJokerSwap` 성공 → `addRecoveredJoker("JK1")` → `pendingRecoveredJokers = ["JK1"]`, `pendingMyTiles += ["JK1"]`
  2. 사용자가 JK1 을 pending 그룹 A 에 드롭 → pendingMyTiles 에서 JK1 제거 → `unplacedRecoveredJokers = ["JK1"].filter(jk => [].includes(jk)) = []` (OK)
  3. **사용자가 "되돌리기" 클릭** (가상 기능) 또는 `setPendingTableGroups` 재설정으로 JK1 이 pendingMyTiles 에 재삽입됨
  4. 이 경로에서 `addRecoveredJoker("JK1")` 가 **다시 호출되면** → `pendingRecoveredJokers = ["JK1", "JK1"]`
  5. 사용자가 JK1 을 다시 보드에 배치 → pendingMyTiles 에서 1장 제거 → `unplacedRecoveredJokers = ["JK1","JK1"].filter(jk => [].includes(jk)) = []` (OK)
  6. **하지만** 실제 기본 시나리오에서 JK1 이 pendingMyTiles 에 2장 있을 수는 없으므로 filter 는 빈 배열 반환 → 차단 안 됨 → 정상
  7. **진짜 위험**: JK1 이 pendingMyTiles 에 1장 남아있는 상태에서 `pendingRecoveredJokers = ["JK1","JK1"]` 이면 `filter(jk => ["JK1",...].includes(jk)) = ["JK1","JK1"]` → 차단. 사용자가 JK1 을 보드에 한 번 배치하면 pendingMyTiles 에서 제거 → filter 결과 `[]` → 차단 해제. **데드락 없음**.
- **현 상황**: 되돌리기 기능 아직 없음 + `addRecoveredJoker` 호출 경로는 L789 `tryJokerSwap` 성공 1곳뿐. 중복 push 를 만드는 코드 경로는 **현재 존재하지 않음**.
- **미래 회귀 리스크**: "되돌리기"/"취소" 기능 추가 시 addRecoveredJoker 가 재호출될 수 있으며, guard 가 없으면 중복이 쌓임.

### 4.2 사용자 영향: **invisible (현재) → potential annoyance (되돌리기 추가 시)**

- 현재 경로에서 중복 push 가 발생할 수 없음 → 영향 없음
- 다만 방어 코드 없이 미래 기능 도입 시 경고 배너 (`JokerSwapIndicator`) 에 "JK1" 이 2번 중복 표시되거나 `filter` 결과가 예상 외로 커져 UX 혼란 가능

### 4.3 수정 비용: **S** (<30m)

- gameStore.ts L166~168 에 중복 guard 1줄 추가:
  ```ts
  addRecoveredJoker: (code) =>
    set((state) => {
      if (state.pendingRecoveredJokers.includes(code)) return {};
      return { pendingRecoveredJokers: [...state.pendingRecoveredJokers, code] };
    }),
  ```
- Jest 테스트 2건 추가 (중복 push 무시 / 정상 push 유지). 기존 `gameStore.test.ts` 에 append.

### 4.4 권고: **FIX NOW** (Sprint 7 Day 1)

- 5~10분 패치 + 방어적 변경. 회귀 리스크 극소 (Set-like 동작은 기존 `indexOf + splice` 시맨틱을 더 견고하게 만든다).
- Finding #5 로 이슈 등록 + 별도 hotfix PR 권고. PR 본문에 "WARN-03 사전 방어" 명시.
- **중요**: 본 변경은 V-07 / V-13e 규칙 로직과 독립 — 게임룰 영향 없음.

### 4.5 FIX NOW 시 담당 에이전트

- **frontend-dev** (구현 + Jest 2건)
- 검증: **qa** (기존 Jest 182건 유지 + 신규 2건 PASS)

---

## 5. WARN-04 — 비-UUID 호스트 방 rooms 미기록 (Admin UX)

### 5.1 실제 재현 가능성: **very likely (설계상 의도)**

- **근거**: `src/game-server/internal/service/room_converter.go` L14~18. `isValidUUIDStr(state.HostID)` false → nil 반환 → `pgBestEffortCreateRoom`/`UpdateRoom` 에서 스킵 (room_service.go L91, L109).
- 게스트 사용자 (`qa-테스터-xxx` 접두 ID) 는 UUID 형식이 아님 → 항상 DB rooms 에 INSERT 안 됨.
- **확정**: 설계 의도. FK `rooms.host_user_id → users.id` 보호용 + 게스트는 users 테이블에 row 없음 → FK 위반 방지.

### 5.2 사용자 영향: **invisible (현재) → future concern**

- **현재 상태 확인** (2026-04-22):
  - admin handler (`src/game-server/internal/handler/admin_handler.go`) 에는 rooms 관련 엔드포인트 **없음**.
  - 공개 `/api/rooms` (room_handler.go L104 ListRooms) 는 **memory repo** 만 조회 (`h.roomSvc.ListRooms()` → `s.roomRepo.ListRooms()`) → 게스트 방도 보임.
  - 따라서 현 Admin Dashboard 에 "게스트 방 누락" UX 이슈 **없음**.
- **미래 상태 우려**:
  - `docs/02-design/32-admin-dashboard-component-spec.md` (2026-04-12 작성) 가 향후 DB-backed admin rooms 관제를 제안하면 그때 이 이슈가 표면화.
  - 운영 어드민이 "어제의 방 목록" (memory repo 에서 이미 만료된 방) 을 재구성하려면 DB rooms 가 필요 → 게스트 방은 복구 불가.

### 5.3 수정 비용: **L** (>1 day, 단 지금은 수정 불필요)

- **옵션 A (게스트도 DB 기록)**: `users` 테이블에 게스트 row 선삽입 (temp user) → FK 유지. 별도 설계 필요 + Sprint 7 범위 초과.
- **옵션 B (rooms.host_user_id 를 nullable 로)**: FK 제약 완화. 스키마 변경 마이그레이션 + admin 쿼리 수정.
- **옵션 C (현상 유지 + ADR 문서화)**: 비용 0 + 미래 요구 시점에 재평가.

### 5.4 권고: **Permanent WONTFIX + ADR 문서화**

- 현 Sprint 7 에서는 수정 **불필요**. 단 다음 둘을 Day 1 내에 처리:
  1. **ADR 작성**: `docs/02-design/34-adr-025-guest-room-persistence.md` (신규)
     - Context: FK 보호 + 게스트 UUID 미보장
     - Decision: 게스트 방은 DB rooms 에 기록하지 않는다 (memory-only)
     - Consequences: Admin Dashboard 에서 게스트 방 히스토리 조회 불가 + 로그 기반 재구성 필요 시 별도 game_events 테이블 활용
     - Alternatives: 옵션 A/B (위 §5.3)
  2. **Admin Dashboard FAQ**: `docs/06-operations/` 에 "게스트 방이 왜 rooms 테이블에 없는가" 항목 추가. 현재 `docs/06-operations/` 는 2문서뿐이므로 새 파일 `03-admin-faq.md` 생성 권고.
- 향후 게스트 방 DB 기록이 요구되면 ADR 개정 + 별도 Sprint 에서 구현.

### 5.5 FIX NOW 시 담당 에이전트

- **architect** (ADR 작성) — 1시간 이내
- **pm** 또는 **architect** (Admin Dashboard FAQ) — 30분 이내
- 코드 변경 없음.

---

## 6. Recommended Action Plan

### 6.1 Sprint 7 Day 1 (2026-04-22, 오늘~내일)

| 항목 | 담당 | 소요 | 완료 기준 |
|------|------|------|----------|
| **WARN-03 hotfix PR** | frontend-dev | 30분 | gameStore.ts addRecoveredJoker guard + Jest 2건 신규 / Jest 184+/184+ PASS |
| **WARN-04 ADR-025 작성** | architect | 1시간 | `docs/02-design/34-adr-025-guest-room-persistence.md` |
| **WARN-04 Admin FAQ** | architect | 30분 | `docs/06-operations/03-admin-faq.md` §"게스트 방 rooms 누락" |

### 6.2 Sprint 7 backlog (W1 말까지)

| 항목 | 담당 | 소요 | 완료 기준 |
|------|------|------|----------|
| **WARN-01 race 방어** | go-dev + architect review | 2시간 | LeaveRoom PLAYING-block + 단위 race 테스트 / Go 689→691 |
| **WARN-02 confirm in-flight lock** | frontend-dev | 1시간 | GameClient.tsx in-flight state + Jest 2건 |

### 6.3 Sprint 7 Day 2~Week 1 (거부/연기)

- WARN-04 옵션 A/B (게스트 DB 기록) — **WONTFIX**. 필요 시점 도달까지 보류.

---

## 7. Rationale Summary

### 7.1 왜 WARN-03 만 FIX NOW 인가

- **비용 최소** (5~10분 패치) + **회귀 리스크 극소** (기존 동작에 Set-like 강화, 기존 테스트 모두 유지)
- **미래 회귀 방어**: 되돌리기/취소 기능이 Sprint 8+ 에 추가될 가능성이 Phase 1 UI roadmap 에 있음 → 선제적 방어가 효율적
- 다른 3건은 재현성이 낮거나 (WARN-01/02) 설계 의도 (WARN-04) 이므로 추가 분석 후 처리가 적절

### 7.2 왜 WARN-04 는 ADR 인가

- 설계 결정이 명시적으로 문서화되지 않은 상태 — "게스트 방은 DB 기록 안 함" 이 코드에만 존재
- 미래 운영팀/신규 개발자가 버그로 오해할 가능성 매우 높음 → ADR 로 고착
- Admin Dashboard 가 아직 DB rooms 를 조회하지 않으므로 **지금 기록하는 것이 저비용**

### 7.3 Confidence

- WARN-01 재현 가능성 판정: **HIGH** (코드 직접 검증)
- WARN-02 race window 크기 판정: **MEDIUM** (네트워크 RTT 변수)
- WARN-03 FIX NOW 권고: **HIGH** (수정 소비용 vs 미래 방어 가치 명확)
- WARN-04 WONTFIX 근거: **HIGH** (현 admin 코드 실측 확인)

---

## 8. References

- `docs/04-testing/71-pr41-42-regression-test-plan.md` §11.2 — WARN 원본
- `docs/04-testing/72-pr41-42-regression-test-report.md` — qa 실행 결과 (본 문서 작성 시점 기준 실행 완료 가정)
- `docs/02-design/31-game-rule-traceability.md` — V-07, V-13e (WARN-03 관련)
- `docs/02-design/30-error-management-policy.md` — INVALID_MOVE / FK 에러 정책
- `src/game-server/internal/service/room_service.go` — WARN-01 본체
- `src/game-server/internal/service/room_converter.go` — WARN-04 본체
- `src/frontend/src/hooks/useWebSocket.ts` — WARN-02 본체
- `src/frontend/src/store/gameStore.ts` — WARN-03 본체

---

## 9. 변경 이력

- **2026-04-22 v1.0**: architect 최초 작성 (WARN 4건 심각도 평가 + Action Plan)
