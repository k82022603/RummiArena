# 71. PR #41 / PR #42 Regression Test Plan

- **작성일**: 2026-04-22 (Sprint 7 D+1)
- **작성자**: architect (Opus 4.7 xhigh)
- **브랜치**: `test/pr41-42-regression-2026-04-22`
- **목적**: 2026-04-22 머지된 두 PR 의 regression surface 를 기존 자동화로는 검증되지 않은 지점까지 끌어올려 **사용자 실측 전에 Claude 가 먼저 발견**한다.
- **SSOT 준수**: `.claude/skills/ui-regression/SKILL.md`, `.claude/skills/pre-deploy-playbook/SKILL.md`, `docs/02-design/31-game-rule-traceability.md`
- **상태**: Plan (qa agent 실행 대기)

---

## 1. Context + Scope

### 1.1 오늘 머지 대상

| PR | 범위 | 위험 등급 |
|----|------|----------|
| **#41** `hotfix/frontend-p0-2nd-2026-04-22` — 커밋 `212947a` + `5a09a62` | I-18 롤백 (append 제거) + I-19 `handleConfirm` 차단 조건 교체 (`pendingRecoveredJokers.length > 0` → `pendingRecoveredJokers.filter(jk ∈ pendingMyTiles)`) | **HIGH** — `GameClient.tsx` 드래그 경로 + 확정 경로 동시 수정. Phase 0 금기 트리거 중 **handleConfirm 변경** 에 해당 |
| **#42** `feat/rooms-postgres-phase1-impl` — 커밋 `6acba15`/`34cce98`/`bee0511`/`c4c4f58`/`bf0a4f7`/`c8b1c2f` | `NewRoomService` 3-arg 확장 + 7개 mutation 지점 (Create/Join/Leave/Start/Finish/Cancel) Dual-Write + `persistGameResult(state, endType, roomID)` 시그니처 변경 + 17 call-site 마이그레이션 + FK 게스트 방어 | **MEDIUM** — best-effort 경로이므로 실패가 게임 흐름을 차단하지 않지만, `persistGameResult` 시그니처 변경은 **모든 게임 종료 경로**에 영향 |

### 1.2 검증 범위

- **In scope**: 두 PR 이 직접 수정한 경로 + 반사실적 체크리스트로 도출한 부수 경로 + 기존 유사 시나리오 회귀 가드
- **Out of scope**: LLM 프롬프트 품질, AI 대전 Round N 재실행, Istio East-West 회귀, E2E 전체 390건 재실행 (영향권만 선별)

### 1.3 왜 이 계획이 필요한가

- PR #41 자체가 **PR #37 의 핫픽스(I-2)가 거꾸로 동작하던 것을 되돌린 2차 핫픽스**다. 같은 경로에서 2회 연속 회귀 → 반사실적 체크리스트 필수.
- PR #42 는 `persistGameResult` 시그니처 변경으로 `ws_handler.go` 내 3개 call-site (`864`, `1626`, `2284`) 가 모두 영향. 단위/통합 테스트는 통과했지만 **실제 게임 종료 → DB 쓰기 → rows 존재** 의 E2E 실측은 devops smoke 5/5 밖에 없음.

---

## 2. Phase 0: Pre-flight (ui-regression §Phase 0)

### 2.1 PR #41 수정 파일 계층 분류

| 파일 | 계층 | 영향 |
|------|------|------|
| `src/frontend/src/app/game/[roomId]/GameClient.tsx` §895-912 (I-18) | GameClient — **모든 계층 + 드래그 회귀 고위험** | hasInitialMeld=false 경로 전환. 기존 append 블록 제거 → `treatAsBoardDrop` 폴스루 |
| `src/frontend/src/app/game/[roomId]/GameClient.tsx` §1126-1141 (I-19) | GameClient — 확정 경로 | `handleConfirm` 조건 교체. `pendingRecoveredJokers` 소비 기준이 "배치 여부" 로 변경 |
| `src/frontend/e2e/hotfix-p0-i1-pending-dup-defense.spec.ts` (신규) | E2E | 중복 감지 방어 |
| `src/frontend/e2e/hotfix-p0-i2-run-append.spec.ts` (재작성) | E2E | SC1/SC2 `srvRunHasY[27]=false` 로 재작성 |
| `src/frontend/e2e/hotfix-p0-i4-joker-recovery.spec.ts` (SC4/SC5 추가) | E2E | I-19 차단 로직 검증 |

