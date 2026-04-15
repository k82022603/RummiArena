# 공급망 리스크 프레임워크 (초안)

- **작성일**: 2026-04-15 (Sprint 6 Day 4 화요일)
- **작성자**: Security Engineer (security-1)
- **상태**: Draft — 팀 리뷰 대기 (Architect ADR 후보 연계)
- **배경**: 2026-04-15 아침 스크럼 §3 부주제 (threads.com 스니펫 오류 + Anthropic 2026-02-09 / 03-03 / 04-07 세 번의 silent default 변경 + 2026-04-09 Advisor Strategy 공식화)
- **연계 문서**: docs/04-testing/56-sec-rev-013-audit.md (라이브러리 레벨 CVE 감사)
- **OWASP**: A06:2021 Vulnerable and Outdated Components + A08:2021 Software and Data Integrity Failures

---

## 0. 문서의 위치

SEC-REV-013 의존성 감사는 **라이브러리 레벨**(axios, next, go-redis)에서 공급망 위험을 다룬다. 그러나 2026-04-13~15 동안 팀이 직접 마주한 3가지 사건은 **라이브러리보다 상위 레이어**(개발 도구, 외부 API, 커뮤니티 스니펫)에서 발생했다. 기존 SCA(Software Composition Analysis) 도구로는 탐지되지 않는 영역이다.

본 문서는 **라이브러리 레벨 감사(docs/04-testing/56)** 와 **도구/API/커뮤니티 레벨 리스크(본 문서)** 를 구분하여, RummiArena 팀의 공급망 방어선을 4개 레이어로 정의하는 초안이다.

---

## 1. 공급망 레이어 정의

본 문서는 RummiArena 팀이 마주하는 공급망 리스크를 4개 레이어로 구분한다.

| 레이어 | 대상 예시 | 탐지 도구 | 현재 커버리지 |
|--------|----------|----------|-------------|
| L1 라이브러리 | axios, next, go-redis | npm audit / govulncheck / Trivy | SEC-REV-013 감사 존재, 3주 drift |
| L2 도구 | Claude Code, kubectl, helm, Docker | 없음 (수동 버전 확인) | 미커버 |
| L3 외부 API | Anthropic API default, Ollama model | 없음 (공식 blog 수동 추적) | 미커버 — 본 문서 주요 과제 |
| L4 커뮤니티 | threads.com, X, GitHub gist | 없음 (개발자 개인 검증) | 미커버 — 검증 책임 명시 필요 |

**L1은 기존 체계로 커버되지만** (SCA 도구 자체는 존재), L2/L3/L4는 이번 Sprint 6 Day 3~4 사건으로 처음 가시화되었다.

---

## 2. Sprint 6 Day 3~4에 발견된 3건의 도구 레벨 리스크

본 섹션은 2026-04-15 아침 스크럼에서 팀이 합의한 3가지 사건을 공급망 리스크 관점에서 공식 기록한다.

---

### 2.1 리스크 A: 이미지-코드 drift (내부 CI/CD 체인 약점)

**발견 시점**: 2026-04-15 (Day 4) 오전

**발견 경위**: SP3 PromptRegistry 커밋(2026-04-13 commit 5ad02e8) 이후 game-server/ai-adapter 이미지가 5일 전 이미지로 실행 중이었다는 사실이 확인되었다. ArgoCD는 helm chart의 tag가 변하지 않으면 rollout을 트리거하지 않고, CI는 이미지 재빌드를 commit에 자동 연결하지 않았다.

**리스크 유형**: L2 도구 레벨 — 내부 CI/CD 파이프라인이 소스-이미지 일관성을 보장하지 않음

**영향 분석**:
- **프로덕션 운영 중인 이미지가 최신 코드와 divergent** → 개발자가 새 코드가 배포되었다고 믿는 상태에서 실제로는 구버전 실행
- **디버깅 혼란**: 코드에는 있는 함수가 실행 시 없음 에러 발생 가능
- **보안 관점**: CVE 패치를 커밋해도 이미지 재배포가 자동화 안 되어 있으면 **취약점이 프로덕션에 남아 있음**. SEC-REV-013의 axios Critical fix가 커밋되어도 이미지 재빌드가 없으면 무효

