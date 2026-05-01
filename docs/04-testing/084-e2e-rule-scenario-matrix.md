# 게임룰 19 × UI 행위 E2E 시나리오 매트릭스

**문서 번호**: 81
**작성**: qa (Opus 4.7 xhigh)
**작성일**: 2026-04-24
**대상 PR**: Phase2-qa 게임룰 19 기반 E2E 시나리오 세트
**상위 참조**:
- `docs/02-design/31-game-rule-traceability.md` — 룰 19 추적성 매트릭스 (V-01~V-19)
- `docs/02-design/06-game-rules.md` — 규칙 정의서 SSOT
- `work_logs/plans/tmp-analysis/bug-ui-ext-ghost-rereview.md` — architect 재재조사 (증상 + 원인)
- `docs/04-testing/73-finding-01-root-cause-analysis.md` — FINDING-01 경로
- `.claude/skills/pre-deploy-playbook/SKILL.md` — 기존 playbook

---

## 1. 왜 이 매트릭스가 필요한가

### 1.1 사용자 직접 지시 (2026-04-24)

> "게임룰에 의해 사용자가 UI에서 게임 가능한지 테스트는 안해보는거야? 테스트 시나리오 제대로 만들어 테스트해보면 안될까?"

사용자가 **세 번째** 같은 UI 버그에 부딪혀 직접 지적했다. PR #70 (BUG-UI-009 복제 렌더) 머지 1일 만에 동일 계열 증상이 재발했고, 사용자 스크린샷(2026-04-23_221543/221554/221603) 으로 드러났다. architect 재재조사(`bug-ui-ext-ghost-rereview.md`) 결론: PR #70 의 세 수정(PlayerRack key idx + isHandlingDragEndRef guard + onDragCancel) 전부 **효과 부족**.

### 1.2 현존 E2E 의 구조적 한계

390 spec 중 대부분은 다음 패턴이다.

```
// 1) createRoomAndStart 로 실 게임 시작
// 2) window.__gameStore.setState 로 결정론적 상태 주입
// 3) dndDrag 1~2회 → 어서션
```

이 패턴이 잡지 못하는 증상:
1. **연속 드래그 중 stale useMemo 누적** (BUG-UI-GHOST) — 1~2회 드래그는 stale 재현 안됨. 3~6회 반복 필요.
2. **한 게임 전체 흐름 중 특정 턴에서만 발동** — 턴 #1~#29 누적 state 가 원인 일 때 fixture 상태 주입은 재현 불가.
3. **hasInitialMeld=true 확정 후 extend 반복** (BUG-UI-EXT) — 확정 직후 같은 턴에 extend 를 여러 번 시도하는 상황 미커버.
4. **턴 경계 invariants** (V-08) — 턴 종료 시 pending 이 0 으로 리셋되고 AI 턴 중에는 플레이어 UI 가 disabled 되어야 한다. 현재 1개의 간접 커버만.

### 1.3 재발 방지의 구조적 접근

각 룰 V-01~V-19 × UI 행위(Happy / 실패 / 엣지) 를 **전수 매트릭스**로 만들고, 각 셀당 최소 1 spec. 매트릭스는 **문서화**이 아니라 **spec 명부**다. 빈 칸이 보이면 spec 을 만든다. 이 매트릭스는 `game-rule-traceability.md` (설계 SSOT) 의 E2E 컬럼을 확장한 **QA 운영 SSOT** 다.

---

## 2. 룰 × 행위 매트릭스

각 셀 표기: `spec 파일명 :: 테스트 ID (상태)`
상태 범례: `PASS` / `RED` (의도된 실패, 버그 재현) / `SKIP` (미구현) / `—` (해당없음)

