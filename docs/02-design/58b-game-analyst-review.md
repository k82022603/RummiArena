# 58b -- game-analyst SSOT 정합성 검증 리뷰

- **작성**: 2026-04-25, game-analyst
- **검증 대상**: `docs/02-design/58-ui-component-decomposition.md` (architect, v1.0)
- **검증 기준 (SSOT)**:
  - `docs/02-design/55-game-rules-enumeration.md` (V-23 / UR-36 / D-12 = 71개 룰)
  - `docs/02-design/56-action-state-matrix.md` (A1~A21 행동 x 6차원 상태)
  - `docs/02-design/56b-state-machine.md` (S0~S10 상태 12 + 전이 24 + invariant 16)
- **교차 검증**: `docs/02-design/60-ui-feature-spec.md` (PM 기능 카탈로그)

---

## 1. 정합성 점검표

### 1.1 F-NN별 룰 ID 매핑 정합성

**판정: PASS**

58 문서 2절의 각 F-NN 구현 명세에서 참조하는 룰 ID를 55 SSOT와 대조한 결과:

| 검증 항목 | 결과 | 상세 |
|----------|------|------|
| 58이 참조하는 모든 V-* ID가 55에 정의되어 있는가 | **PASS** | 58에서 사용된 V-01, V-02, V-03, V-04, V-06, V-07, V-08, V-09, V-10, V-13a, V-13e, V-14, V-15, V-17, V-18, V-19 모두 55 2절에 정의됨 |
| 58이 참조하는 모든 UR-* ID가 55에 정의되어 있는가 | **PASS** | UR-01, 02, 04, 06, 07, 08, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 25, 26, 29, 30, 32, 34, 35, 36 모두 55 3절에 정의됨 |
| 58이 참조하는 모든 D-* ID가 55에 정의되어 있는가 | **PASS** | D-01, D-02, D-10, D-11, D-12 모두 55 4절에 정의됨 |
| 58이 참조하는 모든 INV-* ID가 56b에 정의되어 있는가 | **PASS** | INV-G1~G5 모두 56b 3.1절에 정의됨 |
| 55에 없는 룰 ID를 58이 사용하고 있는가 | **PASS (없음)** | 확인 완료 |
| 55에 정의된 룰 중 58에서 누락된 것이 있는가 | **PASS (경미 사항 있음, 아래 §3 참조)** | 아래 누락 목록 참조 |

**세부 분석 -- 55 SSOT 71개 룰 커버리지**:

| 카테고리 | SSOT 55 정의 수 | 58에서 직접 참조 수 | 미참조 | 비고 |
|---------|----------------|-------------------|--------|------|
| V-* (서버 검증) | 23 | 16 | V-05, V-11, V-12, V-13b, V-13c, V-13d, V-16 | V-05는 V-13a 분기로 동작(55 2.5절 명시). V-11/V-12는 게임 종료 룰로 F-16에서 처리(P1). V-13b/c/d는 V-13a를 통과한 후의 세부 유형으로 58 F-06 서술에서 "split/merge/move"로 암시적 포함. V-16은 mergeCompatibility.ts(보존) 내부 로직으로 별도 명시 불필요 |
| UR-* (UI 인터랙션) | 36 | 28 | UR-03, 05, 09, 23, 27, 28, 31, 33 | UR-03은 F-14(P1) AI 사고 spinner. UR-05는 턴 종료 안내 토스트(사소). UR-09는 조커 드래그=일반 타일과 동일(별도 구현 불필요). UR-23은 F-19(P2). UR-27/28은 F-16(P1). UR-31은 V-13a 안내 메시지(UR-13으로 충분). UR-33은 AI 강제 드로우(서버측) |
| D-* (데이터 무결성) | 12 | 5 | D-03~D-09 | D-03은 INV-G3으로 커버. D-04~D-09는 서버 engine 또는 L3 mergeCompatibility 내부 로직으로 58 컴포넌트 분해에서 별도 명시 불필요. 단 D-04(tile code 형식)는 wsEnvelope.ts에서 암시적 커버 |

미참조 룰 대부분은 P1/P2 기능(F-14, F-16, F-19)에 속하거나, 기존 보존 파일(mergeCompatibility.ts, engine)에 이미 구현된 것으로 **구조적 누락이 아닌 설계 범위 한정**이다.

---

### 1.2 행동 매트릭스 셀 매핑 정합성

**판정: PASS**