**탐지 방안**:
1. **이미지 태그에 git SHA 포함** 강제 (예: game-server:2026-04-15-abc1234) — helm chart의 imageTag를 CI에서 자동 덮어쓰기
2. **ArgoCD Health check**에 이미지 digest와 helm chart의 기대 digest 일치 검증
3. **CI 파이프라인 Phase 3(배포)** 이 Phase 2(빌드) 완료 시에만 진행하도록 DAG 의존성 강제
4. **일일 drift 리포트**: 매일 아침 cron job으로 kubectl 배포 이미지 vs 최신 commit SHA 비교, drift 시 카카오톡 알림

**대응 방안**:
- **Day 5 Go Dev + DevOps**: helm chart imageTag를 CI 환경변수로 템플릿화
- **Day 6 DevOps**: ArgoCD auto-sync + self-heal + prune 재확인
- **Sprint 7**: drift 리포트 자동화 (scripts/image-drift-check.sh)

**Owner**: DevOps (주) + Go Dev (보조)

---

### 2.2 리스크 B: 외부 도구 silent change (Anthropic Claude Code)

**발견 시점**: 2026-04-14 (Day 3) 저녁 부주제 + 2026-04-15 (Day 4) 아침 스크럼 재확인

**발견 경위**: 2026-04-14 저녁 부주제 Claude Code Opus 왜이러는가 를 조사하던 중 Team Lead가 공식 Anthropic 문서를 교차 검증한 결과, 2026-02-09부터 2026-04-07까지 **약 두 달 사이 세 번의 silent default 변경**이 있었음을 발견:

| 날짜 | 변경 내용 | 공지 수준 |
|------|----------|----------|
| 2026-02-09 | adaptive thinking default 활성화 | blog 포스트 있음 (간단) |
| 2026-03-03 | API/Bedrock/Vertex effort default medium 전환 | changelog만 |
| 2026-04-07 | default effort medium → high 재변경 (되돌림) | changelog만 |

**2026-04-09**: Anthropic Claude Platform Advisor Strategy 공식 통합 발표 (Opus=조언자 + Sonnet/Haiku=실행자 페어링). 실질적으로 **Opus 사용자에게 Sonnet/Haiku로 이동하라는 권고**.

**리스크 유형**: L3 외부 API 레벨 — 외부 도구 제공자가 default 동작을 고지 없이 변경

**영향 분석**:
- **재현성 붕괴**: QA가 2026-04-14에 Playwright 588 runs × 0 flaky를 증명했지만, 이 측정은 2026-04-07 이후 high effort 상태에서 이루어진 것. 만약 내일 누군가 medium effort로 재실행하면 결과는 달라질 수 있으며 flaky로 오분류될 위험
- **토큰 비용 변동성**: default effort가 medium → high로 돌아오면서 Sprint 6 토큰 소비율이 예상보다 빠르게 증가. Sprint 예산 가정이 외부 도구 변경에 취약
- **Prompt Engineering 효과 혼동**: Round 6 Phase 2에서 Claude 2 게임을 v4 프롬프트로 대전할 때, 만약 Claude가 Round 4~5 대비 다른 결과를 내면 **원인이 우리 v4 때문인지 Anthropic 4/7 변경 때문인지 구분 불가**. AI Engineer가 리포트(docs/03-development/22)에 각주 필요
- **LLM 신뢰 금지 원칙이 도구 레이어까지 확장**: 기존에는 LLM 응답만 검증 대상이었으나, 이제 LLM을 실행하는 도구 자체도 동작 일관성 검증 대상이 되어야 함

