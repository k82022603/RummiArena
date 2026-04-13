# 게임룰 ↔ 소스코드 추적성 매트릭스 (Game Rule Traceability Matrix)

> 이 문서는 `06-game-rules.md`에 정의된 모든 게임 규칙이 소스코드에 어떻게 구현되어 있는지 추적한다.
> 게임 엔진 수정 시 반드시 이 문서를 참조하여 규칙 누락을 방지한다.

**최종 갱신**: 2026-04-13
**근거 문서**:
- `docs/02-design/06-game-rules.md` (규칙 정의서)
- `docs/04-testing/48-game-rule-coverage-audit.md` (UI/테스트 커버리지 감사 보고)

---

## 0. 매트릭스 표기 규약

본 문서의 §1 매트릭스는 **3단계 7컬럼 구조**(2026-04-13 도입)를 따른다:

| 컬럼 | 의미 | ✅ 조건 |
|------|------|--------|
| **Engine 구현** | 서버 엔진 검증 로직 존재 | `internal/engine/` 또는 `internal/service/` 에 검증 코드가 있음 |
| **Engine 테스트** | Go 단위/통합 테스트 존재 | Happy + Negative 최소 각 1건 |
| **UI 구현** | 사용자가 실제로 해당 동작을 수행할 수 있는 프론트 경로 존재 | `src/frontend/` 인터랙션 핸들러 존재 |
| **UI 테스트(E2E)** | Playwright E2E 시나리오 존재 | Happy 최소 1건 |
| **Playtest** | Human×AI 시나리오에서 실제 실행/관찰됨 | `docs/04-testing/` 시나리오 보고서에 실행 결과 기록 |
| **종합** | 위 5개 모두 ✅일 때만 ✅ | 하나라도 ⚠️/❌ → "부분" 또는 "미완" |

**표기 기호**:
- ✅ 완료
- ⚠️ 부분 (일부 구현/테스트 누락)
- ❌ 미구현/미테스트
- N/A 해당 단계 자체가 적용되지 않음 (예: 서버 전용 규칙은 UI 컬럼이 N/A)

> **주의**: 2026-04-13 이전 매트릭스는 "Engine 구현 + Engine 테스트"만으로 PASS를 표기했다.
> 본 갱신은 그 표기를 "엔진 한정 PASS"로 재해석하고, UI/E2E/Playtest 컬럼을 신설하여 종합 상태를 다시 산정한다.
> 계기는 2026-04-13 라이브 테스트에서 발견된 V-13 재배치 합병 UI 누락 사건이다 (감사: `docs/04-testing/48-game-rule-coverage-audit.md`).

---

## 1. 규칙 검증 매트릭스 (V-01 ~ V-15)

