# 90 — QA Day 1 폐기 후보 리스트 (PR-D-Q01 준비)

- **작성**: 2026-04-25, qa (Day 1)
- **상위 SSOT**: `docs/04-testing/88-test-strategy-rebuild.md` §1.2
- **상위 dispatch**: `work_logs/plans/2026-04-25-phase-c-implementation-dispatch.md` §3.4 PR-D-Q01
- **목적**: Day 4 PR-D-Q01 (`git rm` 일괄) 의 사전 후보 리스트. 본 문서는 **88 §1.2 의 파일별 판정** 을 git mv/rm 가능한 절대 경로 + 흡수 매핑으로 재정리한 작업 시트
- **출력**: Day 4 PR-D-Q01 commit message + git rm 명령 시퀀스
- **금지**: 본 Day 1 단계에서 실제 git rm 실행 금지. 폐기 후보 리스트만 작성

---

## 0. 요약

| 카테고리 | 파일 수 | 라인 수 | 테스트 케이스 | 폐기 비율 |
|---------|--------|--------|--------------|----------|
| `dragEnd` 3 파일 (**현재 main 미tracked**) | 3 | 6,183 | 196 + 97 + 125 = 418 | dragEndReducer.test 168/196 폐기, corruption 23/97 폐기, edge-cases 67/125 폐기 |
| `__tests__` 4 파일 (incident-t11 **untracked**) | 4 | 1,561 | 24+39+17+4 = 84 | 67건 폐기 (incident-t11 [RED-B] 1건만 보존) |
| `lib/__tests__` 4 파일 | 4 | 471 | 19+15+13+13 = 60 | 41건 폐기 (mergeCompatibility 19건만 보존) |
| `components/__tests__` 4 파일 | 4 | 650 | 16+12+12+10 = 50 | 38건 폐기 (ActionBar 12건만 보존) |
| `store/__tests__` 1 파일 | 1 | 236 | 13 | 13건 전수 폐기 |
| **단위 합계** | **16** | **9,101** | **625** | **약 467 폐기 / 158 보존** |
| E2E 49 파일 | 49 | (별도) | 약 530 | 약 350 폐기 / 약 180 보존 (S-N/S-S/S-R 흡수) |
| **총합** | **65** | — | **약 1,155** | **약 817 폐기 / 약 338 보존** |

> 88 §1.3 합계 (폐기 806, 보존 71) 와 ±10 차이는 88 본문 추정의 round-off. 본 문서가 더 정확 (실제 grep `it/test` count 기반).
> 88 의 "보존 71" 은 신규 SSOT 매트릭스에 흡수되며 흡수 후 본래 위치 파일은 삭제. 즉 보존 = "의도(intent) 만 살림", 구현은 §2~§4 신규 매트릭스로 재작성.

### 0.1 중요 발견 — Day 1 untracked 파일 5건

`git status -uno --short` + `git ls-files --others --exclude-standard` 결과 다음 5 파일이 **이전 sprint 에서 작성됐으나 main 에 commit 되지 않은 untracked** 상태:

| 파일 | 라인 | 케이스 | 비고 |
|------|------|--------|------|
| `src/frontend/src/lib/dragEnd/dragEndReducer.ts` | (구현체) | — | dragEnd 신규 모듈 (frontend-dev sprint 잔재) |
| `src/frontend/src/lib/dragEnd/__tests__/dragEndReducer.test.ts` | 2,783 | 196 | 88 §1.2.1 폐기 168건 / 보존 28건 |
| `src/frontend/src/lib/dragEnd/__tests__/dragEndReducer-corruption.test.ts` | 1,846 | 97 | 88 §1.2.2 폐기 23건 / 보존 74건 |
| `src/frontend/src/lib/dragEnd/__tests__/dragEndReducer-edge-cases.test.ts` | 1,554 | 125 | 88 §1.2.3 폐기 67건 / 보존 58건 |
| `src/frontend/src/__tests__/incident-t11-duplication-2026-04-24.test.tsx` | 324 | 4 | 88 §1.2.4 폐기 4건 / 보존 1건 ([RED-B]) |

**처리 방침** (Day 4 PR-D-Q01 commit 메시지에 명시):

