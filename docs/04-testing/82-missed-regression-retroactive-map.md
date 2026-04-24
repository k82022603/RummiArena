# Missed Regression Retroactive Map — 어제 스크린샷 × spec 역매핑

**문서 번호**: 82
**작성**: qa (Opus 4.7 xhigh)
**작성일**: 2026-04-24
**대상 PR**: Phase2-qa 게임룰 19 기반 E2E 시나리오 세트
**상위 참조**:
- `docs/04-testing/81-e2e-rule-scenario-matrix.md` — 룰 × UI 행위 매트릭스 (신규 spec 5종 정의)
- `work_logs/plans/tmp-analysis/bug-ui-ext-ghost-rereview.md` — architect 재재조사

---

## 1. 목적

2026-04-23 22:04~22:18 사용자 플레이테스트 중 촬영된 스크린샷 16장 + 2026-04-24 10:16:14 기권 화면 1장이 **만약 본 PR 의 5 spec 이 사전에 있었다면 어느 TC 에서 RED 로 사전 탐지되었을지**를 역매핑한다. 향후 사용자가 직접 발견하기 전에 spec 이 먼저 탐지하는 구조의 근거 자료.

**원칙**:
- 각 스크린샷 → 5 spec 중 최소 1개 TC 매핑
- 매핑 근거 (증상 설명 + 기대 단언)
- "해당 spec 이 있었다면 언제 RED 가 나왔을지" 타임라인

---

## 2. 스크린샷 인벤토리

architect 재재조사 §3.1 표 기반. 실제 파일은 `d:\Users\KTDS\Pictures\FastStone\2026-04-23_22*.png` + `2026-04-24_101614.png`.