| 규칙 ID | 검증 항목 | Engine 구현 | Engine 테스트 | UI 구현 | UI 테스트(E2E) | Playtest | 종합 |
|---------|----------|-----------|------------|--------|-------------|---------|------|
| **V-01** | 세트가 유효한 그룹 또는 런인가 | ✅ `validator.go:80-84` `ValidateTable()` | ✅ `validator_test.go:87,135` `group_test.go:18` `run_test.go:9` | ✅ `GameClient.tsx` `handleConfirmTurn` (서버 검증 트리거) | ✅ `e2e/game-rules.spec.ts` (그룹/런 기본) | ✅ S1~S7 다수 실행 | ✅ |
| **V-02** | 세트가 3장 이상인가 | ✅ `engine/group.go` (3~4장) `engine/run.go` (3+장) | ✅ `validator_test.go:62` `group_test.go:47,54` `run_test.go:38` | ✅ 서버 검증 (UI는 위반 가능, 서버 거부) | ✅ `e2e/game-rules.spec.ts` (negative case) | ✅ S1 기본 등록 | ✅ |
| **V-03** | 랙에서 최소 1장 추가했는가 | ✅ `validator.go:85-90` | ✅ `validator_test.go:148-163` | ✅ 서버 검증 | ⚠️ E2E 직접 케이스 없음 | ✅ S1~S7 간접 | ⚠️ |
| **V-04** | 최초 등록 30점 이상인가 | ✅ `validator.go:133-162` `validateInitialMeld()` | ✅ `validator_test.go:167-205` `turn_service_test.go:454` | ✅ `GameClient.tsx` 서버 검증 트리거, 에러 메시지 표시 | ✅ `e2e/game-rules.spec.ts` 30점 이하 거부 | ✅ S1, S4 등 | ✅ |
| **V-05** | 최초 등록 시 랙 타일만 사용했는가 | ✅ `validator.go:123-131` `validateInitialMeld()` | ✅ `validator_test.go:208-229` `turn_service_test.go:497-558` | ✅ 서버 검증 | ⚠️ E2E 직접 케이스 없음 (간접만) | ✅ S4 등 | ⚠️ |
| **V-06** | 테이블 타일이 유실되지 않았는가 | ✅ `validator.go:91-97,111-119` | ✅ `validator_test.go:230-250,432-509` `conservation_test.go` (43개) | ✅ `GameClient.tsx` 보드 상태 동기화 | ✅ `e2e/game-rules.spec.ts` 기본 (간접) | ✅ S1~S7 간접 | ✅ |
| **V-07** | 조커 교체 후 즉시 사용했는가 | ✅ `validator.go:106-110,164-181` `validateJokerReturned()` | ✅ `validator_test.go:251-292` `turn_service_test.go:329-452` | ⚠️ 조커 회수 후 즉시 사용 UX 검증 미수행 | ❌ E2E 0건 | ⚠️ S4 Phase D 조커 미획득 스킵 | ⚠️ |
| **V-08** | 자기 턴인가 | ✅ `service/game_service.go:295-300` (seat 확인) | ✅ `game_service_test.go` (간접) | ✅ 클라이언트 isMyTurn UI 상태 | ⚠️ E2E 직접 케이스 없음 | ✅ 모든 시나리오 | ⚠️ |
| **V-09** | 턴 타임아웃 | ✅ `service/turn_service.go:106-127` `HandleTimeout()` | ✅ `turn_service_test.go:148-198` | ✅ `GameClient.tsx` 타이머 UI | ⚠️ E2E 타임아웃 직접 케이스 없음 | ✅ AI 대전 다수 관찰 | ⚠️ |
| **V-10** | 드로우 파일이 비어있는가 | ✅ `engine/pool.go:49-53` `Draw()` | ✅ `turn_service_test.go:199-230` | ✅ 서버 검증 (드로우 버튼 비활성) | ❌ E2E 0건 | ⚠️ Round 4 80턴 완주에서 1회 관찰 | ⚠️ |
| **V-11** | 교착 상태인가 | ✅ `service/game_service.go` (ConsecutivePassCount) | ✅ `game_service_test.go:580-603,701-732` | ✅ `GameClient.tsx` GAME_OVER 메시지 처리 | ❌ E2E 0건 | ⚠️ 자연 발생 드물어 드물게 관찰 | ⚠️ |
| **V-12** | 승리 조건 (랙 타일 0장) | ✅ `service/game_service.go` (ConfirmTurn 후 랙 체크) | ✅ `game_service_test.go` (간접) | ✅ `GameClient.tsx` GAME_OVER UI | ⚠️ E2E 직접 케이스 없음 | ✅ Round 4 DeepSeek 등 다수 | ⚠️ |
| **V-13** | 재배치 권한 + 4유형 | (V-13a~V-13e 분해 — 아래 §1.1 참조) | | | | | **부분** |
| **V-14** | 그룹에서 같은 색상 중복 불가 | ✅ `engine/group.go` (색상 중복 체크) | ✅ `group_test.go:62` `regression_test.go:554` | ✅ 서버 검증 | ✅ `e2e/game-rules.spec.ts` 그룹 negative | ✅ S1 등 | ✅ |
| **V-15** | 런에서 숫자 연속 (13-1 순환 불가) | ✅ `engine/run.go:60` `checkRunDuplicates()` + 순서 검증 | ✅ `run_test.go:53,114,172` | ✅ 서버 검증 | ✅ `e2e/game-rules.spec.ts` 런 negative | ✅ S1 등 | ✅ |

