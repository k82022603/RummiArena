# Merge Gate 정책 (Sprint 7 Week 2 ~)

- **문서 번호**: `docs/01-planning/22-merge-gate-policy.md`
- **작성일**: 2026-04-24 (Sprint 7 Day 3, AM 스탠드업 Action Item 이행)
- **최초 적용**: **2026-04-25 (Day 4)** 생성되는 PR 부터
- **책임**: PM 주관 (정책) · architect 리뷰 (구조 부채 체크) · devops 자동화 (CI 연동) · qa 검증 (재현 spec / 회귀)
- **상태**: ACTIVE (v1.0)

## 0. 배경 및 원칙

Sprint 7 Day 2 (2026-04-23) 에 5 PR 머지 + `day2-2026-04-23` 태그 smoke PASS 직후, 같은 날 22:04~22:18 실사용자 플레이테스트에서 BUG-UI-009~014 6건 + UX-004 1건이 쏟아졌다. 사용자 진술 **"고쳐진 게 하나도 없는 듯"** 이 우리가 측정해 온 모든 지표 — `/health 200 OK`, `helm list DEPLOYED`, `Go 689 PASS`, `AI 428 PASS`, `Playwright 390 PASS`, `Critical/High=0` — 를 통과한 상태에서 사용자가 즉시 체감한 회귀였다.

이 정책은 **"지표 뒤에 숨지 않는다"** 를 머지 게이트 수준에서 제도화한다. 2026-04-24 스탠드업 11명 반성 교집합 (보고서 `work_logs/scrums/2026-04-24-01.md` §공통 교훈 표) 의 구조적 진단을 그대로 옮긴다.

원칙:

1. **Production 기준 = 실사용자 플레이 기준**. smoke PASS 는 "Pod 가 살아 있다" 가 아니라 "한 판을 완주한다" 이다.
2. **재현 spec RED → GREEN 순서**. 재현 없는 수정은 회귀 탐지 공백과 동일하다.
3. **UI 수정은 페어 증거 필수**. 구조 부채 누적은 ADR 없이 넘어가지 않는다.
4. **예외 운영은 허용하되, 속도 목적의 우회는 금지**. 문서/dev-only fix 는 하위 체크만, Production 영향 PR 은 전수 게이트.

## 1. 머지 전 필수 체크리스트 (10개)

모든 production 영향 PR (game-server / ai-adapter / frontend / admin / helm / istio / K8s manifest 변경) 은 아래 10개를 통과해야 머지된다. PR description 에 체크박스 10개를 그대로 복사하고, 각 항목의 "증거" 섹션에 링크/커밋 해시/첨부를 남긴다.

- [ ] **1. `pre-deploy-playbook` 스킬 실행 증거 첨부** — `release` 라벨 PR 에 한함. 실행 로그 또는 수행 요약을 PR 본문 또는 코멘트에 첨부.
- [ ] **2. 재현 spec RED → GREEN 커밋 히스토리** — 버그 수정 PR 은 재현 spec 을 **구현 커밋보다 먼저** 커밋한다. `git log --oneline` 에서 spec 커밋 → fix 커밋 순서 확인 가능해야 한다.
- [ ] **3. 동일 파일/함수 3회 이상 핫픽스 누적 시 리팩터 ADR 링크** — `handleDragEnd` 같이 한 함수에 분기를 계속 추가해 온 경우, architect 승인 ADR (`docs/02-design/adr/`) 링크 필수. ADR 없이는 머지 차단.
- [ ] **4. UI 수정은 architect + frontend-dev + designer 페어 증거 (PR 코멘트 3인 승인)** — UI 파일 (`src/frontend/src/`, admin UI) 변경 PR 은 세 역할 각각의 리뷰 코멘트가 PR 에 남아 있어야 한다. "approved" 클릭만으로는 불충분, 구조/UX/카피 각 관점 문장 1줄 이상.
- [ ] **5. 한글 i18n 변경 시 designer 카피 에디트 승인** — `ko.json` 또는 한글 문자열 하드코딩 변경 시 designer 명시적 승인 코멘트. BUG-UI-012 "상업/골셀/차집합" 재발 방지.
- [ ] **6. smoke 4축 GREEN** — devops smoke 정의 (`docs/05-deployment/08-rollback-criteria.md` 연동) 의 4축: **(a) 1 게임 완주 / (b) 재배치 4유형 / (c) 한글 렌더 diff 0 / (d) drag stuck 재현 0**. devops 머지 승인 코멘트에 네 항목 체크.
- [ ] **7. Playwright + Go + Jest 회귀 PASS** — CI green 배지 + 신규 재현 spec 이 포함된 회귀 세트 PASS 확인. Known Flaky 예외는 PR 본문에 목록 명시.
- [ ] **8. Rollback 절차 PR 본문에 1문단** — "이 변경을 즉시 회수하는 방법 (helm rollback / ArgoCD resync / feature flag off)" 1문단 필수. devops 의 `docs/05-deployment/08-rollback-criteria.md` 절차 참조 링크 포함.
- [ ] **9. 사용자 플레이테스트 증거** — `release` 라벨 PR 에 한함. 애벌레 (PO) 또는 지정 테스터의 실플레이 30분 세션 스크린샷/영상/간단 감상 코멘트 1건 이상. 없으면 `release` 태그 부착 금지.
- [ ] **10. Co-Authored-By 라인 포함** — 모든 커밋 메시지에 `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` 또는 해당 세션 에이전트 트레일러. 책임 귀속 추적.

## 2. 예외 운영 (3 항목)