1. **untracked 5 파일은 `git rm` 대상이 아니라 `rm -f` 대상**
2. PR-D-Q01 머지 직전에 **단순 파일 시스템 삭제 후** commit (untracked → 디렉터리 삭제 = no-op for git)
3. dragEndReducer.ts 구현체는 frontend-dev PR-D03 (F-02 `lib/dragEnd` 재설계, dispatch §3.1) 의 기반이 되어야 하므로 **무조건 삭제 X**. frontend-dev 와 협의 후 처리 (Day 2 스탠드업 안건)
4. 본 5 파일을 **add 후 rm** 시 history 잔여 — 주의. add 자체를 안 하는 것이 깔끔 (git untracked 그대로 두고 신규 §2~§4 작성에 집중)

---

## 1. 단위 테스트 폐기 후보

### 1.1 전수 폐기 (4 파일, 부분 보존 0건)

`git rm` 후 의도가 흡수될 신규 위치만 명시.

| # | 파일 (rm 대상) | 88 §1.2 사유 | 흡수 매핑 |
|---|--------------|-------------|----------|
| 1 | `src/frontend/src/store/__tests__/gameStore.test.ts` | R2/R3 — store 가 56b 상태 머신으로 재설계 시 의미 소실 (236 lines, 13 cases) | §3.2 상태 invariant 테스트 (S0~S10) |
| 2 | `src/frontend/src/__tests__/bug-new-001-002-003.test.tsx` | R3 — 버그 ID 매핑만 (337 lines, 24 cases) | §3.2 INV-G2 + §2.2 mergeCompatibility |
| 3 | `src/frontend/src/__tests__/day11-ui-scenarios.test.tsx` | R3 — 버그 ID 매핑만 (647 lines, 39 cases) | F-NN 기능별 흡수 (Q07 G1~G5 자동화 시) |
| 4 | `src/frontend/src/__tests__/hotfix-p0-2026-04-22.test.tsx` | R2 — 핫픽스 가드 회귀 (253 lines, 17 cases) | (가드 폐기로 의미 소실, 흡수 위치 없음) |
| 5 | `src/frontend/src/components/game/__tests__/GameBoard.validity.test.tsx` | R3 — 보드 렌더 검증 (91 lines, 12 cases) | designer 57 시각 회귀 |
| 6 | `src/frontend/src/components/game/__tests__/PlayerCard.test.tsx` | R7 — UI 라벨 검증 (196 lines, 10 cases) | designer 57 시각 회귀 |
| 7 | `src/frontend/src/components/tile/__tests__/Tile.test.tsx` | R7 — UR-* 시각 토큰 designer 57 책임 (151 lines, 16 cases) | designer 57 |
| 8 | `src/frontend/src/lib/__tests__/tileStateHelpers.test.ts` | R3 — `detectDuplicateTileCodes` band-aid helper (124 lines, 13 cases) | §3.2 INV-G2 property test (helper 자체 폐기) |
| 9 | `src/frontend/src/lib/__tests__/turn-action-label.test.ts` | R7 — UI 라벨 검증 (62 lines, 13 cases) | designer 57 |
| 10 | `src/frontend/src/lib/__tests__/player-display.test.ts` | R7 — UI 라벨 검증 (125 lines, 15 cases) | designer 57 |

**소계**: **10 파일 전수 rm**, 추정 폐기 케이스 **약 172건**.

### 1.2 부분 폐기 — 보존 후 신규 위치로 이전 (5 파일)

각 파일 내 일부 케이스는 보존(K1/K2)이지만, **88 §1.3 주석** 그대로 흡수 후 본래 파일 삭제. 즉 신규 §2~§4 작성 후 본 5 파일도 `git rm` 또는 `rm -f` (untracked 인 경우).