> **에러 코드 참조**: 기존 §1의 에러 코드 컬럼은 가독성을 위해 본 매트릭스에서 분리했다. 에러 코드는 `internal/engine/errors.go` 및 `docs/02-design/30-error-management-policy.md`를 참조한다.
> 주요 코드: V-01 `ERR_INVALID_SET` / V-02 `ERR_SET_SIZE` / V-03 `ERR_NO_RACK_TILE` / V-04 `ERR_INITIAL_MELD_SCORE` / V-05 `ERR_INITIAL_MELD_SOURCE` / V-06 `ERR_TABLE_TILE_MISSING` / V-07 `ERR_JOKER_NOT_USED` / V-08 `ERR_NOT_YOUR_TURN` / V-09 `ERR_TURN_TIMEOUT` / V-10 `ERR_DRAW_PILE_EMPTY` / V-13 `ERR_NO_REARRANGE_PERM` / V-14 `ERR_GROUP_COLOR_DUP` / V-15 `ERR_RUN_SEQUENCE` `ERR_RUN_RANGE` `ERR_RUN_DUPLICATE`.

---

## 1.1 V-13 재배치 4유형 분해 (2026-04-13 신설)

V-13은 단일 권한 검증이 아니라 **재배치 권한 + 4가지 재배치 유형 각각의 UI 경로**로 구성된다.
2026-04-13 라이브 테스트에서 유형 2(합병)가 UI에서 동작하지 않음을 확인하여 **4유형으로 분해 추적**한다.

근거 규칙: `docs/02-design/06-game-rules.md` §6.2 (재배치 4유형)
근거 감사: `docs/04-testing/48-game-rule-coverage-audit.md` §3 (재배치 4유형 × 3단계 매트릭스)

| 규칙 ID | 검증 항목 | Engine 구현 | Engine 테스트 | UI 구현 | UI 테스트(E2E) | Playtest | 종합 |
|---------|----------|-----------|------------|--------|-------------|---------|------|
| **V-13a** | 재배치 권한 (hasInitialMeld) | ✅ `engine/errors.go:52` `validator.go` (간접) | ✅ `game_rules_comprehensive_test.go:574` | ✅ `GameClient.tsx` 최초 등록 후 재배치 활성 | ❌ E2E 0건 | ✅ AI 대전에서 자연 관찰 | ⚠️ |
| **V-13b** | 유형 1: 세트 분할 (split) | ✅ V-06 보존 + V-01 유효성 | ✅ `conservation_test.go` 간접 | ✅ `f3eedb9` tilesDraggable 프롭 + DraggableTile 렌더링 + `handleDragEnd` 내 table→다른 group 이동 + pending→rack 되돌리기 landed | ⚠️ TC-RR-04 Negative **PASS** (회귀 가드) + TC-RR-03 Happy **fixme** (프론트 재배포 대기) | ❌ S4 미실행 | **부분** |
| **V-13c** | 유형 2: 세트 합병 (merge) — **본 사건** | ✅ V-01 4색 그룹 + V-06 보존 | ✅ 그룹 유효성 테스트 다수 | ✅ `23e770a` `GameClient.tsx handleDragEnd` 서버 확정 그룹 머지 분기 landed | ⚠️ `adf0d84` TC-RR-01 Happy **fixme** + TC-RR-02 Negative **PASS** | ❌ S4 미실행 | **부분** |
| **V-13d** | 유형 3: 타일 이동 (move) | ✅ V-06 보존 + V-01/V-02 최종 유효성 | ✅ `conservation_test.go` 간접 | ✅ `f3eedb9` tilesDraggable + `handleDragEnd` 내 table→다른 group 이동 분기 landed | ❌ 전용 TC 없음 (TC-RR-03 간접 커버 예정, 현재 fixme) | ❌ S4 미실행 | **부분** |
| **V-13e** | 유형 4: 조커 교체 (joker swap) | ✅ V-07 조커 즉시 사용 검증 | ✅ `game_rules_comprehensive_test.go` joker swap | ⚠️ `8e540cc` P3 MVP — `pendingRecoveredJokers` + `JokerSwapIndicator` + ConfirmTurn 사전 차단 landed, **회수 조커 재드래그 미완** (Sprint 6 후반 이월) | ⚠️ TC-RR-06 **fixme** (재배포 대기) | ⚠️ S4 Phase D 조커 미획득 스킵 | **부분** |