### 2.2 PR #42 수정 파일 계층 분류

| 파일 | 계층 | 영향 |
|------|------|------|
| `src/game-server/internal/service/room_service.go` §51-117 + 7 mutation 지점 | service | Dual-Write 진입점, FK 게스트 방어 |
| `src/game-server/internal/service/room_converter.go` (신규) | service | `roomStateToModel` 변환 + UUID 검증 |
| `src/game-server/internal/repository/game_repository.go` (interface 확장) | repository | `CreateRoom`/`UpdateRoom` 계약 |
| `src/game-server/internal/handler/ws_handler.go` §864/1626/1917-1921/2284 | handler | `persistGameResult(state, endType, roomID)` 시그니처 + room_id FK 정상화 |
| `src/game-server/internal/main.go` wire-up | bootstrap | `NewRoomService(roomRepo, gameStateRepo, pgGameRepo)` 3-arg |
| `src/game-server/e2e/rooms_persistence_test.go` (신규, 통합 3건) | test | HTTP 경계 Dual-Write |
| `src/game-server/internal/service/room_service_test.go` (단위 5건 추가) | test | mock pgRepo 호출 시퀀스 |
| `scripts/verify-rooms-persistence.sh`, `scripts/smoke-rooms-phase1.py` | ops | DB 실측 |

### 2.3 반사실적 체크리스트 (필수)

#### I-18 롤백이 영향 줄 수 있는 다른 경로 3개

- [ ] **CF-I18-A**: `hasInitialMeld=true` 상태에서 서버 런 append — **정상 경로 유지**되어야 함. §856-895 분기는 건드리지 않았으나 변수 `targetServerGroup` 이 `treatAsBoardDrop` 조건에 여전히 등장하므로 회귀 우려.
- [ ] **CF-I18-B**: **조커 swap 경로** — 서버 확정 런에 실제 타일을 드롭하는 경우 (I-4 시나리오). hasInitialMeld=true 에서 tryJokerSwap 호출이 여전히 올바르게 발동하는지. I-18 롤백은 hasInitialMeld=false 경로에 한정되지만 `targetServerGroup` 식별 로직은 공유됨.
- [ ] **CF-I18-C**: **게임 보드 빈 공간 드롭** (`over.id === "game-board"`) — 기존 동작 유지 확인. `treatAsBoardDrop` OR 조건에 변화 없음.
- [ ] **CF-I18-D (추가)**: **pending-* 접두사 그룹 드롭** — `pendingOnlyGroups.filter(g => g.id.startsWith("pending-"))` 경로 회귀 금지.

#### I-19 조건 교체가 영향 줄 수 있는 다른 경로 3개

- [ ] **CF-I19-A**: **조커 2장 회수** — `pendingRecoveredJokers = ["JK1", "JK2"]` 인데 1장만 배치된 경우. `filter(jk ∈ pendingMyTiles)` 로 1장 남으면 여전히 차단. 엣지 케이스 명시 필요.
- [ ] **CF-I19-B**: **조커 회수 후 rack 정렬** — `handleRackSort` (§1106-1115) 가 pendingMyTiles 를 재배열할 때 JK 위치가 바뀌어도 `.includes()` 판정은 동일해야 함.
- [ ] **CF-I19-C**: **TURN_END WS 수신 → resetPending** — 서버가 확정 성공 시 `pendingRecoveredJokers` + `pendingMyTiles` 모두 null/[] 로 리셋되는지. I-19 조건 교체는 `handleConfirm` 내부만 건드렸지만, race 시 확정 중 WS 이벤트가 오면 어떤 상태가 되는가.
- [ ] **CF-I19-D (추가)**: **미배치 조커 + 유효하지 않은 블록 동시** — 1번째 블록 3장 미만 + 미배치 조커 존재 시 어느 에러 메시지가 먼저 뜨는가. Early-return 순서 중요 (조커 체크 먼저).

#### rooms Dual-Write 실패 시 영향 경로

