# 56 — 행동 × 상태 매트릭스 (SSOT)

- **작성**: 2026-04-25, game-analyst
- **상위 SSOT**: `docs/02-design/55-game-rules-enumeration.md`
- **사용처**: architect (컴포넌트 분해), frontend-dev (`handleDragEnd` 재설계), qa (테스트 매트릭스 생성), go-dev (서버 분기 audit)
- **목적**: 사용자 행동(A1~A21) × 상태 조합(S-meld × S-pending × S-source × S-dest 등) 의 **셀별 허용/거절 + 룰 ID 매핑** exhaustive enumeration. band-aid 회귀 시 본 매트릭스로 **명세에 없는 차단** 즉시 식별.
- **충돌 정책**: 본 매트릭스 셀과 코드 분기 충돌 시 → 본 매트릭스 우선. 코드 분기를 제거하거나 셀에 명시.

---

## 1. 행동 enumeration (A-*)

| ID | 행동 | 트리거 (이벤트 / UI) |
|----|------|---------------------|
| **A1** | 랙 → 보드 새 그룹 드롭 | dnd-kit drop on `new-group` zone |
| **A2** | 랙 → 보드 기존 pending 그룹 드롭 | drop on pending group |
| **A3** | 랙 → 보드 서버 확정 그룹 드롭 (extend) | drop on server-confirmed group |
| **A4** | 보드 pending → 보드 새 그룹 드롭 (split via new) | drag from pending, drop new |
| **A5** | 보드 pending → 보드 다른 pending 드롭 (merge pending) | drag from pending, drop pending |
| **A6** | 보드 pending → 보드 서버 확정 그룹 드롭 | drag from pending, drop server |
| **A7** | 보드 pending → 랙 (회수) | drag from pending, drop rack |
| **A8** | 보드 서버 확정 → 보드 새 그룹 (split server) | drag from server, drop new |
| **A9** | 보드 서버 확정 → 보드 다른 서버 확정 (merge server) | drag from server, drop server |
| **A10** | 보드 서버 확정 → 보드 pending 그룹 | drag from server, drop pending |
| **A11** | 보드 서버 확정 → 랙 (회수) | drag from server, drop rack |
| **A12** | 조커 swap (V-13e) — 랙 타일을 보드 조커 위에 드롭 | drop tile on joker tile |
| **A13** | 랙 → 랙 (재정렬) | drag within rack |
| **A14** | ConfirmTurn 클릭 | button click |
| **A15** | RESET_TURN 클릭 | button click |
| **A16** | DRAW 클릭 | button click |
| **A17** | 드래그 취소 (esc / onDragCancel) | dnd-kit cancel |
| **A18** | 다른 플레이어 PLACE_TILES 수신 | WS receive (관전자 시점 포함) |
| **A19** | TURN_START 수신 | WS receive |
| **A20** | TURN_END 수신 | WS receive |
| **A21** | INVALID_MOVE 수신 (서버 거부) | WS receive |

---

## 2. 상태 차원

매 행동의 허용/거절은 다음 **6 개 차원**의 조합으로 결정된다.

| 차원 | 값 | 비고 |
|------|------|------|
| **S-turn** | MY_TURN / OTHER_TURN | V-08 |
| **S-meld** | PRE_MELD / POST_MELD | `hasInitialMeld` 값 (V-13a) |
| **S-source** | RACK / PENDING_BOARD / SERVER_BOARD | 드래그 출발 |
| **S-dest** | RACK / NEW_GROUP / PENDING_BOARD / SERVER_BOARD / JOKER_TILE | 드래그 목적지 |
| **S-compat** | COMPAT / INCOMPAT / N_A | `isCompatibleWithGroup` 결과 (UR-14) |
| **S-pending-count** | 0 / 1+ | 현재 pending 그룹 수 (RESET 활성·UR-15 사전검증 영향) |

상태 조합 총수 (이론치): 2 × 2 × 3 × 5 × 3 × 2 = **360**. 이 중 **유효 + 의미 있는 조합** 만 §3 셀에 매핑.

---

## 3. 매트릭스 — 행동 × 핵심 상태 조합

각 셀: **허용** (룰 ID) / **거절** (룰 ID) / **N/A**

### 3.1 드래그 시작 (행동 자체가 시작 단계)

| 행동 출발 | S-turn | S-meld | 결과 | 근거 |
|----------|--------|--------|------|------|
| RACK 출발 | OTHER_TURN | * | **거절** | V-08 / UR-01 |
| RACK 출발 | MY_TURN | * | **허용** | UR-06 |
| PENDING 출발 | OTHER_TURN | * | **거절** | V-08 / UR-01 |
| PENDING 출발 | MY_TURN | * | **허용** | UR-07 |
| SERVER 출발 | OTHER_TURN | * | **거절** | V-08 |
| SERVER 출발 | MY_TURN | PRE_MELD | **거절** | V-13a / UR-13 (band-aid 가 아닌 명세 기반 차단) |
| SERVER 출발 | MY_TURN | POST_MELD | **허용** | UR-08 |

### 3.2 A1 — 랙 → 새 그룹 드롭