> **V-13b/V-13d UI 구현 주석**: `GameClient.tsx` `handleDragEnd` 내 `if (!sourceIsPending) return;` 가드는 **의도적 V-06 conservation 준수**이다.
> 루미큐브 규칙상 "서버 확정 그룹의 타일을 랙으로 회수"는 타일 보존 법칙 위반이므로 **차단하는 것이 정답**이다.
> 따라서 V-13b UI 구현은 (i) pending 그룹 타일 랙 되돌리기, (ii) 테이블 타일 → 다른 그룹 이동 두 경로로 완성이며 미완이 아니다.

**개선 계획** (Sprint 6, 감사 보고 §6 권고 기반):
- ~~V-13c (합병): 즉시 조치~~ → **Day 2 초반 landed** (`23e770a` 구현 + `adf0d84` E2E), TC-RR-01 Happy fixme 해제는 프론트 재배포 후속
- ~~V-13b (분할): UI 구현~~ → **Day 2 후반 landed** (`f3eedb9`), TC-RR-03 Happy fixme 해제 후속 (프론트 재배포)
- ~~V-13d (이동): UI 구현~~ → **Day 2 후반 landed** (`f3eedb9`), 전용 E2E TC 신규 작성 필요 (현재 TC-RR-03 간접 커버만)
- V-13e (조커 회수): 회수 조커 재드래그 UX 후속 (Sprint 6 후반 이월) + Playtest S4 결정론적 전환 (시드 기반)
- 추가: `e2e/rearrangement.spec.ts` fixme 일괄 해제 (프론트 재배포 후)

---

## 2. 비검증 규칙 (게임룰 문서에 있지만 코드에 없는 것)

| 규칙 | 문서 위치 | 구현 상태 | 심각도 | 비고 |
|------|----------|----------|--------|------|
| **패널티 드로우 3장** | §6.1 "실패 시 스냅샷 복원 + 패널티 드로우 3장" | **구현 완료** (2026-04-10) | Medium | `game_service.go:penaltyDrawAndAdvance` + `ws_handler.go:broadcastTurnEndWithPenalty` |
| **AI 5턴 연속 강제 드로우 → 비활성화** | §8.1 "5턴 연속 강제 드로우 시 해당 AI 비활성화" | **구현 완료** (2026-04-10) | Low | `ws_handler.go:incrementForceDrawCounter` + `PlayerState.ConsecutiveForceDrawCount` |
| **끊김 후 3턴 연속 부재 → 제외** | §8.2 "3턴 연속 부재 시 게임에서 제외" | **구현 완료** (2026-04-10) | Low | `ws_handler.go:checkAbsentTurnAndForfeit` + `PlayerState.ConsecutiveAbsentTurns` |

---

## 3. 타일 시스템

| 항목 | 문서 위치 | 구현 파일:라인 | 테스트 | 상태 |
|------|----------|--------------|--------|------|
| 106장 생성 (4색×13×2 + 조커2) | §1.1 | `engine/pool.go` → `NewDrawPile()` | `pool_test.go`, `conservation_test.go` | **PASS** |
| 타일 인코딩 (R7a, JK1 등) | §1.2 | `engine/tile.go` → `ParseTileCode()` | `tile_test.go` | **PASS** |
| 타일 점수 (숫자값, 조커=30) | §1.3 | `engine/tile.go` → `TileScore()` | `tile_test.go` | **PASS** |
| 셔플 (Fisher-Yates) | §2 | `engine/pool.go` → `Shuffle()` | `pool_test.go` | **PASS** |
| 14장 분배 | §2 | `service/game_service.go` → `StartGame()` | `game_service_test.go` | **PASS** |
| 타일 보존 법칙 (총합 106 유지) | §6.4 | `engine/validator.go:91-119` | `conservation_test.go` (43개) | **PASS** |