속도 확보를 위해 **Production 원칙을 훼손하지 않는 범위** 에서 하위 3개 체크만 요구하는 경로를 허용한다.

| 예외 대상 | 필요 체크 | 금지 |
|----------|----------|------|
| **문서 전용 PR** (`docs/`, `work_logs/`, `README.md` 만 변경) | #7 CI 통과, #10 Co-Author, 스크럼/데일리 기록에 PR 번호 언급 | 코드 파일 1개라도 섞이면 즉시 전수 게이트 복귀. 섞지 말 것. |
| **dev-only fix** (dev deps 버전 bump, test 파일 수정, CI config 튜닝) | #7 CI 통과, #10 Co-Author, 영향 범위 "dev-only" 명시 PR description | Production 런타임에 닿는 transitive 가 한 개라도 있으면 SEC-REV 감사 필수 전환. |
| **긴급 핫픽스** (Prod 장애 실시간 대응) | #6 smoke 4축 중 최소 (a)(d), #8 rollback 1문단, #10 Co-Author | 24시간 내 전수 게이트 소급 적용 PR 필수. 영구 예외 불가. |

- 예외 라벨: `docs-only`, `dev-only`, `hotfix-expedite` 중 하나 부착 필수.
- 예외 PR 은 주간 gate 통과율 메트릭 분모에서 제외하되, **별도 카운트** 로 공시한다.

## 3. 게이트 적용 시점 및 책임자 매트릭스

- **적용 개시**: 2026-04-25 (Day 4) 생성되는 PR 부터.
- **Day 3 PR** (#58~, 2026-04-24 생성분): 파일럿. #1/#2/#6/#7/#10 5개 최소 체크만 강제, 나머지는 권장. PM 이 게이트 통과 여부 주간 리포트에 "파일럿" 으로 별도 집계.
- **Day 4 ~ Week 2 마감 (2026-05-02)**: 전수 10개 체크 + 예외 3항목 운영.

책임자 매트릭스:

| 항목 | 1차 책임 | 2차 리뷰 | 자동화 |
|------|---------|---------|--------|
| 정책 유지·개정 | **pm** | architect | — |
| #3 구조 부채 카운터 | **architect** | pm | 동일 파일 N+3 hotfix 검출 스크립트 (Sprint 7 Week 2 착수) |
| #4 UI 3인 페어 | **architect + frontend-dev + designer** | pm | PR template `## UI Review (3 roles)` 섹션 강제 |
| #5 i18n 카피 | **designer** | frontend-dev | i18n 파일 변경 시 designer 자동 리뷰 요청 (CODEOWNERS) |
| #6 smoke 4축 | **devops** | qa | `scripts/smoke-4axis.sh` (devops `08-rollback-criteria.md` 연동) |
| #7 회귀 PASS | **qa** | devops | CI required checks |
| #8 rollback 1문단 | **devops** | pm | PR template 필수 필드 |
| #9 사용자 플레이테스트 | **pm (조율) + 애벌레 (수행)** | qa (재현 확인) | `release` 라벨 부착 체크리스트 |

## 4. 운영 메트릭 (주간 리포트)

PM 이 매주 금요일 스크럼 회고 모드 (헌장 §9 신규 섹션 연동) 에 다음 4개를 제출한다.

| 메트릭 | 정의 | 목표치 (Sprint 7) | 경보 임계 |
|--------|------|-----------------|-----------|
| **Gate 통과율** | (전수 10개 통과 PR) / (release PR 전체) × 100 | ≥ 90% | < 70% 시 정책 재점검 스크럼 안건 |
| **회귀 탐지율 (Pre-merge)** | 머지 전 CI/smoke 에서 잡힌 회귀 건수 / 전체 회귀 건수 | ≥ 80% | < 50% 시 smoke 4축 정의 재검토 |
| **Post-merge 사용자 회귀 보고 건수** | 머지 후 24h 내 실사용자 스크린샷/이슈로 보고된 회귀 | ≤ 1 건/주 | 2건 이상 시 해당 PR 회고 필수 |
| **재현 spec 선행 비율** | (spec → fix 순서 PR) / (버그 수정 PR 전체) × 100 | ≥ 95% | < 80% 시 frontend-dev + go-dev + qa 공동 리뷰 |

## 5. 부록 — 참조 문서

- `work_logs/scrums/2026-04-24-01.md` — 11명 반성 원본 및 교집합 분석 (본 정책의 근거)
- `work_logs/plans/2026-04-24-standup-actions-execution-plan.md` §3 — 회귀 방지 게이트 초안 (본 정책으로 형식화)
- `docs/05-deployment/08-rollback-criteria.md` — devops smoke 4축 정의 + rollback 임계치 (동 스프린트 Day 3 devops 산출)
- `docs/02-design/43-rule-ux-sync-ssot.md` — 룰-UX 동기화 SSOT (ai-engineer + designer, Day 5 예정)
- `docs/01-planning/01-project-charter.md` §9 — 스크럼 운영 규칙 (회고 모드) 연동
- `.claude/skills/pre-deploy-playbook/SKILL.md` — 체크리스트 #1 의 실행 스킬
- `.claude/skills/pr-workflow/SKILL.md` — PR 생성 워크플로우 (본 정책은 그 게이트 강화)

## 6. 개정 이력

| 버전 | 일자 | 작성자 | 변경 내용 |
|------|------|--------|-----------|
| v1.0 | 2026-04-24 | pm (Opus 4.7 xhigh) + Claude main | 최초 제정. Sprint 7 Day 2 실사용자 플레이테스트 회귀 사고 대응. Day 4 개시. |