| S-turn | S-meld | S-pending-count | 결과 |
|--------|--------|----------------|------|
| OTHER_TURN | * | * | 거절 (UR-01) |
| MY_TURN | PRE_MELD | * | **허용** (V-13a 무관 — 자기 랙만 사용) |
| MY_TURN | POST_MELD | * | **허용** |

→ 새 그룹 ID = `pending-{uuid}` (D-01 / D-12)

### 3.3 A2 — 랙 → pending 그룹 드롭

| S-meld | S-compat | 결과 |
|--------|---------|------|
| * | COMPAT | **허용** (UR-14) |
| * | INCOMPAT | 거절 (UR-19, 드롭존 강조 안 됨) |

### 3.4 A3 — 랙 → 서버 확정 그룹 드롭 (extend)

| S-meld | S-compat | 결과 | 근거 |
|--------|---------|------|------|
| PRE_MELD | * | **거절** | V-13a / UR-13. 서버 그룹은 **건드릴 수 없음** (이번 턴 한정 자기 랙만) |
| POST_MELD | COMPAT | **허용** | UR-14. 서버 그룹은 setPendingTableGroups 에서 **그룹 id 보존하면서 pending 으로 마킹** (D-12) |
| POST_MELD | INCOMPAT | 거절 (UR-19) |

> **사고 매핑**: BUG-UI-EXT-SC1 (확정 후 extend 회귀) 은 이 셀의 POST_MELD/COMPAT/허용 셀이 회귀로 INCOMPAT 처리된 것. 본 매트릭스가 명세 SSOT.

### 3.5 A4 — pending → 새 그룹 드롭 (split via new)

| S-meld | S-pending-count | 결과 |
|--------|----------------|------|
| * | 1+ | **허용** (V-13a 무관 — pending 은 항상 자기 것) |

→ 출발 그룹에서 tile 제거. 잔여 < 3장이면 그룹은 invalid pending 으로 표시 (UR-20) — 단 ConfirmTurn 시 V-02 로 거부. 사용자가 보충 가능 시간 줘야 함.

### 3.6 A5 — pending → 다른 pending 드롭 (merge pending)

| S-compat | 결과 |
|---------|------|
| COMPAT | **허용** |
| INCOMPAT | 거절 |

### 3.7 A6 — pending → 서버 확정 그룹 드롭

| S-meld | S-compat | 결과 |
|--------|---------|------|
| PRE_MELD | * | **거절** (V-13a — 서버 그룹 변형 불가) |
| POST_MELD | COMPAT | **허용** |
| POST_MELD | INCOMPAT | 거절 |

### 3.8 A7 — pending → 랙 (회수)

| 결과 | 근거 |
|------|------|
| **허용** | UR-12. pending 은 아직 commit 안 됨, 자기 것 회수 자유 |

### 3.9 A8 — 서버 → 새 그룹 (split server)

| S-meld | 결과 |
|--------|------|
| PRE_MELD | 거절 (V-13a) |
| POST_MELD | **허용**. 출발 서버 그룹은 pending 으로 마킹 + 일부 tile 분리되어 새 pending 그룹 생성 |

### 3.10 A9 — 서버 → 다른 서버 (merge server)

| S-meld | S-compat | 결과 |
|--------|---------|------|
| PRE_MELD | * | 거절 (V-13a) |
| POST_MELD | COMPAT | **허용**. 양쪽 서버 그룹 모두 pending 으로 전환 + tile 이동 |
| POST_MELD | INCOMPAT | 거절 (UR-19) |

### 3.11 A10 — 서버 → pending 드롭

| S-meld | S-compat | 결과 |
|--------|---------|------|
| PRE_MELD | * | 거절 (V-13a) |
| POST_MELD | COMPAT | **허용**. 출발 서버 그룹은 pending 으로 전환 |
| POST_MELD | INCOMPAT | 거절 |

### 3.12 A11 — 서버 → 랙 (회수)

| 결과 | 근거 |
|------|------|
| **거절 (전체)** | V-06 conservation. 어떤 상태에서도 서버 commit 된 tile 을 랙으로 가져올 수 없음. 단 V-13e 조커 swap 결과 회수된 조커는 예외 — 그러나 그것도 "랙 회수" 가 아니라 "교체 후 즉시 사용" 흐름이라 별도 (A12) |

### 3.13 A12 — 조커 swap (V-13e)

| S-meld | 조건 | 결과 |
|--------|------|------|
| PRE_MELD | * | 거절 (V-13a — 서버 그룹 변형) |
| POST_MELD | 보드 조커 위에 동등 가치 일반 타일 드롭 | **허용**. 조커는 회수 → 랙 표시 → 같은 턴 재사용 필수 (V-07, UR-25) |

### 3.14 A13 — 랙 내 재정렬

| 결과 | 근거 |
|------|------|
| **허용 (항상, 내 턴 무관)** | 랙은 내 사적 공간. 서버 영향 없음 |

### 3.15 A14 — ConfirmTurn