---

## 4. 턴 관리

| 항목 | 문서 위치 | 구현 파일 | 테스트 | 상태 |
|------|----------|----------|--------|------|
| 턴 순서 (seat 순환) | §5.5 | `service/game_service.go` → `advanceTurn()` | `game_service_test.go` | **PASS** |
| 타임아웃 (30~120초) | §5.4 | `service/turn_service.go:107` + `handler/ws_handler.go` (타이머) | `turn_service_test.go:148` | **PASS** |
| 드로우 (1장 뽑기) | §5.3 | `service/game_service.go:508` → `DrawTile()` | `game_service_test.go` | **PASS** |
| 턴 확정 (confirm) | §5.2 | `service/game_service.go:292` → `ConfirmTurn()` | `game_service_test.go` | **PASS** |
| 스냅샷 롤백 | §5.2, §6.1 | `service/game_service.go:321-327` | `game_service_test.go` | **PASS** |

---

## 5. 승리/종료 조건

| 항목 | 문서 위치 | 구현 파일 | 테스트 | 상태 |
|------|----------|----------|--------|------|
| 정상 승리 (랙 0장) | §7.1 | `service/game_service.go` (ConfirmTurn 후 체크) | `game_service_test.go` | **PASS** |
| 교착 상태 판정 | §7.2 | `service/game_service.go` (ConsecutivePassCount ≥ playerCount) | `game_service_test.go:580-603` | **PASS** |
| 교착 시 점수 비교 | §7.2 | `service/game_service.go` → `calculateScores()` | `game_service_test.go:597` | **PASS** |
| 점수 계산 (조커=30점) | §7.3 | `engine/tile.go` → `TileScore()` | `tile_test.go` | **PASS** |
| 동점 처리 (타일 수 비교) | §7.2 | `service/game_service.go` | 테스트 확인 필요 | **확인 필요** |

---

## 6. 조커 규칙

| 항목 | 문서 위치 | 구현 파일 | 테스트 | 상태 |
|------|----------|----------|--------|------|
| 그룹/런 대체 | §3.3 | `engine/group.go`, `engine/run.go` (조커 필터링) | `group_test.go:104`, `run_test.go:82` | **PASS** |
| 세트 내 복수 조커 | §3.3 | `engine/group.go`, `engine/run.go` | `game_rules_comprehensive_test.go` | **PASS** |
| 조커 교체 (즉시 사용 필수) | §3.3, V-07 | `engine/validator.go:164-181` | `validator_test.go:251-292` | **PASS** |
| 최초 등록 시 조커 점수 | §4.1 | `engine/validator.go:133-162` (inferJokerValue) | `validator_test.go:317-359` | **PASS** |

---

## 7. 연습 모드

| 항목 | 문서 위치 | 구현 파일 | 상태 |
|------|----------|----------|------|
| Stage 1~5 (부분 규칙) | §9.2 | `handler/practice_handler.go` | **구현 완료** |
| Stage 6 (AI 대전) | §9.2 | `handler/practice_handler.go` | **구현 완료** |
| 턴 타임아웃 무제한 | §9.1 | `handler/practice_handler.go` | **구현 완료** |
| ELO 미반영 | §9.1 | `service/game_service.go` | **구현 완료** |

---

## 8. AI 특수 규칙

| 항목 | 문서 위치 | 구현 파일 | 상태 |
|------|----------|----------|------|
| 무효 수 → 재요청 (max 3회) | §8.1 | `ai-adapter/src/adapter/base.adapter.ts` (retry loop) | **PASS** |
| 3회 실패 → 강제 드로우 | §8.1 | `handler/ws_handler.go:866-882` → `forceAIDraw()` | **PASS** |
| **5턴 연속 강제 드로우 → 비활성화** | §8.1 | `handler/ws_handler.go:incrementForceDrawCounter` + `model/tile.go:ConsecutiveForceDrawCount` | **PASS** (2026-04-10) |

---

## 9. 파일 인덱스

게임 규칙 관련 주요 소스 파일 목록.