- [ ] **CF-R-A**: **JoinRoom race** — 동시에 2명이 join 요청 시 메모리 repo 는 mutex 로 직렬화되지만 pgRepo 호출은 병렬화됨. `createRoomCalls` vs `updateRoomCalls` 순서가 메모리와 일치하는지.
- [ ] **CF-R-B**: **LeaveRoom during StartGame** — StartGame 직전 LeaveRoom 이 오면 메모리는 LEAVE 먼저 반영, pgRepo 는 best-effort 이므로 실패 가능. 게임 진행은 계속 — 단 rooms.players JSONB 가 stale.
- [ ] **CF-R-C**: **비-UUID HostID (게스트)** — `isValidUUIDStr` false 시 스킵. 게스트는 UI 에서 아예 방을 못 만들지만 API 직접 호출 시 `roomStateToModel` 이 nil 반환. 회귀 가드 필요.
- [ ] **CF-R-D (추가)**: **PG 3초 context timeout** — `context.WithTimeout(3*time.Second)` — 3초 초과 시 best-effort 로그만 남고 게임 진행 유지. WS 흐름 차단 금지.
- [ ] **CF-R-E (추가)**: **`persistGameResult` roomID 빈 문자열** — 방 정보 없이 게임 종료 시 `roomIDPtr=nil` → games.room_id NULL. 스키마상 NOT NULL 이면 INSERT 실패. 기존 ws_handler §1955-1959 분기에서 방어됨을 재확인.

### 2.4 금기 트리거 감지

| 트리거 | 발동 여부 | 대응 |
|--------|----------|------|
| dnd-kit `collisionDetection` 변경 | ❌ 해당 없음 (Day 11 A3 `pointerWithinThenClosest` 이미 적용, 이번 PR 미수정) | skip |
| `classifySetType` / `isCompatibleWithGroup` 수정 | ❌ 해당 없음 | skip |
| `handleDragEnd` 내 분기 추가/수정 | ✅ **발동** — §895-912 append 블록 제거 = 분기 수정 | Phase 2 Integration 필수, Phase 3 E2E 필수 |
| `handleConfirm` 변경 | ✅ **발동** — §1126-1141 차단 조건 교체 | Jest 단위 + E2E 모두 의무 |
| `persistGameResult` signature 변경 | ✅ **발동** — `ws_handler.go` 3개 call-site 영향 | 단위 `ws_persist_test.go` 재실행 + 게임 1판 완주 후 games 테이블 확인 |

**Phase 0 게이트**: 위 4개 항목 모두 표시되었으므로 이후 Phase 전부 실행 의무.

---

## 3. 게임룰 추적성 매핑 (`docs/02-design/31`)

| 규칙 ID | 수정 관련성 | 본 계획에서의 검증 경로 |
|---------|-----------|---------------------|
| **V-04** 최초 등록 30점 이상 | **PR #41 I-18 핵심** — I-2 핫픽스가 이 규칙을 우회하게 만들어 서버 V-04 거절 + 패널티 3장 유발. 롤백 후 V-04 가 클라이언트 레이어에서 **사전 회피** (append 금지 → 새 그룹 분리) | REG-PR41-I18-01/02/03 |
| **V-05** 최초 등록 시 랙 타일만 사용 | I-18 롤백이 V-05 간접 경로 — 서버 런(테이블) 에 rack 타일을 append 하는 것은 V-05 위반 유발 소지 | REG-PR41-I18-02 간접 |
| **V-07** 조커 교체 후 즉시 사용 | **PR #41 I-19 핵심** — 회수된 조커가 같은 턴에 재배치되지 않고 확정되는 것을 차단하는 UI 레이어. 엔진 V-07 과 **이중 방어** 관계 | REG-PR41-I19-01/02/03 + CF-I19-A (조커 2장) |
| **V-13e** 조커 교체 재배치 유형 | I-19 수정이 V-13e UI 경로의 데드락 해소 | REG-PR41-I19-01 |
| **V-08** 자기 턴 검증 | PR #42 로 game_events 에 turn 기록이 rooms.id FK 에 연결되는 경로 정상화 | REG-PR42-DB-01 |
| **V-12** 승리 조건 | `persistGameResult` 가 정상 승리 종료 시 호출되는 경로. 시그니처 변경 회귀 | Pre-deploy Playbook Phase 2.3 확정 |

---

## 4. 테스트 계층 전략

### 4.1 Layer 1 — Unit (Jest)

**대상**: 프론트엔드 `src/frontend/src/lib/` · `src/frontend/src/store/`

- `gameStore.ts` — `removeRecoveredJoker` / `clearRecoveredJokers` selector (기존 테스트 존재 여부 확인 의무)
- 신규 **unplacedRecoveredJokers 계산 함수** — 만약 `handleConfirm` 내부 인라인이라면 pure function 으로 추출하여 단위 테스트 가능 여부 검토 (qa 판단)