**탐지 방안**:
1. **세션 시작 시점 자동 기록** (DevOps 제안, Day 5 구현): Agent Teams 가동 시 claude --version + claude config get effortLevel + date 출력을 work_logs/tool-state/ 디렉토리에 저장. Node Dev SP3 PromptRegistry의 variant 로깅과 동일한 패턴
2. **테스트 재현 조건에 도구 상태 포함** (QA 제안): Playwright 리포트에 Node 버전 외에도 Claude Code 버전/effort level 필드 추가
3. **effortLevel 명시 고정** (Go Dev 제안): .claude/settings.local.json에 effortLevel 값을 명시 고정하여 Anthropic default가 바뀌어도 프로젝트 동작 불변 유지
4. **외부 도구 변경 칸반** (PM 제안): Sprint 백로그에 외부 도구 변경 모니터링 상시 칸반 추가. 주 1회 공식 changelog 수동 확인 루틴화

**대응 방안**:
- **Day 5 DevOps**: scripts/agent-team-prelude.sh 구현
- **Day 5 QA**: 테스트 리포트 메타필드 추가 (toolVersions)
- **Day 5 Go Dev**: .claude/settings.local.json에 effortLevel 명시
- **Sprint 6 내 Architect**: 외부 도구 silent change 탐지 ADR 후보 승격 (Architect Day 4 저녁~Day 5 초안)
- **상시 Team Lead**: 외부 스니펫/블로그 공유 전 공식 문서 교차 검증 루틴화

**Owner**: DevOps (주) + QA (보조) + Architect (ADR)

---

### 2.3 리스크 C: 커뮤니티 스니펫 검증 부재 (threads.com 사례)

**발견 시점**: 2026-04-14 (Day 3) 저녁 부주제 공유 시 + 2026-04-15 (Day 4) 아침 스크럼 재검증

**발견 경위**: Day 3 저녁 애벌레가 threads.com에서 본 Claude Code 설정 스니펫을 팀에 공유. 해당 스니펫은 CLAUDE_CODE_EFFORT_LEVEL=max, CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1, CLAUDE_CODE_DISABLE_1M_CONTEXT=1 세 개 환경변수를 설정하는 내용이었으며, 원 게시물의 주석은 각 플래그의 동작을 다음과 같이 설명:
- EFFORT_LEVEL=max: 매 턴 풀 추론 강제
- DISABLE_ADAPTIVE_THINKING=1: 생각 예산 축소 방지
- DISABLE_1M_CONTEXT=1: 컨텍스트 200k 제한, 추론에 집중

**Day 4 아침 공식 문서 교차 검증 결과**:

1. **DISABLE_ADAPTIVE_THINKING=1은 축소 방지가 아니다.** 공식 문서 원문: revert to the previous fixed thinking budget, controlled by MAX_THINKING_TOKENS. 즉 adaptive reasoning을 **끄고 고정 예산으로 회귀**시키는 플래그. 기본값(adaptive high)보다 오히려 **더 적은 생각 예산**이 될 수도 있음. **원 스니펫 주석은 반대로 해석됨**
2. EFFORT_LEVEL은 3단계가 아니라 4단계 (low / medium / high / max). max는 thinking token 상한이 없어 가장 느리고 가장 비싸다. 스니펫의 max 설정은 **토큰 한도 소진을 가속하는 루트** (절약 목적이면 역효과)
3. DISABLE_1M_CONTEXT=1은 컨텍스트를 200k로 제한하는 것은 맞음. 그러나 **RummiArena처럼 긴 문서 참조가 많은 워크로드에는 오히려 독** (프로젝트 파일 전수 읽기 불가)

**결론**: 커뮤니티에서 유행하던 settings.json 치트코드는 **절반만 맞다**. 팀 합의: 적용하지 않는다.

**리스크 유형**: L4 커뮤니티 스니펫 레벨 — 비공식 가이드의 반대 해석

**영향 분석**:
- **24시간 지연 발생**: Day 3 저녁 공유 → Day 4 아침 교차 검증 → 반대 해석 발견. 만약 즉시 적용했다면 Day 4 전체 Agent Teams 가동이 **예상과 반대 방향** 으로 설정된 상태로 진행되었을 것
- **팀 리드의 책임 고백**: 사용자 제공 맥락이라 분류하고 공식 문서 교차 검증을 생략한 것이 원인. 외부 비공식 가이드를 공식 소스로 취급한 실수
- **반복 가능성**: 개발자 커뮤니티는 시행착오 공간이며, 부정확한 설정이 유행처럼 확산되는 경우 흔함. 이번 건은 다행히 아침 재검증으로 막혔지만, **검증 없는 채택은 반복될 수 있음**

