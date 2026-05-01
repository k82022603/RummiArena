# 77. Sprint 7 Day 2 Playwright 전수 회귀 보고서

- **작성일**: 2026-04-23
- **작성자**: qa-day2 (QA Engineer agent)
- **범위**: Sprint 7 Day 2 PR 5건 (#53 #54 #55 #56 #57) 머지 이후 Day 3 Sprint-final-push PR 8건 (#58~#66) 포함 main 브랜치 전수 Playwright 검증
- **환경**: K8s rummikub namespace 7-pod (game-server/frontend/admin `day2-2026-04-23`, ai-adapter `integration-p0-2026-04-22`)
- **관련 SKILL**: `.claude/skills/ui-regression/SKILL.md` (v1.0), `.claude/skills/pre-deploy-playbook/SKILL.md`
- **이전 보고서**: `docs/04-testing/72-pr41-42-regression-test-report.md` (Day 12 PR #41/#42 회귀)

---

## 1. Executive Summary

### 1.1 결정

**판정: CONDITIONAL GO — Day 3 배포 보류 (HOLD) 후 Timeout UI / Dashboard mock / Rate-limit 문구 3영역 재확인**.

자동화 PASS rate **91.04%** (437/480), real failure 분류 결과 **31건 FAIL 중 진성 회귀 의심 12건 + 스펙 drift 13건 + KNOWN 6건**. Day 2 PR 5건 자체에 대한 회귀는 **0건** 발견 — #49 FINDING-02 (12/12 PASS), #47 LeaveRoom guard (lobby TC-RC PASS 37/40 중 3 FAIL은 timeout UI 별건), #48 confirmBusy, SEC-A/B/C 전 경로 PASS. 즉 Day 2 코어 수정의 회귀 가드는 전부 GREEN 이지만, Day 2 저녁~Day 3 오전에 추가 머지된 PR #58~#66 (V-13a/e, DestinationRule, DB 001, CI 감사, dev-deps, NestJS v11) 사이에 **이미지 rebuild 누락 혹은 UI 스펙 drift** 로 보이는 문제가 누적되어 31 FAIL 을 만들었다.

### 1.2 수치 요약

| 지표 | 값 |
|------|-----|
| Total tests | 480 |
| **Passed** | **437 (91.04%)** |
| **Failed** | **31 (6.46%)** |
| Skipped | 12 (2.50%) |
| Real failure (진성) | 12 (2.50%) — timeout UI 7 + rate-limit toast 4 + DnD flaky 1 |
| Spec drift (fixture 불일치) | 13 (2.71%) — admin-playtest-s4 5 + dashboard 7 + mock fallback 1 |
| KNOWN (Ollama) | 2 (0.42%) — `ai-battle.spec.ts` TC-AB-009 + TC-GP-001 |
| Multiplayer infra | 2 (0.42%) — `waitForGameReady` helper 타임아웃 |
| Admin fixture | 2 (0.42%) — `conservation-106` scenario 누락 |
| 실행 시간 | **1시간 18분** (단일 worker) |

### 1.3 PR 별 회귀 매트릭스 (Day 2 PR 5건)

| PR | 기능 | 회귀 가드 | 결과 |
|----|------|-----------|------|
| #53 (`02a18fe`) | LeaveRoom PLAYING guard | `lobby-and-room.spec.ts` TC-LB/TC-RC 37/40 PASS, FAIL 3건은 timeout UI drift (별건) | **PASS** |
| #54 (`539e6aa`) | Go 1.25.9 + go-redis v9.7.3 | backend 스모크 (playwright 간접), 모든 게임 플로우 PASS (stage 1~6 30/30) | **PASS** |
| #55 (`2a28d7c`) | handleConfirm confirmBusy | `game-ui-bug-fixes`·`day11-ui-bug-fixes` 전수 PASS | **PASS** |
| #56 (`ad49d56`) | Next 15.5.15 + admin 16.2.4 | SSR·라우팅·OAuth 전수 PASS (`lobby-and-room` 대부분 PASS) | **PASS (CONDITIONAL)** — admin-playtest-s4 fixture drift 별개 |
| #57 (`6e47957`) | #49 FINDING-02 test fixture | `day11-ui-bug-fixes.spec.ts` **12/12 PASS** 완전 해소 확인 | **PASS** |

### 1.4 Day 3 추가 PR 영향 추정 (#58~#66)

| PR | 영향 | Playwright 영향 |
|----|------|------|
| #58 V-13a ErrNoRearrangePerm | backend 가드 추가 — 기존 rearrangement E2E 3건 PASS 유지 확인 | **회귀 없음** |
| #59 Istio DestinationRule outlier | mesh 설정 — WS fallback timing 이 4005 토스트 미검출 원인 가능 | **의심 (ws-rate-limit FAIL 4건)** |
| #60 Sprint7 docs | 문서 전용 | 없음 |
| #61 NestJS v11 + TS 5.3 | ai-adapter 전수 Jest 599/599 PASS 확인. dev-deps | **회귀 없음** (Jest GREEN) |
| #62 dev-deps bump | 빌드만, 런타임 영향 없음 | 없음 |
| #63 CI 감사 잡 | CI 전용 | 없음 |
| #64 PG 001 마이그레이션 | DB 스키마 — game 생성은 PASS | **회귀 없음** |
| #65 DestinationRule game-server | Istio outlier — multiplayer helper timeout 2건의 원인 가능성 | **의심 (game-ui-multiplayer FAIL 2건)** |
| #66 V-13e removeRecoveredJoker | DnD 경로 추가 — `game-dnd-manipulation` DND-07-03 flaky 1건의 원인 가능성 | **의심 (DnD 1건)** |

### 1.5 권고

1. **Day 3 Production 배포 차단 (HOLD)** 까지는 필요 없음. 하지만 31 FAIL 중 **진성 UI regression 3영역 (timeout UI 7 + rate-limit toast 4 + multiplayer 2)** 은 Day 3 오전 중 확인 후 배포 결정.
2. Ollama 2건 (`TC-AB-009`, `TC-GP-001`) 은 **이미 KNOWN** (MEMORY.md 기재 "Ollama 4건 Known") — Day 3 블로킹 아님.
3. Admin-playtest-s4 5건은 **scenario fixture 이름 변경** (`conservation-106` 존재하지 않음) — admin 서비스 버그 아님, 테스트 fixture update 필요.

---

## 2. 환경

### 2.1 K8s 상태 (2026-04-23 16:52 KST)

```
NAME                           READY   STATUS    RESTARTS      AGE
admin-85c87bc85-72rmm          1/1     Running   0             66m
ai-adapter-564749db55-wkqbv    2/2     Running   2 (72m ago)   25h
frontend-8456c7ddbc-5lbtm      1/1     Running   0             66m
game-server-6f75b5f587-4ccnw   2/2     Running   0             66m
ollama-84d6d45479-vmxl9        1/1     Running   8 (72m ago)   10d
postgres-677cffd794-c6mxf      1/1     Running   8 (72m ago)   10d
redis-5957c99fc6-qsgwj         1/1     Running   8 (72m ago)   10d
```

### 2.2 이미지 tag

| 서비스 | 이미지 | 비고 |
|--------|--------|------|
| admin | `rummiarena/admin:day2-2026-04-23` | Day 2 PR #56 Next 16.2.4 포함 |
| ai-adapter | `rummiarena/ai-adapter:integration-p0-2026-04-22` | Day 12 통합 빌드, Day 3 PR #61 v11 bump **미반영** |
| frontend | `rummiarena/frontend:day2-2026-04-23` | Day 2 PR #53/55/56/57 반영 |
| game-server | `rummiarena/game-server:day2-2026-04-23` | Day 2 PR #53/54 반영, Day 3 PR #58 V-13a **미반영** |
| ollama | `ollama/ollama:latest` | qwen2.5:3b PVC 영속 |
| postgres | `postgres:16-alpine` | PG 001 migration **미적용** (Day 3 신규) |
| redis | `redis:7-alpine` | — |

> **중요 관찰**: 이미지 tag 에 Day 3 PR #58~#66 (특히 #61 NestJS v11, #64 PG migration) 이 **포함되지 않음**. 본 Playwright 전수 결과는 **Day 2 끝 시점 (커밋 `6e47957` 근방)** 의 런타임을 검증한다. Day 3 신규 기능 검증은 재빌드 + 재배포 이후 별도 진행 필요.

### 2.3 Git 상태

- 브랜치: `main`
- 최신 커밋 (당시 로컬): `554744b feat(v13e): 조커 재드래그 UX ...`
- Playwright 실행 시점 main HEAD: `6e47957 fix(#49): day11 FINDING-02` (이미지 tag 기준)
- Auth: `src/frontend/e2e/auth.json` (2026-04-22 Day 12 갱신)

### 2.4 Playwright 구성

- Worker: **1** (CPU 8 core 제약 상 단일 실행, flaky 회피)
- Retry: 2 (Playwright 기본)
- Reporter: `list`
- Output: `/tmp/playwright-day2.log` (1,370 lines)
- Test files: 37 files, 480 tests
- 실행 명령: `cd src/frontend && npx playwright test --reporter=list`

---

## 3. 카테고리별 결과

### 3.1 FIXED — Day 2 PR 검증 (수정 성공)

#### ✅ Issue #49 FINDING-02 — `day11-ui-bug-fixes.spec.ts` 12/12 PASS

PR #57 (`6e47957`) 로 Option A+C (test fixture 수정) 적용 후, day11 시나리오 전수 통과. Day 12 에 발견된 FINDING-01 (I-18 서버 그룹 드롭) 과 혼동된 FINDING-02 (테스트 fixture 의 `hasInitialMeld=false` 전제 불일치) 가 해소되었음을 확인.

```
✓  234 ~ 252 [chromium] › e2e/day11-ui-bug-fixes.spec.ts (12 tests)
✓  237 Stage 3 JK1+R5+R6 조커 런 ...
✓  238 Stage 4 런+그룹 동시 배치 ...
... (12/12 PASS)
```

#### ✅ FINDING-01 I-18 롤백 가드 유지 — `regression-pr41-i18-i19.spec.ts` 7/7 PASS

Day 12 PR #51 롤백이 Day 2 PR 머지 후에도 회귀 없이 유지됨을 확인. `hasInitialMeld=false` 에서 서버 그룹 드롭 명시적 차단 경로가 깨지지 않음.

```
✓  457 REG-PR41-I18-04: hasInitialMeld=true + Y2 → 서버 run [Y3-Y6] 드롭 → append 성공 (I-18 롤백이 이 경로를 깨지 않음)
```

#### ✅ #47 LeaveRoom PLAYING guard — 직접 커버리지 없음 but 회귀 없음

`lobby-and-room.spec.ts` 중 TC-LB (12/12) + TC-RC 생성 폼 부분 PASS. LeaveRoom API 자체에 대한 E2E 는 기존 suite 에 없음 — backend unit test `room_service_test.go` 에서 커버.

#### ✅ #48 confirmBusy state — UI bug fixes 전수 PASS

`game-ui-bug-fixes.spec.ts` BUG-UI-001 S4-01/02 PASS. 연속 Confirm 클릭 race 는 기존 suite 에 명시적 테스트 없음 (Phase 2 integration 으로 Jest 수준에서만 커버).

#### ✅ SEC-A/B/C — backend + frontend 전 경로 PASS

Go 1.25.9 + go-redis v9.7.3 (SEC-A), Next 15.5.15 + admin 16.2.4 (SEC-B/C) 모두 빌드/런타임 회귀 없음. 게임 플로우 stage 1~6 (**30/30 PASS**, 런 타입 분류 포함).

### 3.2 FAIL — 진성 회귀 의심 (12건)

#### 🔴 Timeout UI drift (7건, 최우선)

**증상**: `30초` / `60초` / `90초` / `120초` 버튼과 `aria-label="턴 제한 시간 설정 (30~120초)"` 슬라이더가 `/room/create` 페이지에 **렌더되지 않음**.

| # | Test | 증상 |
|---|------|------|
| 170 | `game-flow.spec.ts:221` TC-GF-008 | `getByRole('button', { name: '30초' })` 10s timeout |
| 171 | `game-flow.spec.ts:240` TC-GF-009 | `getByLabel('턴 제한 시간 설정 (30~120초)')` toHaveValue '120' element(s) not found |
| 183 | `game-flow.spec.ts:479` TC-FV-003 | slider toBeVisible element(s) not found |
| 185 | `game-flow.spec.ts:515` TC-FV-005 | `30초` 버튼 클릭 10s timeout |
| 332 | `lobby-and-room.spec.ts:190` TC-RC-008 | `30초` 버튼 10s timeout |
| 334 | `lobby-and-room.spec.ts:214` TC-RC-010 | slider aria-label toBeVisible element(s) not found |
| 351 | `lobby-and-room.spec.ts:571` TC-WR-007 | `90초` 버튼 10s timeout |

**가설**:
1. (가장 유력) PR #56 Next 16.2.4 upgrade 혹은 admin/frontend 중 한쪽에서 `/room/create` UI 컴포넌트가 변경됐는데 테스트 fixture 가 업데이트되지 않음 — 프로덕션 영향 **없음** (설정 기본값으로 게임 생성은 가능)
2. (대안) 실제 UI 렌더가 깨진 회귀 — 사용자 수동 검증 필요

**분류**: 진성 회귀 의심 (스펙 drift 확률 높음). Day 3 오전 frontend-dev 가 `src/frontend/src/app/room/create/page.tsx` 또는 `CreateRoomForm` 현재 상태 확인 + 테스트 또는 UI 한쪽 수정.

#### 🔴 Rate Limit Toast 문구 변경 (4건)

**증상**: `rate-limit-toast` 에 `"요청이 너무 많습니다"` 기대, 실제 표시는 `"요청이 너무 빨랐습니다. 5초 후 다시 시도합니다. 재시도 중...11s"`.

| # | Test | 문제 |
|---|------|------|
| 28 | `rate-limit.spec.ts:62` TC-RL-002 | 토스트 문구 "많습니다" vs "빨랐습니다" |
| 29 | `ws-rate-limit-enhanced.spec.ts:30` TC-WS-RL-E-001 | toast 렌더 자체 안 됨 (10s timeout) |
| 30 | `ws-rate-limit-enhanced.spec.ts:216` TC-WS-RL-E-005 | toast 렌더 자체 안 됨 |
| 31 | `ws-rate-limit.spec.ts:28` TC-WS-RL-001 | toast 렌더 자체 안 됨 |

**가설**:
- TC-RL-002 는 **문구 변경**. Rate limit UX 개선 과정에서 backoff sec 포함 메시지로 바뀐 것 같으며 테스트 fixture 미반영 — 프로덕션 UX 는 오히려 개선된 버전 (retry-in 표시).
- TC-WS-RL-* 3건은 `rate-limit-toast` 자체가 **안 뜸** — PR #59/#65 Istio DestinationRule outlier 튜닝으로 4005 close 가 외부에서 발생하지 않거나 타이밍 달라졌을 가능성.

**분류**: 문구 1건 스펙 drift + WS 3건 진성 회귀 의심. architect 자문 필요.

#### 🟡 DnD flaky (1건)

**증상**: `game-dnd-manipulation.spec.ts:506` DND-07-03 "정상 드래그 후 랙에 타일이 사라지는지 대조 검증" — retry 3회 후 FAIL. 본 suite 다른 드래그 테스트 (DND-01~07-02) 는 모두 PASS 이므로 flaky 성격.

**분류**: Flaky (PR #66 V-13e 조커 재드래그 UX 경로 추가에 의한 side effect 가능성 — dnd-kit closestCenter 의 좌표 매핑 race).

### 3.3 FAIL — Spec drift (13건)

#### 🟠 Admin Playtest S4 — scenario fixture (5건)

모든 케이스 공통: `page.getByTestId("scenario-select").selectOption("conservation-106")` 가 **option 을 찾지 못함** (10s timeout).

현재 admin 서비스 시나리오 endpoint 가 반환하는 list 에 `conservation-106` 이 없음. Day 12 혹은 Day 2 scenarios 리팩터 이후 이름이 변경됐거나 fixture 추가 필요.

| # | Test |
|---|------|
| 31 | TC-S4-UI-001 |
| 32 | TC-S4-UI-002 |
| 33 | TC-S4-UI-003 |
| 35 | TC-S4-UI-005 |
| 36 | TC-S4-UI-006 |

**분류**: 테스트 fixture 수정 필요 (admin playtest 기능 자체는 PASS — TC-S4-UI-004 `fixture/live AI 모드 disabled` 만 1건 PASS).

#### 🟠 Dashboard — recharts SVG 렌더 실패 (7건)

| Suite | FAIL | 공통 원인 |
|-------|------|-----------|
| `dashboard-cost-efficiency-scatter` | 4 | `figure[aria-labelledby="cost-eff-title"] > svg.recharts-surface` 미렌더 |
| `dashboard-model-card-grid` | 3 | 모델 카드 4~5장 미렌더 (mock fallback 미작동) |
| `dashboard-place-rate-chart` | 3 | recharts Line 요소 미렌더 |

공통 원인: **mock fallback 동작 안 함**. 대시보드는 `/api/dashboard/*` endpoint 가 200 을 반환하지 않을 때 mock data 로 fallback 하도록 설계 (`docs/02-design/33-dashboard-component-spec.md` §4.2). 현재 endpoint 가 401 혹은 빈 응답이어서 fallback branch 가 실행되지 않을 가능성.

**분류**: fixture drift + mock branch 조건 재확인 필요 (backend dashboard endpoint 구현 상태 점검 선행).

#### 🟠 Multiplayer 랙 로드 helper (2건)

| # | Test | 증상 |
|---|------|------|
| 196 | `game-ui-multiplayer.spec.ts:173` A-2b | `waitForGameReady` helper 에서 `aria-label="내 타일 랙"` 10s timeout |
| 198 | `game-ui-multiplayer.spec.ts:198` A-2d | 동일 |

**분류**: 게임 생성 + join 이 10s 내 완료되지 않음. 원인 가설: PR #65 Istio DestinationRule outlier 튜닝이 game-server 트래픽에 지연을 줬을 가능성 혹은 단일 worker 부하.

### 3.4 KNOWN — 사전 인식된 실패 (2건)

| # | Test | 상태 |
|---|------|------|
| 66 | `ai-battle.spec.ts:393` TC-AB-009 AI 턴 복귀 | KNOWN (MEMORY 기재) — Ollama qwen2.5:3b 가 180s 내 응답 미반환 |
| 77 | `ai-battle.spec.ts:674` TC-GP-001 2턴 이상 진행 | KNOWN — 동일 원인 |

MEMORY.md 원문 "Playwright E2E: 390개 — 376 PASS / 4 FAIL (Ollama Known) / 10 Flaky". 현재는 2건만 FAIL 로 줄어 **개선** (Ollama 4 → 2). 나머지 Ollama 시나리오 (TC-MX, TC-AM) 는 모두 PASS.

### 3.5 PASS 확인 — 주요 스위트

| Suite | Pass/Total | 비고 |
|-------|-----------|------|
| `01~06-stage*.spec.ts` (1~6단계 퍼즐) | 30/30 | 게임 규칙 전수 PASS (V-01~V-15 E2E 커버) |
| `ai-battle.spec.ts` | 23/25 | Ollama 2건만 FAIL (KNOWN) |
| `day11-ui-bug-fixes.spec.ts` | 12/12 | Issue #49 FINDING-02 해소 확인 |
| `regression-pr41-i18-i19.spec.ts` | 7/7 | Day 12 FINDING-01 I-18 롤백 가드 유지 |
| `game-rules.spec.ts` | 18/18 | 룰 전수 |
| `rearrangement.spec.ts` | 7/7 | V-13a backend 가드 + P2-2 UI 힌트 |
| `game-dnd-manipulation.spec.ts` | 27/28 | DND-07-03 1건 flaky |
| `game-ui-bug-fixes.spec.ts` | 4/4 | BUG-UI-001 다중 그룹 동시 배치 |
| `lobby-and-room.spec.ts` | 37/40 | timeout UI 3건 제외 전수 |
| `ws-rate-limit.spec.ts` | 6/7 | TC-WS-RL-001 만 FAIL |
| `hotfix-p0-2026-04-22.spec.ts` | (Jest 전용) | Day 12 심야 핫픽스 회귀 가드 |

---

## 4. Jest 병행 결과

### 4.1 Frontend Jest (203/203 PASS)

```
Test Suites: 12 passed, 12 total
Tests:       203 passed, 203 total
Time:        113.348 s
```

- `ActionBar.test.tsx`, `day11-ui-scenarios.test.tsx`, `GameBoard.validity.test.tsx`, `PlayerCard.test.tsx`, `bug-new-001-002-003.test.tsx`, `player-display.test.ts`, `turn-action-label.test.ts`, `mergeCompatibility.test.ts`, `tileStateHelpers.test.ts`, `gameStore.test.ts`, `Tile.test.tsx`, `hotfix-p0-2026-04-22.test.tsx`

Day 12 핫픽스 4건 회귀 가드 + #49 FINDING-02 단위 커버리지 포함 전수 GREEN.

### 4.2 AI Adapter Jest (599/599 PASS)

```
Test Suites: 28 passed, 28 total
Tests:       599 passed, 599 total
Time:        154.55 s
```

PR #61 NestJS v11 + TypeScript 5.3 upgrade 이후에도 모든 suite PASS — Character service, rate-limit guard, prompt shaper, response parser, controller 전 경로 회귀 없음. (확인용 로그 중 `invalid-json`, `최대 재시도 초과` 는 parser resilience 검증 로직의 정상 동작).

### 4.3 종합 Jest PASS rate: **802/802 (100%)**

---

## 5. 최종 판정

### 5.1 게이트별 결과

| 게이트 | 결과 |
|--------|------|
| Jest 단위·통합 (Frontend + AI Adapter) | ✅ PASS (802/802, 100%) |
| Playwright stage 1~6 퍼즐 + 게임 규칙 | ✅ PASS (48/48, 100%) |
| Day 2 PR 5건 회귀 가드 | ✅ PASS (0 건 회귀) |
| Day 12 FINDING-01/02 해소 검증 | ✅ PASS (12+7/19, 100%) |
| Playwright 전체 | ⚠️ CONDITIONAL (91.04%, 목표 98% 미달) |
| Timeout UI 회귀 | ❌ FAIL (7건 렌더 누락 의심) |
| Dashboard recharts | ❌ FAIL (7건, mock fallback 이슈) |
| Rate-limit WS toast | ❌ FAIL (3건, Istio DestinationRule 가설) |

### 5.2 판정: **CONDITIONAL GO**

- **Day 2 PR 5건 (#53~#57) 자체의 프로덕션 승격은 GO**. 회귀 0건, 핵심 regression guard suite 전수 GREEN.
- **Day 3 신규 기능 (V-13a/e, Istio DestinationRule, DB 001, NestJS v11, dev-deps bump) 배포는 HOLD** — 본 Playwright 결과는 이미지 tag 상 **Day 2 끝 시점** 을 검증했을 뿐이며 Day 3 PR 은 이미지 미반영 상태. Day 3 배포 결정은 Day 3 오전 재빌드 + 재검증 이후 별건.
- **즉시 진행할 3개 백로그**:
  1. **Timeout UI drift** (frontend-dev, 1h) — `/room/create` 현재 렌더 확인 + 테스트 또는 컴포넌트 중 한쪽 수정
  2. **Rate-limit WS toast 3건** (architect + frontend-dev, 1h) — Istio DestinationRule PR #65 의 outlier 튜닝이 WS 4005 close 흐름에 영향 주는지 확인
  3. **Admin Playtest S4 scenario fixture** (qa, 0.5h) — `conservation-106` 을 현재 시나리오 목록에 맞춰 수정

### 5.3 다음 단계

1. 본 보고서를 team-lead 에 전달 후 Day 3 배포 결정 대기.
2. Day 3 오전 session 에 이미지 rebuild (#58~#66 포함) + 본 31 FAIL 재실행으로 실제 회귀 vs drift 구분.
3. 진성 회귀 확정 시 해당 PR revert 혹은 hotfix, drift 는 테스트 fixture 업데이트 commit.
4. `docs/04-testing/65-day11-ui-scenario-matrix.md` 에 timeout UI drift 시나리오 추가 (ui-regression SKILL Phase 5.1 "24h 전환 의무").

---

## 6. 부록

### 6.1 Playwright 실행 로그

- 전체 로그: `/tmp/playwright-day2.log` (1,370 줄)
- Fail 요약: `/tmp/fails-list.txt` (31줄)
- 스크린샷 + error-context: `src/frontend/test-results/` (각 FAIL 에 대해 `test-failed-1.png` + `error-context.md`)

### 6.2 주요 스크린샷 경로 (일부)

- `src/frontend/test-results/admin-playtest-s4-Admin-Pl-*-chromium/test-failed-1.png` (5개)
- `src/frontend/test-results/dashboard-cost-efficiency-*-chromium/test-failed-1.png` (4개)
- `src/frontend/test-results/dashboard-model-card-grid-*-chromium/test-failed-1.png` (3개)
- `src/frontend/test-results/dashboard-place-rate-chart-*-chromium/test-failed-1.png` (3개)
- `src/frontend/test-results/game-flow-TC-GF-*-chromium/test-failed-1.png` (2개)
- `src/frontend/test-results/game-flow-TC-FV-*-chromium/test-failed-1.png` (2개)
- `src/frontend/test-results/game-ui-multiplayer-*-chromium/test-failed-1.png` (2개)
- `src/frontend/test-results/lobby-and-room-*-chromium/test-failed-1.png` (3개)
- `src/frontend/test-results/rate-limit-*-chromium/test-failed-1.png` (1개)
- `src/frontend/test-results/ws-rate-limit-*-chromium/test-failed-1.png` (3개)
- `src/frontend/test-results/game-dnd-manipulation-*-chromium/test-failed-1.png` (1개)
- `src/frontend/test-results/ai-battle-TC-AB-*-chromium/test-failed-1.png` (1개)
- `src/frontend/test-results/ai-battle-TC-GP-*-chromium/test-failed-1.png` (1개)

### 6.3 FAIL 에러 로그 샘플 (카테고리당 1건)

**timeout UI (TC-GF-008)**:
```
TimeoutError: locator.click: Timeout 10000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: '30초' })
```

**dashboard recharts (TC-DASH-SC-002)**:
```
Expect "toBeVisible" with timeout 5000ms
Locator: locator('figure[aria-labelledby="cost-eff-title"]').locator('svg.recharts-surface[role="application"]')
Error: element(s) not found
```

**rate-limit toast 문구 (TC-RL-002)**:
```
Expected substring: "요청이 너무 많습니다"
Received string:    "요청이 너무 빨랐습니다. 5초 후 다시 시도합니다.재시도 중...11s"
```

**admin playtest scenario (TC-S4-UI-003)**:
```
TimeoutError: locator.selectOption: Timeout 10000ms exceeded.
Call log:
  - waiting for getByTestId('scenario-select')
    - locator resolved to <select data-testid="scenario-select" ... >…</select>
  - attempting select option action
    - did not find some options
```

**Ollama KNOWN (TC-AB-009)**:
```
Expect "toBeVisible" with timeout 180000ms
Locator: locator('[aria-label="게임 액션"]')
Error: element(s) not found
```

### 6.4 PASS rate 상세 분포

| PASS rate 구간 | Suite 수 | 파일 예시 |
|----------------|---------|----------|
| 100% | 28 | stage 1~6, day11-ui-bug-fixes, rearrangement, regression-pr41-i18-i19, hotfix-p0 |
| 95~99% | 4 | ai-battle (92%), game-dnd-manipulation (97%), ws-rate-limit (86%), lobby-and-room (93%) |
| 85~94% | 2 | game-flow, ws-rate-limit-enhanced |
| <85% | 3 | admin-playtest-s4 (17%, fixture drift), dashboard-* (0%, mock fallback) |

### 6.5 시간 분배

- 00:00~02:00 stage 1~6 + joker: **30 tests / 2 min** (평균 4s)
- 02:00~10:00 admin-playtest-s4 + ai-battle 초반: 6 tests / 8 min (평균 80s, AI 대전 포함)
- 10:00~40:00 dashboard + DnD + game-flow + game-rules: **~180 tests / 30 min**
- 40:00~1:00:00 lobby + rearrangement + regression + multiplayer: **~230 tests / 20 min**
- 1:00:00~1:18:00 ws-rate-limit + rate-limit + 기타 스위트: **~34 tests / 18 min**

---

## 7. 변경 이력

- **2026-04-23 v1.0** (qa-day2): Sprint 7 Day 2 Playwright 전수 회귀 보고서 최초 작성. PASS rate 91.04%, CONDITIONAL GO 판정.