58 3절의 dragEndReducer 매핑이 56 매트릭스의 각 셀(허용/거절)과 일치하는지 검증한다.

| 검증 항목 | 결과 | 상세 |
|----------|------|------|
| A1~A12 전부 58 3.1에 매핑되어 있는가 | **PASS** | 12개 행동 모두 매핑됨 (58 3.1 표) |
| A13~A21 비드래그 행동이 처리되는가 | **PASS** | A13(랙 재정렬)은 58 2.2 F-08. A14~A16은 58 2.1 F-09/F-11. A17은 58 2.2 F-12. A18~A21은 58 5절 WS 이벤트 매핑 |
| 각 셀의 허용/거절 판정이 56과 일치하는가 | **PASS** | 아래 셀별 대조 참조 |

**셀별 대조 (핵심 셀)**:

| A-ID | 56 SSOT 셀 | 58 매핑 | 정합 |
|------|-----------|---------|------|
| A1 (랙 -> 새 그룹) | 56 3.2: MY_TURN/*/허용 | 58 3.1: "보존", SSOT 56 셀 "3.2: MY_TURN/*/허용" | 일치 |
| A2 (랙 -> pending) | 56 3.3: COMPAT 시 허용 | 58 3.1: "보존", SSOT 56 셀 "3.3: COMPAT 시 허용" | 일치 |
| A3 (랙 -> server extend) | 56 3.4: POST_MELD+COMPAT 시 허용 | 58 3.1: "보존", SSOT 56 셀 "3.4" | 일치 |
| A4 (pending -> 새 그룹) | 56 3.5: 항상 허용 | 58 3.1: "신규 작성", SSOT 56 셀 "3.5" | 일치 |
| A5 (pending -> pending) | 56 3.6: COMPAT 시만 허용 | 58 3.1: "수정 RDX-01: 호환성 검사 추가", SSOT 56 셀 "3.6" | 일치 |
| A6 (pending -> server) | 56 3.7: POST_MELD+COMPAT 시 허용 | 58 3.1: "보존" | 일치 |
| A7 (pending -> 랙) | 56 3.8: 항상 허용 | 58 3.1: "보존" | 일치 |
| A8 (server -> 새 그룹) | 56 3.9: POST_MELD 시 허용 | 58 3.1: "신규 작성", SSOT 56 셀 "3.9" | 일치 |
| A9 (server -> server) | 56 3.10: POST_MELD+COMPAT 시 허용 | 58 3.1: "보존" | 일치 |
| A10 (server -> pending) | 56 3.11: POST_MELD+COMPAT 시 허용 | 58 3.1: "보존" | 일치 |
| A11 (server -> 랙) | 56 3.12: 전체 거절 (V-06) | 58 3.1: "보존" | 일치 |
| A12 (조커 swap) | 56 3.13: POST_MELD 시 허용 | 58 3.1: "보존" | 일치 |

**A4 신규 작성 시그니처 검증 (58 3.3 vs 56 3.5)**:

- 56 3.5 정의: "S-meld = *, S-pending-count = 1+, 결과 = 허용. V-13a 무관 -- pending은 항상 자기 것"
- 58 3.3 A4 시그니처: "source.kind === 'table' && sourceIsPending", "조건: hasInitialMeld 무관 (pending은 자기 것)"
- **정합**: 56 3.5의 "V-13a 무관"과 58 3.3의 "hasInitialMeld 무관" 동일 의미

**A8 신규 작성 시그니처 검증 (58 3.3 vs 56 3.9)**:

- 56 3.9 정의: "PRE_MELD = 거절 (V-13a), POST_MELD = 허용. 출발 서버 그룹은 pending으로 마킹"
- 58 3.3 A8 시그니처: "source.kind === 'table' && !sourceIsPending", "조건: hasInitialMeld === true (V-13a)"
- **정합**: 56 3.9의 POST_MELD 조건과 58 3.3의 hasInitialMeld === true 동일 의미

---

### 1.3 상태 머신 전이 정합성

**판정: PASS**

58 4절의 turnStateStore가 56b의 상태 머신을 올바르게 반영하는지 검증한다.

