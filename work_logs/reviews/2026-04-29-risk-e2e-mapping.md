# G — RISK-01~06 시나리오 E2E 편입 모니터링 / 계획

- **작성일**: 2026-04-29
- **작성자**: game-analyst (게임 도메인 SSOT)
- **트리거**: `work_logs/plans/2026-04-29-next-actions-after-reboot.md` §2.4 작업 G — "RISK-01~06 시나리오 E2E 편입 모니터링" (4/30 예정)
- **페어**: B-2 (`2026-04-29-v21-matrix-remap.md`) — V-21 재정의 후 SSOT 정합성 / F (`work_logs/plans/2026-04-29-p3-3-and-ghost-sc2-plan.md`) — rule-one-game-complete snapshot 보강
- **제약**: 코드 변경 없음 (분석/계획). SSOT 권한으로 RISK 시리즈 정의 보강 권장.
- **사용자 절대 원칙 준수**: 꼼수 금지 / guard 금지 / 사용자 테스트 떠넘기기 금지 / 룰 ID 매핑 의무.

---

## 0. 요약 (TL;DR)

1. **RISK-01~06 시리즈는 본 프로젝트 docs/ 트리에 정의되지 않은 상태**. B-2 보고서 (`2026-04-29-v21-matrix-remap.md` §3) 가 이미 grep 0건 결과로 1차 확인. 재기동 plan + scrum + daily 로그에 ID 만 등장하고, **트리거/영향/회귀 발견 시점 명세 부재**.
2. game-analyst 권한 (게임 도메인 SSOT) 으로, **기존 산출물 (56 §4 사고 매핑 / 56 §5 deferred / 23·77·81·82 의 BUG-UI 카탈로그 / 89 SEC-DEBT) 을 RISK-01~06 시리즈로 재명명·정의** 하고, 본 보고서 §2 에 6 항목 캐노니컬 정의를 발행.
3. 6 항목 분류: **(a) E2E spec 가능 = RISK-01/02/05** / **(b) self-play harness = RISK-03/06** / **(c) 단위 + integration = RISK-04**. 분류 근거는 §3.
4. 우선순위: **P0 = RISK-01 (T11 보드 복제 — 사용자 직접 보고)** / **RISK-02 (그룹 ID 중복)** / **P1 = RISK-03/06** / **P2 = RISK-04/05**.
5. W2 마감 (2026-05-02 토) 까지 **P0 2건만 GREEN 목표** + **P1 2건은 spec 골격 작성 + RED 의도 반영**. P2 2건은 백로그 (Sprint 8 없음 → 미정 백로그).
6. F (`rule-one-game-complete.spec.ts` snapshot 보강) 결과물은 (b) 분류 RISK-03/06 의 self-play 헬퍼로 **그대로 재활용 가능**. 헬퍼 공유 권장.

---

## 1. 출처 조사 결론

### 1.1 grep 결과

| 검색 위치 | 패턴 | 매치 |
|----------|------|------|
| `docs/` 전수 | `RISK-0[1-6]` | **0건** |
| `docs/` 전수 | `RISK-` | 7건 (`docs/04-testing/20-human-flow-review-2026-03-30.md` RISK-BE-01~04 / RISK-ENG-01~02) — **다른 시리즈** (Sprint 4 인간 플로우 리뷰) |
| `work_logs/` | `RISK-0[1-6]` | 5 plan/scrum/session 등 plan 메모로만 등장. 정의 부재 |
| `src/` | `RISK-0[1-6]` | 0건 |

### 1.2 가장 가까운 후보

본 보고서는 다음 4 곳에서 RISK 후보를 추출:

1. **`docs/02-design/56-action-state-matrix.md` §4 사용자 실측 사고 ↔ 매트릭스 셀 매핑** — 3 사고 (INC-T11-DUP / INC-T11-IDDUP / INC-T11-FP-B10) → RISK-01/02/03 후보
2. **`docs/04-testing/82-missed-regression-retroactive-map.md`** — BUG-UI-EXT / BUG-UI-GHOST / I3 누적 state — RISK-04/05 후보
3. **`docs/02-design/56-action-state-matrix.md` §5 deferred** — A12 조커 swap 가치 일치 / A18 관전자 시점 — RISK-06 후보
4. **`docs/04-testing/89-state-corruption-security-impact.md` SEC-DEBT-001~006** — 보안 부채 (V-15 같은 색 중복 등) — 본 RISK 시리즈 외부 (security 에이전트 영역으로 이양)