| # | 파일 | 시각 | 증상 요약 |
|---|------|-----|---------|
| S1 | 2026-04-23_220411 | 22:04:11 | 턴 #24 정상 플레이 (초기 등록 후) |
| S2 | 2026-04-23_220531 | 22:05:31 | 드래그 전 pending 1개 (정상) |
| S3 | 2026-04-23_221010 | 22:10:10 | Y5 타일 드래그 시작 |
| S4 | 2026-04-23_221218 | 22:12:18 | 런 [R11,R12,JK] 위로 drop 시도 |
| S5 | 2026-04-23_221543 | 22:15:43 | **BUG-UI-GHOST 6개 복제 [R11,R12,JK,5] + 빈 박스 2~3개** |
| S6 | 2026-04-23_221554 | 22:15:54 | 동일 턴 드래그 진행 중, 6개 복제 구조 유지 |
| S7 | 2026-04-23_221603 | 22:16:03 | 턴 #29 런 [R11,R12,JK] 6개 복제 + 빈 박스 3개 |
| S8 | 2026-04-23_221707 | 22:17:07 | 턴 #30 정상 (대조군, 복제 없음) |
| S9~S16 | 2026-04-23_221* | 22:04~22:18 | 나머지 정상/중간 상태 (dnd-kit drag overlay, pending list 등) |
| S17 | 2026-04-24_101614 | 10:16:14 | 기권 종료 화면 (턴 #29 시점 아님) |

---

## 3. 역매핑 표 (핵심 5건 + 보조)

### 3.1 핵심 "이 spec 이 있었다면 사전 탐지 가능" 사례 5건

#### 사례 A — S5 (221543) 6개 복제 [R11,R12,JK,5]

| 항목 | 내용 |
|------|-----|
| 증상 | hasInitialMeld=true 상태에서 호환 불가 Y5 를 런 위에 여러 번 drop 시도 → 동일 tile 집합 그룹이 6개 복제 |
| 사전 탐지 가능 spec | `rule-extend-after-confirm.spec.ts :: EXT-SC4` |
| 단언 포인트 | `result.duplicatedGroupSignatures.length === 0` (복제 시그니처 0 기대) + `groupCount ≤ 2` |
| RED 기대 근거 | useMemo stale + isHandlingDragEndRef microtask 우회 (architect §3.3 G1 + §3.6 G4) |
| 보완 spec | `rule-ghost-box-absence.spec.ts :: GHOST-SC1` 도 동일 증상 탐지 |

#### 사례 B — S7 (221603) 턴 #29 런 6개 복제 + 빈 박스 3개

| 항목 | 내용 |
|------|-----|
| 증상 | pending 그룹 [R11,R12,JK] 6개 복제 + 우측/하단 빈 박스 출현 |
| 사전 탐지 가능 spec | `rule-ghost-box-absence.spec.ts :: GHOST-SC3` (pendingGroupSeq 단조성) |
| 단언 포인트 | `new Set(seenIds).size === seenIds.length` (모든 pending id unique) |
| RED 기대 근거 | 연속 drop 마다 useMemo stale snapshot 에 id 가 중복 append. 빈 박스는 pending 그룹이 empty tile list 로 렌더되는 race 조건 |
| 보완 | turn #29 누적 state 는 rule-one-game-complete.spec.ts OGC 에서도 추적 가능 (I3 복제 tile 0) |

#### 사례 C — S5/S6/S7 공통 "hasInitialMeld=true 확정 후 append 실패"

| 항목 | 내용 |
|------|-----|
| 증상 | 사용자 기억: "지난번 조치받았는데 이어붙이기 안 됨". 실제로는 append 실패 + 복제 혼재 |
| 사전 탐지 가능 spec | `rule-extend-after-confirm.spec.ts :: EXT-SC1` (런 뒤 append Happy) + `EXT-SC3` (런 앞 append Happy) |
| 단언 포인트 | `runTiles.length === 4` + `groupCount === 1` |
| RED 기대 근거 | EXT-SC1 PASS 면 append 정상 경로 자체는 동작. BUG-UI-EXT 의 진짜 증상은 EXT-SC4 (호환 불가 반복 drop 시 복제) |
| 핵심 | **EXT-SC1 PASS + EXT-SC4 RED 조합**이 "append 는 정상인데 복제가 일어난다" 는 증상을 정확히 포착 |

#### 사례 D — S17 (101614) 기권 종료 화면

| 항목 | 내용 |
|------|-----|
| 증상 | 턴 #29 이전에 사용자가 포기 (기권). 게임 종료 오버레이 표시. |
| 사전 탐지 가능 spec | `rule-one-game-complete.spec.ts :: OGC` (1게임 완주 메타) |
| 단언 포인트 | 20턴 이상 or 정상 종료 (승리/교착/타임아웃). **기권은 정상 종료 아님** |
| RED 기대 근거 | 사용자가 UI 버그 때문에 게임을 끝까지 못 한 정황. OGC 가 있었다면 CI 에서 일관되게 게임 완주 실패로 감지. 기권이 아니라 drop 실패 → 확정 불가 → 무한 대기가 root cause. |
| 보완 | I3 복제 tile 감지 + I1 pendingGroupIds 정리 가 매 턴 invariant 로 검증되어 **턴 #N 에서 정확히 어디가 깨지는지** 특정 가능 |

#### 사례 E — S4 (221218) 런 위로 drop 시도 직전 프레임

| 항목 | 내용 |
|------|-----|
| 증상 | 드래그 오버레이는 정상, over.id 는 런 그룹으로 확정. drop 순간부터 복제 시작 |
| 사전 탐지 가능 spec | `rule-turn-boundary-invariants.spec.ts :: TBI-SC1` (턴 경계 pending 정리) + `rule-extend-after-confirm.spec.ts :: EXT-SC4` |
| 단언 포인트 | drop 전후 `pendingGroupIds` 델타가 정확히 +1 (여러 개 아님) |
| RED 기대 근거 | drop 1회가 state change 여러 개로 분기되는 증상. TBI-SC1 의 "TURN_START 후 pending 0" 단언으로 턴 내 축적을 간접 검증 |

### 3.2 보조 매핑 (나머지 스크린샷)

| # | 파일 | 매핑 spec | 비고 |
|---|------|---------|-----|
| S1 | 220411 | OGC (정상 턴 대조군) | 사용자가 이 시점까지는 정상 플레이. 턴 경과 추적 기준선 |
| S2 | 220531 | EXT-SC1 (pending 1개 정상 상태) | 드래그 직전 정상 pending 1개 (기준선) |
| S3 | 221010 | (없음 — drag 시작 프레임) | activator 단계, 기능 버그 아님 |
| S6 | 221554 | GHOST-SC1 (동일 증상) | S5 와 동일 턴, 연속 프레임 |
| S8 | 221707 | TBI-SC1 (턴 경계 resetPending 작동 대조군) | 턴 #30 시작 시 복제 사라짐. TBI-SC1 이 이 정리 경로를 회귀 가드화 |

---

## 4. 만약 본 PR 의 5 spec 이 어제 (2026-04-23 22:04 이전에) 있었다면

### 4.1 타임라인 가설

| 시점 | 실제 발생 | 5 spec 있었을 때 기대 |
|------|---------|------------------|
| 2026-04-23 오후 | PR #70 머지 (PlayerRack key idx + isHandlingDragEndRef) | 동일 |
| 머지 직후 CI | Playwright 390 spec PASS → 배포 | **GHOST-SC1 + EXT-SC4 RED → merge gate 차단** |
| 사용자 플레이 22:04~22:18 | S1~S16 촬영 + 사용자가 직접 증상 발견 | **발생하지 않음** (배포 전 차단) |
| architect 재재조사 | `bug-ui-ext-ghost-rereview.md` 작성 | 사전에 근본 원인 조사 가능 |
| 사용자 기권 10:16:14 | S17 | 발생하지 않음 |

**결론**: 5 spec 중 **EXT-SC4 + GHOST-SC1 + GHOST-SC3** 3건이 RED 로 버그를 사전 탐지했을 것. 사용자 피해 차단 + architect 조사 선행 가능.

### 4.2 각 사용자 액션 별 5 spec 감지 비율

| 사용자 동작 (실제) | 5 spec 감지 여부 |
|-------------------|---------------|
| 턴 #1~#28 정상 플레이 | OGC 가 매 턴 invariants 검증 |
| 턴 #29 Y5 첫 drop | EXT-SC1/SC3 PASS 기대 → 감지 없음 (append 경로 정상) |
| 턴 #29 Y5 재 drop (복제 시작) | **EXT-SC4 + GHOST-SC1 RED** 로 즉시 감지 |
| 턴 #29 런 6개 복제 출현 | **GHOST-SC3 RED** (id 단조성 위반) |
| 턴 #30 정상 복귀 | TBI-SC1 PASS (대조군) |
| 기권 | OGC 가 완주 실패로 감지 |

---

## 5. 자기 비판 — 왜 AM 스탠드업 PR #71 에서 이 시나리오 세트 안 만들고 문서만 썼는가

### 5.1 사실 관계

- 2026-04-22 AM 스탠드업 시점: 사용자가 "테스트부터 제대로" 요구
- 2026-04-22 PM: qa 에이전트가 `pre-deploy-playbook` SKILL (v1.0) + BUG-UI-011/012/013 재현 spec 3종 작성 (PR #71)
- 2026-04-23 AM: PR #71 머지
- 2026-04-23 PM: PR #70 (BUG-UI-009 수정) 머지
- 2026-04-23 22:04~22:18: 사용자 플레이테스트 → BUG-UI-GHOST 재현
- 2026-04-24: architect 재재조사 → PR #70 효과 부족 판정
- 2026-04-24: 사용자 직접 지시 "테스트 시나리오 제대로 만들어 테스트해보면 안될까"

### 5.2 PR #71 에서 한 것 vs 해야 했던 것

**한 것**:
- pre-deploy-playbook SKILL v1.0 작성 (Phase 구조)
- BUG-UI-011/012/013 재현 spec 3종 RED

**해야 했던 것** (사후 판단):
- **룰 19 × UI 행위 전수 매트릭스** 작성 (본 PR 의 §81 문서)
- 각 셀 × spec 매핑 + 빈 칸 spec 발굴
- BUG-UI-EXT/GHOST 전조를 사전에 캡처할 "확정 후 extend 반복" spec (본 PR 의 EXT-SC4, GHOST-SC1)
- 1게임 완주 메타 실제 구현 (본 PR 의 OGC)

### 5.3 왜 그러지 못했는가 — 구조적 원인

1. **"스킬 먼저, spec 나중"의 반사적 관성**
   SKILL 을 정비하면 spec 은 그 구조에 따라 나중에 쓰면 된다는 잘못된 가정. 실제로 SKILL 은 **spec 집합을 가리키는 포인터**이므로 spec 이 먼저 있어야 한다.

2. **"정의된 버그"만 spec 화**
   BUG-UI-011/012/013 은 이미 티켓이 있던 버그. spec 은 정의된 증상을 재현했으나, **아직 티켓이 없는 증상군** (룰 × 엣지 조합) 을 선제적으로 탐색하지 못했다. 매트릭스가 없으니 빈 칸이 안 보였다.

3. **매트릭스 문서 = 설계팀 영역이라는 오해**
   `docs/02-design/31-game-rule-traceability.md` 에 룰 추적성 매트릭스가 있으므로 qa 는 "E2E 컬럼만 본다" 는 분업 사고. 매트릭스는 **QA 운영 SSOT** 여야 하고 빈 칸 발굴이 QA 핵심 책무라는 인식 부족.

4. **"2회 drop 이면 재현된다" 는 오판**
   PR #70 의 BUG-UI-009 spec 은 2회 drop 으로 재현. 같은 패턴을 BUG-UI-EXT 에도 그대로 적용할 수 있다고 가정. 실제로는 **3~6회 연속** + useMemo stale 이 필요. 반복 횟수 부족으로 재현 실패.

5. **사용자 스크린샷을 SKILL Phase 4 (실패 대응) 에만 반영**
   S5/S6/S7 을 본 건 2026-04-23 저녁이었으나, 이를 **신규 spec 생성 근거로** 쓰지 않고 "기존 PR #70 수정이 뚫렸다" 는 판정에만 썼다. 증거 → spec 으로 가는 루틴 부재.

6. **AM 스탠드업에서 "내일까지 끝낼 것" 압박에 대한 과반응**
   사용자의 "내일까지 끝" 지시를 "3가지 재현 spec + SKILL v1.0" 의 좁은 범위로 해석. 큰 매트릭스 + 여러 신규 spec 은 시간 압박에 밀려나 우선순위에서 탈락.

### 5.4 재발 방지 루틴

1. **사용자가 "테스트 시나리오" 언급 시 매트릭스부터 확인**
   `docs/04-testing/81-*.md` 매트릭스에 빈 칸이 있으면 spec 작성 먼저.
2. **PR #70 같은 UI 수정 PR 머지 전 매트릭스 갱신 필수**
   수정 대상 룰의 엣지 셀에 spec 이 있는지 확인. 없으면 UI 수정과 **동일 PR** 에 spec 추가.
3. **스크린샷 수신 시 매트릭스 cell 매핑 즉시**
   스크린샷 → "어느 행·어느 열의 증상인가" → 해당 cell 에 spec 없으면 생성.
4. **qa 에이전트 기본 루틴에 "매트릭스 빈 칸 스캔" 추가**
   매 스프린트 첫 날, 매트릭스 빈 칸 count 를 Metrics 로 기록. 감소 추세 유지.

---

## 6. 참고

- architect 재재조사 전문: `work_logs/plans/tmp-analysis/bug-ui-ext-ghost-rereview.md`
- 81번 매트릭스 (본 PR 동반): `docs/04-testing/81-e2e-rule-scenario-matrix.md`
- pre-deploy-playbook v2.0: `.claude/skills/pre-deploy-playbook/SKILL.md`
- PR #70 (BUG-UI-009 수정, 효과 부족 판정): https://github.com/k82022603/RummiArena/pull/70
- PR #71 (pre-deploy-playbook SKILL v1.0 + BUG-UI-011/012/013): https://github.com/k82022603/RummiArena/pull/71
