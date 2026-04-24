# 09. Pre-deploy Playbook — 배포 게이트 편입 정책

- **작성일**: 2026-04-24 (Day 3 AM 스탠드업 직후)
- **작성자**: qa (RummiArena)
- **상태**: 제안 → 사용자 승인 대기
- **상위 문서**: `.claude/skills/pre-deploy-playbook/SKILL.md` (v1.1, 2026-04-21)
- **연관 정책**: `docs/01-planning/17-merge-gate-policy.md` (pm 작성 예정, Day 3 Phase 1)

---

## 1. 배경 — 왜 이 게이트가 필요한가

### 1.1 사고 경위 (2026-04-23 Day 2)

Day 2 Week 1 P1 8.5 SP 를 한 세션에 5 PR(#53~#57) 머지하고 `day2-2026-04-23` 태그로 K8s 재배포. 05:39 UTC smoke PASS 판정. 같은 날 22:04~22:18 실사용자 플레이테스트 15분 구간에서 **BUG-UI-009~014 6건 + UX-004 오해 1건** 이 쏟아짐. 사용자 진술 "**고쳐진 게 하나도 없는 듯**". 원인은 `smoke PASS` 정의가 `/health 200 OK + helm list DEPLOYED` 수준에 머물렀기 때문.

### 1.2 직접 원인 — Playbook 스킬 미실행

`.claude/skills/pre-deploy-playbook/SKILL.md` 는 2026-04-21 v1.0 신설, 4월 21일 qa 에이전트에 의한 첫 실전 발동(170801 잡종 방지) 이후 **Day 2 배포 때 호출 안 됨**. 스킬은 존재했지만 강제할 게이트가 없었다. 자유 재량에 맡겨진 스킬은 시간 압박 앞에서 "이번만 생략" 된다.

### 1.3 Playbook 으로 잡힐 수 있었던 시나리오 3개 (사후 검증)

SKILL Phase 2.3 플레이 시퀀스(드래그 3회 + 확장 2회 + 조커 1회 + 확정 2회 + 드로우 2회 + 턴 10회) 를 실제로 돌렸다면 아래 버그가 배포 전에 드러남:

| # | 버그 | Playbook 어느 단언에서 잡혔을 것인가 |
|---|------|--------------------------------------|
| 1 | **BUG-UI-009** 동일 멜드 9개 복제 렌더링 (22:15:43) | Phase 2.4 "같은 타일 code 가 여러 블록에 동시 표시되지 않음" 단언. 드래그 5회 이내 재현 확률 높음 |
| 2 | **BUG-UI-011** AI 턴 중 플레이어 버튼 활성화 (22:12:37) | Phase 2.4 "라벨 정합성" 섹션 + "턴 진행 10회 이상" 단언. AI 턴 중 버튼 disabled 강제 점검 |
| 3 | **BUG-UI-013** 손패 카운트 16→19→18→21 요동 (22:07:33) | Phase 2.4 "내 랙 타일 수 = 실제 rack 표시 수 (drift 없음)" 단언. 드로우 2회만 돌아도 재현 |

즉 Playbook 은 **이미 설계 단계에서 이 세 버그를 잡도록 단언을 갖고 있었다**. 실행되지 않았기에 쓸모가 없었다.

---

## 2. 정책 — Playbook 스킬 실행 증거 필수 첨부

### 2.1 적용 범위

| 범위 | Playbook 실행 필요 | 근거 |
|------|-------------------|------|
| **release 라벨 PR** 머지 전 | **필수** | 사용자 노출 경로 변경은 실 플레이 완주 없이 머지 금지 |
| K8s `rollout restart` 직후 (dev / prod) | **필수** | Pod 배포 성공 ≠ 게임 완주 가능 |
| Hotfix PR (hotfix 라벨) | **필수** | 핫픽스일수록 회귀 확률 높음 |
| docs-only PR (docs 라벨 단독) | 면제 | 문서 수정은 runtime 무관 |
| test-only PR (`e2e/**` 또는 `*_test.go` 단독) | 면제 | 테스트 코드 수정은 Playbook 대상 아님 |
| infra-only PR (helm/ 또는 argocd/ 단독) | 조건부 | deployment template 변경 시 필수, configmap value-only 는 면제 |

### 2.2 실행 증거 형식 (PR 본문 필수 첨부)

다음 3개 아티팩트를 PR 본문 또는 코멘트로 첨부해야 머지 승인:

1. **로그 요약**
   ```
   ## Pre-deploy Playbook — PASS (or FAIL)

   - Endpoint: http://localhost:30000
   - BUILD_ID: <sha>
   - 소요 시간: mm:ss
   - 플레이 시퀀스: 드래그 N회 / 확정 M회 / 드로우 K회 / 턴 L회 완주
   - 단언: 모두 PASS
   - 판정: GO
   ```

2. **Playwright trace.zip 경로**
   - `src/frontend/test-results/pre-deploy-playbook/YYYY-MM-DD-HHMM/trace.zip`
   - 실패 시 trace.zip + screenshots 경로 필수

3. **BUILD_ID 검증 스크린샷** (선택, release PR 에 한함)
   - `kubectl exec -n rummikub deploy/frontend -- cat /app/.next/BUILD_ID` 출력
   - 기대 커밋 해시와 일치 여부 확인

### 2.3 NO-GO 처리

Phase 3.2 의 4개 실패 분류(A 환경 / B backend / C UI 버그 / D 단언 실패) 중 **어느 하나라도 발생** 시:

- **사용자 전달 금지**. "확인해주세요" 메시지 작성 금지
- 실패 분류별 조치:
  - A/B: devops 에이전트에 우선순위 P1 알림, 재시도 2회 후에도 실패면 배포 롤백
  - C: 즉시 frontend-dev 또는 go-dev 스폰, 실패 시나리오를 `docs/04-testing/65-*.md` 에 등재
  - D: regression. 원인 식별 전까지 태그 배포 중단

---

## 3. 자동화 훅 — `helm/deploy.sh` 연동

### 3.1 배포 스크립트 변경

`helm/deploy.sh` 에 `--with-playbook` 플래그 추가. `release` 또는 `hotfix` 태그 배포 시 자동 실행:

```bash
./helm/deploy.sh upgrade --with-playbook
```

동작:
1. Phase 1~5 기존 배포 수행
2. `verify_health` 통과 확인
3. `scripts/run-pre-deploy-playbook.sh` 호출 (신규)
4. Playbook PASS 시에만 완료 선언
5. Playbook FAIL 시 배포 태그는 유지하되 **"user-facing 전달 차단" 플래그** 를 K8s ConfigMap 에 표기 (`playbook.pass=false`)

### 3.2 호출 스크립트 (신규)

`scripts/run-pre-deploy-playbook.sh`:

```bash
#!/usr/bin/env bash
# .claude/skills/pre-deploy-playbook/SKILL.md v1.1 에 정의된 Phase 1~4 를 자동 실행.
# Ollama warmup 포함.

set -euo pipefail

# Phase 1: Pre-flight
kubectl exec -n rummikub deploy/frontend -- cat /app/.next/BUILD_ID
kubectl exec -n rummikub deploy/ollama -- \
  curl -s -X POST http://localhost:11434/api/generate \
  -d '{"model":"qwen2.5:3b","prompt":"ready","stream":false}' > /dev/null

# Phase 2: Playbook 실행
cd src/frontend
npx playwright test e2e/pre-deploy-playbook.spec.ts \
  --workers=1 --reporter=list \
  --output=test-results/pre-deploy-playbook/"$(date +%Y-%m-%d-%H%M)"
```

### 3.3 CI/CD (GitLab Runner) 연동

- `release` 라벨이 붙은 MR 은 파이프라인 stage 에 `pre-deploy-playbook` 잡 추가
- 잡 실패 시 머지 차단 (GitLab 의 "All threads must be resolved" 와 동급 게이트)
- 상세는 `docs/05-deployment/06-test-run-guide.md` 에 연동 (devops 작업)

---

## 4. 시행 일정

| 시점 | 액션 | 담당 |
|------|------|------|
| **2026-04-24 Day 3 오전** | 본 정책 문서 + `scripts/run-pre-deploy-playbook.sh` 커밋 | qa |
| **2026-04-24 Day 3 오후** | `helm/deploy.sh --with-playbook` 플래그 구현 | devops |
| **2026-04-24 Day 3 저녁** | Day 3 통합 태그 `day3-2026-04-24-ui-triage` 배포에 최초 적용 | devops + qa |
| **2026-04-25 Day 4** | GitLab Runner 파이프라인 stage 편입 | devops |
| **2026-04-26 Day 5** | PR Template 체크박스 강제화 완료, 옵트아웃 케이스 점검 | pm |
| **2026-05-02 Week 2 마감** | 1주일 운영 데이터로 Playbook 평균 소요 시간 + 실패율 첫 회고 | qa + pm |

---

## 5. 예외 처리

### 5.1 Ollama 미가동 시

Playbook 기본값은 LLaMA(Ollama qwen2.5:3b) — 비용 $0. Ollama 장애로 Playbook 불가하면:
- 1차 대응: DeepSeek Reasoner 로 교체 (비용 $0.001/턴, 속도 30~350s)
- 2차 대응: GPT-5-mini ($0.025/턴) — 이 경우 `pm` 에이전트가 비용 승인 필요

### 5.2 사용자 압박으로 인한 스킵 요청

"급하니 이번만 스킵하자" 요청이 와도 **금지**. SKILL 문서 Phase 3.3 "Playbook 생략 후 사용자 전달 금지" 조항 준수. 스킵이 필요한 상황이면 배포 자체를 미루는 것이 원칙.

---

## 6. 측정 지표 (Week 2 이후)

- **Playbook 실행율**: release PR 중 Playbook 실행 증거 첨부 비율 (목표 100%)
- **Playbook 실패율**: 실행 중 FAIL 비율 (목표 &lt;10%, 높으면 배포 전 QA 파이프라인 상류에 문제)
- **Playbook 평균 소요 시간**: Phase 1~4 전체 (목표 &lt;5분, 초과 시 튜닝)
- **Post-Playbook 사용자 회귀 건수**: Playbook PASS 이후 사용자 스크린샷으로 발견된 버그 건수 (목표 0건/주)

위 지표는 `docs/04-testing/` 아래 주간 리포트에 매주 기록.

---

## 7. 레퍼런스

- Skill 원문: `.claude/skills/pre-deploy-playbook/SKILL.md`
- Day 2 사고 스크린샷: `2026-04-23_220403.png` ~ `2026-04-23_221859.png` (16장, `d:\Users\KTDS\Pictures\FastStone`)
- Day 3 스탠드업 로그: `work_logs/scrums/2026-04-24-01.md` §5 QA 반성
- Day 3 실행 계획: `work_logs/plans/2026-04-24-standup-actions-execution-plan.md` §1 Phase 1
- 관련 버그 티켓: BUG-UI-009, BUG-UI-010, BUG-UI-011, BUG-UI-012, BUG-UI-013, BUG-UI-014, UX-004
