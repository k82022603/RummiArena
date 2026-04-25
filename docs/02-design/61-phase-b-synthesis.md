# 61 — Phase B 8 산출물 종합 보고서 (PM Phase C)

- **작성**: 2026-04-25, pm (본 sprint 최종 의사결정자)
- **사용자 GO 사인**: 2026-04-25 "승인함" — Phase A+B 8 산출물 모두 승인 수신 후 발행
- **상위 plan**: `/home/claude/.claude/plans/reflective-squishing-beacon.md` (Phase C 정의)
- **입력 산출물 (8건)**:
  1. `docs/02-design/55-game-rules-enumeration.md` (game-analyst, 룰 71)
  2. `docs/02-design/56-action-state-matrix.md` (game-analyst, 행동 21 × 상태 6 차원)
  3. `docs/02-design/56b-state-machine.md` (game-analyst, 상태 12 + 전이 24 + invariant 16)
  4. `docs/02-design/60-ui-feature-spec.md` (pm Phase A, F-NN 25 + acceptance 54)
  5. `docs/03-development/26-architect-impact.md` (architect, 컴포넌트 24단위 + ADR 5건 + 이벤트 계약 4표)
  6. `docs/03-development/26b-frontend-source-review.md` (frontend-dev, 폐기 107 / 보존 1061 / 수정 1287)
  7. `docs/04-testing/87-server-rule-audit.md` (go-dev, V-* 16/23 완전, 미구현 P0 2 + P1 2)
  8. `docs/04-testing/88-test-strategy-rebuild.md` (qa+game-analyst, 폐기 806 / 보존 71 / 신규 228)
  9. `docs/02-design/57-game-rule-visual-language.md` (designer, UR-* 36 시각 토큰 + 드롭존 3상태)
  10. `docs/04-testing/89-state-corruption-security-impact.md` (security, WS 변조 6 / 권한 우회 0 / 신규 보안 부채 6)
- **사용처**: Phase D (구현 dispatch) — frontend-dev / go-dev / designer / qa 4명 병렬
- **충돌 정책**: 본 종합 보고서가 산출물 간 모순 발견 시 → 본 PM 결단 (§6) 우선. 모순 영역의 후속 PR 은 본 결단 따라야.

---

## 1. 8 산출물 핵심 수치 일람표

| 산출물 | 작성자 | 핵심 출력 | 수치 |
|-------|-------|----------|------|
| 55 게임룰 enumeration | game-analyst | V-* 23 + UR-* 36 + D-* 12 | **71 룰** |
| 56 행동×상태 매트릭스 | game-analyst | 행동 A1~A21 × 상태 6차원 | 행동 **21**, 셀 60+ |
| 56b 상태 머신 | game-analyst | 상태 12 + 전이 24 + invariant 16 | 12/24/16 |
| 60 UI 기능 설계서 | pm | F-NN 25 + acceptance 54 | P0 **12**, P1 **8**, P2 **5** |
| 26 architect 영향도 | architect | 4 계층 ADR 5건 + 컴포넌트 24단위 + 이벤트 계약 4표 | **24 단위**, ADR **5** |
| 26b frontend 라인 리뷰 | frontend-dev | 폐기 107 / 보존 1,061 / 수정 1,287 | A-N 매핑 **90.5%** |
| 87 서버 룰 audit | go-dev | V-* 매핑 16/23 완전, 미구현 V-17/V-19/D-12 | 완전 **16**, 미구현 **6** |
| 88 테스트 전략 재작성 | qa+game-analyst | 폐기 806 / 보존 71 / 신규 228 (harness 28 포함) | 보존율 **8%** |
| 57 시각 언어 | designer | UR-* 36 시각 토큰 + 디자인 토큰 30+ | UR-* **36** |
| 89 보안 영향 평가 | security | WS 변조 6 / 권한 우회 **0** / 신규 보안 부채 **6** | SEC-DEBT **6** |