| S-pending-count | tilesAdded | 클라 사전검증 (V-01/02/14/15) | 초기멜드 시 V-04 점수 | 결과 |
|----------------|-----------|------------------------------|---------------------|------|
| 0 | 0 | * | * | UR-15 버튼 자체 비활성화 |
| 1+ | 0 | * | * | UR-15 비활성화 (V-03) |
| 1+ | ≥ 1 | FAIL | * | 비활성화 |
| 1+ | ≥ 1 | OK | PRE_MELD AND < 30 | 비활성화 (UR-30 안내) |
| 1+ | ≥ 1 | OK | POST_MELD OR ≥ 30 | **활성** → WS CONFIRM_TURN |

서버 응답:
- OK → TURN_END, UR-04 pending 리셋
- FAIL (V-* 위반) → UR-21 INVALID_MOVE 토스트, 스냅샷 롤백, 턴 유지 (재시도 가능)

### 3.16 A15 — RESET_TURN

| 결과 | 근거 |
|------|------|
| **허용 (UR-16)**: pending 0 으로 + 랙 복귀 | 클라 단독 작업 (서버 영향 없음). pending → server 매핑 정합성 유지 (D-12) |

### 3.17 A16 — DRAW

| 사전 상태 | drawpile.empty | 결과 |
|----------|---------------|------|
| pending 그룹 존재 | * | **거절**: ConfirmTurn 또는 RESET 후 시도 가능 |
| pending 0 | false | **허용**: 1장 추가, 턴 종료 |
| pending 0 | true | **허용 (패스 처리)**: V-10 / UR-22 |

### 3.18 A17 — 드래그 취소

| 결과 |
|------|
| **항상 허용** (UR-17). dnd-kit onDragCancel 시 원위치. **이 경로에서 어떠한 state 변경도 발생해서는 안 됨** (D-01/D-02 invariant 보호) |

### 3.19 A18~A21 — WS 수신 처리

| 행동 | 동작 |
|------|------|
| A18 PLACE_TILES (다른 플레이어) | 관전 표시. 내 pending 영향 없음 |
| A19 TURN_START | UR-04: pendingTableGroups = []. UR-02 활성화 (내 턴이면) |
| A20 TURN_END | TURN_START 와 동일 cleanup |
| A21 INVALID_MOVE | UR-21 토스트, 클라 state = 서버 마지막 healthy 스냅샷 (롤백). **band-aid invariant validator 자동 RESET 토스트 노출 금지 (UR-34)** |

---

## 4. 사용자 실측 사고 ↔ 매트릭스 셀 매핑

| 사고 | 매트릭스 셀 | 위반 | 본질 원인 |
|------|------------|------|----------|
| **INC-T11-DUP** (84) | A6 (pending → server 드롭) — POST_MELD/COMPAT/허용 | D-02 (11B 가 두 그룹에 존재) — 코드 버그가 매트릭스 셀의 명세를 위반함 | `handleDragEnd` table→table 분기에서 출발 그룹의 tile 을 제거하지 않은 채 목적 그룹에 추가 |
| **INC-T11-IDDUP** (86 §3.1) | A9 (server → server merge) — POST_MELD/COMPAT/허용 | D-01 (그룹 ID 중복) — V-17 (서버 ID 미할당) | `processAIPlace` ID 누락 + 클라 합병 시 양쪽 ID 보존하다 충돌 |
| **INC-T11-FP-B10** (스탠드업 §0) | A3 (랙 → server 그룹 extend) — POST_MELD/COMPAT/허용 (B10/B11/B12 런 + B10 추가하면 V-15 위반이지만 B10/B11/B12 사례는 사용자 의도가 다른 그룹 합병이었음) | UR-35 (명세에 없는 사유로 차단) — band-aid source guard | source guard 가 D-01/D-02 false positive 로 모든 setPendingTableGroups 거부 |

---

## 5. 빠진 셀 / 향후 carve-out

본 매트릭스의 sparse 한 셀 (`* AND *` 표기) 은 **모든 조합에서 동일 결과** 임을 의미. 만약 이후 새로운 룰이 추가되어 분기가 필요해지면 본 문서를 재정렬한다 (architect ADR 필수).

명시적으로 **deferred** 된 결정:
- A12 조커 swap 의 "동등 가치 일반 타일" 정의 — V-13e 가 회수 조커의 즉시 재사용을 강제할 뿐, swap 시 가치 일치는 명세 부재. 검토 후 V-20 으로 추가 후보.
- A18 관전자 시점 (taller, 비활성 플레이어) — 본 매트릭스는 활성 플레이어 관점. 관전자 모드는 별도 carve-out.

---

## 6. 카운트 요약

| 항목 | 개수 |
|------|------|
| 행동 (A-*) | **21** |
| 핵심 상태 차원 | **6** (S-turn × S-meld × S-source × S-dest × S-compat × S-pending-count) |
| 매트릭스 명시 셀 | **§3.2 ~ §3.19 통합 약 60+ 셀** (sparse 표기 포함) |

요구 (20+ 행동×상태 조합) 충족.

---

## 7. 변경 이력

- **2026-04-25 v1.0**: 본 매트릭스 발행. SSOT 55 의 V-*/UR-*/D-* 와 1:1 매핑. 사용자 실측 사고 3건 셀 매핑 완료.