**커맨드**:

```bash
cd src/frontend && npm test -- --testPathPatterns="gameStore|tileState"
```

**성공 기준**: 100% PASS (현재 182/182 유지) + 신규 시나리오 시 2건 이상 추가.

### 4.2 Layer 2 — Integration (Go + Jest)

**Go — PR #42 Dual-Write**:

```bash
cd src/game-server && go test ./internal/service/... ./e2e/... -run "TestRoom|TestDualWrite|TestRoomsPersistence" -v
```

- **이미 존재**: `room_service_test.go` 단위 5건 + `e2e/rooms_persistence_test.go` 통합 3건. 본 계획은 **추가 없이 회귀 확인만**.
- **추가 고려**: `CF-R-A/B/C/D/E` 중 E2E 커버되지 않은 race 케이스는 qa 판단으로 단위 추가 검토.

**Jest — PR #41**:

```bash
cd src/frontend && npx jest --testPathPatterns="integration|handleDragEnd|gameStore"
```

**성공 기준**: Go 689 + Jest 182 유지. 신규 통합 0건 (기존 커버리지로 충분, qa 가 부족 판단 시 즉시 추가).

### 4.3 Layer 3 — E2E (Playwright) — **주 검증 계층**

신규 스펙: `src/frontend/e2e/regression-pr41-i18-i19.spec.ts` — 총 **9 시나리오** (§5 상세).

**커맨드**:

```bash
cd src/frontend
npx playwright test e2e/regression-pr41-i18-i19.spec.ts --workers=1 --reporter=list
# 영향권 전체:
npx playwright test e2e/hotfix-p0-*.spec.ts e2e/rearrangement.spec.ts e2e/day11-*.spec.ts --workers=2
```

**성공 기준**: 신규 9건 100% PASS + 영향권 기존 spec 98%+ PASS.

### 4.4 Layer 4 — Pre-deploy Playbook (실 게임 완주)

**대상**: `pre-deploy-playbook.spec.ts` 기본 흐름 확장 — 2인전 Ollama vs Human 1게임 완주.

- 로그인 → 방 생성 (2인전 / AI=Ollama LLaMA / 난이도 하수 / 턴 120s)
- 게임 시작 → 최초 등록 → **조커 회수 → 재배치 → 확정** 최소 1회 포함
- 종료 후 games 테이블 row 존재 + room_id NOT NULL 확인

**커맨드**:

```bash
cd src/frontend && npx playwright test e2e/pre-deploy-playbook.spec.ts --workers=1 --reporter=list
# 이후:
kubectl exec -n rummikub deploy/postgres -- psql -U rummikub -d rummikub -c \
  "SELECT id, room_id, status, turn_count FROM games ORDER BY ended_at DESC LIMIT 3;"
```

**성공 기준**: 게임 완주 + games row 1건 신규 + room_id 가 방금 만든 room 과 일치.

**Ollama cold start 대응**: Playbook 실행 전 warmup 필수 (SKILL §Phase 2.2).

### 4.5 Layer 5 — DB 실측 (K8s PostgreSQL)

**대상**: PR #42 Dual-Write 종단간 검증.

**커맨드**:

```bash
bash scripts/verify-rooms-persistence.sh  # 기존 스크립트 재실행
# 또는 수동:
kubectl exec -n rummikub deploy/postgres -- psql -U rummikub -d rummikub <<SQL
SELECT COUNT(*) AS rooms_count FROM rooms WHERE created_at > NOW() - INTERVAL '1 hour';
SELECT id, room_id, status FROM games WHERE ended_at > NOW() - INTERVAL '1 hour';
SELECT room_id, seat_order, user_id FROM game_players WHERE created_at > NOW() - INTERVAL '1 hour';
SQL
```

**성공 기준**: rooms row ≥ 1건 + games.room_id NOT NULL + FK 연결 정상.

---

## 5. Playwright E2E 신규 시나리오 상세 명세

파일: `src/frontend/e2e/regression-pr41-i18-i19.spec.ts` (신규, 9 시나리오)

### REG-PR41-I18-01 — hasInitialMeld=false 런 앞쪽 드롭 회귀 가드

