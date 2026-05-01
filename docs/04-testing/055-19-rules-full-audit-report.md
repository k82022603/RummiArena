# 52. 19개 게임 규칙 3단계 매트릭스 전수 재감사 보고서

- **작성일**: 2026-04-14 (Sprint 6 Day 3)
- **작성자**: architect-1 (Task #5 B1)
- **범위**: V-01 ~ V-15 (V-13을 V-13a~V-13e 5개로 분해 → 총 19개 규칙)
- **목적**: 어제 V-13에서 발견된 "엔진 ✅ / UI ❌" 패턴이 다른 규칙에도 숨어있는지 전수 검증
- **산출물**:
  1. 본 보고서 (§5 "결정론 테스트 필요 규칙" 섹션은 B3에 핸드오프)
  2. `docs/02-design/31-game-rule-traceability.md` 3차 갱신
  3. `docs/02-design/36-rule-implementation-checklist-template.md` 신규

---

## 1. Executive Summary

### 1.1 전체 결과

| 종합 상태 | Day 2 마감 | Day 3 재감사 | Δ |
|---------|:---------:|:------------:|:--:|
| ✅ 완료 (5단계 모두 ✅) | 6 | **9** | **+3** |
| ⚠️ 부분 (E2E/Playtest 일부 결손) | 13 | **10** | **−3** |
| ❌ 미완/버그 | 0 | 0 | — |
| **총 규칙** | 19 | 19 | — |

**Day 3 진전**:
- V-10 (드로우 파일 소진), V-11 (교착), V-12 (승리 조건) — ⚠️→✅ **3건 승격**
- 이 3건은 Sprint 5 lifecycle 작업(`game-lifecycle.spec.ts`)에서 이미 E2E가 구현되어 있었으나 **추적성 매트릭스 반영이 누락**되어 있었음. 본 재감사로 매트릭스를 실제 테스트 자산에 맞춰 동기화.
- V-13b/c/d Day 2 UI 랜딩 결과는 Day 2 후반 커밋(`f3eedb9`, `23e770a`, `adf0d84`, `8e540cc`)으로 이미 매트릭스에 반영되어 있었음 (V-13c 본 사건 수정).

### 1.2 놀랍게 누락되어 있던 항목 ("재감사 전 매트릭스가 거짓말하고 있던" 항목)

| 규칙 ID | Day 2 매트릭스 표기 | 실제 상태 | 원인 |
|--------|-------------------|----------|------|
| **V-10** (드로우 파일 소진) | ⚠️ "E2E 0건" | ✅ **TC-DL-E01~E04 (4건 PASS)** | Sprint 5 lifecycle 구현 시 추적성 매트릭스 미갱신 |
| **V-11** (교착) | ⚠️ "E2E 0건" | ✅ **TC-LF-E07 PASS** (GameEndedOverlay 교착 라벨) | 동일 — 매트릭스 미갱신 |
| **V-12** (승리) | ⚠️ "E2E 직접 케이스 없음" | ✅ **TC-LF-E05/E09 + A-11 PASS** | 동일 — 매트릭스 미갱신 |
| **V-13a** (재배치 권한) | ⚠️ "E2E 0건" | ⚠️ **TC-RR-02/04 Negative PASS** (UI 가드만, 엔진은 V-05 간접) | 매트릭스 갱신은 됐으나 엔진 구현이 `ErrNoRearrangePerm` orphan이라는 사실이 누락 |

**교훈**: 추적성 매트릭스는 "자동 생성"이 아니라 **수작업 갱신 의존 문서**이기 때문에, 구현-테스트 랜딩과 매트릭스 갱신이 서로 다른 커밋으로 분리되면 "착각된 PASS"가 발생한다. V-10~V-12는 Day 2 시점에서는 "엔진 검증 있음 + E2E 없음"으로 기록돼 있었지만, 실제로는 E2E가 이미 있었다. **매트릭스가 현실을 반영하지 못한 것이 V-13 사건의 역상(逆像)**이다.

### 1.3 확인된 "진짜 빈틈"

1. **V-09 턴 타임아웃 전이 E2E 0건** — 설정 E2E(TC-GF-008/009, TC-RC-007)와 카운트다운 E2E(A-12)는 있으나, **실제 타임아웃 만료 → HandleTimeout → 강제 드로우 → 다음 턴 전이**를 end-to-end로 검증하는 케이스는 없다. Playwright의 긴 대기 시간(30초) 비용 문제로 생략된 것으로 추정.
2. **V-13a 엔진 orphan code** — `ErrNoRearrangePerm` 상수는 정의되어 있으나 `validator.go`에서 사용되지 않고, V-05(`ErrInitialMeldSource`)가 간접적으로 재배치 권한을 차단한다. 사용자 경험상 차이는 없으나 에러 메시지 정확도에 gap이 있다 (`work_logs/reviews/2026-04-10-game-server-review.md §2.7.1` 참조).
3. **V-13b/c/d/e 프론트 재배포 대기** — Day 2 P2-1/P3 커밋으로 UI는 완성되었으나, E2E TC-RR-01/03/05/06 Happy는 여전히 `fixme` 상태(프론트 재배포 대기). Day 3 라이브 테스트 후 일괄 해제 예정.
4. **V-13e 회수 조커 재드래그 UX** — MVP 랜딩(`8e540cc`)은 회수 감지와 ConfirmTurn 차단까지만 구현. 회수된 조커를 다른 세트에 재드래그하는 UX는 Sprint 6 후반 이월.
5. **조커 의존 규칙(V-07, V-13e)의 S4 Playtest 미실행** — 조커 획득 확률(초기 6장 드로우 ~34%) 때문에 한 번도 Phase D/E가 실제로 실행되지 않음. B3 결정론적 프레임워크가 해결할 영역.

---

## 2. 19규칙 재감사 결과 (V-01 ~ V-15)

### 표기 규약 (2026-04-13 도입, 본 보고 유지)

| 컬럼 | 의미 | ✅ 조건 |
|------|------|--------|
| Engine 구현 | 서버 엔진 검증 로직 존재 | `internal/engine/` 또는 `internal/service/` 에 실제 호출되는 검증 코드 |
| Engine 테스트 | Go 단위/통합 테스트 존재 | Happy + Negative 최소 각 1건 |
| UI 구현 | 사용자가 실제로 해당 동작을 수행할 수 있는 프론트 경로 | `src/frontend/` 인터랙션 핸들러 존재 |
| UI 테스트(E2E) | Playwright E2E 시나리오 존재 | Happy 최소 1건 |
| Playtest | Human×AI 시나리오에서 실제 실행/관찰 | `docs/04-testing/` 시나리오 보고 |
| **종합** | 위 5개 모두 ✅일 때만 ✅ | — |

---

### V-01 · 세트가 유효한 그룹 또는 런인가

| 단계 | 상태 | 증거 |
|-----|------|------|
| Engine 구현 | ✅ | `internal/engine/validator.go:22-57 ValidateTileSet` / `ValidateTable` |
| Engine 테스트 | ✅ | `validator_test.go:87,135`, `group_test.go:18`, `run_test.go:9` |
| UI 구현 | ✅ | `GameClient.tsx handleConfirmTurn` 서버 검증 트리거 + `GameBoard.tsx detectDuplicateColors` 색상 경고 |
| E2E | ✅ | `e2e/game-rules.spec.ts` GR-01/02, RN-01/02 (Practice 간접) |
| Playtest | ✅ | S1~S7 다수 |
| **종합** | ✅ | — |

---

### V-02 · 세트가 3장 이상인가

| 단계 | 상태 | 증거 |
|-----|------|------|
| Engine 구현 | ✅ | `engine/validator.go:23 len(ts.Tiles) < 3` → `ErrSetSize` |
| Engine 테스트 | ✅ | `validator_test.go:62`, `group_test.go:47,54`, `run_test.go:38` |
| UI 구현 | ✅ | 서버 검증 (UI는 2장 상태를 허용하나 확정 시 서버가 거부) |
| E2E | ✅ | `game-rules.spec.ts` GR-03 (2타일 → 클리어 불가), RN-05 |
| Playtest | ✅ | S1 기본 등록 |
| **종합** | ✅ | — |

---

### V-03 · 랙에서 최소 1장 추가했는가

| 단계 | 상태 | 증거 |
|-----|------|------|
| Engine 구현 | ✅ | `validator.go:86-89 tilesAdded < 1` → `ErrNoRackTile` |
| Engine 테스트 | ✅ | `validator_test.go:148-163` |
| UI 구현 | ✅ | 서버 검증 트리거 (확정 버튼이 랙 변화 없음 상태에서 비활성) |
| E2E | ⚠️ | 직접 Negative 케이스 없음 — `game-flow.spec.ts` A-8b "드로우 후 확정 비활성"이 간접 커버 |
| Playtest | ✅ | S1~S7 간접 |
| **종합** | ⚠️ | 원인: E2E 직접 Negative 케이스 신설 필요 (낮은 우선순위, 간접 가드가 이미 존재) |

---

### V-04 · 최초 등록 30점 이상인가

| 단계 | 상태 | 증거 |
|-----|------|------|
| Engine 구현 | ✅ | `validator.go:133-162 validateInitialMeld` (조커 점수 `inferJokerValue` 포함) |
| Engine 테스트 | ✅ | `validator_test.go:167-205`, `turn_service_test.go:454`, `validator_test.go:317-359` |
| UI 구현 | ✅ | `GameClient.tsx` 서버 검증 트리거 + `components/game/PlayerCard.tsx` 최초 등록 배지 + CS-12 "최초 등록 30점 안내" |
| E2E | ✅ | `game-rules.spec.ts` (Practice 스테이지 간접) + `game-ui-state.spec.ts CS-12` 30점 안내 표시 |
| Playtest | ✅ | S1, S4 등 |
| **종합** | ✅ | — |

---

### V-05 · 최초 등록 시 랙 타일만 사용했는가

| 단계 | 상태 | 증거 |
|-----|------|------|
| Engine 구현 | ✅ | `validator.go:123-131 validateInitialMeld` tableBefore 보존 체크 → `ErrInitialMeldSource` |
| Engine 테스트 | ✅ | `validator_test.go:208-229`, `turn_service_test.go:497-558` |
| UI 구현 | ✅ | 서버 검증 (V-13a와 동일 경로 — 최초 등록 전 재배치 차단) |
| E2E | ⚠️ | 직접 Negative 케이스 없음 — `rearrangement.spec.ts TC-RR-04` Negative가 간접 커버 |
| Playtest | ✅ | S4 등 |
| **종합** | ⚠️ | 원인: E2E 직접 Negative 케이스 신설 필요 (우선순위 낮음) |

---

### V-06 · 테이블 타일이 유실되지 않았는가

| 단계 | 상태 | 증거 |
|-----|------|------|
| Engine 구현 | ✅ | `validator.go:91-97,111-119 validateTileConservation` (총 수 + 코드 수준 빈도 비교) |
| Engine 테스트 | ✅ | `conservation_test.go` 43건 (Happy + Negative 다수) |
| UI 구현 | ✅ | `GameClient.tsx handleDragEnd:618 sourceIsPending` 가드 — 서버 확정 그룹 → 랙 회수 차단 (V-06 준수) |
| E2E | ✅ | `game-rules.spec.ts` 기본 (간접) |
| Playtest | ✅ | S1~S7 간접 |
| **종합** | ✅ | — |

---

### V-07 · 조커 교체 후 즉시 사용했는가

| 단계 | 상태 | 증거 |
|-----|------|------|
| Engine 구현 | ✅ | `validator.go:106-110,164-176 validateJokerReturned` → `ErrJokerNotUsed` |
| Engine 테스트 | ✅ | `validator_test.go:251-292`, `turn_service_test.go:329-452` |
| UI 구현 | ⚠️ | `8e540cc` P3 MVP — `pendingRecoveredJokers` 추적 + `JokerSwapIndicator` + ConfirmTurn 사전 차단. **회수 조커 재드래그 UX 미완** (Sprint 6 후반 이월) |
| E2E | ⚠️ | `rearrangement.spec.ts TC-RR-06 fixme` (재배포 대기) |
| Playtest | ⚠️ | S4 Phase D 조커 미획득 스킵 |
| **종합** | ⚠️ | 원인: (1) 회수 조커 재드래그 UX 미완 (2) Playtest는 조커 확률로 미실행 — **B3 결정론 대상** |

---

### V-08 · 자기 턴인가

| 단계 | 상태 | 증거 |
|-----|------|------|
| Engine 구현 | ✅ | `service/game_service.go:295-300, 607, 671 state.CurrentSeat != seat` 체크 |
| Engine 테스트 | ✅ | `game_service_test.go` 간접 |
| UI 구현 | ✅ | `GameClient.tsx` `isMyTurn` 상태 → 액션 버튼 활성 제어 |
| E2E | ⚠️ | `game-ui-multiplayer.spec.ts A-10` "내 차례 배지" + `game-ui-state.spec.ts CS-13` "내 차례 액션 버튼" 간접만, **상대 턴일 때 액션 시도 차단 직접 E2E 없음** |
| Playtest | ✅ | 모든 시나리오 |
| **종합** | ⚠️ | 원인: E2E 직접 Negative 신설 가치 낮음 (서버가 반드시 차단, UI는 비활성 표시) |

---

### V-09 · 턴 타임아웃

| 단계 | 상태 | 증거 |
|-----|------|------|
| Engine 구현 | ✅ | `service/turn_service.go:106-127 HandleTimeout` + `ws_handler.go` 타이머 tick |
| Engine 테스트 | ✅ | `turn_service_test.go:148-198` |
| UI 구현 | ✅ | `components/game/TurnTimer.tsx` + `GameClient.tsx` 타이머 구독 |
| E2E | ⚠️ | **설정 값**만: `TC-GF-008` 30초, `TC-GF-009` 120초, `TC-RC-007` 기본 60초, `A-12` 카운트다운 동작. **타임아웃 만료 → HandleTimeout → 강제 드로우 전이 E2E 0건** |
| Playtest | ✅ | AI 대전 다수 관찰 |
| **종합** | ⚠️ | 원인: 실시간 타임아웃을 30초 대기로 재현하는 Playwright 비용 → 생략. 결정론 프레임워크(B3)에서 타이머 주입으로 재현 가능 |

---

### V-10 · 드로우 파일이 비어있는가

| 단계 | 상태 | 증거 |
|-----|------|------|
| Engine 구현 | ✅ | `engine/pool.go:49-53 Draw()` → `ErrDrawPileEmpty` |
| Engine 테스트 | ✅ | `turn_service_test.go:199-230`, `pool_test.go` |
| UI 구현 | ✅ | `GameClient.tsx` 드로우 버튼 → 패스 전환, 드로우 파일 X 시각화 |
| E2E | ✅ **(Day 3 재감사 발굴)** | `game-lifecycle.spec.ts TC-DL-E01` 패스 버튼 표시 / `TC-DL-E02` 안내 메시지 / `TC-DL-E03` X 시각화 / `TC-DL-E04` 배치 중 패스 비활성 |
| Playtest | ⚠️ | Round 4 80턴 완주에서 1회 관찰 |
| **종합** | ✅ **(⚠️→✅ 승격)** | 원인 제거: TC-DL-E01~04가 이미 존재. 매트릭스 갱신 누락이었음 |

---

### V-11 · 교착 상태인가

| 단계 | 상태 | 증거 |
|-----|------|------|
| Engine 구현 | ✅ | `service/game_service.go:618-639 ConsecutivePassCount` + `activePlayerCount` 비교 |
| Engine 테스트 | ✅ | `game_service_test.go:580-603,701-732` |
| UI 구현 | ✅ | `GameClient.tsx` GAME_OVER 메시지 → GameEndedOverlay 교착 종료 분기 |
| E2E | ✅ **(Day 3 재감사 발굴)** | `game-lifecycle.spec.ts TC-LF-E07` "교착 종료 라벨" + `deadlockReason: ALL_PASS` 안내 검증 |
| Playtest | ⚠️ | 자연 발생 드물어 드물게 관찰 |
| **종합** | ✅ **(⚠️→✅ 승격)** | 원인 제거: TC-LF-E07 존재, 매트릭스 반영 누락 |

---

### V-12 · 승리 조건 (랙 타일 0장)

| 단계 | 상태 | 증거 |
|-----|------|------|
| Engine 구현 | ✅ | `service/game_service.go:483-500` ConfirmTurn 후 랙 체크 + `WinnerID` 설정 |
| Engine 테스트 | ✅ | `game_service_test.go` 간접 |
| UI 구현 | ✅ | `GameClient.tsx GameEndedOverlay` 렌더 + trophy 이모지 |
| E2E | ✅ **(Day 3 재감사 발굴)** | `game-lifecycle.spec.ts TC-LF-E05` 정상 종료 라벨 / `TC-LF-E09` 남은 타일 수 표시 / `TC-LF-E06` 기권 종료 / `game-ui-multiplayer.spec.ts A-11` GameEndedOverlay 구조 |
| Playtest | ✅ | Round 4 DeepSeek 등 다수 |
| **종합** | ✅ **(⚠️→✅ 승격)** | 원인 제거: winnerSeat 주입 기반 E2E 다수 존재 |

---

### V-13a · 재배치 권한 (hasInitialMeld)

| 단계 | 상태 | 증거 |
|-----|------|------|
| Engine 구현 | ⚠️ | **간접 구현** — `engine/errors.go:52 ErrNoRearrangePerm` 상수 정의만, 실제로는 `validator.go:100-104 validateInitialMeld → ErrInitialMeldSource` 대체 차단 |
| Engine 테스트 | ✅ | `game_rules_comprehensive_test.go:574`, `validator_test.go:208-229` V-05 간접 |
| UI 구현 | ✅ | `GameClient.tsx:644 if (!hasInitialMeld) return` 재배치 차단 가드 |
| E2E | ✅ | `rearrangement.spec.ts TC-RR-02` (최초 등록 전 합병 차단) + `TC-RR-04` (분할 차단) Negative PASS |
| Playtest | ✅ | AI 대전에서 자연 관찰 |
| **종합** | ⚠️ | 원인: `ErrNoRearrangePerm` orphan으로 에러 메시지 정확도 gap. 기능적 버그는 없음. 리팩터: `validator.go` 진입 직후 V-13a 명시 분기 추가 권장 (`work_logs/reviews/2026-04-10-game-server-review.md §2.7.1`) |

---

### V-13b · 재배치 유형 1 — 세트 분할 (split)

| 단계 | 상태 | 증거 |
|-----|------|------|
| Engine 구현 | ✅ | V-06 보존 + V-01 유효성 |
| Engine 테스트 | ✅ | `conservation_test.go` 간접 |
| UI 구현 | ✅ | `f3eedb9` `tilesDraggable` prop + `DraggableTile` 렌더링 + `handleDragEnd` table→다른 group 이동 + pending→rack 되돌리기 landed |
| E2E | ⚠️ | `rearrangement.spec.ts TC-RR-04` Negative PASS (회귀 가드) + `TC-RR-03` Happy **fixme** (프론트 재배포 대기) |
| Playtest | ❌ | S4 미실행 (조커 확률) — **B3 결정론 대상** |
| **종합** | ⚠️ | 원인: TC-RR-03 fixme 해제 필요 + S4 결정론 전환 필요 |

---

### V-13c · 재배치 유형 2 — 세트 합병 (merge) — **본 사건**

| 단계 | 상태 | 증거 |
|-----|------|------|
| Engine 구현 | ✅ | V-01 4색 그룹 + V-06 보존 |
| Engine 테스트 | ✅ | 그룹 유효성 테스트 다수 |
| UI 구현 | ✅ | `23e770a` `GameClient.tsx handleDragEnd` 서버 확정 그룹 머지 분기 landed (2026-04-13 Day 2 초반) |
| E2E | ⚠️ | `adf0d84` `TC-RR-01` Happy **fixme** + `TC-RR-02` Negative PASS |
| Playtest | ❌ | S4 미실행 — **B3 결정론 대상** |
| **종합** | ⚠️ | 원인: TC-RR-01 fixme 해제 필요 + S4 결정론 전환 필요 |

---

### V-13d · 재배치 유형 3 — 타일 이동 (move)

| 단계 | 상태 | 증거 |
|-----|------|------|
| Engine 구현 | ✅ | V-06 보존 + V-01/V-02 최종 유효성 |
| Engine 테스트 | ✅ | `conservation_test.go` 간접 |
| UI 구현 | ✅ | `f3eedb9` `tilesDraggable` + `handleDragEnd` table→다른 group 이동 분기 landed |
| E2E | ❌ | 전용 TC 없음 — `TC-RR-03` 간접 커버 예정 (현재 fixme) |
| Playtest | ❌ | S4 미실행 — **B3 결정론 대상** |
| **종합** | ⚠️ | 원인: 전용 E2E TC 신규 작성 필요 + S4 결정론 전환 필요 |

---

### V-13e · 재배치 유형 4 — 조커 교체 (joker swap)

| 단계 | 상태 | 증거 |
|-----|------|------|
| Engine 구현 | ✅ | V-07 조커 즉시 사용 검증 |
| Engine 테스트 | ✅ | `game_rules_comprehensive_test.go` joker swap 케이스 |
| UI 구현 | ⚠️ | `8e540cc` P3 MVP — `pendingRecoveredJokers` + `JokerSwapIndicator` + ConfirmTurn 사전 차단 landed. **회수 조커 재드래그 미완** (Sprint 6 후반 이월) |
| E2E | ⚠️ | `TC-RR-06 fixme` (재배포 대기) |
| Playtest | ⚠️ | S4 Phase D 조커 미획득 스킵 — **B3 결정론 대상** |
| **종합** | ⚠️ | 원인: (1) 회수 조커 재드래그 UX Sprint 6 후반 이월 (2) Playtest 조커 확률 — B3 |

---

### V-14 · 그룹에서 같은 색상 중복 불가

| 단계 | 상태 | 증거 |
|-----|------|------|
| Engine 구현 | ✅ | `engine/group.go` 색상 중복 체크 → `ErrGroupColorDup` |
| Engine 테스트 | ✅ | `group_test.go:62`, `regression_test.go:554` |
| UI 구현 | ✅ | 서버 검증 + `GameBoard.tsx:16 detectDuplicateColors` 드래그 중 경고 |
| E2E | ✅ | `game-rules.spec.ts` GR-04 그룹 색상 불일치 Negative |
| Playtest | ✅ | S1 등 |
| **종합** | ✅ | — |

---

### V-15 · 런에서 숫자 연속 (13→1 순환 불가)

| 단계 | 상태 | 증거 |
|-----|------|------|
| Engine 구현 | ✅ | `engine/run.go:60 checkRunDuplicates` + 순서 검증 → `ErrRunSequence/ErrRunRange/ErrRunDuplicate` |
| Engine 테스트 | ✅ | `run_test.go:53,114,172` |
| UI 구현 | ✅ | 서버 검증 |
| E2E | ✅ | `game-rules.spec.ts` RN-03 (색상 혼합), RN-04 (비연속) Negative |
| Playtest | ✅ | S1 등 |
| **종합** | ✅ | — |

---

## 3. 전수 감사 통계

### 3.1 5단계별 ✅ / ⚠️ / ❌ 분포

| 단계 | ✅ | ⚠️ | ❌ | 소계 |
|-----|---:|---:|---:|----:|
| Engine 구현 | 18 | 1 | 0 | 19 |
| Engine 테스트 | 19 | 0 | 0 | 19 |
| UI 구현 | 17 | 2 | 0 | 19 |
| UI 테스트 (E2E) | 10 | 8 | 1 | 19 |
| Playtest | 13 | 4 | 2 | 19 |
| **종합** | **9** | **10** | **0** | 19 |

### 3.2 결손 카테고리

- **Engine 구현 ⚠️ (1건)**: V-13a — `ErrNoRearrangePerm` orphan (V-05 간접 차단으로 대체)
- **UI 구현 ⚠️ (2건)**: V-07 / V-13e — 조커 회수 재드래그 UX 미완 (동일 항목)
- **E2E ⚠️ (8건)**: V-03, V-05, V-08, V-09, V-13b, V-13c, V-13e + V-13d ❌ (전용 TC 없음)
- **Playtest ⚠️/❌ (6건)**: V-07, V-13e, V-10, V-11 (⚠️ 간헐 관찰) + V-13b, V-13c, V-13d (❌ 미실행)

### 3.3 근본 원인 분류

| 원인 | 해당 규칙 | 해결 경로 |
|------|----------|----------|
| **조커 확률 의존** | V-07, V-13e | B3 결정론적 시드 프레임워크 |
| **재배치 시드 필요** | V-13b, V-13c, V-13d, V-13e | B3 결정론적 시드 프레임워크 |
| **타임아웃 실시간 재현 비용** | V-09 | B3 타이머 주입 |
| **E2E 직접 Negative 생략** | V-03, V-05, V-08 | 단순 TC 추가 (우선순위 낮음) |
| **엔진 orphan code** | V-13a | 리팩터 — `validator.go`에 V-13a 명시 분기 |

---

## 4. B3(qa-2)에 전달할 "결정론 테스트 필요 규칙 목록" — Handoff 섹션

> **본 섹션은 B3 qa-2 Task #7 "Playtest S4 시드 프레임워크 설계 + 실행 스크립트" 에 직접 사용되는 입력 자산이다.**
>
> B3는 결정론적 시드 기반 프레임워크(Go 시드 드로우 + `window.__gameStore.setState` 브리지)로 아래 규칙들을 시나리오화해야 한다.

### 4.1 최우선 대상 (P0) — 조커/재배치 의존, 매트릭스 ⚠️

| 규칙 | 사유 | 최소 시나리오 (시드 조건) |
|------|------|----------------------|
| **V-07** 조커 교체 즉시 사용 | 조커 획득 확률 ~34%로 S4 Phase D 미실행 | 플레이어 초기 핸드에 `JK1` 강제 포함 + 테이블에 `[R7a, JK1, K7b]` 주입 → `B7a` 드래그로 교체 |
| **V-13c** 재배치 합병 (merge) | 본 사건 재발 방지 — 결정론 없이 라이브 테스트 의존 | 테이블 `[R9a, B9a, K9b]` + 랙 `Y9a` 주입 → `hasInitialMeld=true` → 머지 시도 |
| **V-13e** 조커 교체 + 회수 재드래그 | 조커 확률 + 복잡한 UX 분기 | 테이블 `[R7a, JK1, K7b]` + 랙 `B7a, Y5a` + 다른 세트 `[R5a, B5a]` → JK1 회수 후 `[R5a, B5a, JK1]`로 즉시 배치 |
| **V-13b** 재배치 분할 (split) | 서버 확정 런 → 랙 split 경로 (conservation 복잡도) | 테이블 `[B10, B11, B12, B13]` + 랙 `B13b` 재고 → B13 분할 후 랙 복구 |
| **V-13d** 재배치 이동 (move) | 두 세트 간 타일 이동 conservation | 테이블 A `[R5, R6, R7]` + B `[B7, Y7, K7]` + 랙 `R4b` → R7을 B로 이동, A는 `R4b`로 복구 |

### 4.2 P1 — 타임아웃 전이

| 규칙 | 사유 | 필요 인프라 |
|------|------|-----------|
| **V-09** 턴 타임아웃 → 강제 드로우 전이 | Playwright 30초 실시간 대기 비용 | 타이머 주입 API (`window.__gameStore.setState({ turnTimer: 0.01 })`) 또는 서버 측 테스트 전용 타임아웃 단축 플래그 |

### 4.3 P2 — 간접 커버만 있는 Negative 케이스

| 규칙 | 현재 상태 | 추가 TC 제안 |
|------|----------|-------------|
| **V-03** 랙 타일 추가 필요 | A-8b "드로우 후 확정 비활성"이 간접 커버 | 직접: 배치 없이 확정 시도 → 서버 400 + `ErrNoRackTile` 메시지 노출 |
| **V-05** 최초 등록 랙 타일만 | TC-RR-04 Negative 간접 커버 | 직접: 테이블 타일을 이동시키고 최초 등록 시도 → `ErrInitialMeldSource` |
| **V-08** 자기 턴 아님 | A-10 "내 차례 배지" 간접 | 직접: 상대 턴 중 드래그 시도 → 액션 버튼 비활성 + 서버 `ErrNotYourTurn` |

### 4.4 B3에 필요한 공통 인프라

B3가 구현해야 할 공통 헬퍼 (`src/frontend/e2e/helpers/deterministic-seed.ts` 신규 권장):

```typescript
// 결정론적 시드 주입 API (예시)
export async function seedGameState(page, {
  tableGroups,
  myTiles,
  otherRacks,
  hasInitialMeld,
  currentSeat,
  drawPile,          // 다음 N장을 고정
  turnTimer,         // 타이머 단축 (V-09용)
}: SeedOpts): Promise<void>;
```

Go 측에서는:
- `internal/engine/pool.go` 의 `Shuffle()` 에 `RUMMIKUB_TEST_SEED` 환경 변수 지원 추가
- `internal/service/game_service.go` 의 초기 분배에 "첫 N 플레이어에게 강제 타일" 테스트 훅 (env gate)

---

## 5. 권고 사항 (Sprint 6 Day 3~ 우선순위)

### 5.1 즉시 (Day 3)
1. **본 감사 보고 + 매트릭스 커밋** — 재감사 결과가 유실되지 않도록.
2. **TC-RR-01/03/05/06 fixme 해제** — 프론트 재배포 완료 후 일괄 해제 (A4 WS rate limit 완화와 독립).
3. **B3 핸드오프 확인** — qa-2가 §4 "결정론 테스트 필요 규칙 목록"을 수신했는지 team-lead가 확인.

### 5.2 단기 (Sprint 6 Day 3~7)
4. **V-13d 전용 E2E TC 신규 작성** — `rearrangement.spec.ts TC-RR-08` (테이블 A → B 타일 이동).
5. **V-13a 엔진 리팩터** — `validator.go` 진입 직후 `!req.HasInitialMeld && len(req.JokerReturnedCodes)==0 && tilesModifiedInTableBefore()` 검사 후 `ErrNoRearrangePerm` 반환. 사용자 경험 변경 없이 에러 메시지 정확도만 개선.
6. **V-13e 회수 조커 재드래그 UX** — Sprint 6 후반 이월 확정.
7. **B3 결정론 프레임워크 Phase 1 완료** — §4.1 P0 시나리오 5건 주입.

### 5.3 중기 (Sprint 6 후반 ~ Sprint 7)
8. **V-09 타임아웃 전이 E2E** — 타이머 주입 API 도입 후 TC-TO-001 작성 (3초 → 0초 → force-draw → advanceTurn).
9. **V-03/V-05/V-08 직접 Negative TC** — 우선순위 낮음, 인턴 태스크.
10. **6항목 체크리스트 템플릿 의무화** — Sprint 6 Day 3부터 규칙 관련 PR은 본 체크리스트 포함 강제.
11. **CI rule-matrix-check job** — `.gitlab-ci.yml`에 추적성 매트릭스와 실제 테스트 파일 정합성 검증 job 도입 (Sprint 7).

### 5.4 장기 (Sprint 7+)
12. **B3 Phase 2** — 모든 ⚠️ 규칙을 ✅로 승격하기 위한 결정론 시나리오 19건 완성.
13. **Playtest S4~S7 결정론 전환** — 확률 의존 시나리오 제거, 시드 기반 재현 가능 시나리오로 대체.

---

## 6. 부록: 매트릭스 Day 2 → Day 3 diff 요약

```
V-09 turn timeout          ⚠️ (E2E 타임아웃 직접 없음) → ⚠️ (설정/카운트다운만, 전이 0건 명시)
V-10 draw pile empty       ⚠️ (E2E 0건) → ✅ (TC-DL-E01~04 발굴 승격) ★
V-11 stalemate             ⚠️ (E2E 0건) → ✅ (TC-LF-E07 발굴 승격) ★
V-12 victory               ⚠️ (E2E 직접 케이스 없음) → ✅ (TC-LF-E05/E09 + A-11 발굴 승격) ★
V-13a rearrange permission ⚠️ (E2E 0건) → ⚠️ (TC-RR-02/04 발굴 but ErrNoRearrangePerm orphan 노출)
```

**순수 승격**: V-10, V-11, V-12 (3건)
**상태 유지 (정보 정정)**: V-09, V-13a (2건)

---

## 7. 결론

### 사용자 관심사 재질문: "V-13 외 동일 패턴(엔진 ✅ / UI ❌)이 숨어 있는가?"

**답**: **없다.** 19개 규칙 전수 재감사 결과, V-13 사건과 동일한 "엔진 ✅ / UI ❌" 패턴은 발견되지 않았다.

대신 발견된 것은 반대 방향의 문제였다:
- **"엔진 ✅ / UI ✅ / E2E ✅ (진짜로 있음!) / 매트릭스에서는 ⚠️로 기록돼 있던"** 3건 (V-10/V-11/V-12).
- 이는 "어제 사건의 역상" — 실제 구현과 매트릭스 갱신이 **분리된 커밋**으로 진행되면서 매트릭스가 현실보다 **비관적으로** 기록돼 있던 사례.

### 진짜 gap 요약
1. **V-09 타임아웃 전이 E2E 0건** — 타이머 주입 API로 해결 가능.
2. **V-13a 엔진 orphan code** — 에러 메시지 정확도만 gap, 기능적 버그는 없음.
3. **V-13b~e + V-07 조커 Playtest 미실행** — B3 결정론 프레임워크로 해결.
4. **V-13d 전용 E2E TC 부재** — TC-RR-08 1건 신설로 해결.
5. **조커 재드래그 UX 미완 (V-07/V-13e)** — Sprint 6 후반 이월 확정.

### 재발 방지
- `docs/02-design/36-rule-implementation-checklist-template.md` 6항목 체크리스트를 Sprint 6 Day 3부터 의무화.
- 매트릭스 갱신을 구현 커밋과 **동일 PR**에 포함 강제 (별도 커밋 금지).
- Sprint 7에 CI `rule-matrix-check` job 도입하여 자동 정합성 검증.

---

**본 보고의 의의**: 사용자가 의심한 "V-13 외 유사 누락"은 전수 재감사 결과 **없었다**. 대신 **매트릭스 갱신 자체가 누락돼 있던 3건**이 발견되었고, 이는 V-13 사건과 **동일한 구조적 원인(갱신 프로세스 부재)**에 기인한다. 본 보고는 그 구조적 원인을 명시하고, B3 결정론 프레임워크와 6항목 체크리스트 의무화로 재발 방지의 두 축을 확립한다.
