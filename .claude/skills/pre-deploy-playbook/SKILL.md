---
name: pre-deploy-playbook
description: 배포 전 Claude가 게임룰 19 매트릭스 기반 사용자 시나리오 세트 + 1게임 완주 메타를 실행해 회귀를 탐지한다. 사용자가 발견하기 전에 spec 이 먼저 발견한다.
---

# Pre-deploy Playbook — Rule-based Scenario Gate

> "게임룰에 의해 사용자가 UI에서 게임 가능한지 테스트는 안해보는거야?"
> — 사용자 (2026-04-24)

## Purpose

PR 머지 전 + Pod 재배포 후 **게임룰 19 × UI 행위 매트릭스** 를 전수 실행하여 회귀를 탐지한다. 개별 component smoke 가 아니라 **룰 기반 시나리오 세트** + **1게임 완주 메타**를 요구한다.

**사고 배경**:
- 2026-04-23 PR #70 머지 후 1일 만에 동일 계열 UI 버그 재현 (BUG-UI-GHOST)
- architect 재재조사 결론: PR #70 3개 수정 모두 효과 부족
- 사용자가 세 번째 같은 증상에 부딪힌 후 "테스트 시나리오 제대로 만들어 테스트해보면 안될까" 직접 지적
- 기존 390 spec 이 잡지 못한 이유: fixture 상태 1~2회 drop 만 검증, **연속 드래그 + 확정 후 extend + N회 반복** 패턴 없음

**SSOT**:
- `docs/04-testing/81-e2e-rule-scenario-matrix.md` — 룰 19 × UI 행위 매트릭스
- `docs/04-testing/82-missed-regression-retroactive-map.md` — 과거 놓친 증상 역매핑
- `docs/02-design/31-game-rule-traceability.md` — 룰 추적성 (매트릭스 연동)

**적용 대상**:
- PR `ready for review` 상태 전환 직전 (merge gate)
- devops 재배포 직후 (BUILD_ID 변경 확인 후)
- 사용자에게 "테스트해보세요" 전달 **직전**

---

## Trigger (자동 발동 조건)

- Pod rollout restart 완료 알림 수신
- PR `ready for review` 전환 직전
- 사용자가 "확인해줘" / "테스트해봐" / "플레이해봐" 요청 직전

**수동**: `pre-deploy-playbook 돌려`

---

## Phase 1: Pre-flight

1. **환경 확인**
   - Pod BUILD_ID 확인 (`kubectl exec ... cat /app/.next/BUILD_ID`)
   - 기대 커밋 해시와 일치 여부
   - `src/frontend/e2e/auth.json` 유효성

2. **대상 endpoint**
   - 로컬 K8s: `http://localhost:30000`
   - production smoke: 별도 smoke URL

3. **네트워크 사전 점검**
   - `curl -I <endpoint>` 200/307 확인
   - game-server, ai-adapter Pod 정상 여부

4. **Ollama warmup** (1게임 완주 메타 실행 전 필수)
   ```bash
   kubectl exec -n rummikub deploy/ollama -- \
     curl -s -X POST http://localhost:11434/api/generate \
     -d '{"model":"qwen2.5:3b","prompt":"ready","stream":false}' > /dev/null
   ```

---

## Phase 2: 룰 기반 시나리오 세트 실행

### 2.1 신규 5 spec (본 SKILL 의 핵심)

`docs/04-testing/81-e2e-rule-scenario-matrix.md §2.1` 의 5 spec 을 순차 실행.

```bash
cd src/frontend
npx playwright test --workers=1 --reporter=list \
  e2e/rule-initial-meld-30pt.spec.ts \
  e2e/rule-extend-after-confirm.spec.ts \
  e2e/rule-ghost-box-absence.spec.ts \
  e2e/rule-turn-boundary-invariants.spec.ts
```

**기대 결과** (본 PR 현재 시점):