- **목적**: I-18 롤백 후 서버 run `[Y3-Y6]` 앞에 Y2 드롭 → append 금지 + 새 그룹 분리
- **사전 조건**: auth.json 로그인 / `__gameStore` 주입 `{hasInitialMeld:false, myTiles:["Y2a","B8a","K11a"], tableGroups:[{id:"srv-run-yellow",tiles:["Y3a","Y4a","Y5a","Y6a"]}]}`
- **조작**: `dndDrag(y2, y3Anchor)` → `page.waitForTimeout(500)`
- **기대**: `srvRunHasY2=false` + `srvRunTiles.length=4` + `y2InAnyGroup=true` + `groupCount=2`
- **관련**: V-04, hotfix-p0-i2 SC1 과 중복이나 **신규 스펙에 독립 확보** (파일 분리 시 독립 실행 가능성)
- **참고**: 기존 `hotfix-p0-i2-run-append.spec.ts` SC1 과 동일 — 본 계획은 해당 기존 3건 + I-19 신규 4건을 **통합 스펙 파일로 재배치 금지** (기존 유지). 단 CF 추가 케이스 2건은 신규 파일에 작성.

> **qa 주의**: 기존 SC1/SC2/SC3 재실행으로 충분하면 REG-PR41-I18-01/02/03 은 skip 가능. `architect` 판단: **새 스펙 파일은 CF 추가 케이스 중심**으로 작성.

### REG-PR41-I18-04 (신규) — CF-I18-A hasInitialMeld=true 서버 런 append 반사실

- **목적**: I-18 롤백이 hasInitialMeld=**true** 경로를 깨지 않는지 확인
- **사전 조건**: `hasInitialMeld:true`, 나머지 SC1 동일
- **조작**: `dndDrag(y2, y3Anchor)`
- **기대**: `srvRunHasY2=true` + `srvRunTiles.length=5` + `groupCount=1` (append 정상)
- **관련**: V-13b 재배치 유형 1 간접

### REG-PR41-I18-05 (신규) — CF-I18-C game-board 빈 공간 드롭 반사실

- **목적**: `over.id === "game-board"` OR 경로 회귀 방지
- **사전 조건**: `hasInitialMeld:false`, rack=["R7a","R8a","R9a"], 서버 그룹 없음
- **조작**: rack R7 → 빈 game-board 중앙 드롭
- **기대**: 새 pending 그룹 1개 + R7a 포함 + rack 에서 제거
- **관련**: BUG-NEW-001 회귀

### REG-PR41-I19-01 (신규) — CF-I19-A 조커 2장 중 1장 미배치 → 차단 유지

- **목적**: `pendingRecoveredJokers=["JK1","JK2"]` 에서 JK1 만 배치하면 여전히 차단되어야 함
- **사전 조건**:
  - `pendingRecoveredJokers: ["JK1","JK2"]`
  - `pendingMyTiles: ["JK2","B8a"]` (JK2 미배치, JK1 은 이미 배치됨)
  - `pendingTableGroups: [..., {id:"pending-new", tiles:[...JK1 포함]}]`
- **조작**: 확정 버튼 클릭 (`page.locator('[aria-label="턴 확정"]').click()`)
- **기대**: `ErrorToast` "회수한 조커(JK)를 같은 턴에 다른 세트에 사용해야 합니다" 표시 + WS 전송 안 됨
- **관련**: V-07, 엣지 케이스 2장 조커

### REG-PR41-I19-02 (신규) — CF-I19-A 조커 2장 모두 배치 → 확정 성공

- **목적**: 2장 모두 `pendingMyTiles` 에서 제거되면 `unplacedRecoveredJokers.length=0` → 차단 해소
- **사전 조건**:
  - `pendingRecoveredJokers: ["JK1","JK2"]`
  - `pendingMyTiles: ["B8a","Y10a"]` (둘 다 미포함 = 둘 다 배치됨)
- **조작**: 확정 버튼 클릭
- **기대**: ErrorToast 미발생 + `CONFIRM_TURN` WS 송신 (network intercept 또는 store side-effect 관찰)
- **관련**: V-07 + V-13e

### REG-PR41-I19-03 (신규) — CF-I19-B rack 정렬 후에도 조커 판정 정확