| 검증 항목 | 결과 | 상세 |
|----------|------|------|
| S0~S10 상태 12개 모두 포함 | **PASS** | 58 4.2 turnStateStore의 TurnState 타입에 S0~S10 모두 열거. "End" 상태는 S0으로의 전이로 표현 (TURN_END_OK -> S0). "GAME_OVER"는 TurnAction에 별도 정의 |
| TurnAction 17개가 56b 전이 24개를 커버하는가 | **PASS (설명 필요)** | 56b 전이 24개 중 일부는 동일 TurnAction의 조건 분기로 표현. 예: TURN_START는 mySeat 여부에 따라 S0->S1 또는 S1->S0. DRAG_CANCEL은 출발 상태에 따라 S2->S1, S3->S5, S4->S5. 17개 TurnAction으로 24개 전이를 exhaustive하게 커버 가능 |
| INV-G1~G5 반영 | **PASS** | 58 1.1 pendingStore.ts에 "[INV-G1/G2/G3]" 명시. 58 3.2에 INV-G2 보존. 58 4.2 pendingStore에 invariant 보호 applyMutation. 58 6.7에 INV-G1~G5 self-check |

**전이 매핑 상세 (56b 24개 -> 58 TurnAction 17개)**:

| 56b 전이 | 58 TurnAction | 비고 |
|----------|---------------|------|
| S0->S1 (TURN_START, mySeat) | TURN_START | 조건 분기 |
| S1->S0 (TURN_START, other) | TURN_START | 조건 분기 |
| S1->S2 (dragStart rack) | DRAG_START_RACK | 직접 매핑 |
| S1->S9 (DRAW) | DRAW | 직접 매핑 |
| S5->S2 (dragStart rack) | DRAG_START_RACK | 직접 매핑 |
| S5->S3 (dragStart pending) | DRAG_START_PENDING | 직접 매핑 |
| S5->S4 (dragStart server) | DRAG_START_SERVER | 직접 매핑 |
| S2->S5 (drop OK A1/A2/A3) | DROP_OK | 직접 매핑 |
| S3->S5 (drop OK A4/A5/A6/A7) | DROP_OK | 직접 매핑 |
| S4->S5 (drop OK A8/A9/A10) | DROP_OK | 직접 매핑 |
| S4->S10 (joker swap) | JOKER_SWAP | 직접 매핑 |
| S2->S1 (cancel, no pending) | DRAG_CANCEL | 조건 분기 |
| S3->S5 (cancel) | DRAG_CANCEL | 조건 분기 |
| S4->S5 (cancel) | DRAG_CANCEL | 조건 분기 |
| S5->S6 (UR-15 충족) | PRE_CHECK_PASS | 직접 매핑 |
| S6->S5 (사전조건 깨짐) | PRE_CHECK_FAIL | 직접 매핑 |
| S5->S1 (RESET) | RESET | 직접 매핑 |
| S6->S1 (RESET) | RESET | 직접 매핑 |
| S6->S7 (ConfirmTurn) | CONFIRM | 직접 매핑 |
| S7->End (TURN_END OK) | TURN_END_OK | 직접 매핑 |
| S7->S8 (INVALID_MOVE) | INVALID | 직접 매핑 |
| S8->S5 (사용자 재시도) | (사용자 액션으로 암시적 전이) | 별도 TurnAction 없음 -- S8에서 드래그 시작 시 DRAG_START_* 사용 가능 |
| S8->S1 (RESET) | RESET | 직접 매핑 |
| S9->End (DRAW 결과) | DRAW_OK | 직접 매핑 |
| S9->S1 (timeout 재시도) | (58에서 명시 없음) | 아래 경미 사항 참조 |
| S10->S5 (조커 재배치) | JOKER_PLACED | 직접 매핑 |
| S10->S5 (RESET) | RESET | RESET 액션이 S10에서도 동작해야 함 -- 58 TurnAction의 RESET 정의에 S8만 명시. 아래 경미 사항 참조 |

**경미 사항 (PASS 판정에 영향 없음)**:

1. S8->S5 전이: 56b에서 "사용자 액션 (재시도)"로 정의. 58에서는 별도 TurnAction 없이 S8 상태에서 DRAG_START_*로 전이되는 것으로 해석 가능. 단, `selectCanDrag` 셀렉터(58 4.4)에 S8이 포함되어 있지 않아 구현 시 보완 필요.
2. S9->S1 전이: 56b에서 "timeout 재시도"로 정의. 58 TurnAction에 대응하는 액션이 명시되지 않았으나, 이는 예외 경로로 구현 시 보완 가능.
3. S10에서 RESET: 58 TurnAction RESET 정의에 "S5/S6/S8 -> S1"로만 기술. 56b에서는 S10->S5 (RESET)도 정의. 구현 시 RESET 대상 상태에 S10 추가 필요.