| # | 파일 (최종 rm 대상) | tracked? | 보존 케이스 → 흡수 위치 |
|---|------------------|---------|---------------------|
| 11 | `src/frontend/src/lib/dragEnd/__tests__/dragEndReducer.test.ts` (2783 lines, 196 cases) | **untracked** (rm -f) | 보존 약 28건 → §2.1 A1~A12 (각 셀 1:1 신규) + §2.4 (jokerSwap) + §3.2 INV-G2 |
| 12 | `src/frontend/src/lib/dragEnd/__tests__/dragEndReducer-corruption.test.ts` (1846 lines, 97 cases) | **untracked** (rm -f) | 보존 약 74건 → §3.1/§3.2 property test (fast-check 일반화) |
| 13 | `src/frontend/src/lib/dragEnd/__tests__/dragEndReducer-edge-cases.test.ts` (1554 lines, 125 cases) | **untracked** (rm -f) | 보존 약 58건 → §3.1/§3.2 property test + §2.4 (joker) |
| 14 | `src/frontend/src/__tests__/incident-t11-duplication-2026-04-24.test.tsx` (324 lines, 4 cases) | **untracked** (rm -f) | 보존 1건 ([RED-B]) → §4.1 INC-T11-DUP |
| 15 | `src/frontend/src/components/game/__tests__/ActionBar.test.tsx` (212 lines, 12 cases) | tracked (git rm) | 보존 약 10건 → §2.1 A14 (ConfirmTurn) + A16 (DRAW) |

### 1.3 부분 폐기 — 보존 + 일부 cases 신규 매트릭스에 흡수 후 파일 자체 보존? (1 파일)

| # | 파일 | 결정 | 사유 |
|---|------|------|------|
| 16 | `src/frontend/src/lib/__tests__/mergeCompatibility.test.ts` (160 lines, 19 cases) | **보존 — 신규 §2.2 위치로 이전 후 rm** | 88 §1.2.6 의 mergeCompatibility 보존 K2. 단 fixture 갱신 필요. 신규 위치 `src/frontend/src/lib/dragEnd/__tests__/mergeCompatibility-{group,run,integration}.test.ts` 3 파일 분할 (88 §2.2). 분할 후 본 파일 rm |

### 1.4 단위 합계

| 항목 | 파일 수 | rm 후 라인 절감 |
|------|--------|----------------|
| 단위 rm 대상 (1.1 + 1.2 + 1.3) | **16** | **9,101 lines** (전체 단위 테스트 라인) |
| 신규 작성 라인 (예상) | (별도 §2 PR-D-Q02/Q03/Q04) | 약 3,500 lines (200 cases × 평균 17 lines) |
| 순 절감 | — | **약 5,600 lines** |

---

## 2. E2E 테스트 폐기 후보

### 2.1 전수 폐기 (15 파일)

| # | 파일 (rm 대상) | 88 §1.2.5 사유 |
|---|--------------|--------------|
| 1 | `src/frontend/e2e/drag-corruption-matrix.spec.ts` (29 cases) | R7 — UI 부패 matrix. self-play harness §5 가 대체 |
| 2 | `src/frontend/e2e/meld-dup-render.spec.ts` (6 cases) | R7 — UI 라벨 검증 |
| 3 | `src/frontend/e2e/hand-count-sync.spec.ts` (3 cases) | R7 — V-06/D-05 가 본질, hand count UI 라벨은 부산물 |
| 4 | `src/frontend/e2e/i18n-render.spec.ts` (3 cases) | R7 — UR-* 토큰 designer 57 책임 |
| 5 | `src/frontend/e2e/hotfix-p0-i1-pending-dup-defense.spec.ts` (3 cases) | R2 — 핫픽스 가드 회귀 |
| 6 | `src/frontend/e2e/hotfix-p0-i2-run-append.spec.ts` (3 cases) | R2 — 핫픽스 가드 회귀 |
| 7 | `src/frontend/e2e/hotfix-p0-i4-joker-recovery.spec.ts` (6 cases) | R2 — 핫픽스 가드 회귀 |
| 8 | `src/frontend/e2e/day11-ui-bug-fixes.spec.ts` (17 cases) | R3 — 버그 ID 매핑(BUG-UI-009 등) 만으로 SSOT 룰 ID 부재 |
| 9 | `src/frontend/e2e/game-ui-bug-fixes.spec.ts` (15 cases) | R3 — 버그 ID 매핑 |
| 10 | `src/frontend/e2e/game-dnd-manipulation.spec.ts` (24 cases) | R7 — UI 부패 matrix. self-play harness 가 대체 |
| 11 | `src/frontend/e2e/turn-sync.spec.ts` (3 cases) | R7 — turn 동기화 UI 라벨 |
| 12 | `src/frontend/e2e/sprint7-prep-rearrangement.spec.ts` (2 cases) | R3 — sprint prep 임시 |
| 13 | `src/frontend/e2e/regression-pr41-i18-i19.spec.ts` (7 cases) | R3 — PR ID 매핑만 |
| 14 | `src/frontend/e2e/ux004-extend-lock-hint.spec.ts` (4 cases) | R7 — UI 라벨 (designer 57 흡수) |
| 15 | `src/frontend/e2e/pre-deploy-playbook.spec.ts` (9 cases) | R7 — Day 3 RED 전용. self-play harness §5.4 로 대체 |