- **목적**: `handleRackSort` 로 pendingMyTiles 순서가 바뀌어도 `.includes()` 로 여전히 정확 판정
- **사전 조건**: `pendingRecoveredJokers: ["JK1"]`, `pendingMyTiles: ["JK1","R2a","R3a"]`
- **조작**: rack 정렬 버튼 클릭 → JK1 위치 끝으로 이동 → 확정 클릭
- **기대**: 여전히 차단 (JK1 이 rack 에 그대로 있음)
- **관련**: 쏘트 side-effect 회귀

### REG-PR41-I19-04 (신규) — CF-I19-D 미배치 조커 + 유효하지 않은 블록 공존 → 조커 에러 우선

- **목적**: Early-return 순서 확인 — 조커 체크(§1135-1143) 가 블록 유효성 체크(§1147-1185) 보다 먼저
- **사전 조건**:
  - `pendingRecoveredJokers: ["JK1"]`, `pendingMyTiles: ["JK1"]`
  - `pendingTableGroups: [..., {id:"pending-new", tiles:["R2a","R3a"]}]` (2장 = 유효하지 않음)
- **조작**: 확정 클릭
- **기대**: 에러 메시지는 "회수한 조커(JK)..." (블록 유효성 에러 아님) + `invalidPendingGroupIds` 빈 Set
- **관련**: UX 일관성

### REG-PR42-DB-01 (신규) — rooms HTTP create → DB row 실측

- **목적**: PR #42 Dual-Write 의 종단간 (HTTP → 서비스 → 메모리 + PG) 검증
- **사전 조건**: K8s PostgreSQL 가동 중
- **조작**:
  1. `POST /api/rooms` (auth token + body `{playerCount:2, aiPlayers:[{type:"AI_LLAMA",persona:"rookie"}]}`)
  2. `kubectl exec ... psql -c "SELECT ... FROM rooms WHERE id = '<roomID>'"`
- **기대**: rooms row 1건 존재 + `host_id` = 로그인 유저 UUID + `status = 'WAITING'`
- **구현 방식**: Playwright API request 대신 **bash extension** 권고 — `scripts/verify-rooms-persistence.sh` 이미 존재하므로 **해당 스크립트 실행으로 대체**. 신규 spec 작성 불필요.

> **결론**: REG-PR42-DB-01 은 **bash 스크립트 재실행** + Playbook Phase 5 DB 실측으로 커버. Playwright 신규 spec 작성 불가피할 때만 추가.

### 신규 시나리오 총계

- **Playwright 신규 spec 에 작성**: **7건** (REG-PR41-I18-04, I18-05, I19-01, I19-02, I19-03, I19-04 + 1건 유보)
- **기존 spec 재실행으로 커버**: REG-PR41-I18-01/02/03 (hotfix-p0-i2-run-append.spec.ts SC1/2/3)
- **bash 스크립트로 커버**: REG-PR42-DB-01
- **최종 신규 Playwright 시나리오**: **6~7건** (7번째는 qa 판단)

---

## 6. Regression 체크리스트 (기존 기능 비영향 검증)

### 6.1 `docs/04-testing/65-day11-ui-scenario-matrix.md` 영향권 재실행

다음 Day 11 매트릭스 항목들이 `handleDragEnd` / `handleConfirm` 변경의 영향권:

| Day 11 ID | 시나리오 | 재실행 필요 | 이유 |
|-----------|---------|-------------|------|
| **A3** | pointerWithinThenClosest collision detection | ✅ 필요 | handleDragEnd 변경 인접 |
| **A4** | 토스트 에러 메시지 | ✅ 필요 | handleConfirm 에서 토스트 발화 |
| **A5** | aria-label 정확성 | ⚠️ 선택 | DOM 구조 미변경 |
| **A6** | hasInitialMeld=true 빈 공간 드롭 (3 시나리오) | ✅ 필요 | I-18 반사실과 직접 관련 |
| **G-1~G-12** | Day 11 UI 대규모 수정 12건 | ⚠️ 선택 | 대부분 별도 파일, 영향권 외 |
| **H-1~H-3** | 실측 버그 | ⚠️ 선택 | H-2 가 조커 관련이면 필요 |

**영향권 재실행 필요 건수**: 3건 확정 (A3, A4, A6 = 3+3+3 = 약 **9 시나리오** 재실행) + 선택 영역.

### 6.2 영향권 spec 파일

