# 67 — RISK 카탈로그 SSOT (Sprint 7 W2)

- **작성일**: 2026-04-29
- **작성자**: game-analyst (게임 도메인 SSOT 권한)
- **격상 트리거**: G dispatch (`work_logs/reviews/2026-04-29-risk-e2e-mapping.md`) — RISK-01~06 시리즈가 plan/scrum/daily 11곳에 등장하지만 docs SSOT 정의 0건이었던 상태를 해소
- **PM 의사결정**: 사용자(애벌레) 위임 결정 (2026-04-29) — "디폴트 채택, 가장 좋은 것으로"
- **SSOT 권위**: 본 카탈로그가 RISK-01~06 의 캐노니컬 정의. 향후 plan/scrum/daily 에서 "RISK-NN" 인용 시 본 문서 §2 정의를 기준으로 한다.

---

## 0. 요약

Sprint 7 W2 (2026-04-25~) 기간 사용자 실측 사고 + qa 회고 + 1게임 완주 누적 결함을 6개의 RISK 시리즈로 통합 정의한다. 각 RISK 는:

- **트리거 조건 / 영향 범위 / 회귀 발견 시점 / 연관 룰 ID / 연관 BUG-UI / 현 상태** 6 필드로 명세
- E2E 편입 가능성을 (a) E2E spec / (b) self-play harness / (c) 단위+integration 으로 분류
- 우선순위 P0/P1/P2 부여 — W2 마감 (2026-05-02 토) 까지 P0 2건 GREEN 목표

---

## 1. 시리즈 명명 규약

- 형식: `RISK-NN` (NN = 01~99 zero-padded 2자리)
- 결번 처리: 폐기 시 ID 재사용 금지. 신규는 다음 미사용 번호.
- 인용: commit message / spec 주석 / plan 에 RISK ID 매핑 의무 (사용자 절대 원칙 6번)

**참고 — 다른 RISK 시리즈와의 구분**:
- `RISK-BE-01~04` / `RISK-ENG-01~02` (`docs/04-testing/20-human-flow-review-2026-03-30.md`) = Sprint 4 인간 플로우 리뷰 시리즈. 본 카탈로그와 별개.
- `SEC-DEBT-001~006` (`docs/04-testing/89-state-corruption-security-impact.md`) = 보안 부채. security 에이전트 영역.

---

## 2. RISK 캐노니컬 정의

### RISK-01 — 보드 그룹 복제 (T11 INC-T11-DUP 계열)