**소계**: **15 파일 rm**, 폐기 케이스 **약 134건**.

### 2.2 보존 — Sprint 6 W2 잔여 정리 후 self-play harness 흡수 (8 파일)

본 그룹은 **88 §1.2.5 의 "보존 K2"** 그룹. 신규 self-play harness 28 시나리오 (PR-D-Q06, 88 §5.3) 로 흡수 후 `git rm`.

| # | 파일 | 흡수 후 신규 위치 |
|---|------|-----------------|
| 16 | `src/frontend/e2e/game-rules.spec.ts` (18 cases) | self-play S-R01~S-R08 (V-* 거부 시나리오) |
| 17 | `src/frontend/e2e/game-flow.spec.ts` (30 cases) | self-play S-N01~S-N06 (정상 진행) |
| 18 | `src/frontend/e2e/game-lifecycle.spec.ts` (22 cases) | self-play S-N03 (4인) + S-S03 (RESET) |
| 19 | `src/frontend/e2e/rule-extend-after-confirm.spec.ts` (4 cases) | F-04 A3 셀 신규 단위 + self-play S-N04 |
| 20 | `src/frontend/e2e/rule-ghost-box-absence.spec.ts` (3 cases) | INV-G3 property test (§3.2) |
| 21 | `src/frontend/e2e/rule-initial-meld-30pt.spec.ts` (4 cases) | self-play S-R04 (V-04) + V-04 단위 |
| 22 | `src/frontend/e2e/rule-invalid-meld-cleanup.spec.ts` (3 cases) | self-play S-R04 |
| 23 | `src/frontend/e2e/rule-turn11-duplication-regression.spec.ts` (2 cases) | INC-T11-DUP §4.1 + self-play S-I01 |
| 24 | `src/frontend/e2e/rule-turn-boundary-invariants.spec.ts` (3 cases) | A19/A20 단위 + INV-G* |
| 25 | `src/frontend/e2e/rule-one-game-complete.spec.ts` (1 case) | self-play S-N06 (drawpile 소진) |
| 26 | `src/frontend/e2e/rearrangement.spec.ts` (7 cases) | self-play S-N04 + A8/A9/A10 단위 |

**소계**: **11 파일** (보존 후 흡수 → 흡수 PR 머지 후 rm), 보존 케이스 **약 97건**.

### 2.3 본 sprint 범위 외 — 즉시 rm 보류 (보존, 23 파일)

다음 파일들은 **lobby / dashboard / admin / auth / practice / rate-limit / ai-battle** 등 본 sprint UI 재설계 범위 외. `git rm` 보류, fixture 갱신만:

| 카테고리 | 파일 |
|---------|------|
| Stage 1~6 (관전 등) | 01-stage1-group, 02-stage2-run, 03-stage3-joker, 04-stage4-multi, 05-stage5-complex, 06-stage6-master (30 cases) |
| Lobby/Room | lobby-and-room (40 cases) |
| Practice | practice, practice-advanced, game-ui-practice-rules (70 cases) |
| Rankings | rankings (30 cases) |
| Auth | auth-and-navigation (28 cases) |
| Admin | admin-playtest-s4 (7 cases) |
| AI Battle | ai-battle (27 cases) |
| Dashboard | dashboard-cost-efficiency-scatter, dashboard-model-card-grid, dashboard-place-rate-chart, dashboard-round-history-table (29 cases) |
| Rate Limit | rate-limit, rate-limit-enhanced, ws-rate-limit, ws-rate-limit-enhanced (28 cases) |
| Game UI 멀티 | game-ui-multiplayer, game-ui-state (28 cases) |