```bash
npx playwright test \
  e2e/day11-ui-bug-fixes.spec.ts \
  e2e/hotfix-p0-i1-pending-dup-defense.spec.ts \
  e2e/hotfix-p0-i2-run-append.spec.ts \
  e2e/hotfix-p0-i4-joker-recovery.spec.ts \
  e2e/rearrangement.spec.ts \
  --workers=2
```

---

## 7. Pre-deploy Playbook 시나리오 (필수)

**SKILL**: `pre-deploy-playbook` Phase 2 완주 + 본 계획 특화 추가

| 단계 | 동작 | 성공 기준 (selectors / state) | 실패 시 abort |
|------|------|-----------------------------|----------------|
| 1 | 로그인 | `/lobby` 200 + `[data-testid="lobby-room-list"]` 렌더 | Phase 1 fail |
| 2 | 방 생성 (2인 / Ollama / rookie / 120s) | POST /api/rooms 200 + 방 ID 수신 | Phase 2.2 fail |
| 3 | 게임 시작 | WS GAME_START + `data-testid="game-board"` 렌더 | Phase 2.3 fail |
| 4 | 초기 등록 (30점+) | `CONFIRM_TURN` 성공 + `hasInitialMeld=true` | V-04 회귀 |
| 5 | **조커 회수** | 서버 런 [R5,JK1,R7] 에 R6 드롭 → JK1 이 랙에 append | **I-19/V-07 핵심 검증** |
| 6 | **조커 재배치** | JK1 → 다른 pending 그룹 드롭 → pendingMyTiles 에서 제거 | I-4 회귀 |
| 7 | **확정** | 확정 버튼 클릭 → `CONFIRM_TURN` WS → 성공 | **I-19 핵심** — 차단 해소 확인 |
| 8 | 10턴 이상 진행 | turn counter 증가 | 게임 흐름 회귀 |
| 9 | 게임 종료 (승리 or FORFEIT) | `game_ended` WS + GameEndedOverlay | V-12 |
| 10 | **DB 확인** | games row 1건 + room_id = Phase 2 roomID | **PR #42 핵심** |

**abort 조건**: 5, 7, 10 단계 중 하나라도 실패 시 즉시 NO-GO + qa 리포트에 반영.

**Ollama 비용**: $0, 소요 시간 예상 5~10분 (cold start 별도 +50s).

---

## 8. 실행 순서 & 예상 시간

| # | Layer | 커맨드 요약 | 시간 |
|---|-------|----------|------|
| 1 | Phase 0 pre-flight | `git diff --stat` 확인 + 본 문서 체크리스트 4개 항목 확인 | 3m |
| 2 | Layer 1 Unit | `npm test` (frontend Jest 182건) | 3m |
| 3 | Layer 2 Integration (Go) | `go test ./internal/service/... ./e2e/...` | 4m |
| 4 | Layer 3 E2E 신규 | `npx playwright test e2e/regression-pr41-i18-i19.spec.ts` | 8m |
| 5 | Layer 3 E2E 영향권 | `npx playwright test e2e/hotfix-p0-*.spec.ts e2e/day11-*.spec.ts` | 10m |
| 6 | Layer 4 Pre-deploy Playbook | `npx playwright test e2e/pre-deploy-playbook.spec.ts` + Ollama warmup | 8m |
| 7 | Layer 5 DB 실측 | `bash scripts/verify-rooms-persistence.sh` + psql 수동 확인 | 3m |
| 8 | Report 작성 | qa 가 `docs/04-testing/72-*.md` 작성 | 5m |

**합계**: **약 44분** (정상 흐름). 재시도/디버깅 포함 시 **60분** 예산.

---

## 9. 성공 기준 / 실패 조건 / 결과 분류

### 9.1 판정 기준

| 판정 | 조건 |
|------|------|
| **GO (PASS)** | 신규 7건 Playwright 100% + 영향권 spec 98%+ + Go 689 유지 + Jest 182 유지 + Playbook 10단계 완주 + DB 실측 games.room_id NOT NULL |
| **CONDITIONAL GO** | 신규 100% + 영향권 95~97% (flaky 재시도 후 PASS) + Playbook 완주 | real failure 0 확인 |
| **NO-GO (FAIL)** | 신규 1건 이상 실패 OR 영향권 real failure OR Playbook 5/7/10단계 실패 OR DB row 누락 |

### 9.2 실패 분류 (ui-regression §4.3)