**합계**:
- **룰 ID 정의**: 71 (V-23 + UR-36 + D-12)
- **추가 invariant**: 16 (전역 5 + 상태별 11)
- **F-NN 카탈로그**: 25 (P0=12 / P1=8 / P2=5)
- **acceptance criteria**: 54 (P0 본문 명시 34 + P1/P2 qa 88 확장 20)
- **컴포넌트/hook/도메인 단위**: 24 (12 + 7 + 5)
- **ADR**: 5건 (4 계층 분리 / L3 순수성 / 그룹 ID 정책 / 상태 머신 store / 의존성 주입)
- **신규 테스트**: 228 (단위/property 200 + self-play harness 28)
- **신규 보안 부채**: 6 (P1×1 / P2×3 / P3×2)
- **미구현 서버 룰 (P0)**: V-17 (AI 그룹 ID 누락) + D-12 (pending→server ID 매핑)
- **사용자 사고 매핑**: 3건 (INC-T11-DUP / INC-T11-IDDUP / INC-T11-FP-B10) — 모두 Phase B 산출물에서 직접 해결 경로 식별

---

## 2. 모순 식별 (산출물 간 충돌)

본 PM 이 8 산출물을 교차검증하여 식별한 모순. **모순 ≠ 결함**. 8명이 독립 작성 후 PM 이 통합 책임.

### 2.1 모순 #1 — A-N 매핑 카운트 불일치

| 출처 | 주장 | 근거 |
|------|------|------|
| 56 매트릭스 | A1~A21 = **21** 행동 | §1 행동 enumeration |
| 26b frontend 리뷰 | handleDragEnd 매핑률 **69.2%** (9/13) / 전체 **90.5%** (19/21) | §1.3 매핑률 계산 |
| 88 테스트 전략 | A1~A21 단위 테스트 **90건** (요구 60+) | §2.1 테이블 |

**충돌 평가**: 카운트 자체는 일치 (21). 그러나 **현 코드의 매핑률과 테스트 전략의 신규 작성 단위가 같은 분모를 쓰는지** 모호.

**PM 판정 (§6.1)**: 분모 **21**로 통일. handleDragEnd 직접 매핑(13)은 잠시 분리 분류.

---

### 2.2 모순 #2 — V-17 책임 경계 (frontend vs backend)

| 출처 | V-17 책임 |
|------|----------|
| 55 SSOT | "**서버에서 발급** (UUID v4). 클라이언트가 새 그룹을 만들 때는 임시 prefix `pending-` 만 사용" |
| 26 architect ADR §3.3 | "FE `pendingStore` 가 단독 발급. 서버 확정 그룹 ID 는 **서버에서 발급된 UUID 만 사용**" + "**V-17 서버측 ID 발급은 go-dev 책임** (`processAIPlace` 의 ID 누락 — `87-server-rule-audit.md`)" |
| 87 go-dev | "ID 발급 책임이 어느 계층(handler/service/repository)인지 명세되지 않아 수정 시 여러 계층을 동시에 수정해야 한다" — **모듈화 §6 위반 자기 인정** |
| 89 security | "AUDIT-02 `wsGroupsToService:2419` 가 클라 ID 를 그대로 신뢰" + "P1 신규 부채 SEC-DEBT-001" |

**충돌 평가**: SSOT 와 ADR 은 일관되나, **server 측 어느 함수가 ID 를 발급하는지** 명세되지 않음. go-dev 자기 인정이 정확.

**PM 판정 (§6.2)**: V-17 구현 위치를 **`service.convertToSetOnTable` 단일 진실의 원천**으로 확정. handler 는 빈 ID 또는 `pending-` prefix 만 통과. service 가 `uuid.New().String()` 발급.

---

### 2.3 모순 #3 — INC-T11-DUP 본질 원인 해석