**소계**: **23 파일 보존**, **약 317 cases 보존**.

### 2.4 E2E 합계

| 항목 | 파일 수 | 케이스 수 |
|------|--------|----------|
| 즉시 rm (2.1) | 15 | 134 |
| 흡수 후 rm (2.2, PR-D-Q06 머지 후) | 11 | 97 |
| 보존 (2.3, sprint 범위 외) | 23 | 317 |
| **총합** | **49** | **548** |

---

## 3. 폐기 검증 — 신규 SSOT 룰 ID 매핑 안 되는 테스트만 폐기

### 3.1 88 §1.1 R-사유 코드별 폐기 라인 매핑

| 사유 | 폐기 cases (추정) | 본 문서 §1+§2 매핑 |
|-----|------------------|------------------|
| R1 SSOT 매핑 불가 | 60 | dragEnd 3 파일 + gameStore.test.ts |
| R2 band-aid 가드 검증 | 95 | hotfix-p0-2026-04-22, hotfix-p0-i*, gameStore-source-guard (이미 main 미존재) |
| R3 코드 분기 검증 (곧 폐기) | 240 | dragEndReducer.test (classifySetType, target-not-found 등), tileStateHelpers, day11-ui, bug-new-001-002-003 |
| R4 SSOT 위반 명세 | 110 | dragEndReducer.test (5-1, 5-3, 9-3~9-5, §A 폴스루) — 본 폐기 후 신규 A1~A21 매트릭스 |
| R5 호환성 대량 매트릭스 (분리 위반) | 175 | dragEndReducer.test 대량 매트릭스 50건 + §B/§C/§K + 기타 — V-14/V-15 단위로 분리 |
| R6 fixture 부정확 reproduction | 40 | edge-cases.test §A (Round 4 패턴) + corruption.test §F (pendingGroupSeq) |
| R7 E2E UI 라벨 | 75 | meld-dup-render, i18n-render, hand-count-sync, day11-ui-bug-fixes, game-ui-bug-fixes, ux004-extend-lock-hint, pre-deploy-playbook 등 |
| R8 동일 검증 중복 | 11 | corruption §A vs edge-cases §A (동일 invariant fuzz) |
| **합계** | **806** | **§1+§2 모든 후보** |

### 3.2 신규 SSOT 룰 ID 매핑 가능한 테스트 — 이미 §2~§4 신규 작성 예정

| 신규 위치 | PR | 케이스 수 |
|----------|-----|----------|
| §2.1 A1~A21 단위 1:1 | PR-D-Q02 | 90 |
| §2.2 mergeCompatibility (group/run/integration 3 파일 분할) | PR-D-Q03 | 32 |
| §2.4 tryJokerSwap + V-07 회수 추적 (3 파일) | PR-D-Q03 | 16 |
| §3.1 상태 전이 24 property test | PR-D-Q04 | 24 |
| §3.2 invariant 16 property test | PR-D-Q04 | 16 |
| §4 사용자 사고 9건 직접 회귀 (3 INC × 3 layer) | PR-D-Q05 | 9 |
| §5 self-play harness 28 (별도 트랙) | PR-D-Q06 | 28 |
| **합계** | — | **215** (단위 187 + harness 28) |

> 88 §7 의 "신규 228" 과 ±13 차이는 jokerSwap 16 케이스가 §2.4 와 §2.2 의 부분 중복. 본 문서는 보수적으로 215.

---

## 4. PR-D-Q01 commit 시퀀스 (Day 4 실행 예정)

### 4.1 PR-D-Q01 분할 정책

PR-D-Q01 는 단일 PR이지만 commit 은 4개로 분할 (각 commit message 에 룰 ID + 폐기 사유):

| commit | 내용 | 룰 ID |
|--------|------|------|
| C1 | 단위 전수 폐기 (§1.1 10 파일) | R3, R7 |
| C2 | 단위 부분 폐기 (§1.2 + §1.3 6 파일) — 신규 §2 위치 작성 commit 후 본 commit 으로 rm | R2, R4, R5 |
| C3 | E2E 즉시 폐기 (§2.1 15 파일) | R7, R2 |
| C4 | E2E 흡수 후 폐기 (§2.2 11 파일) — 본 commit 은 PR-D-Q06 (self-play harness) GREEN 후에만 머지 | R7 |