**탐지 방안**:
1. **외부 스니펫 적용 전 공식 문서 교차 검증 루틴** (Team Lead, 상시): 커뮤니티 스니펫 공유 시 **출처 + 공식 문서 링크 + 실제 동작 요약** 3요소를 함께 제공. 3요소 중 하나라도 빠지면 적용 보류
2. **비공식 플래그 주의 태그**: 공식 문서에 없는 환경변수/설정은 실험적 으로 명시 분류, 당장 적용 금지
3. **3일 검증 기간**: 외부 가이드를 프로젝트에 적용할 때 최소 3일 관찰 후 기본값 반영. Day-0 즉시 적용 금지
4. **개발자 교육**: 본 사건을 work_logs/insights/에 개인 교훈 기록, 신규 팀원 온보딩 자료에 포함

**대응 방안**:
- **Day 4 Team Lead 합의**: 외부 스니펫 공유 전 공식 문서 교차 검증을 기본 동작으로 추가 (스크럼 기록)
- **팀 전체**: threads.com 스니펫 적용 금지 합의 기록 (docs/01-planning/20 §5 Bonus)
- **Sprint 7 PM**: Agent Teams 템플릿 개편 시 외부 가이드 검증 체크리스트 포함

**Owner**: Team Lead (주) + PM (교육 연계)

---

## 3. 전체 리스크 요약 매트릭스

| # | 리스크 | 레이어 | 심각도 | 가능성 | 탐지 커버리지 | Owner |
|---|--------|-------|-------|-------|-------------|-------|
| A | 이미지-코드 drift | L2 도구 | High | 확정 관측 | 0% → 50% (Day 5 목표) | DevOps |
| B | Anthropic silent change | L3 외부 API | High | 고빈도 (두 달에 3회) | 0% → 30% (Day 5 목표) | DevOps + QA + Architect |
| C | 커뮤니티 스니펫 오류 | L4 커뮤니티 | Medium | 중빈도 (Day 3~4 1회) | 0% → 100% (Day 4 합의 완료) | Team Lead + PM |

---

## 4. 기존 L1 커버리지 연계 (SEC-REV-013 감사 결과)

L1 라이브러리 레이어는 docs/04-testing/56-sec-rev-013-audit.md 의 실측 결과와 연계. 본 감사에서 확인된 Critical 1건 + High 4건(game-server go-redis + frontend/admin next + ai-adapter axios)은 본 공급망 리스크 문서의 L1 근거로 인용됨.

**L1 → L2~L4 연관성**:
- L1의 axios Critical이 Day 5에 패치되어도, **L2 이미지-코드 drift 리스크(A)** 가 존재하면 프로덕션 이미지는 여전히 취약
- L3 Anthropic silent change가 재발하면, LLM 호출 동작이 바뀌어 **L1 라이브러리(axios)의 SSRF 공격 표면도 연쇄 영향 가능성**
- L4 커뮤니티 스니펫이 DISABLE_ADAPTIVE_THINKING 등을 켜면, L3의 외부 API 동작이 의도 밖으로 변경되어 **측정 불가능한 상태로 전이**

따라서 공급망 방어는 **4개 레이어 동시 커버**가 필요하며, L1만 커버하는 기존 SEC-REV 체계는 구조적 약점이 있다.

---

## 5. Sprint 6~7 Action Items (종합)