| 출처 | 본질 원인 |
|------|----------|
| 55 SSOT §5 | "frontend (`handleDragEnd` table→table 분기 호환성 미검사)" → V-06 클라 단독 위반 |
| 56 매트릭스 §4 | "A6 (pending → server merge) 에서 출발 그룹의 tile 을 제거하지 않은 채 목적 그룹에 추가" → INV-G2 (D-02) |
| 88 테스트 전략 §4.1 | "[RED-A] 호환성 미검사 — B11a → 12s 4-tile" **폐기** (R4) — "사고 본질은 호환성 미검사가 아니라 D-02 위반" |

**충돌 평가**: 55 SSOT 는 "호환성 미검사"로 진단했으나, 56/88은 "atomic transfer 누락 → D-02 위반"으로 정정. **88이 더 정확**. 55 §5의 책임 컬럼 재진단 필요.

**PM 판정 (§6.3)**: 88 의 진단 **채택**. INC-T11-DUP 의 본질 원인은 **dragEndReducer A6 셀 atomic transfer 누락** (출발 그룹 tile 미제거). 호환성 미검사는 부차 효과. 55 SSOT §5 표 다음 sprint 갱신 (game-analyst 책임).

---

### 2.4 모순 #4 — 폐기 라인 수 불일치

| 출처 | 주장 |
|------|------|
| 26b frontend §7 | "폐기 대상: 약 **107줄**" |
| 26 architect §0.1 | "GameClient.tsx 1830줄 monolith" — 분할 필수 |
| 88 테스트 전략 §1.3 | "폐기 **806건** / 보존 71건 / 신규 228건" (테스트 영역) |

**충돌 평가**: 다른 차원의 수치. 26b 는 **소스 코드 라인 폐기**, 88은 **테스트 케이스 폐기**. 문서 독자가 혼동 가능. **모순이 아니라 명명 명료성 부족**.

**PM 판정 (§6.4)**: 본 종합 보고서 §1 일람표에서 "폐기 라인 (소스)" / "폐기 케이스 (테스트)" 명시 분리 표기. 향후 모든 산출물은 **단위 명시 의무**.

---

### 2.5 모순 #5 — band-aid 토스트의 경계선 (UR-34 vs handleConfirm 시점)

| 출처 | 주장 |
|------|------|
| 55 UR-34 | "state 부패 토스트 금지 — invariant validator / source guard 류 토스트는 사용자에게 보여서는 안 됨" |
| 26b §3.1 1342–1382 | `handleConfirm` 내 detectDuplicateTileCodes 토스트 — "**보존 (단기)**: ConfirmTurn 시점 토스트는 사용자가 직접 요청(클릭)한 시점이므로 노출 허용 가능" |
| 88 §1.2.1 G2 게이트 | "`detectDuplicateTileCodes` (helper 사용 검증) — 단 INV-G2 property test 내 import 는 허용 (assertion 도구로만)" |

**충돌 평가**: 26b 는 ConfirmTurn 시점 토스트를 **경계선** 으로 보존 추천. 88 G2 게이트는 helper 사용 검증을 모두 폐기. 두 결정이 충돌하는 것은 아님 — 26b의 보존은 **단기**, 88은 **테스트 영역에서 helper 사용 자체를 검증하는 테스트**가 폐기.

**PM 판정 (§6.5)**: ConfirmTurn 시점 토스트 **단기 보존**. 단 카피는 UR-21 패턴 (룰 ID 명시)으로 통일. 본 sprint 종료 시점에 atomic dragEndReducer 가 INV-G2 자체를 보장하면 이 토스트도 폐기 (Phase E 마일스톤).

---

### 2.6 모순 #6 — Self-play harness 시나리오 카운트

| 출처 | 카운트 |
|------|------|
| 60 UI 기능 설계 §7.2 | Cat-A 12 + Cat-B 4 + Cat-C 3 + Cat-D 1 + Cat-E 5 = **25** |
| 88 테스트 전략 §5.3 | S-Normal 6 + S-Incident 6 + S-Reject 8 + S-State 5 + S-Edge 3 = **28** |

**충돌 평가**: 60은 카테고리 5개 25 시나리오, 88은 카테고리 5개 28 시나리오. **88 이 더 풍부** (V-* 거부 시나리오 8개 추가).