| spec | TC 수 | PASS 기대 | RED 기대 (버그 재현) | SKIP |
|------|------|---------|-------------------|-----|
| rule-initial-meld-30pt | 4 | SC1, SC3 | — | SC2, SC4 (fixme) |
| rule-extend-after-confirm | 4 | SC1, SC3 | **SC4** (BUG-UI-EXT) | SC2 (fixme) |
| rule-ghost-box-absence | 3 | SC2 | **SC1, SC3** (BUG-UI-GHOST) | — |
| rule-turn-boundary-invariants | 3 | SC1, SC2, SC3 | — | — |

**BUG-UI-EXT + BUG-UI-GHOST RED 확인이 PASS 조건이다** (버그가 고쳐지기 전까지).

### 2.2 1게임 완주 메타

```bash
E2E_OLLAMA_ENABLED=1 npx playwright test e2e/rule-one-game-complete.spec.ts --workers=1 --reporter=list
```

**목표**:
- Human × 1 + Ollama × 1, 2인전
- 20턴 이상 진행 또는 승리/교착으로 정상 종료
- 매 턴 invariants 4종 불변:
  - (I1) 확정 턴 전환 후 pendingGroupIds=0
  - (I2) currentTableGroups 단조성
  - (I3) 복제 tile 0 (V-06 violation 부재)
  - (I4) hasInitialMeld true → false 되돌아가지 않음

**소요 시간**: 5~15분 (Ollama 응답 속도 + 턴 수)

### 2.3 기존 390 spec 회귀 확인

```bash
npx playwright test --workers=1 --reporter=line \
  --grep-invert "rule-(initial|extend|ghost|one-game|turn-boundary)"
```

**허용 Flaky**: 최대 10 건 (기존 기준). 11 건 이상 → 환경 불안정 재조사.

---

## Phase 3: 단언 체크리스트

### 3.1 드래그·드롭 정합성

- [ ] 모든 drop 이 보드에 반영 (silent revert 없음)
- [ ] 같은 타일 code 가 여러 블록에 동시 표시되지 않음 (복제 0)
- [ ] 같은 그룹 id 가 중복 출현하지 않음 (stale snapshot 0)
- [ ] 내 랙 타일 수 = 실제 rack 표시 수 (drift 0)

### 3.2 턴 경계

- [ ] AI 턴 중 확정/드로우 버튼 disabled (TBI-SC3)
- [ ] 턴 종료 시 pendingGroupIds=0, pendingTableGroups=null (TBI-SC1)
- [ ] hasInitialMeld true → false regression 없음 (TBI-SC2)

### 3.3 룰 검증

- [ ] V-04 30점 Happy PASS, 부족 점수 거부
- [ ] V-06 복제 tile 0 (모든 spec)
- [ ] V-08 자기 턴 확인 (TBI-SC3)
- [ ] hasInitialMeld=true extend append 성공 (EXT-SC1/SC3)
- [ ] hasInitialMeld=true 호환 불가 drop 시 복제 0 (EXT-SC4, GHOST-SC1)

### 3.4 1게임 완주 (Phase 2.2 결과)

- [ ] 20턴 이상 또는 정상 종료
- [ ] 매 턴 invariants 4종 PASS
- [ ] 게임 종료 오버레이 정상 표시

---

## Phase 4: 실패 대응

### 4.1 실패 분류

- **A. 환경 문제** — Pod 비정상, auth 만료 등. devops 알림 후 재시도.
- **B. 신규 spec RED** — BUG-UI-EXT, BUG-UI-GHOST 해결 전까지 의도된 RED. **배포 허용 / PR 머지 게이트 NO-GO**. 이 두 RED 가 GREEN 이 되면 버그 해소 신호.
- **C. 기존 390 spec 회귀** — 머지 차단. immediate rollback 검토.
- **D. 1게임 완주 invariant 위반** — 누적 state drift. architect + frontend-dev 페어 소환.

### 4.2 실패 시 조치

1. **배포 게이트 차단**: 사용자에게 "확인해주세요" 전달 **금지**
2. **아티팩트 수집**:
   - `src/frontend/test-results/` 스크린샷 + trace.zip
   - Pod 로그 (`kubectl logs ... --tail=200`)