### Engine (규칙 검증 핵심)
| 파일 | 역할 | 라인 수 |
|------|------|---------|
| `internal/engine/validator.go` | V-01~V-07 턴 확정 검증 | ~180 |
| `internal/engine/group.go` | 그룹 유효성 (V-01, V-02, V-14) | ~80 |
| `internal/engine/run.go` | 런 유효성 (V-01, V-02, V-15) | ~100 |
| `internal/engine/tile.go` | 타일 파싱, 점수 계산 | ~100 |
| `internal/engine/pool.go` | 드로우 파일, 셔플, 분배 | ~60 |
| `internal/engine/errors.go` | 에러 코드 상수 19개 | ~85 |

### Service (비즈니스 로직)
| 파일 | 역할 |
|------|------|
| `internal/service/game_service.go` | ConfirmTurn, DrawTile, 승리/교착 판정 |
| `internal/service/turn_service.go` | HandleTimeout, 턴 순서 관리 |

### Test (테스트 커버리지)
| 파일 | 테스트 수 | 커버 규칙 |
|------|----------|----------|
| `engine/validator_test.go` | ~30 | V-01~V-07 |
| `engine/group_test.go` | ~10 | V-01, V-02, V-14 |
| `engine/run_test.go` | ~15 | V-01, V-02, V-15 |
| `engine/conservation_test.go` | 43 | V-06 (타일 보존) |
| `engine/game_rules_comprehensive_test.go` | ~20 | V-01~V-07 종합 |
| `service/game_service_test.go` | ~30 | V-04, V-06, V-08, V-11, V-12 |
| `service/turn_service_test.go` | ~20 | V-04, V-05, V-07, V-09, V-10 |

---

## 10. 운영 규칙

이 문서는 다음 시점에 반드시 갱신한다:

1. **게임 엔진 코드 수정 시** — 영향받는 규칙 ID의 구현 파일:라인 업데이트
2. **게임 규칙 문서 변경 시** — 새 규칙 추가 또는 기존 규칙 변경 반영
3. **미구현 규칙 구현 시** — §2 "비검증 규칙"에서 해당 항목을 §1로 이동
4. **Sprint 회고 시** — 규칙 위반 사고가 있었으면 이 문서의 누락 여부 점검
5. **UI/E2E 작업 시** — UI 구현 또는 E2E 테스트가 추가/제거되면 §1의 해당 컬럼을 즉시 갱신

**아키텍트 책임**: 게임 엔진 수정 계획서 작성 시 이 문서를 참조하여 규칙 커버리지를 확인한다.

**3단계 매트릭스 의무화** (2026-04-13~):
- 새 규칙 추가 시 §1에 7컬럼 행을 추가하고 5단계(Engine 구현/Engine 테스트/UI 구현/UI 테스트/Playtest)를 모두 평가한다
- 5단계 중 하나라도 ⚠️/❌이면 종합 컬럼은 "부분" 또는 "미완"으로 표기하며 PR 본문에 명시한다
- 체크리스트 6건은 `docs/04-testing/48-game-rule-coverage-audit.md` §8 참조

---

## 11. 요약 (2026-04-13 감사 기준)

3단계 매트릭스로 재평가한 결과:

### V-01 ~ V-15 (V-13을 V-13a~V-13e 5건으로 분해 → 총 19개 규칙)
| 종합 상태 | 건수 | 비율 | 규칙 ID |
|---------|-----|------|--------|
| ✅ 완료 (5단계 모두 ✅) | 6 | 32% | V-01, V-02, V-04, V-06, V-14, V-15 |
| ⚠️ 부분 (E2E/Playtest 일부 결손 또는 UI/E2E fixme) | 13 | 68% | V-03, V-05, V-07, V-08, V-09, V-10, V-11, V-12, V-13a, **V-13b**, **V-13c**, **V-13d**, V-13e |
| ❌ 미완/버그 (UI 또는 핵심 기능 결손) | 0 | 0% | — |