**PM 판정 (§6.6)**: 88 의 **28 시나리오** 채택. 60 §7.2 다음 갱신 시 88 정렬 (pm 책임).

---

### 2.7 모순 #7 — F-NN P0 카운트 (12 vs 11)

| 출처 | P0 카운트 |
|------|----------|
| 60 §1.1 인덱스 | "P0 = **11개**" (헤더) |
| 60 §3.1 + Phase B 종합 | "**카운트**: P0 = **12개** (F-01, 02, 03, 04, 05, 06, 09, 11, 13, 15, 17, 21)" |

**충돌 평가**: pm 본인 작성 60 내부 자기모순. 인덱스 헤더 11 vs §3.1 12. F-21 호환 드롭존이 P0 카탈로그에 누락된 듯.

**PM 판정 (§6.7)**: **12개로 확정** (§3.1 정확). 인덱스 헤더 다음 PR 에 정정.

---

### 2.8 모순 #8 — Test 보존 71건 vs 50건 (88 §1.3 합계 vs 흡수표)

| 출처 | 보존 카운트 |
|------|-----------|
| 88 §0 Executive Summary | "보존 71건 (8%)" |
| 88 §1.3 합계 표 | "보존 ~365 (계산 시 28+74+58+1+32+50+122 = 365)" — 단 122는 서버 testify로 영역 외 |
| 88 Appendix B | 보존 71건 매핑 — 흡수 위치 합계 약 50건 |

**충돌 평가**: 본문 §1.3 ("365") 와 §0/§7 ("71") 가 다른 카운트. §1.3 합계가 "잠재 보존" 까지 포함했고, §0/§7 이 "실제 흡수 후 살아남는 의도" 만 셈한 듯. 명확성 부족.

**PM 판정 (§6.8)**: §0/§7 의 **71건** 채택. 88 다음 PR 에 §1.3 합계 표 명료화 (qa 책임).

---

### 2.9 모순 종합

| 모순 # | 영역 | 심각도 | PM 판정 결론 |
|--------|------|--------|-------------|
| #1 | A-N 카운트 분모 | Low | 21로 통일 |
| #2 | V-17 구현 위치 | **High** | service.convertToSetOnTable 단일 |
| #3 | INC-T11-DUP 본질 | **High** | 88 진단 채택 (atomic transfer) |
| #4 | 폐기 라인 단위 | Low | 라인/케이스 명시 분리 |
| #5 | band-aid 경계선 | Mid | 단기 보존 + Phase E 폐기 |
| #6 | harness 시나리오 | Low | 28 채택 |
| #7 | F-NN P0 12 vs 11 | Low | 12 확정 |
| #8 | 보존 71 vs 365 | Low | 71 확정 |

**전체 평가**: 8 산출물 간 **High 모순 = 2건** (V-17 / INC-T11-DUP), 나머지 6건은 명료성 갱신. 8명 병렬 작성 산출물의 일관성 측면에서 **양호한 수준**.

---

## 3. 모듈화 7원칙 충족 여부 (8 산출물 self-check + PM 교차검증)

각 산출물이 자기 self-check 결과를 보고했고, 본 PM 이 교차검증.