---

### 1.4 사용자 실측 사고 3건 해결 경로 확인

**판정: PASS**

| 사고 | 위반 룰 | 58 해결 경로 | 정합 |
|------|---------|-------------|------|
| **INC-T11-DUP** (D-02 위반, tile code 보드 중복) | D-02, V-06 클라 표현 | 58 F-05 구현 명세: `pendingStore.applyMutation(result)` -- src 그룹 tile 제거 + dest 그룹 tile 추가 **atomic** (INV-G2 보호). 58 3.2 INV-G2 보존 (detectDuplicateTileCodes 방어선). 55 5절 "재발 방지: UR-14 sufficient + D-01/D-02 setter 가드"와 일치 | **PASS** |
| **INC-T11-IDDUP** (D-01 위반, 그룹 ID 중복) | D-01, V-17 | 58 F-06 구현 명세: `pendingStore.markServerGroupAsPending(srcId)` -- 서버 그룹 ID 보존하면서 pending 전환. 58 F-04: "서버 그룹 ID를 보존하면서 pending으로 마킹 (D-01, V-17)". pendingStore에 INV-G1 (D-01 그룹 ID 유니크) 보호. 55 5절 "재발 방지: V-17 서버측 ID 강제 + D-12 pending -> server ID 매핑"과 일치 | **PASS** |
| **INC-T11-FP-B10** (UR-35 위반, source guard false positive) | UR-35 | 58 6.7 band-aid 금지 self-check: "GroupDropZone.disabled는 V-13a 조건만. 추가 게이트 없음" (UR-35 충족). "confirmValidator.ts는 V-01/02/03/04/14/15 미러만 구현. 임의 추가 게이트 금지" (UR-36 충족). "invariantValidator.ts는 dev-only assert. 프로덕션은 silent restore" (UR-34 충족). 55 5절 "재발 방지: UR-34/UR-35/UR-36 + 본 SSOT 룰 ID 외 차단 금지"와 일치 | **PASS** |

---

### 1.5 band-aid 금지 원칙 준수

**판정: PASS**

| 검증 항목 | 결과 | 근거 |
|----------|------|------|
| UR-34 (invariant 토스트 금지) | **PASS** | 58 6.7: "invariantValidator.ts는 dev-only assert. 프로덕션은 silent restore. 사용자 토스트는 errorMapping.ts의 ERR_* 만 허용". 56b 4.3: "위반 발견 시 프로덕션은 console.error + Sentry alert + silent restore (사용자에게 토스트 노출 금지 -- UR-34)"와 일치 |
| UR-35 (명세 외 드래그 차단 금지) | **PASS** | 58 6.7: "GroupDropZone.disabled는 V-13a 조건만. 추가 게이트 없음". 58 1.1 GroupDropZone.tsx에 "[UR-14/18/19/20]"만 명시, source guard 류 없음. 55 3.6: "V-13a/V-13b/V-13c/V-13d/V-14/V-15 명세 외 사유로 드래그를 막아서는 안 됨"과 일치 |
| UR-36 (ConfirmTurn V-* 미러만) | **PASS** | 58 F-09 구현 명세 confirmValidator.ts: "V-01/V-02/V-03/V-04/V-14/V-15의 클라이언트 미러만 수행. 그 외 게이트 추가는 UR-36에 의해 금지". 55 3.6: "ConfirmTurn 사전검증은 V-01~V-15 클라 미러만 허용. 임의 추가 게이트 금지"와 일치 |

---

## 2. 모순 목록

검증 결과 **구조적 모순 0건**. 아래는 경미한 표현 불일치 2건으로, 의미적 모순은 아니나 문서 정비 시 통일 권장.

### 2.1 경미 사항 M-01: TurnAction RESET 대상 상태 범위

- **58 위치**: 4.2절 TurnAction 정의 `"RESET" // S5/S6/S8 -> S1`
- **56b 위치**: 2절 상태 다이어그램 `S10_JOKER_RECOVERED_PENDING --> S5_PENDING_BUILDING: A15 RESET_TURN`
- **내용**: 56b에서는 S10에서도 RESET(A15) 전이가 정의되어 있으나, 58의 RESET TurnAction 설명에 S10이 누락. 또한 56b에서 S10->S5이지만 58의 RESET은 S1로 전이하므로 도착 상태도 불일치.
- **심각도**: 경미. 구현 시 RESET 대상에 S10 추가 + 도착 상태를 56b 기준(S5)으로 통일하면 해소.
- **권고**: 58 4.2 RESET 주석을 `S5/S6/S8/S10 -> S1` 또는 56b 기준 `S10 -> S5`로 보완.