> 위 합계는 V-13을 V-13a~e의 5건으로 분해한 결과(총 19건 기준, V-13 통합 행은 카운트에서 제외)이다.
> **Sprint 6 Day 2 진전**: 2026-04-13 기준 ❌ 3건(V-13b/c/d) → 0건 해소.
> - V-13c (합병, 본 사건): Day 2 초반에 UI 복원(`23e770a`) + E2E(`adf0d84`) landed → **버그 → 부분**
> - V-13b (분할), V-13d (이동): Day 2 후반 P2-1 `f3eedb9` UI 완전 랜딩 (table→group 이동 + pending→rack) → **미완 → 부분** (종합 판정은 E2E Happy fixme로 "부분"이지만 UI는 ✅)
> - V-13e (조커 교체): Day 2 후반 P3 `8e540cc` MVP 랜딩으로 UI 부분 커버 유지 → **부분 유지** (세부 개선)
>
> 단, ⚠️ "부분"은 여전히 sprint 6 후반 후속 작업 대상이다:
> (i) 모든 TC-RR-{01,03,05,06} Happy fixme 해제 (프론트 재배포 후), (ii) V-13d 전용 E2E TC 신규 작성, (iii) V-13e 회수 조커 재드래그 UX, (iv) Playtest S4 결정론적 전환.
>
> **참고**: 서버 확정 그룹 → 랙 회수 경로는 V-06 conservation 위반이므로 `handleDragEnd`에서 의도적으로 차단되어 있으며 gap이 아니다 (§1.1 V-13b/d 주석 참조).

### 핵심 결손 영역
1. **재배치 4유형 UI 구현** (V-13b/c/d/e) — 본 사건의 직접 원인
2. **E2E 테스트 커버리지** — 9개 규칙이 E2E 직접 케이스 부재 (간접만)
3. **Playtest 결정론적 시나리오** — S4 조커 시나리오가 확률 의존으로 미실행

### 재발 방지 관련 문서
- 감사 보고: `docs/04-testing/48-game-rule-coverage-audit.md`
- 권고 항목: 감사 §6 (즉시/단기/장기 12건)
- 신규 규칙 체크리스트: 감사 §8 (6항목 의무화)

---

## 12. 업데이트 이력

- **2026-04-13 (Day 2 후반, 정정)**: Sprint 6 Day 2 P2/P3 UI 구현 반영 — V-13c 합병 UI ✅ (`23e770a` + `adf0d84`), V-13b 분할 UI ✅ 완전 랜딩 (`f3eedb9` — table→group 이동 + pending→rack), V-13d 이동 UI ✅ (동일 커밋), V-13e 조커 교체 P3 MVP 랜딩 (`8e540cc`). 결과: ❌ 3건 → 0건 해소, ⚠️ 10 → 13, ✅ 6 유지. E2E 4건(TC-RR-03/04/05/06) 추가(대부분 fixme, 프론트 재배포 후 해제). **정정**: 이전 기록의 "V-13b split-to-rack 경로 미완"은 오해였음 — `handleDragEnd` `!sourceIsPending` 가드는 V-06 conservation 준수이며 차단이 정답. §1.1에 주석으로 명시. 잔여 gap: V-13d 전용 E2E TC, V-13e 회수 조커 재드래그, Playtest S4 결정론적 전환.
- **2026-04-13**: 3단계(Engine/Engine 테스트/UI/UI 테스트/Playtest) 7컬럼 매트릭스로 확장. V-13을 V-13a~V-13e 4유형으로 분해. 기존 "PASS" 표기를 "엔진 한정 PASS"로 재해석하여 종합 상태 재산정. 요약 섹션(§11) 신설. 계기: 2026-04-13 라이브 테스트 V-13c 합병 UI 누락 사건. 감사 보고: `docs/04-testing/48-game-rule-coverage-audit.md`.
- **2026-04-10**: 비검증 규칙 §2 3건(패널티 드로우, AI 5턴 강제 드로우, 끊김 후 3턴 부재) 구현 완료 반영. 에러코드 전수 검토(커밋 `822282e`)와 동시 갱신. (당시 UI 컬럼 부재로 V-13 UI 누락 미인지)
- **2026-03-29**: V-01~V-15 초기 매트릭스 작성. Engine 구현 + Engine 테스트 2단계 기준.