| 산출물 | self-check | PM 교차검증 결과 |
|-------|----------|----------------|
| 55 SSOT | (해당 없음 — 명세 정의 문서) | ✅ ID 매핑 가능 / 룰 카테고리 분리 / 변경 이력 추적 |
| 56 매트릭스 | (해당 없음 — 셀 enumeration) | ✅ 셀 매핑 1:1 / 행동·상태 차원 분리 |
| 56b 상태 머신 | (해당 없음 — 상태 enumeration) | ✅ invariant 분리 / dnd-kit 동시성 모델 명시 |
| 60 UI 기능 설계 | §8 self-check 7/7 ✅ | ✅ 다만 §1.1 P0 인덱스 11 vs §3.1 12 자기 모순 (모순 #7) — Low 이슈 |
| 26 architect | §5.1 self-check 7/7 ✅ | ✅ 다만 §3.3 V-17 위치 모호 (모순 #2) — High 이슈 |
| 26b frontend | §6 self-check 7원칙 평가 (3 미준수 / 2 부분 / 2 충족) | ⚠ **현행 코드 평가**이며 신규 모듈 자체는 충족. 명확성 OK |
| 87 server audit | §10 self-check (3 미충족 / 2 부분 / 2 충족) | ⚠ **현 서버 평가**이며 본 산출물 자체는 충족. 명확성 OK |
| 88 test rebuild | §8 self-check 7/7 ✅ | ✅ 다만 §1.3 합계 모호 (모순 #8) — Low |
| 57 visual lang | (해당 명시 없음) | ✅ 토큰 SSOT / 드롭존 3상태 / band-aid 차단 정책 |
| 89 security | §6 self-check 7/7 ✅ | ✅ 다만 SEC-DEBT-001 ↔ V-17 우선순위 매핑 보강 권고 |

**PM 종합 판정**: 8 산출물 모두 모듈화 7원칙 명시적 self-check 또는 묵시적 충족. 본 sprint 의 **건설 가능성** (constructability) 확보됨. 모순 #2/#3 만 Phase D 착수 전 §6 결단으로 해소.

---

## 4. 사용자 사고 3건 ↔ 8 산출물 매핑

본 sprint 의 출발점인 사용자 실측 사고 3건이 8 산출물에서 어떻게 명세화되고 회귀 방지가 보장되는지.

### 4.1 INC-T11-DUP (2026-04-24 21:50, docs/04-testing/84)

| 산출물 | 매핑 |
|-------|------|
| 55 §5 | 위반 룰 = D-02 (11B 가 12s/12s 두 그룹 동시 존재) |
| 56 §4 | 셀 = A6 (pending → server merge), POST_MELD/COMPAT |
| 56b §5 | 위반 invariant = INV-G2, 발생 상태 = S5 → S2/S3 → S5 transition |
| 60 §5 | F-05 (pending → 다른 곳 이동) atomic transfer 보장 — F-NN 직접 매핑 |
| 26 ADR §3.5 | dragEndReducer 의존성 주입 → atomic 보장 + jest property test |
| 26b §3.1 | `dragEndReducer.case(A6)` 분기에서 `updatedSourceTiles.splice` 이미 수정됨 (확인됨) |
| 87 (해당 없음 — 클라 단독 사고) | — |
| 88 §4.1 | 단위 4건 + property INV-G2 + e2e 1건 = 6 layer |
| 89 §2 | "서버 진실성 영향 없음" — UX 사고 분류 |
| 57 UR-34 | 부패 토스트 금지 정책 |

**해결 책임자**: frontend-dev (PR #76 INV-G1/G2 atomic 부분 수정 완료, Phase D 에서 dragEndReducer 통합)

---

### 4.2 INC-T11-IDDUP (2026-04-25 10:25, docs/04-testing/86 §3.1)

| 산출물 | 매핑 |
|-------|------|
| 55 §5 | 위반 룰 = D-01 (그룹 ID 중복) → V-17 위반 (서버 ID 미할당 합병) |
| 56 §4 | 셀 = A9 (server → server merge), POST_MELD/COMPAT |
| 56b §5 | 위반 invariant = INV-G1, 발생 상태 = S5 자기-루프 |
| 60 §5 | F-06 (server 재배치) + F-04 ID 보존 정책 — F-NN 직접 매핑 |
| 26 ADR §3.3 | pending vs server 그룹 ID 분리 ADR — pending 만 FE 발급, server UUID 만 사용 |
| 26b §5.3 | `pendingDraft: PendingDraftState` atomic 통합 |
| 87 §2 | **`processAIPlace` L:1061 ID 미할당** — 서버측 직접 원인. V-17 미구현 |
| 88 §4.2 | 서버 단위 3건 (`processAIPlace` ID 부여 검증) + 클라 단위 3건 + property + e2e |
| 89 §3 | **AUDIT-02 SEC-DEBT-001 P1** (클라 ID 신뢰 일반화) — 보안 부채로 격상 |
| 57 UR-20 | pending 그룹 시각 표현 (프리픽스 검증) |

**해결 책임자**: **go-dev** (서버 V-17 구현) + **frontend-dev** (pendingDraft 통합) + **security** (SEC-DEBT-001 리뷰)

---

### 4.3 INC-T11-FP-B10 (2026-04-25 11:30 직전, 스탠드업 §0)

| 산출물 | 매핑 |
|-------|------|
| 55 §5 | 위반 룰 = UR-35 (source guard false positive) — 정상 V-13c 차단 |
| 56 §4 | 셀 = A3 (랙 → server 그룹 extend), POST_MELD/COMPAT |
| 56b §5 | 위반 = "명세에 없는 사유로 transition 차단" — UR-34/35/36 |
| 60 §5 | F-21 (호환 드롭존) + F-09 (ConfirmTurn) "V-* 클라 미러만 허용" |
| 26 ADR §3.4 | turnStateStore 가 S0~S10 SSOT, 명세 외 가드 신설 금지 |
| 26b §2.7 | band-aid 잔존 — `detectDuplicateTileCodes` 토스트 956–964 폐기 |
| 87 (해당 없음 — 클라 단독 band-aid) | — |
| 88 §4.3 | 단위 4건 + band-aid-detection property + e2e |
| 89 §2.4 | "M4 → M1 변환 불가능" — 보안 침해 아님 |
| 57 UR-34/35/36 | band-aid 차단 정책 시각 언어 SSOT |

**해결 책임자**: **frontend-dev** (band-aid 폐기) + **qa** (G2 게이트로 회귀 차단)

---

### 4.4 사고 매핑 종합

| 사고 | 책임자 | 매핑 산출물 수 | 본 sprint 해결 보장 |
|------|-------|-------------|------------------|
| INC-T11-DUP | frontend-dev | 8 산출물 (87 제외) | ✅ Phase D F-05 구현 시 atomic 보장 + 88 §4.1 6 layer |
| INC-T11-IDDUP | go-dev + frontend-dev + security | 9 산출물 (87 핵심) | ✅ Phase D V-17 + pendingDraft + SEC-DEBT-001 |
| INC-T11-FP-B10 | frontend-dev + qa | 8 산출물 (87 제외) | ✅ Phase D 폐기 + G2 게이트 |

**결론**: 사용자 사고 3건이 모두 P0 F-NN 안에 들어왔고, 4명 (FE/BE/QA/SEC) 의 독립 책임으로 분산. 본 sprint 가 **사고 본질 해결을 구조적으로 보장**.

---

## 5. band-aid 잔존 위험 영역

frontend-dev 26b §7 의 폐기 107라인 외에 본 PM 이 식별한 추가 잔존 가능성.

### 5.1 식별된 잔존 영역

| ID | 영역 | 위험 | 처리 |
|----|------|------|------|
| **R-RESID-01** | `handleConfirm` 내 detectDuplicateTileCodes 토스트 (1342-1395) | UR-34 경계선 — "사용자가 직접 클릭" 으로 정당화. 그러나 atomic dragEndReducer 가 INV-G2 보장하면 잉여 | Phase E (sprint 종료 시) 폐기 |
| **R-RESID-02** | `isHandlingDragEndRef` / `lastDragEndTimestampRef` (737-754) | dnd-kit re-fire 가드 — 56b §4.1 "최후 방어선" | 단기 보존, Phase E 에서 dnd-kit Sensors 설정 후 제거 |
| **R-RESID-03** | `useEffect` invariant validator (gameStore subscribe) | INV-G1/G2 위반 시 console.error — UR-34 silent restore 정책에 부합하나 prod Sentry 누락 (SEC-DEBT-006) | Phase D 끝 또는 Sprint 8 |
| **R-RESID-04** | `tableGroup.type` 힌트 강등 로직 (D-10) | mergeCompatibility unknown 강등은 명세 (D-10) 이지 band-aid 아님 | **보존** (분류 정정) |
| **R-RESID-05** | `effectiveHasInitialMeld` 7지점 분산 | W2-A 미해결 — 룰 1개 변경 시 7 파일 — 모듈화 §6 위반 | **Phase D F-04/F-06 통합 작업으로 해소** |
| **R-RESID-06** | server 측 `tileScoreFromCode` 중복 함수 (handler) | engine.tile.go 와 중복 — DRY 위반, band-aid 아니나 잔존 | Phase D 수정 (go-dev) |

### 5.2 PM 정책

본 sprint 의 R-RESID-01/02/03/05 는 **Phase D 구현 후 self-play harness 28 GREEN 상태에서 재평가**. RESID-01 토스트 한 줄도 하위 sprint(E) 에 명시 폐기. R-RESID-04 는 "band-aid 가 아니라 명세" 로 재분류 (frontend-dev 26b 정정 권고).

### 5.3 재발 모니터링 자동화

PR 머지 게이트 G2 (band-aid 0 hit) 가 **CI 자동 grep** 으로 회귀 차단. 본 sprint 부터 강제 (88 §6.2 + 본 종합 §3 G2 게이트 정책).

---

## 6. PM 결단 (모순 해결 + Phase D 인수)

본 §6 은 §2 의 8 모순에 대한 **본 PM 의 최종 결단** 이며 후속 PR 모두 이 결단을 따라야 한다.

### 6.1 결단 #1 — A-N 카운트 분모 통일

- **분모**: 21 (A1~A21)
- **하위 분류**: handleDragEnd 내부 직접 매핑 13 (A1~A12, A17), 별도 핸들러 6 (A13~A16, A18~A21), WS 수신 4 (A18~A21 중 일부)
- **반영**: 26b §1.3 매핑률 표 next PR 정정 (frontend-dev)

### 6.2 결단 #2 — V-17 구현 위치 SSOT

- **단일 진실 위치**: `service.convertToSetOnTable` (game_service.go L:916-931)
- **책임**: Human/AI 양쪽 경로 모두 service 가 빈 ID 또는 `pending-` prefix 를 받아 `uuid.New().String()` 발급
- **handler 책임**: ID 보존 (Human 경로는 `wsGroupsToService` 가 그대로 통과 OK), AI 경로는 `processAIPlace:1061` 빈 ID 통과 OK (service 가 처리)
- **검증**: 88 §2.3 V-17 5 케이스 + 89 SEC-DEBT-001 단위 테스트
- **반영**: Phase D go-dev PR (87 §2.6 수정 제안 적용), architect ADR §3.3 보강 (next PR)

### 6.3 결단 #3 — INC-T11-DUP 본질 진단

- **본질 원인**: dragEndReducer A6 셀 atomic transfer 누락 (출발 그룹 tile 미제거)
- **호환성 미검사**: 부차 효과 (RDX-01 의 A5 pending→pending 호환성 누락은 별도 이슈)
- **반영**:
  - 55 SSOT §5 표 책임 컬럼 갱신 (game-analyst, next PR)
  - 88 §4.1 fixture 정확 reproduction 강제 (qa 책임)
  - frontend-dev 26b §4.1 A6 분기는 이미 수정됨 — 88 단위 테스트 4건이 회귀 방지

### 6.4 결단 #4 — 폐기 단위 명시 의무화

- **규칙**: 모든 산출물에서 "폐기 N" 표기 시 **단위 명시** (라인 / 케이스 / 파일 / 분기)
- **반영**: 본 종합 §1 일람표 + 향후 PR 머지 게이트 G5 self-check 항목에 추가

### 6.5 결단 #5 — band-aid 토스트 경계선

- **정책 (단기, 본 sprint)**:
  - `handleConfirm` 시점 토스트 **보존** — 사용자 명시 클릭 이후
  - `handleDragEnd` 시점 detectDuplicateTileCodes 토스트 **폐기** (956-964, 1053-1061)
  - 카피 통일: `[V-XX]` / `[INV-GX]` 룰 ID 명시
- **정책 (Phase E, sprint 종료 시 재평가)**:
  - dragEndReducer atomic 보장 GREEN 확인 후 ConfirmTurn 시점 토스트도 폐기

### 6.6 결단 #6 — Self-play harness 28 시나리오

- **확정**: 88 §5.3 의 **28 시나리오** 채택
- **반영**: 60 §7.2 다음 갱신 시 88 정렬 (pm 책임)
- **G4 게이트**: 28/28 GREEN 만 PR 머지 허용

### 6.7 결단 #7 — F-NN P0 = 12

- **확정**: F-01, F-02, F-03, F-04, F-05, F-06, F-09, F-11, F-13, F-15, F-17, F-21 = 12개
- **반영**: 60 §1.1 인덱스 헤더 다음 PR 에 정정 (pm)

### 6.8 결단 #8 — 테스트 보존 71건 (8%)

- **확정**: 88 §0/§7 의 71건 (8%) 채택
- **§1.3 합계 표 명료화**: "잠재 보존" vs "흡수 후 살아남는 의도" 구분 (qa, next PR)

### 6.9 결단 #9 — Phase D 인수 선언

본 §6.1~§6.8 결단을 인수했음을 선언한다. 본 종합 보고서 발행 즉시 다음을 발효:

1. **Phase D 시작** (2026-04-25 본 보고서 발행 시점)
2. **Phase D 마감**: 2026-05-02 (T+7 일)
3. **다음 산출물**:
   - `work_logs/plans/2026-04-25-phase-c-implementation-dispatch.md` (구현 dispatch 명령서)
   - `docs/03-development/20-pr-merge-gate-policy.md` (PR 머지 게이트 운영 정책)
4. **dispatch 대상**: frontend-dev, go-dev, designer, qa (4명 병렬)
5. **PR 머지 게이트 G1~G5 즉시 강제**

---

## 7. PM 자체 평가

본 종합 보고서 자체의 모듈화 7원칙 self-check.

| 원칙 | 본 문서 적용 |
|------|------------|
| **SRP** | 본 문서 = "Phase B 산출물 종합 보고서" 단일 책임. 구현 dispatch 는 별도 산출물 |
| **순수 함수 우선** | 입력 (8 산출물) → 출력 (모순 8 + 결단 9) 의 결정론적 매핑 |
| **의존성 주입** | 8 산출물 모두 명시 인용. SSOT 변경 시 본 문서 §2 모순 표만 갱신 |
| **계층 분리** | §1 수치 / §2 모순 / §3 7원칙 / §4 사고 매핑 / §5 잔존 / §6 결단 — 6 계층 분리 |
| **테스트 가능성** | §6 결단 9건 모두 다음 PR 에서 검증 가능 (책임자/마감 명시) |
| **수정 용이성** | 산출물 1개 변경 시 §1 일람표 1행 + §2 모순 표 0~1행 갱신 |
| **band-aid 금지** | §6 결단이 모두 SSOT 룰 ID 매핑. 우회 결정 0건 |

**self-check**: 7/7 ✅

---

## 8. 변경 이력

- **2026-04-25 v1.0**: 본 종합 보고서 발행. 사용자 GO 사인 수신 후 Phase C 인수. 8 산출물 정독 → 모순 8건 식별 → 모듈화 7원칙 교차검증 → 사용자 사고 3건 매핑 → band-aid 잔존 6건 식별 → PM 결단 9건. 본 보고서 발행 즉시 Phase D 시작 (구현 dispatch).

---

**서명**: pm (애벌레 GO 사인 인수, 2026-04-25)
**다음 액션**: 즉시 `work_logs/plans/2026-04-25-phase-c-implementation-dispatch.md` + `docs/03-development/20-pr-merge-gate-policy.md` 발행 → 4명 병렬 dispatch