| 룰 | 규칙 요약 | Happy Path | 실패 / 서버 거부 | 엣지 — 조커 | 엣지 — 가장자리 | 엣지 — 복제/고스트 | 엣지 — 확정후 |
|----|----------|-----------|--------------|----------|-------------|---------------|------------|
| **V-01** | 유효한 그룹/런 | `game-rules.spec.ts` 기본 | `game-rules.spec.ts` negative | `hotfix-p0-i4-joker-recovery.spec.ts` | — | — | — |
| **V-02** | 세트 3장 이상 | `game-rules.spec.ts` | `game-rules.spec.ts 2장 거부` | — | — | — | — |
| **V-03** | 랙 1장 이상 추가 | `game-rules.spec.ts` 간접 | — SKIP | — | — | — | — |
| **V-04** | 최초 등록 30점 | **rule-initial-meld-30pt.spec.ts :: V04-SC1 Happy** | **V04-SC2 29점 거부** | V04-SC4 조커 포함 30점 | — | — | **V04-SC3 초기등록 전 extend 차단** |
| **V-05** | 최초 등록 랙 타일만 | `turn_service_test.go` Go | — E2E SKIP | — | — | — | — |
| **V-06** | 타일 보존 | 간접 | `conservation_test.go` 43개 Go | `hotfix-p0-i4` | — | **rule-ghost-box-absence.spec.ts :: GHOST-SC1 6회 drop 복제0** | — |
| **V-07** | 조커 교체 즉시 사용 | `hotfix-p0-i4-joker-recovery` | — | `hotfix-p0-i4` SC1~SC6 | — | — | — |
| **V-08** | 자기 턴 확인 | `game-flow.spec.ts` 간접 | **rule-turn-boundary-invariants.spec.ts :: TBI-SC3 AI 턴 confirm 버튼 disabled** | — | — | — | **TBI-SC1 턴 종료 시 pending=0** / **TBI-SC2 확정 후 hasInitialMeld 유지** |
| **V-09** | 턴 타임아웃 | `game-flow.spec.ts` 설정만 | — 전이 E2E 0건 | — | — | — | — |
| **V-10** | 드로우 파일 소진 | `game-lifecycle.spec.ts TC-DL-E01~E04` | TC-DL-E02 패스 전환 | — | — | — | — |
| **V-11** | 교착 | `game-lifecycle.spec.ts TC-LF-E07` | ALL_PASS 안내 | — | — | — | — |
| **V-12** | 승리 (랙 0) | `game-lifecycle.spec.ts TC-LF-E05/E09` + `rule-one-game-complete.spec.ts :: OGC-WIN` | — | — | — | — | **OGC 20~30턴 완주 내 승리** |
| **V-13a** | 재배치 권한 (hasInitialMeld) | `rearrangement.spec.ts TC-RR-02` (초기등록 전 차단) | — | — | — | — | — |
| **V-13b** | 재배치 유형 1: 분할 (split) | `rearrangement.spec.ts TC-RR-03` fixme | TC-RR-04 초기등록 전 차단 | — | — | — | — |
| **V-13c** | 재배치 유형 2: 합병 (merge) | `rearrangement.spec.ts TC-RR-01` fixme | TC-RR-02 초기등록 전 차단 | — | — | — | — |
| **V-13d** | 재배치 유형 3: 이동 | 간접 TC-RR-03 | — | — | — | — | — |
| **V-13e** | 재배치 유형 4: 조커 교체 | `hotfix-p0-i4-joker-recovery TC-I4-SC6` | — | SC7 fixme | — | — | — |
| **V-14** | 그룹 동색 중복 불가 | `game-rules.spec.ts` 그룹 negative | same-color reject | — | — | — | — |
| **V-15** | 런 숫자 연속 | `game-rules.spec.ts` 런 negative | 순환 거부 | — | — | — | — |
| **확정후 extend** (파생) | hasInitialMeld=true 후 append | — | — | JK 포함 런 extend | **rule-extend-after-confirm.spec.ts :: EXT-SC1 런 뒤 append** | EXT-SC4 호환불가 복제 0 | **EXT-SC2 가운데 append** |
| **FINDING-01 경계** | 초기등록 전 서버그룹 드롭 | — | `regression-pr41-i18-i19.spec.ts REG-PR41-I18-04/05` + `hotfix-p0-i2-run-append.spec.ts` | — | — | — | — |

### 2.1 신규 spec 5종 매핑

| 신규 spec | 대상 룰/버그 | 테스트 케이스 수 | 현재 상태 (작성 직후) |
|-----------|-------------|---------------|-------------------|
| `rule-initial-meld-30pt.spec.ts` | V-04 + V-13a | 4 (SC1~SC4) | RED 의도 없음, PASS 목표 |
| `rule-extend-after-confirm.spec.ts` | 확정후 extend + BUG-UI-EXT | 4 (SC1~SC4) | **SC4 RED 의도** (BUG-UI-EXT 재현) |
| `rule-ghost-box-absence.spec.ts` | V-06 고스트 렌더 + BUG-UI-GHOST | 3 (SC1~SC3) | **SC1 RED 의도** (BUG-UI-GHOST 재현) |
| `rule-one-game-complete.spec.ts` | 메타 완주 (V-10/V-12 포함) | 1 (OGC) | PASS 목표 (Ollama 실대전) |
| `rule-turn-boundary-invariants.spec.ts` | V-08 | 3 (TBI-SC1~SC3) | PASS 목표 |

**합계 15 TC**. 매트릭스의 "확정후 extend" 파생 행 + "고스트" 컬럼 + "AI 턴 disabled" 셀 신규 커버.

---

## 3. 각 셀 → Playwright spec 파일명 대응표

§2 의 셀 중 spec 파일명이 명시되지 않은 칸은 **SKIP / 향후 보강 백로그**다. 다음은 Sprint 7 후반 ~ Sprint 8 추가 후보 (우선순위 내림차순).