3. **incident log**: `work_logs/incidents/YYYYMMDD-playbook.md` 생성
   - 실패 분류 (A/B/C/D)
   - RED TC 목록 + 스크린샷 경로
   - 다음 조치 담당 에이전트
4. **매트릭스 갱신**: `docs/04-testing/81-*.md` 에 증상 셀 추가 / 갱신

### 4.3 금지 사항

- **spec 생략 후 사용자 전달 금지** (시간 압박 제외)
- **RED 를 flaky 로 치부 금지** — architect 재재조사 §6.4 교훈 (PR #70)
- **단언 부분 통과로 GO 판정 금지**

---

## Phase 5: 리포트

### 5.1 성공 시

```
## Pre-deploy Playbook — GO

- Endpoint: <url> / BUILD_ID: <id>
- Phase 2.1 신규 spec: PASS / RED (의도된 BUG-UI-*)
- Phase 2.2 1게임 완주: N턴 완주 / invariants PASS
- Phase 2.3 기존 390: PASS (flaky <10)
- 소요 시간: <mm:ss>
- 판정: GO — 사용자 전달 가능
```

### 5.2 실패 시

```
## Pre-deploy Playbook — NO-GO

- Endpoint: <url> / BUILD_ID: <id>
- 실패 분류: C (기존 390 회귀)
- 실패 TC: rearrangement.spec.ts TC-RR-02 (hasInitialMeld=false 서버 그룹 드롭)
- 증거: test-results/.../trace.zip, 스크린샷
- 다음 조치: architect 재조사 소환 + rollback 검토
- 판정: NO-GO — 사용자 전달 차단
```

---

## Phase 6: 매트릭스 편입

Playbook 실행 중 새로 발견된 증상은 **즉시 매트릭스에 추가**:

1. `docs/04-testing/81-e2e-rule-scenario-matrix.md §2` 의 적절한 룰 × 행위 셀에 신규 spec 행 추가
2. `docs/04-testing/82-missed-regression-retroactive-map.md` 에 사후 매핑 근거 기록
3. spec 을 `src/frontend/e2e/rule-*.spec.ts` 로 작성 (RED 확인 후 PR 생성)
4. architect + frontend-dev 페어 킥오프 (UI 수정 의무)

---

## 왜 ui-regression + 기존 playbook 으로 부족했는가

| 스킬 | 스코프 | 미커버 |
|------|-------|-------|
| ui-regression | 개별 component / 개별 시나리오 | 룰 전수 + 연속 플레이 |
| 기존 playbook (v1.1) | 플레이 시퀀스 최소 요건 10턴 | 룰 19 × 행위 매트릭스, invariants 단언 |
| **본 SKILL (v2.0)** | 룰 19 매트릭스 + 1게임 완주 + invariants 4종 | — |

---

## 역할 분담

| 담당 | 역할 |
|------|------|
| Claude 메인 세션 | devops 재배포 알림 수신 시 본 SKILL 자동 발동 판단 |
| frontend-dev | 신규 시나리오 spec 작성 협조, RED → GREEN 수정 |
| qa | 매트릭스 유지 (81번), retroactive map (82번), 본 SKILL 유지 |
| architect | RED 증상 RCA + 수정 계획서 작성, UI 페어 리드 |
| devops | Pod 상태 + 로그 수집, Ollama warmup 자동화 |

---

## 변경 이력

- **2026-04-21 v1.0**: 최초 신설 (ui-regression SKILL 에서 분리)
- **2026-04-21 v1.1**: 기본 AI 모델 GPT → LLaMA (Ollama), cold start 50s 대응
- **2026-04-24 v2.0**: **룰 19 매트릭스 기반 재작성**. 신규 5 spec + 1게임 완주 메타 + invariants 4종. 사용자 직접 지시 "테스트 시나리오 제대로 만들어 테스트해보면 안될까" 반영. Phase 구조 재편 (Pre-flight / 룰 시나리오 / 단언 / 실패 대응 / 리포트 / 매트릭스 편입).