### 2.2 경미 사항 M-02: selectCanDrag 셀렉터에 S8 미포함

- **58 위치**: 4.4절 `selectCanDrag(state): boolean // S1/S5/S6에서만 true`
- **56b 위치**: 3.2절 S8 상태별 invariant에서 "사용자 액션(재시도)" 전이를 정의하며, S8에서 드래그 시작이 가능해야 S5로 전이할 수 있음.
- **내용**: S8(INVALID_RECOVER) 상태에서 사용자가 재시도(드래그)할 수 있으려면 selectCanDrag에 S8이 포함되어야 한다. 현재 S8이 누락.
- **심각도**: 경미. S8 상태에서 사용자 재시도 경로가 차단될 수 있으나, RESET을 통해 S1로 복귀 후 드래그하는 대안 경로가 존재.
- **권고**: selectCanDrag에 S8 추가, 또는 S8->S5 전이를 RESET 경유로 한정한다면 현행 유지 가능.

---

## 3. 누락 목록

SSOT에 정의되어 있으나 58에서 반영이 약한 항목. **구조적 누락 0건**, 경미 누락 5건.

### 3.1 N-01: V-13b/V-13c/V-13d 명시적 참조 부재

- **55 위치**: 2.14~2.16절 (V-13b Split, V-13c Merge, V-13d Move)
- **58 위치**: F-06 구현 명세에서 "split / merge / move"로 서술하지만 V-13b/c/d ID를 직접 참조하지 않음
- **영향**: 구현 시 V-13b/c/d를 개별 검증해야 하는지 모호할 수 있음
- **권고**: 58 F-06 구현 명세의 룰 ID 목록에 "V-13b/V-13c/V-13d" 명시 추가

### 3.2 N-02: V-05 (최초 등록 시 랙 타일만) 독립 참조 부재

- **55 위치**: 2.5절 (V-05)
- **58 위치**: F-04에서 V-13a만 참조. V-05는 55에서 "V-13a 분기로도 동작"이라 명시되어 있어 기능적으로는 V-13a로 커버됨
- **영향**: 없음 (V-05 = V-13a의 특화 분기)
- **권고**: 참고 주석 추가 정도

### 3.3 N-03: V-11/V-12 (교착/승리) 컴포넌트 연결 부재

- **55 위치**: 2.11절 (V-11), 2.12절 (V-12)
- **58 위치**: F-16(P1)이 2.2절 요약에만 등장. V-11/V-12 -> GameOverOverlay.tsx 연결은 명시되어 있으나 상세 구현 명세는 없음
- **영향**: 없음 (P1 범위, 상세는 P1 구현 시 작성 예정)
- **권고**: 없음

### 3.4 N-04: D-04~D-09 매핑 부재

- **55 위치**: 4절 (D-04 tile code 형식, D-05 106장, D-06 동일 코드 1장, D-07 조커 2장, D-08 조커 wildcard, D-09 색상 enum)
- **58 위치**: D-04~D-09는 58에서 직접 참조되지 않음
- **영향**: 없음. D-04~D-09는 서버 engine 또는 기존 보존 파일(mergeCompatibility.ts) 내부 로직이며, 58은 프론트엔드 컴포넌트 분해 설계서로 범위가 다름
- **권고**: 없음 (서버측은 go-dev 87에서 커버)

### 3.5 N-05: UR-03, UR-05, UR-09, UR-31, UR-33 미참조

- **55 위치**: 3.1절 (UR-03 AI 사고 중), 3.1절 (UR-05 턴 종료 안내), 3.2절 (UR-09 조커 드래그), 3.5절 (UR-31 V-13a 안내), 3.5절 (UR-33 AI 강제 드로우)
- **58 위치**: 미참조
- **영향**: 경미.
  - UR-03: F-14(P1) AI 사고 spinner -- 58 1.1 PlayerCard.tsx 등에서 처리 가능
  - UR-05: 턴 종료 후 5초 안내 -- 사소한 토스트, useGameSync에서 처리 가능
  - UR-09: 조커 드래그 = 일반 타일 동일 -- 별도 구현 불필요
  - UR-31: V-13a 위반 시 안내 메시지 -- UR-13(disabled) + GroupDropZone으로 충분
  - UR-33: AI 강제 드로우 -- 서버측 처리, 클라에서는 TURN_END 수신으로 충분