### 1.3 SSOT 보강 권장 (game-analyst 권한)

본 보고서 §2 의 RISK-01~06 정의를 **`docs/02-design/56-action-state-matrix.md` §6 신설 — RISK 카탈로그** 로 격상 권장. PM 승인 후 56 v1.3 으로 추가. 본 보고서가 SSOT 이전 단계 초안.

---

## 2. RISK-01~06 캐노니컬 정의

### RISK-01 — 보드 그룹 복제 (T11 INC-T11-DUP 계열)

| 필드 | 값 |
|------|---|
| **트리거 조건** | A6 (pending → server merge) 또는 A2 (rack → pending) 시, 출발 그룹에서 tile 미제거 → 양쪽 그룹에 동일 tile 존재 |
| **영향 범위** | D-02 conservation 위반. WS PLACE_TILES 송신 시 서버는 양쪽 그룹 모두 받아 tilesAdded 검증 실패 → V-20 패널티 또는 invariant validator 강제 RESET |
| **회귀 발견 시점** | 사용자 실측 (스크린샷 2026-04-24 turn #11 BUG-UI-009 직후) — 코드 회귀 1일 만에 재발 |
| **연관 룰 ID** | D-02 (conservation) / V-06 (tile 보존) / V-20 (패널티) / UR-21 (INVALID 토스트) |
| **연관 BUG-UI** | BUG-UI-009 / INC-T11-DUP (`docs/04-testing/84-ui-turn11-duplication-incident.md`) |
| **현 상태** | P3-2 행동 등가 확장 (커밋 `~04-28`) 으로 9 분기 single-write 보장. Jest 614 / E2E rule 9-3-3 GREEN. 회귀 모니터링 필요 |

### RISK-02 — 보드 그룹 ID 중복 (INC-T11-IDDUP 계열)

| 필드 | 값 |
|------|---|
| **트리거 조건** | A9 (server → server merge) 또는 AI processAIPlace 응답 적용 시, 양쪽 그룹의 server-side group_id 보존하다 충돌. D-01 위반 |
| **영향 범위** | React key 충돌 → render warning + 같은 turn 안에서 양쪽 그룹 동시 변형 시도 → 마지막 write 만 살아 다른 그룹 silent loss |
| **회귀 발견 시점** | 사용자 실측 (`docs/04-testing/86-ui-2nd-incident-2026-04-25.md` §3.1) |
| **연관 룰 ID** | D-01 (group ID 유일성) / V-17 (서버 ID 할당) / UR-09 (group key 안정성) |
| **연관 BUG-UI** | INC-T11-IDDUP / BUG-UI-REARRANGE-002 |
| **현 상태** | useDragHandlers.ts:579 / 965 / 1008 에 ID 중복 감지 console.error 가드. spec 직접 RED 검증 부재 |

### RISK-03 — 확정 후 같은 턴 extend 반복 시 누적 state drift (BUG-UI-EXT 계열)

| 필드 | 값 |
|------|---|
| **트리거 조건** | hasInitialMeld=true 후 같은 턴에 호환 불가 tile 을 같은 pending 위에 3~6 회 연속 drop. useMemo stale 로 인해 매 drop 마다 새 그룹 생성되거나 기존 그룹 변형 |
| **영향 범위** | currentTableGroups.length 비단조 증가, hand-count 와 boardTileCount 불일치 |
| **회귀 발견 시점** | 사용자 실측 (스크린샷 2026-04-23_22:15:43 / 22:15:54 / 22:16:03) — PR #70 머지 1일 만에 재발 |
| **연관 룰 ID** | UR-37 (PRE_MELD fall-through) / V-13a (POST_MELD 변형) / D-02 (conservation) |
| **연관 BUG-UI** | BUG-UI-EXT (`docs/04-testing/82-missed-regression-retroactive-map.md`) |
| **현 상태** | `rule-extend-after-confirm.spec.ts EXT-SC4` RED 의도. 04-27 G-E/G-F 에서 EXT-SC1/SC3 GREEN 전환 (A4/A8 분기). EXT-SC4 잔존 RED |

### RISK-04 — 고스트 박스 렌더 (BUG-UI-GHOST 계열)

| 필드 | 값 |
|------|---|
| **트리거 조건** | A1 (rack → new-group) 시 호환 불가 tile 인데 setPendingTableGroups 가 빈 그룹 생성 → V-06 / UR-15 단언 위반. 같은 턴에 RESET 후 재드래그 시 ghost 그룹 잔존 |
| **영향 범위** | 시각적 결함 (빈 박스), confirm 사전조건 검증에서 falsy 그룹 포함 → confirm 비활성 |
| **회귀 발견 시점** | qa 회고 (`docs/04-testing/82-missed-regression-retroactive-map.md`) — 룰 매트릭스 부재로 빈 칸 안 보임 |
| **연관 룰 ID** | UR-15 (confirm 사전조건) / D-02 (conservation) |
| **연관 BUG-UI** | BUG-UI-GHOST / GHOST-SC1/SC2 |
| **현 상태** | `rule-ghost-box-absence.spec.ts SC1` RED 의도, GHOST-SC2 04-26 GREEN, GHOST-SC1/SC3 진행 중 |

### RISK-05 — 초기등록 전 서버 그룹 변형 fall-through 회귀 (UR-37 회귀 계열)

| 필드 | 값 |
|------|---|
| **트리거 조건** | PRE_MELD 상태에서 A3 (rack → server group) 드롭 시 fall-through 정책 (UR-37) 이 회귀 → V-13a 직접 차단으로 fallback. 사용자 의도 (rack tile 보드 배치) 가 차단됨 |
| **영향 범위** | 사용자가 정상 의도 행동을 못 하게 됨 (BUG-UI-EXT-SC1 회귀와 동등) |
| **회귀 발견 시점** | UR-37 신설 (2026-04-28) 직전 사용자 실측 — band-aid source guard 가 D-01/D-02 false positive 유발 |
| **연관 룰 ID** | UR-37 (PRE_MELD fall-through 정책) / V-13a (POST_MELD only) / UR-19 (incompat 거절) |
| **연관 BUG-UI** | INC-T11-FP-B10 / BUG-UI-EXT-SC1 |
| **현 상태** | A4/A8 분기 + UR-37 명세 + ExtendLockToast 1회 표시 (`useDragHandlers.ts`). E2E rule EXT-SC1 GREEN. 회귀 모니터링 |

### RISK-06 — 1게임 완주 누적 state 결함 (OGC 메타)

| 필드 | 값 |
|------|---|
| **트이거 조건** | 20~30 턴 연속 플레이 중 hasInitialMeld true → false 로의 비정상 transition / pendingGroupIds 누적 / 랙 카운트 drift / drawpile.empty 후 V-10 ALL_PASS 도달 정상 종료 못 함 |
| **영향 범위** | 단일 턴 spec 으로는 잡을 수 없는 누적 state 결함. Sprint 7 W1 사용자 직접 발견 |
| **회귀 발견 시점** | qa 회고 + pre-deploy-playbook v1.0 사전 검증에서 누락 |
| **연관 룰 ID** | V-10 (drawpile 소진) / V-12 (승리 랙 0) / V-08 (자기 턴) / 누적 D-02 conservation |
| **연관 BUG-UI** | I3 누적 state, SEC-DEBT-006 |
| **현 상태** | `rule-one-game-complete.spec.ts OGC` 1 케이스 작성 (Ollama 실대전). snapshot 보강 (F) 진행 중. 현재 RED 가능성 — 네트워크/AI 비결정성으로 단순 PASS 검증 부족 |

---

## 3. 편입 가능성 분류 (a / b / c)

### 3.1 분류 기준

| 분류 | 정의 | 사용 도구 | 비결정성 |
|------|-----|---------|---------|
| **(a) E2E spec 가능** | deterministic 행동 시퀀스 + 즉시 검증 가능 | Playwright + dndDrag fixture | 낮음 (fixture 주입) |
| **(b) self-play harness 시나리오** | 1게임 완주 (20~30턴) 또는 AI 다수 턴 필요 | self-play harness + Ollama 실대전 | 높음 (AI 비결정성) |
| **(c) 단위 + integration** | 게임 엔진 분기 + Zustand store invariant | Jest (frontend) + go test (server) | 없음 |

### 3.2 RISK 별 분류

| RISK | 분류 | 분류 근거 |
|------|------|---------|
| **RISK-01** (보드 그룹 복제) | **(a) E2E spec** | 트리거 = 단일 A6 drag. 검증 = currentTableGroups 의 tile 빈도 (D-02). 결정성 충분. dndDrag fixture 충분 |
| **RISK-02** (그룹 ID 중복) | **(a) E2E spec** | 트리거 = A9 (server merge) 또는 AI 응답 적용. 검증 = group_id 중복 grep. fixture 로 hasInitialMeld=true 주입 + dndDrag 2회 |
| **RISK-03** (확정 후 extend drift) | **(a) E2E spec** | EXT-SC4 형태로 이미 작성됨. 트리거 = 호환 불가 tile 3~6회 drop. 결정성 충분 (단 dndDrag 타이밍 RED 잔존) |
| **RISK-04** (고스트 박스) | **(c) 단위 + integration** | invariant validator 영역. 빈 그룹 setPendingTableGroups 진입 자체를 차단해야 함. Jest invariant 테스트로 충분 + GHOST-SC1~3 spec 보조 |
| **RISK-05** (PRE_MELD extend 회귀) | **(a) E2E spec** | EXT-SC1 형태로 이미 작성됨 + GREEN. 회귀 모니터링이라면 spec 유지가 충분. RED 의도 spec 필요 없음 |
| **RISK-06** (1게임 완주 누적) | **(b) self-play harness** | 20~30 턴 연속 + AI 비결정성 + 누적 state 추적 필요. 단일 deterministic spec 으로 잡을 수 없음. Ollama 실대전 + snapshot 헬퍼 |

### 3.3 분류 결정 근거 표 (행동 / state / actor)

| RISK | 트리거 행동 | state 차원 (S-meld / S-pending) | actor (Human/AI) | E2E 결정성 |
|------|-----------|------------------------------|----------------|----------|
| 01 | A6 1회 | POST_MELD / 1+ | Human | 충분 |
| 02 | A9 1회 또는 AI place 1회 | POST_MELD / 1+ | Human + AI | 충분 (fixture) |
| 03 | A3/A2 3~6회 | POST_MELD / 1+ | Human | 충분 (반복 횟수 fixture) |
| 04 | A1 1회 | * / 0 → 1 | Human | invariant 영역 |
| 05 | A3 1회 | PRE_MELD / 0 → 1 | Human | 충분 |
| 06 | A1~A21 multi-turn | 전 차원 누적 | Human + AI | **불충분** (누적성) |

---

## 4. 우선순위 + 에스컬레이션 계획

### 4.1 우선순위 행렬 (사용자 영향도 × 발견 난이도)

| 우선순위 | 영향도 | 난이도 | RISK | 이유 |
|---------|------|------|------|-----|
| **P0** | High (사용자 직접 보고 + 게임 진행 차단) | Easy (deterministic) | RISK-01 / RISK-02 | T11 사용자 실측 사고 직접 매핑. 즉시 spec 가능 |
| **P1** | Medium (회귀 위험) | Medium | RISK-03 / RISK-06 | 누적 / 반복 시나리오. spec 골격 있으나 RED 잔존 또는 비결정성 |
| **P2** | Low (시각적 / fall-through GREEN) | Easy | RISK-04 / RISK-05 | invariant + GREEN 유지 모니터링 |

### 4.2 W2 마감 (2026-05-02 토) 작업 가능 / 후속 백로그

| RISK | W2 (5/2) 까지 가능 | Sprint 8 없음 → 미정 백로그 |
|------|------------------|--------------------------|
| **01 P0** | spec 작성 + GREEN 검증 | (W2 안에 마감) |
| **02 P0** | spec 작성 + GREEN 검증 | (W2 안에 마감) |
| **03 P1** | EXT-SC4 dndDrag 타이밍 잡고 GREEN | 회귀 모니터링 |
| **04 P2** | GHOST-SC1/SC3 RED → GREEN | 회귀 모니터링 |
| **05 P2** | 현 GREEN 유지 모니터링 | 회귀 모니터링 |
| **06 P1** | F (snapshot 보강) 와 결합 spec 골격 | **본격 self-play harness 통합 후속** (백로그) |

### 4.3 P0 dispatch 템플릿 (qa 에 4/30 dispatch)

```
## RISK-01 P0 — 보드 그룹 복제 회귀 spec

프로젝트: /mnt/d/Users/KTDS/Documents/06.과제/RummiArena
참조: docs/04-testing/84-ui-turn11-duplication-incident.md, work_logs/reviews/2026-04-29-risk-e2e-mapping.md §RISK-01

목표: A6 (pending → server merge) drag 1회 후 D-02 conservation 검증 spec
  - 파일: src/frontend/e2e/rule-board-duplication-risk-01.spec.ts (신규)
  - fixture: hasInitialMeld=true, 2 server group + 1 pending group + 1 rack tile
  - 행동: pending tile → server group merge dndDrag
  - 검증:
    1. currentTableGroups 의 같은 tile_id 가 2 그룹에 동시 존재 안 함 (D-02)
    2. tilesAdded == 1 (V-06 conservation)
    3. handleDragEnd re-entrancy 없음 (BUG-UI-009 가드 동작)
  - 룰 ID: D-02 / V-06 / V-20 / UR-21
  - 기대: GREEN (P3-2 행동 등가 확장 후)
  - RED 시: useDragHandlers.ts:739 (BUG-UI-REARRANGE-001) 분기 즉시 보고

산출: spec + Playwright 실행 보고서. 코드 변경 없음 (spec 만).
```

```
## RISK-02 P0 — 보드 그룹 ID 중복 회귀 spec

프로젝트: /mnt/d/Users/KTDS/Documents/06.과제/RummiArena
참조: docs/04-testing/86-ui-2nd-incident-2026-04-25.md §3.1, work_logs/reviews/2026-04-29-risk-e2e-mapping.md §RISK-02

목표: A9 server merge 또는 AI place 후 D-01 group_id 유일성 검증
  - 파일: src/frontend/e2e/rule-group-id-uniqueness-risk-02.spec.ts (신규)
  - fixture: 2 server group (id=g1, g2) + 1 pending group + hasInitialMeld=true
  - 행동: g1 의 tile 을 g2 위로 dndDrag (A9 merge)
  - 검증:
    1. 결과 currentTableGroups 의 group_id 집합이 unique (D-01)
    2. console.error 'BUG-UI-REARRANGE-002 그룹 ID 중복 감지' 미발생
    3. React key 경고 없음
  - 룰 ID: D-01 / V-17 / UR-09
  - 기대: GREEN
  - RED 시: useDragHandlers.ts:579/965/1008 가드 분기 보고

산출: spec + 실행 보고서. 코드 변경 없음.
```

### 4.4 P1 dispatch (RISK-03/06)

- **RISK-03**: 기존 `rule-extend-after-confirm.spec.ts EXT-SC4` 의 dndDrag 타이밍 RED 잔존. qa 가 W2 안에 RED 원인 분석 (Jest 단위로 동일 로직 GREEN 인 점은 04-27 보고서에서 확인됨 — UI 타이밍 단독 문제) → fixture/wait 헬퍼 보강.
- **RISK-06**: F (rule-one-game-complete snapshot 보강) 와 결합. F 가 작성하는 snapshot 헬퍼를 RISK-06 에 그대로 재활용. 본 RISK 의 spec 은 OGC 본 spec 안에서 §4.3 검증 체크리스트 4 항목으로 통합.

---

## 5. 상호 참조 (B-2 / F)

### 5.1 B-2 (V-21 매트릭스 재매핑) 와 RISK 의존성

B-2 §3 결론: V-21 재정의 (Mid-Game 진입자 정책 → 방 정원 충족 후 게임 시작) 는 **in-game 행동 매트릭스 21 행동 (A1~A21) 에 직접 매핑되는 RISK 없음**. UR-39 폐기로 잠재 RISK 가 **소멸** (mid-game 진입자 분배 / hasInitialMeld 회귀 / UR-39 모달 timing).

| RISK | V-21 의존성 | 평가 |
|------|----------|------|
| 01 | 없음 (POST_MELD in-game) | 영향 없음 |
| 02 | 없음 (POST_MELD in-game) | 영향 없음 |
| 03 | 없음 (POST_MELD extend) | 영향 없음 |
| 04 | 없음 (UI invariant) | 영향 없음 |
| 05 | 없음 (PRE_MELD in-game) | 영향 없음 |
| 06 | 없음 (1 게임 완주 + V-21 은 게임 시작 시점만) | **간접**: V-21 invariant 위반 시 게임 시작 자체 차단 → 1 게임 완주 도달 불가 → RISK-06 trigger 자체 부재. 정합성 |

**판정**: 6 RISK 모두 V-21 재정의에 영향 없음. B-2 가 이미 SSOT 정합성 GO 판정.

### 5.2 F (rule-one-game-complete snapshot 보강) 와 RISK 매핑

F 의 산출물 (snapshot 헬퍼) 은 (b) 분류 RISK-06 에 1:1 재활용. 헬퍼가 추적해야 하는 4 항목 (`docs/04-testing/81-e2e-rule-scenario-matrix.md` §4.3):

1. pendingGroupIds 크기 일관성 (확정 후 0)
2. currentTableGroups.length 단조성 (drop 마다 +0 또는 +1)
3. 랙 타일 수 = 실제 렌더 타일 수 (drift 없음)
4. hasInitialMeld 가 true → false 로 되돌아가는 일 없음

→ RISK-06 의 검증 항목과 **동일**. F 가 헬퍼를 작성하면 RISK-06 별도 spec 불필요, OGC spec 안에서 통합.

**또한 (a) 분류 RISK-01/02/03 도 F 헬퍼의 §1, §2, §3 항목을 단위 검증에 차용 가능** — qa 가 dispatch 시 헬퍼 모듈화 권장.

---

## 6. 잔존 이슈 / Follow-up

1. **RISK 시리즈 SSOT 격상** — 본 보고서 §2 의 6 정의를 `docs/02-design/56-action-state-matrix.md` §6 신설 또는 별도 `docs/02-design/67-risk-catalog.md` 로 격상 권장. PM 승인 필요. game-analyst 단독 결정 사항 아님.
2. **RISK-04 (고스트) 의 (c) 분류 적정성 재검토** — invariant validator 가 setPendingTableGroups 진입을 차단하더라도, 같은 턴 RESET 후 잔존 ghost 시각적 결함은 여전히 spec 으로 검증해야 함. (a) + (c) 혼합 가능성. qa 가 RISK-04 dispatch 시 재평가.
3. **Sprint 8 없음 → 미정 백로그 처리** — P2 (RISK-04/05) 와 P1 RISK-06 의 Sprint 8 부재 시 어떻게 추적할지 PM 결정 필요. 후보: `docs/01-planning/` 백로그 파일 / GitHub Issue 라벨 `risk-backlog`.
4. **헬퍼 모듈화 권장** — F 의 snapshot 헬퍼를 `src/frontend/e2e/helpers/risk-snapshot.ts` 로 분리하면 RISK-01/02/03/06 모두 import 재사용 가능. qa 와 frontend-dev 협의 필요.

---

## 7. 결론 (W2 5/2 까지 진행 권고)

| 작업 | 담당 | 시점 | 산출 |
|------|-----|------|-----|
| RISK-01 spec 작성 + GREEN | qa | 4/30 | `rule-board-duplication-risk-01.spec.ts` |
| RISK-02 spec 작성 + GREEN | qa | 4/30 | `rule-group-id-uniqueness-risk-02.spec.ts` |
| RISK-03 EXT-SC4 dndDrag RED → GREEN | qa | 5/1 | `rule-extend-after-confirm.spec.ts` 갱신 |
| RISK-06 F snapshot 헬퍼 통합 | qa + game-analyst | 5/1~5/2 | `rule-one-game-complete.spec.ts` 보강 |
| RISK-04/05 모니터링 (현 GREEN 유지) | qa | 5/2 | E2E rule 회귀 보고서 |
| RISK 카탈로그 SSOT 격상 결정 | PM | 5/2 | docs/02-design/56 §6 또는 67 신설 |

**최종 판정**: G 는 4/30~5/2 안에 P0 2건 + P1 2건 GREEN/통합 가능. **Sprint 8 없음 결정과 별개로 W2 안에 핵심 6 RISK 카탈로그 SSOT 화 + spec 4건 GREEN 까지 도달 가능.**

---

## 8. 변경 이력

- **2026-04-29 v1.0**: G 작업 산출물 발행. RISK-01~06 캐노니컬 정의 (기존 산출물 통합) + (a)/(b)/(c) 분류 + P0/P1/P2 우선순위 + dispatch 템플릿 + B-2/F 상호 참조.

---

룰 ID 매핑 (의무): **D-01**, **D-02**, **V-06**, **V-08**, **V-10**, **V-12**, **V-13a**, **V-17**, **V-20**, **V-21**, **UR-09**, **UR-15**, **UR-19**, **UR-21**, **UR-37**, **UR-38**, **UR-39 (폐기)**, **UR-40**.