1. **V-03 랙 1장 이상 추가** — `rule-rack-source-requirement.spec.ts` (Sprint 7 Week 2)
2. **V-05 초기등록 랙 타일만** — 서버 거부를 E2E 에서 재현 (현재 Go 만)
3. **V-09 타임아웃 → 강제 드로우 전이** — TurnTimer 60초 강제 경과 후 서버 DRAW_TILE 메시지 수신 검증
4. **V-13b Happy (split)** — `rearrangement.spec.ts TC-RR-03` fixme 해제 (프론트 재배포 후)
5. **V-13c Happy (merge)** — 동 TC-RR-01 fixme 해제
6. **V-13d 전용 E2E** — 테이블 타일 → 다른 그룹 이동

---

## 4. "1게임 완주" 메타 시나리오 설계

### 4.1 목적

"연속 플레이 중에만 발동하는 버그" 탐지. 개별 행위 단위 spec 이 잡지 못하는 누적 상태 결함을 잡는다. pre-deploy-playbook 의 현재 규정(`Phase 2.3`: 턴 10회 이상) 은 최소 요건일 뿐 spec 으로 고정된 바가 없다.

### 4.2 고정 시나리오 (rule-one-game-complete)

대상: Human × 1 + Ollama (qwen2.5:3b) × 1, 2인전. 총 20~30턴.

| 턴 단계 | Human 행위 | 검증 |
|-------|----------|-----|
| T1 (Human) | 드로우 | 랙 +1, drawPile -1 |
| T2 (AI) | AI turn 진행 대기 | isMyTurn=false, confirm 버튼 disabled (V-08) |
| T3~T5 (Human) | 초기 등록 30점 달성 시도 | V-04 Happy, hasInitialMeld false → true 전이 |
| T5 말 | 확정 | pendingGroupIds 비워짐, hasInitialMeld=true |
| T7 (Human) | **확정 후 extend 시도 (append)** | 기존 서버 그룹에 타일 붙기 (BUG-UI-EXT 부재 확인) |
| T9 (Human) | **조커 포함 런 구성** | V-07 조커 slot 정합 |
| T11 (Human) | **재배치: 그룹 → 다른 그룹 이동** | V-13d UI 실행 |
| T13 (Human) | 호환 불가 타일을 같은 pending 위에 3회 drop | BUG-UI-GHOST 부재 (복제 그룹 0) |
| T15 (Human) | 드로우 (랙 타일 여유) | V-10 경로 |
| T17~T25 (Human) | 여러 번의 확정 + extend | 누적 state drift 없음 |
| T25~T30 | 승리 시도 or 드로우 파일 소진 or 교착 | V-12 또는 V-10 또는 V-11 하나로 정상 종료 |

### 4.3 검증 체크리스트 (턴마다)

- pendingGroupIds 크기 일관성 (확정 후 0)
- currentTableGroups.length 단조성 (같은 턴 내 drop 마다 정확히 +0 또는 +1)
- 랙 타일 수 = 실제 렌더 타일 수 (drift 없음)
- hasInitialMeld 가 true → false 로 되돌아가는 일 없음

---

## 5. 스킬 연동: pre-deploy-playbook 업그레이드 연동 지점

`.claude/skills/pre-deploy-playbook/SKILL.md` 을 본 매트릭스 기반으로 재작성(본 PR 커밋 #5).

주요 변경:
- Phase 2.3 "플레이 시퀀스 최소 요구치" → **rule-one-game-complete.spec.ts 실행**으로 대체
- Phase 2.4 "단언 체크리스트" → §4.3 검증 체크리스트로 교체
- Phase 5 "시나리오 카탈로그 편입" → **본 문서(81) 매트릭스 갱신 의무** 추가

---

## 6. 운영 규칙

1. **UI 버그 발견 시 항상 spec 먼저** (RED 확인) → 수정 → GREEN.
2. **spec 작성 없이 UI 수정 PR 금지** (Sprint 7 merge gate 정책 편입 권고).
3. 본 매트릭스는 `docs/02-design/31-game-rule-traceability.md` 의 E2E 컬럼과 **동기화**. 매트릭스 갱신 시 31번도 갱신.
4. 신규 버그 티켓에 `BUG-UI-*` 식별자 붙으면 §2.1 표에 신규 spec 행 추가.
5. Sprint 회고에서 본 매트릭스의 ❌/SKIP 셀 수가 감소하는지 추적 (지표).

---

## 7. 변경 이력

- **2026-04-24 v1.0** (본 문서): 최초 작성. V-01~V-19 전수 매트릭스 + 신규 spec 5종 정의. 근거: 사용자 직접 지시 "테스트 시나리오 제대로 만들어 테스트해보면 안될까".