| # | 담당 | Action | 기한 | 레이어 |
|---|------|--------|------|-------|
| 1 | DevOps | helm imageTag를 git SHA로 템플릿화 | Day 5 | L2 (A) |
| 2 | DevOps | ArgoCD auto-sync + self-heal + prune 재확인 | Day 6 | L2 (A) |
| 3 | DevOps | scripts/agent-team-prelude.sh (effort/version 자동 기록) | Day 5 | L3 (B) |
| 4 | DevOps | scripts/image-drift-check.sh 자동화 cron | Sprint 7 | L2 (A) |
| 5 | QA | 테스트 리포트 메타필드에 toolVersions 추가 | Day 5 | L3 (B) |
| 6 | Go Dev | .claude/settings.local.json effortLevel 명시 고정 | Day 5 | L3 (B) |
| 7 | Architect | 외부 도구 silent change 탐지 ADR 후보 초안 | Day 4 저녁~Day 5 | L3 (B) |
| 8 | Team Lead | 외부 스니펫 공유 전 공식 문서 교차 검증 루틴화 | 상시 | L4 (C) |
| 9 | PM | Advisor Strategy 기반 Agent Teams 템플릿 개편 | Day 5 | L3 (B) |
| 10 | Security | CI에 govulncheck + npm audit 게이트 추가 | Day 6 | L1 |
| 11 | Designer | 대시보드 metric 카드에 measured at 도구 상태 각주 UX | Sprint 6 후반 | L3 (B) |
| 12 | 팀 전체 | 주 1회 공식 changelog 수동 확인 루틴 | 상시 | L3 (B) |

---

## 6. 향후 확장 방향

본 문서는 Sprint 6 Day 4 시점의 **초안**이며, 향후 Sprint 7~10에서 다음과 같이 확장 예정:

### 6.1 Sprint 7 (우선순위 높음)
- **L1 자동화**: CI에 SCA 게이트 완전 통합 (SEC-REV-013 action #10)
- **L2 drift 탐지 자동화**: 일일 리포트 + Slack 알림 (action #4)
- **L3 도구 상태 로깅**: agent-team-prelude.sh 운영 경험 축적 (action #3)
- **L4 교육 자료**: work_logs/insights/ 기반 온보딩 문서

### 6.2 Sprint 8~10 (중기)
- **SLSA 도입 검토**: Supply chain Levels for Software Artifacts. RummiArena 규모에서는 Level 1~2 수준이 현실적
- **SBOM 생성**: Software Bill of Materials 자동화 (syft / cyclonedx)
- **의존성 업데이트 자동화**: Renovate / Dependabot 도입 검토
- **외부 API 변경 알림**: Anthropic / OpenAI / DeepSeek 공식 changelog RSS 구독

### 6.3 프로덕션 컷오버 이전 (필수)
- **프로덕션 환경 cloud metadata 노출 차단**: axios Critical 영향 해소 (SEC-REV-013 action #2 후속)
- **이미지 서명 (cosign)**: 이미지 tampering 방지
- **CVE SLA 정의**: Critical 24h, High 72h, Medium 7d 패치 SLA

---

## 7. 참조

- **docs/04-testing/56-sec-rev-013-audit.md** — L1 라이브러리 레벨 실측 감사 (본 문서의 L1 근거)
- **docs/04-testing/50-sec-rev-010-onwards-analysis.md** §3.2 — SEC-REV-013 원 계획 (Sprint 5 W1)
- **docs/01-planning/20-sprint6-day4-execution-plan.md** §4 — 부주제 후속 조치 (7개 합의 사항)
- **work_logs/scrums/2026-04-15-01.md** §3.1~3.4 — 스크럼 부주제 전문 (threads.com 오류 + Anthropic silent change 3회 + Advisor Strategy)
- **CLAUDE.md** Key Design Principles 1 (LLM 신뢰 금지) — 본 문서가 도구 레이어로 확장한 원칙
- **docs/02-design/01-architecture.md** §5 — 기존 보안 설계 (L1 중심)
- **OWASP Top 10 2021**: A06 Vulnerable and Outdated Components, A08 Software and Data Integrity Failures
- **SLSA 프레임워크**: https://slsa.dev/

---

## 8. 변경 이력

| 날짜 | 작성자 | 내용 |
|------|--------|------|
| 2026-04-15 | security-1 | 초안 작성 (Sprint 6 Day 4) — 3 리스크 기록, 4 레이어 정의, 12 action items |

---

**문서 끝**