- **로직 오류** — I-18 / I-19 수정 자체의 버그 → Dev 재수정
- **계층 분산 누락** — handleDragEnd 의 다른 분기가 같은 규칙 위반 → architect 에 위임
- **Race condition** — WS ↔ UI 이벤트 순서 → 재현 후 시나리오 추가
- **dnd-kit 특화** — 좌표·충돌 → 드래그 재현 영상 저장
- **프롬프트 명세 부족** — 본 계획의 엣지 케이스 누락 → architect 에 피드백

---

## 10. Deliverables for qa agent

### 10.1 파일 생성 리스트

1. **신규 Playwright spec**: `src/frontend/e2e/regression-pr41-i18-i19.spec.ts`
   - 6~7 시나리오 (§5 명세 반영)
   - `__gameStore` bridge 주입 패턴은 기존 `hotfix-p0-i4-joker-recovery.spec.ts` 재사용
   - `afterEach` 에 `cleanupViaPage` 필수
2. **신규 bash 스크립트 (선택)**: `scripts/verify-rooms-persistence.sh` 이미 존재 → 재실행으로 대체
3. **qa 리포트 (필수)**: `docs/04-testing/72-pr41-42-regression-test-report.md`
   - Phase별 실행 결과
   - 판정 (GO/CONDITIONAL/NO-GO)
   - flaky 재시도 이력
   - 신규 시나리오 전환 후보 (실측 발견 시)

### 10.2 qa 에게 넘길 때 주의사항

1. **`handleConfirm` 변경은 금기 트리거** — §2.4 에 표시된 대로 Jest + E2E **둘 다** 의무. skip 금지.
2. **Ollama cold start** — Playbook 실행 전 warmup curl 먼저 (`pre-deploy-playbook` SKILL §2.2).
3. **조커 2장 엣지** (REG-PR41-I19-01) 는 본 계획에서 **처음 도입**된 시나리오 — 실패 시 Dev 에이전트 spawn 필요성 즉시 판단.

---

## 11. Tradeoffs / Flagged Concerns

### 11.1 의도적 범위 제한

- **REG-PR42-DB-01 을 Playwright 로 안 만들고 bash 로 대체**: 이미 `verify-rooms-persistence.sh` + `smoke-rooms-phase1.py` 존재. 중복 방지.
- **`pendingRecoveredJokers` 와 `pendingMyTiles` 간 계산을 pure function 추출 여부**: 본 계획은 추출하지 않음 — `handleConfirm` 내 inline `filter` 로 유지. 장기적으로 추출 권고 (Sprint 7 후속).
- **Day 11 A5/G-1~G-12/H-1~H-3 재실행을 "선택" 으로 표시**: 영향권 최소화. qa 판단 시 추가 실행 권장.

### 11.2 Flagged Concerns

- **WARN-01 (CF-R-B)**: `LeaveRoom during StartGame` 케이스는 본 계획에 단위 테스트로도 커버되지 않음. mock pgRepo race 시뮬레이션은 Phase 1 범위 밖. Sprint 7 backlog 등록 권고.
- **WARN-02 (CF-I19-C)**: `TURN_END` WS 수신 race 는 현재 Playwright 에서 재현 까다로움. gameStore mock 주입으로 간접 검증만 가능. 실제 서버 응답 간섭 재현 → Sprint 7 후속.
- **WARN-03**: `pendingRecoveredJokers` 배열이 **중복 push** 될 가능성 (조커 회수 → 배치 → 되돌리기 → 다시 배치) 시 `.filter(.includes)` 가 중복 항목에 대해 1번만 체크. 실제 증상 없으나 방어적 검토 권고.
- **WARN-04**: PR #42 의 `roomStateToModel` 은 UUID 검증 실패 시 nil 반환 — 게스트는 rooms 에 아예 기록 안 됨 → Admin 대시보드 "모든 방 목록" 에 게스트 방이 표시 안 되는 UX 차이 발생. 이는 **설계 의도**이나 문서화 필요 (Admin 관점 FAQ).

### 11.3 Confidence

- **신규 9 시나리오 명세**: HIGH — 실제 수정된 §895-912 / §1126-1141 코드 읽고 작성
- **Pre-deploy Playbook 10단계**: MEDIUM — Ollama cold start 변수 존재
- **DB 실측 Layer 5**: HIGH — 기존 smoke 5/5 PASS 확인됨

---

## 12. 변경 이력

- **2026-04-22 v1.0**: architect 최초 작성 (PR #41 + #42 머지 직후)