| 필드 | 값 |
|------|---|
| **트리거 조건** | A6 (pending → server merge) 또는 A2 (rack → pending) 시, 출발 그룹에서 tile 미제거 → 양쪽 그룹에 동일 tile 존재 |
| **영향 범위** | D-02 conservation 위반. WS PLACE_TILES 송신 시 서버는 양쪽 그룹 모두 받아 tilesAdded 검증 실패 → V-20 패널티 또는 invariant validator 강제 RESET |
| **회귀 발견 시점** | 사용자 실측 (스크린샷 2026-04-24 turn #11 BUG-UI-009 직후) — 코드 회귀 1일 만에 재발 |
| **연관 룰 ID** | D-02 / V-06 / V-20 / UR-21 |
| **연관 BUG-UI** | BUG-UI-009 / INC-T11-DUP (`docs/04-testing/84-ui-turn11-duplication-incident.md`) |
| **현 상태** | P3-2 행동 등가 확장 (커밋 ~2026-04-28) 9 분기 single-write. Jest 614 / E2E rule 9-3-3 GREEN. 회귀 모니터링 필요 |

### RISK-02 — 보드 그룹 ID 중복 (INC-T11-IDDUP 계열)

| 필드 | 값 |
|------|---|
| **트리거 조건** | A9 (server → server merge) 또는 AI processAIPlace 응답 적용 시, 양쪽 그룹의 server-side group_id 보존하다 충돌. D-01 위반 |
| **영향 범위** | React key 충돌 → render warning + 같은 turn 안에서 양쪽 그룹 동시 변형 시도 → 마지막 write 만 살아 다른 그룹 silent loss |
| **회귀 발견 시점** | 사용자 실측 (`docs/04-testing/86-ui-2nd-incident-2026-04-25.md` §3.1) |
| **연관 룰 ID** | D-01 / V-17 / UR-09 |
| **연관 BUG-UI** | INC-T11-IDDUP / BUG-UI-REARRANGE-002 |
| **현 상태** | useDragHandlers.ts:579 / 965 / 1008 에 ID 중복 감지 console.error 가드. spec 직접 RED 검증 부재 |

### RISK-03 — 확정 후 같은 턴 extend 반복 시 누적 state drift (BUG-UI-EXT 계열)

| 필드 | 값 |
|------|---|
| **트리거 조건** | hasInitialMeld=true 후 같은 턴에 호환 불가 tile 을 같은 pending 위에 3~6 회 연속 drop. useMemo stale 로 인해 매 drop 마다 새 그룹 생성되거나 기존 그룹 변형 |
| **영향 범위** | currentTableGroups.length 비단조 증가, hand-count 와 boardTileCount 불일치 |
| **회귀 발견 시점** | 사용자 실측 (스크린샷 2026-04-23_22:15:43 / 22:15:54 / 22:16:03) — PR #70 머지 1일 만에 재발 |
| **연관 룰 ID** | UR-37 / V-13a / D-02 |
| **연관 BUG-UI** | BUG-UI-EXT (`docs/04-testing/82-missed-regression-retroactive-map.md`) |
| **현 상태** | `rule-extend-after-confirm.spec.ts EXT-SC4` RED 의도. 04-27 G-E/G-F 에서 EXT-SC1/SC3 GREEN 전환 (A4/A8 분기). EXT-SC4 잔존 RED |

### RISK-04 — 고스트 박스 렌더 (BUG-UI-GHOST 계열)

| 필드 | 값 |
|------|---|
| **트리거 조건** | A1 (rack → new-group) 시 호환 불가 tile 인데 setPendingTableGroups 가 빈 그룹 생성 → V-06 / UR-15 단언 위반. 같은 턴에 RESET 후 재드래그 시 ghost 그룹 잔존 |
| **영향 범위** | 시각적 결함 (빈 박스), confirm 사전조건 검증에서 falsy 그룹 포함 → confirm 비활성 |
| **회귀 발견 시점** | qa 회고 (`docs/04-testing/82-missed-regression-retroactive-map.md`) — 룰 매트릭스 부재로 빈 칸 안 보임 |
| **연관 룰 ID** | UR-15 / D-02 |
| **연관 BUG-UI** | BUG-UI-GHOST / GHOST-SC1/SC2 |
| **현 상태** | `rule-ghost-box-absence.spec.ts SC1` RED 의도, GHOST-SC2 04-26 GREEN, GHOST-SC1/SC3 진행 중 |

### RISK-05 — 초기등록 전 서버 그룹 변형 fall-through 회귀 (UR-37 회귀 계열)

| 필드 | 값 |
|------|---|
| **트리거 조건** | PRE_MELD 상태에서 A3 (rack → server group) 드롭 시 fall-through 정책 (UR-37) 이 회귀 → V-13a 직접 차단으로 fallback. 사용자 의도 (rack tile 보드 배치) 가 차단됨 |
| **영향 범위** | 사용자가 정상 의도 행동을 못 하게 됨 (BUG-UI-EXT-SC1 회귀와 동등) |
| **회귀 발견 시점** | UR-37 신설 (2026-04-28) 직전 사용자 실측 — band-aid source guard 가 D-01/D-02 false positive 유발 |
| **연관 룰 ID** | UR-37 / V-13a / UR-19 |
| **연관 BUG-UI** | INC-T11-FP-B10 / BUG-UI-EXT-SC1 |
| **현 상태** | A4/A8 분기 + UR-37 명세 + ExtendLockToast 1회 표시 (`useDragHandlers.ts`). E2E rule EXT-SC1 GREEN. 회귀 모니터링 |

### RISK-06 — 1게임 완주 누적 state 결함 (OGC 메타)

| 필드 | 값 |
|------|---|
| **트리거 조건** | 20~30 턴 연속 플레이 중 hasInitialMeld true → false 로의 비정상 transition / pendingGroupIds 누적 / 랙 카운트 drift / drawpile.empty 후 V-10 ALL_PASS 도달 정상 종료 못 함 |
| **영향 범위** | 단일 턴 spec 으로는 잡을 수 없는 누적 state 결함. Sprint 7 W1 사용자 직접 발견 |
| **회귀 발견 시점** | qa 회고 + pre-deploy-playbook v1.0 사전 검증에서 누락 |
| **연관 룰 ID** | V-10 / V-12 / V-08 / 누적 D-02 |
| **연관 BUG-UI** | I3 누적 state, SEC-DEBT-006 |
| **현 상태** | `rule-one-game-complete.spec.ts OGC` 1 케이스 작성 (Ollama 실대전). snapshot 보강 (F qa dispatch 진행 중) — 본 카탈로그 §4 와 통합 |

---

## 3. 편입 가능성 분류

| RISK | 분류 | 분류 근거 |
|------|------|---------|
| **RISK-01** | (a) E2E spec | 트리거 = 단일 A6 drag. 검증 = D-02 빈도. dndDrag fixture 충분 |
| **RISK-02** | (a) E2E spec | 트리거 = A9 또는 AI place. 검증 = group_id 유일성 (D-01) |
| **RISK-03** | (a) E2E spec | EXT-SC4 형태. 호환 불가 tile 3~6회 drop |
| **RISK-04** | (c) 단위+integration | invariant validator 영역. setPendingTableGroups 진입 차단 |
| **RISK-05** | (a) E2E spec | EXT-SC1 형태로 GREEN. 회귀 모니터링 |
| **RISK-06** | (b) self-play harness | 20~30 턴 + AI 비결정성 + 누적 state |

분류 정의:
- (a) **E2E spec 가능**: deterministic 행동 시퀀스 + 즉시 검증. Playwright + dndDrag fixture
- (b) **self-play harness**: 1게임 완주 또는 AI 다수 턴 필요. self-play harness + Ollama 실대전
- (c) **단위 + integration**: 게임 엔진 분기 + Zustand store invariant. Jest + go test

---

## 4. 우선순위 + W2 작업 계획

### 4.1 우선순위 행렬

| 우선 | 영향도 | 난이도 | RISK |
|------|------|------|------|
| **P0** | High (사용자 직접 보고 + 게임 진행 차단) | Easy | RISK-01 / RISK-02 |
| **P1** | Medium (회귀 위험) | Medium | RISK-03 / RISK-06 |
| **P2** | Low (시각적 / GREEN 유지) | Easy | RISK-04 / RISK-05 |

### 4.2 W2 마감 (2026-05-02 토) 작업

| RISK | 작업 | 담당 | 시점 |
|------|-----|------|------|
| 01 P0 | spec `rule-board-duplication-risk-01.spec.ts` 신규 + GREEN | qa | 4/30 |
| 02 P0 | spec `rule-group-id-uniqueness-risk-02.spec.ts` 신규 + GREEN | qa | 4/30 |
| 03 P1 | EXT-SC4 dndDrag 타이밍 RED → GREEN | qa | 5/1 |
| 06 P1 | F snapshot 헬퍼 (`src/frontend/e2e/helpers/risk-snapshot.ts`) 와 통합 | qa + game-analyst | 5/1~5/2 |
| 04 P2 | GHOST-SC1/SC3 RED → GREEN 모니터링 | qa | 5/2 |
| 05 P2 | 현 GREEN 유지 모니터링 | qa | 5/2 |

### 4.3 헬퍼 모듈화 권장

F 의 snapshot 헬퍼를 `src/frontend/e2e/helpers/risk-snapshot.ts` 로 분리 → RISK-01/02/03/06 모두 import 재사용. 헬퍼가 추적해야 하는 4 항목:

1. pendingGroupIds 크기 일관성 (확정 후 0)
2. currentTableGroups.length 단조성 (drop 마다 +0 또는 +1)
3. 랙 타일 수 = 실제 렌더 타일 수 (drift 없음)
4. hasInitialMeld 가 true → false 로 되돌아가는 일 없음

---

## 5. V-21 재정의 영향 평가 (B-2 cross-check)

V-21 재정의 (Mid-Game 진입자 정책 → 방 정원 충족 후 게임 시작) 가 본 카탈로그 6 RISK 에 미치는 영향:

| RISK | V-21 의존성 | 평가 |
|------|----------|------|
| 01~05 | 없음 (in-game 행동) | 영향 없음 |
| 06 | 간접 — V-21 invariant 위반 시 게임 시작 자체 차단 → RISK-06 trigger 부재 | 정합성 강화 |

**판정**: 6 RISK 모두 V-21 재정의에 영향 없음. UR-39 폐기로 잠재 RISK (mid-game 진입자 분배 / hasInitialMeld 회귀 / UR-39 모달 timing) 가 오히려 소멸.

---

## 6. 룰 ID 매핑

본 카탈로그가 인용하는 룰 ID (commit message 매핑 의무):

**Domain (D)**: D-01 / D-02
**Validator (V)**: V-06 / V-08 / V-10 / V-12 / V-13a / V-17 / V-20 / V-21
**UX Rule (UR)**: UR-09 / UR-15 / UR-19 / UR-21 / UR-37 / UR-38 / UR-39 (폐기) / UR-40

룰 정의 SSOT: `docs/02-design/55-game-rules-enumeration.md` (활성 76 + 결번 1).

---

## 7. Cross-Reference

- `docs/02-design/55-game-rules-enumeration.md` — 룰 SSOT (V-/UR-/D-/INV- 정의)
- `docs/02-design/56-action-state-matrix.md` — 행동 21 × 상태 12 매트릭스. §4 사용자 사고 매핑 / §5 deferred
- `docs/02-design/56b-state-machine.md` — in-game 미시 상태 머신
- `docs/02-design/43-rule-ux-sync-ssot.md` — 룰 UX sync v1.1 (B-2 갱신)
- `docs/04-testing/82-missed-regression-retroactive-map.md` — BUG-UI-EXT / BUG-UI-GHOST 추적
- `docs/04-testing/84-ui-turn11-duplication-incident.md` — INC-T11-DUP
- `docs/04-testing/86-ui-2nd-incident-2026-04-25.md` — INC-T11-IDDUP
- `docs/04-testing/89-state-corruption-security-impact.md` — SEC-DEBT 시리즈 (별개 영역)
- `work_logs/reviews/2026-04-29-risk-e2e-mapping.md` — 본 카탈로그 SSOT 격상 전 G 보고서
- `work_logs/reviews/2026-04-29-v21-matrix-remap.md` — B-2 V-21 매트릭스 재매핑 (cross-check 출처)

---

## 8. 잔존 이슈 / Follow-up

1. **RISK-04 분류 (a)+(c) 혼합 가능성** — invariant validator 가 진입을 차단하더라도 같은 턴 RESET 후 잔존 ghost 시각적 결함은 spec 으로도 검증 필요. qa dispatch 시 재평가.
2. **Sprint 8 없음 → 미정 백로그 처리** — P2 (RISK-04/05) + P1 RISK-06 의 후속 추적 방식. 후보: `docs/01-planning/` 백로그 / GitHub Issue 라벨 `risk-backlog`.
3. **RISK 시리즈 확장 정책** — 신규 RISK 발견 시 RISK-07 부터 부여. 본 카탈로그 §2 형식으로 6 필드 명세 의무.

---

## 9. 변경 이력

- **2026-04-29 v1.0**: SSOT 격상 발행. G dispatch (`work_logs/reviews/2026-04-29-risk-e2e-mapping.md`) §2 정의를 캐노니컬 SSOT 로 옮김. PM (사용자) "디폴트 채택" 결정 (2026-04-29) 에 따라 67 신설 (56 §6 통합 안 대신).