- **권고**: UR-03을 F-14 상세 명세 작성 시 포함. 나머지는 무방.

---

## 4. 개선 권고

### 4.1 R-01: RESET TurnAction 대상에 S10 추가

M-01에서 식별. 58 4.2절 TurnAction RESET의 주석을 `S5/S6/S8/S10 -> S1`로 수정하거나, 56b와 통일하여 S10 -> S5 별도 전이로 처리. 구현 시 stateMachineGuard.ts의 RESET 분기에 S10 case 추가 필요.

### 4.2 R-02: selectCanDrag에 S8 포함 여부 명확화

M-02에서 식별. S8(INVALID_RECOVER) 상태에서 사용자 재시도 UX를 정의해야 한다:
- **옵션 A**: S8에서 직접 드래그 가능 -> selectCanDrag에 S8 추가
- **옵션 B**: S8에서는 RESET만 가능, RESET 후 S1에서 드래그 -> 현행 유지

56b 3.2에서 "S8 -> S5: 사용자 액션(재시도)"로 정의하므로 **옵션 A 권장**.

### 4.3 R-03: F-06 룰 ID에 V-13b/c/d 명시 추가

N-01에서 식별. 58 F-06 구현 명세의 수정 근거에 V-13b(Split)/V-13c(Merge)/V-13d(Move)를 명시하면 구현자가 세부 재배치 유형별 검증 포인트를 즉시 파악할 수 있다.

### 4.4 R-04: confirmValidator.ts에 V-03 포함 확인

58 F-09 구현 명세의 confirmValidator.ts 시그니처에서 `tilesAdded: number` 파라미터를 받으므로 V-03(최소 1장 추가) 검증이 가능하다. 그러나 본문 서술에서 "V-01/V-02/V-14/V-15의 클라이언트 미러만"이라 V-03이 목록에서 빠져 있다. 바로 아래 함수 본문 설명에서는 "V-01 (세트 유효성) / V-02 (세트 크기) / V-03 (최소 1장) / V-04 (30점) / V-14 (동색 중복) / V-15 (런 연속)"로 V-03을 포함하고 있어 **서술 불일치**. 상세 함수 설명이 정확하며, 요약 서술의 V-03 누락은 타이포로 보인다.

---

## 5. 최종 판정

> **58 설계서는 SSOT(55/56/56b)와 정합함.**
>
> - **구조적 모순**: 0건
> - **구조적 누락**: 0건
> - **경미 모순**: 2건 (M-01: RESET 대상 S10 누락, M-02: selectCanDrag S8 미포함)
> - **경미 누락**: 5건 (N-01~N-05, 대부분 P1/P2 범위 또는 서버측)
> - **개선 권고**: 4건 (R-01~R-04)
>
> **경미 사항 7건은 구현 단계에서 보완 가능하며 설계 승인을 차단하지 않는다.**
> architect가 R-01~R-04를 반영하면 정합성이 더욱 견고해진다.

### 교차 검증 (60 PM 기능 카탈로그)

58이 60의 P0 12개 F-NN을 모두 커버하는지 확인:

| 60 P0 F-NN | 58 §2 포함 여부 | 비고 |
|------------|----------------|------|
| F-01 | 포함 (2.1 상세) | |
| F-02 | 포함 (2.1 상세) | |
| F-03 | 포함 (2.1 상세) | |
| F-04 | 포함 (2.1 상세) | |
| F-05 | 포함 (2.1 상세) | |
| F-06 | 포함 (2.1 상세) | |
| F-09 | 포함 (2.1 상세) | |
| F-11 | 포함 (2.1 상세) | |
| F-13 | 포함 (2.1 상세) | |
| F-15 | 포함 (2.1 상세) | |
| F-17 | 포함 (2.1 상세) | |
| F-21 | 포함 (2.1 상세) | |

**P0 12개 전원 커버 확인.**

60 P1 8개도 58 2.2절에 요약 명세로 포함 (F-07, F-10, F-12, F-14, F-16, F-18, F-20, F-22/23).

---

## 6. 변경 이력

- **2026-04-25 v1.0**: game-analyst 정합성 검증 최초 발행. 5개 검증 항목 전항 PASS. 경미 모순 2건, 경미 누락 5건, 개선 권고 4건. 최종 판정: **SSOT와 정합함**.