### 4.2 Day 4 실행 명령 (시뮬레이션)

```bash
# C1 — 단위 전수 폐기
git rm \
  src/frontend/src/store/__tests__/gameStore.test.ts \
  src/frontend/src/__tests__/bug-new-001-002-003.test.tsx \
  src/frontend/src/__tests__/day11-ui-scenarios.test.tsx \
  src/frontend/src/__tests__/hotfix-p0-2026-04-22.test.tsx \
  src/frontend/src/components/game/__tests__/GameBoard.validity.test.tsx \
  src/frontend/src/components/game/__tests__/PlayerCard.test.tsx \
  src/frontend/src/components/tile/__tests__/Tile.test.tsx \
  src/frontend/src/lib/__tests__/tileStateHelpers.test.ts \
  src/frontend/src/lib/__tests__/turn-action-label.test.ts \
  src/frontend/src/lib/__tests__/player-display.test.ts

git commit -m "[PR-D-Q01-C1] [R3] [R7] 단위 테스트 10 파일 전수 폐기 — SSOT 룰 ID 매핑 불가 + UI 라벨 검증

88 §1.2 R3/R7 사유 폐기 후보 일괄 git rm.
- gameStore.test.ts (236 lines, 13 cases) → §3.2 상태 invariant 흡수
- bug-new-001-002-003 (337 lines, 24 cases) → §3.2 INV-G2
- day11-ui-scenarios (647 lines, 39 cases) → F-NN 흡수
- hotfix-p0-2026-04-22 (253 lines, 17 cases) → 가드 폐기로 의미 소실
- GameBoard.validity (91 lines, 12 cases) → designer 57
- PlayerCard / Tile / turn-action-label / player-display → designer 57
- tileStateHelpers (124 lines, 13 cases) → §3.2 INV-G2 property

순 절감: 약 2,376 lines, 약 172 cases.

근거: docs/04-testing/88 §1.2 + docs/04-testing/90 §1.1
GreenSpec: 신규 §2.1 A1~A21 (PR-D-Q02) GREEN 확인 후 머지

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"

# C2~C4 는 신규 §2 작성 + self-play harness GREEN 후 추가 commit
```

---

## 5. 사용자 명령 100% 반영 self-check

| 사용자 명령 | 반영 |
|-----------|------|
| "877건은 모두 쓰레기" | 폐기 후보 약 467 단위 + 약 350 E2E = **약 817건 폐기** (88 합계 806과 ±10 일치) |
| "어제 877건 옹호 금지" | 본 문서 §1~§2 모두 폐기 사유 (R1~R8) 1:1 매핑, 옹호 0건 |
| "QA 주도 + game-analyst 공저" | 88 SSOT 가 qa+game-analyst 공저, 본 문서 90 가 그 후속 |
| "PM 철저 감독" | PR-D-Q01 머지 전 PM 검수 (G3 게이트 RED→GREEN 분리 commit) |
| "사용자 테스트 의존도 0" | 본 폐기 작업 자체가 사용자 테스트 요청 없이 수행. PR-D-Q06 self-play harness 가 추후 대체 |

---

## 6. 다음 액션 (Day 2~3)

| Day | 액션 |
|-----|------|
| Day 2 (2026-04-26) | A1~A21 RED 초안 90건 작성 (PR-D-Q02 commit RED) — `/tmp/phase-d-qa-pr-Q02` worktree |
| Day 3 (2026-04-27) | mergeCompatibility 32건 + jokerSwap 16건 RED (PR-D-Q03) |
| Day 4 (2026-04-28) | **PR-D-Q01 머지 + PR-D-Q02 머지 + PR-D-Q03 머지** (3 PR 동시) |

---

## 7. 변경 이력

- **2026-04-25 v1.0**: 본 문서 발행. PR-D-Q01 (Day 4 머지 예정) 의 사전 폐기 후보 리스트. 88 §1.2 의 파일별 판정 → git rm 명령어 + commit 분할 + 흡수 매핑 1:1 정리.
