# 토큰 절약 5가지 실적용 방안 — Sprint 6 Day 4 기준

- **작성일**: 2026-04-15 (Sprint 6 Day 4)
- **배경**: Day 3 오후 세션에서 Opus 4.6 세션 한도 87% 근접 경험 후 도출된 5가지 구조 개선안
- **근거 에세이**: `work_logs/insights/2026-04-14-agent-teams-token-economics-essay.md`
- **웹 검증**: 2026-04-09 Anthropic 공식 Advisor Strategy 발표 — "Opus 조언자 + Sonnet/Haiku 실행자" 패턴을 공식 권고로 통합
- **적용 범위**: 모든 Agent Teams 가동 + Team Lead 직접 작업
- **참조**: `docs/01-planning/20-sprint6-day4-execution-plan.md` (Day 4 실행 계획)

## 0. 요약 — 5가지 조치와 핵심 기대효과

| # | 조치 | 기대 효과 | 적용 시점 |
|---|------|----------|----------|
| 1 | 프롬프트 파일 참조화 | spawn 토큰 ~70% 감소 | 다음 Agent Teams 즉시 |
| 2 | 완료 보고 5줄 압축 | return 토큰 ~80% 감소 | 즉시 (에이전트 지시) |
| 3 | 병렬 상한 3명 | 컨텍스트 파편화 완화 | 즉시 (PM 규칙) |
| 4 | 날 성격별 모델 선택 | 고가 Opus 사용량 축소 | Day 5+ 템플릿 개편 후 |
| 5 | permissions 사전 체크 | Y/N 승인 프롬프트 0건 | 즉시 (세션 시작 습관) |

**종합 기대**: 동일 산출물에 대해 토큰 소비 50~70% 절감 + 애벌레 수작업 Y/N 0건 + 세션 한도 초과 없이 하루 완주

---

## 1. 프롬프트 파일 참조화

### 문제

Day 3 오후 5 트랙 spawn 시 각 에이전트에게 200~300줄짜리 상세 지시서를 **프롬프트 본문에 직접 박아 넣었음**. 5명 × 250줄 ≈ 1,250줄이 한 turn에 누적됨. 이 텍스트가 Claude API에 매 turn 함께 전송되면서 입력 토큰을 빠르게 소진.

### 해결책

에이전트 spawn 시 지시서를 **파일 경로로 대체**하고 에이전트에게 "이 파일을 먼저 읽고 시작하세요"라고 짧게 지시.

### 실적용 방법

**Before (Day 3 오후 방식)**:
```
Agent({
  subagent_type: "ai-engineer",
  prompt: `[250줄짜리 SP1 v4 프롬프트 설계 상세 지시서...
  ... 4모델 특성, 차원별 지시어, 공통 코어 분기,
  ... 역할/입력/출력/품질 기준/제약/산출물 경로 등 전부 포함 ...]`
})
```

**After (오늘부터)**:
```
Agent({
  subagent_type: "ai-engineer",
  prompt: `docs/01-planning/19-sprint6-day3-afternoon-tracks.md §SP1 섹션을 읽고 작업을 시작하세요.
  산출 경로: docs/03-development/20-v4-common-system-prompt.md
  완료 시 SendMessage로 5줄 요약 + 파일 경로만 회신.`
})
```

### 구현 체크리스트

- [ ] PM: 다음 Agent Teams 가동 전, 지시서 파일을 `docs/01-planning/N-sprintX-dayY-tracks.md` 형식으로 사전 작성
- [ ] Team Lead: Agent spawn 프롬프트 템플릿에서 "상세 지시 본문" → "파일 경로 + 섹션" 치환
- [ ] 예외: 5줄 이내 단순 작업은 파일 참조 없이 직접 지시 가능

### 토큰 절약 산식 (추정)

- Day 3 오후 spawn 평균: 250줄 × 5명 ≈ 1,250줄 / 5 turn ≈ **250줄/turn 입력 누적**
- 파일 참조 방식: 경로 + 섹션 지시 5줄 × 5명 ≈ 25줄 (파일 자체는 에이전트가 Read 도구로 1회만 읽음)
- **입력 감소율 ≈ 80% (에이전트 spawn 구간만 한정)**

---

## 2. 완료 보고 5줄 압축

### 문제

에이전트 11명이 각자 500~1,500줄짜리 완료 보고를 올리면 **그게 전부 Team Lead의 입력 토큰으로 누적**됨. Day 3 오전 11 태스크 완료 시 보고 총합 ≈ 10,000줄 이상으로 추정.

### 해결책

에이전트 완료 시 **상세 로그는 파일로 남기고 return 메시지는 5줄 요약 + 파일 경로만** 돌려주도록 지시.

### 실적용 방법

**Before (Day 3 방식)**:
```
[에이전트 return]
## 작업 완료 — SP1 v4 공통 System Prompt 설계

### 1. 작업 개요
SP1 트랙에서 ... (50줄)

### 2. 산출물 상세
- docs/03-development/20-v4-common-system-prompt.md (898줄)
  - 섹션 1: ... (20줄 설명)
  - 섹션 2: ... (30줄 설명)
  ... (총 200줄)

### 3. 테스트 결과 ... (100줄)
### 4. 결정 사항 ... (80줄)
### 5. 다음 단계 ... (50줄)
### 6. 주의 사항 ... (40줄)

[총 500~1500줄]
```

**After (오늘부터)**:
```
[에이전트 return — 5줄 제한]
✅ SP1 완료. docs/03-development/20-v4-common-system-prompt.md (898줄).
핵심: 4모델 특성 매핑 + 차원별 지시어(thinking_budget/evaluation_criteria/retry_discipline/json_strictness) + 공통 코어 + 4 variant 분기.
결정: GPT/Ollama는 v4 부적합 → v3 유지 권고.
테스트: 없음 (설계 문서).
다음: SP5가 본문 구현.
```

### 구현 체크리스트

- [ ] Team Lead: 모든 에이전트 spawn 프롬프트에 다음 문구 추가:
  > "완료 시 return 메시지는 반드시 5줄 이하로 압축. 상세 내용은 산출물 파일에만 기록. return 형식: (1) 완료/실패 + 산출물 경로 (2) 핵심 1줄 (3) 결정 1줄 (4) 테스트 1줄 (5) 다음 단계 1줄"
- [ ] 예외: 실패 / 블로커 발생 시에는 상세 보고 허용 (원인 분석 필요)

### 토큰 절약 산식 (추정)

- Day 3 오전 11 태스크 보고 총합: ~10,000줄
- 5줄 압축 적용 시: 5 × 11 = 55줄
- **입력 감소율 ≈ 99.5%**
- 주의: 상세 로그가 파일에 남아야 추후 분석 가능 → 에이전트는 **파일에는 상세 기록**을 유지

---

## 3. 병렬 상한 3명

### 문제

Day 3 오전 11명 동시 spawn은 관리 가능했지만 (의존성 체인 자동 해제), Team Lead 컨텍스트에서는 **11명 각자의 진행 상태를 매 turn 추적**하게 돼서 컨텍스트 크기가 폭증. Opus 4.6이 1M 컨텍스트를 지원해도 **모든 상태를 기억**하는 비용은 여전히 큼.

### 해결책

**한 번에 최대 3명까지만** Agent Teams 병렬 실행. 3명 완료 후 다음 wave.

### 실적용 방법

**Before (Day 3 오전 방식)**:
```
Wave 1 (11명 동시 spawn):
- devops-1, go-dev-1, security-1, qa-1
- architect-1, designer-1, qa-2, frontend-dev-2
- ai-engineer-1, node-dev-1, frontend-dev-1
```

**After (오늘부터, 더 작은 wave)**:
```
Wave 1 (3명):
- devops-1, go-dev-1, security-1

Wave 2 (3명, Wave 1 완료 후):
- architect-1, designer-1, qa-1

Wave 3 (3명):
- ai-engineer-1, node-dev-1, frontend-dev-1

Wave 4 (2명):
- qa-2, frontend-dev-2
```

### 구현 체크리스트

- [ ] PM: 태스크 의존성 그래프를 그릴 때 **"동시 실행 가능 최대 3"** 제약으로 wave 설계
- [ ] Team Lead: 3명 초과 spawn 시도 시 자체 제동 ("대기 중" 상태로 큐잉)
- [ ] 예외: 긴급 병렬화 필요 시 (예: Round 6 다중 모델 동시 대전) 사용자 승인 받고 초과

### 컨텍스트 관리 효과

- 11명 병렬: Team Lead 컨텍스트에 11개 에이전트 상태 추적
- 3명 병렬: 동시 3개 상태만 추적 → **컨텍스트 파편화 ~73% 감소**
- 총 소요 시간: 11명 1 wave (≈40분) vs 3명 4 wave (≈60~80분) → 시간은 ~50% 증가하지만 **토큰은 크게 감소**

---

## 4. 날 성격별 모델 선택 (Advisor Strategy 정합)

### 문제

Day 3 전 구간에서 Team Lead는 Opus 4.6을 사용. 하지만 대전 집행, 단순 리팩터, 보일러플레이트 생성 같은 작업은 Sonnet 4.6 또는 Haiku 4.5로도 충분. **Opus는 설계/리뷰/복잡 분석에 집중**하고 다른 작업은 저가 모델로 이전하는 게 Advisor Strategy의 핵심.

### 해결책

**하루 단위 성격 분류** → 메인 모델 선택 → 세션 시작 시 명시적 전환.

### 하루 성격 분류 기준

| 성격 | 메인 모델 | 예시 작업 |
|------|----------|----------|
| **설계/아키텍처 day** | Opus 4.6 | ADR 작성, 리팩터 기획, 복잡 버그 근본 원인 분석 |
| **실행/대전 day** | Sonnet 4.6 | 대전 집행, 스크립트 실행, 중간 보고서 작성 |
| **보일러 day** | Haiku 4.5 | 파일 경로 검색, 단순 리네임, 주석 추가 |
| **스크럼/문서화 day** | Sonnet 4.6 | 스크럼 로그 작성, 데일리/바이브 로그, 메모 정리 |

### 오늘(Day 4) 적용

- **오늘 성격**: 실행/대전 day (Round 6 집행 메인)
- **권장 모델**: Sonnet 4.6
- **예외**: Architect의 "외부 도구 silent change ADR 초안"은 Opus 서브에이전트로 실행 (설계 작업)
- **현재 상태**: Team Lead는 Opus 4.6 로 진입 중이지만, 대전 집행 구간은 **답변 길이 의식적 제어**로 보완

### Agent Teams 에이전트별 모델 할당 (Day 5+ 템플릿 개편 예정)

| 에이전트 | 권장 모델 | 근거 |
|---------|----------|------|
| architect | Opus 4.6 | ADR, 설계 결정, 깊은 분석 |
| ai-engineer | Opus 4.6 | 프롬프트 설계, LLM 전략 |
| security | Opus 4.6 | 취약점 분석, 위협 모델링 |
| pm | Sonnet 4.6 | 일정, 리스크 관리, 문서 |
| node-dev | Sonnet 4.6 | NestJS 구현 |
| go-dev | Sonnet 4.6 | Go 구현 |
| frontend-dev | Sonnet 4.6 | React 컴포넌트 |
| devops | Sonnet 4.6 | 스크립트, YAML |
| qa | Sonnet 4.6 | 테스트 코드, E2E |
| designer | Sonnet 4.6 | 와이어프레임, UX |
| **Explore 서브** | Haiku 4.5 | 파일 검색 (Anthropic 기본) |

### 구현 체크리스트

- [ ] PM: Day 5 템플릿 개편에서 에이전트별 `model:` 필드 명시
- [ ] Team Lead: 하루 시작 시 "오늘 성격" 선언 (스크럼 로그에 기록)
- [ ] 비용 측정: Day 5+ 첫 주는 "모델 선택 효과" 관찰 기록

### 예상 비용 절감

- Opus 4.6 대비 Sonnet 4.6: ~5배 저렴 (대략, 2026-04 기준)
- Opus 4.6 대비 Haiku 4.5: ~15배 저렴
- 오늘 같은 실행 day를 Sonnet으로 돌리면 **단일 세션 토큰 비용 ~80% 절감**

---

## 5. Permissions 사전 체크

### 문제

Day 3 오후 Agent Teams 5명 spawn 중 애벌레에게 **Y/N 승인 프롬프트 수십 회 발생**. 원인: `.claude/settings.local.json`의 `permissions.allow` 배열에 **프로젝트 경로 (`/mnt/d/Users/KTDS/Documents/06.과제/RummiArena/**`)가 없었음**. `mode: "bypassPermissions"`는 Agent 본체 호출에만 적용되고 내부 Bash/Read/Edit/Write는 세션 permissions를 따름.

### 해결책

**매 세션 시작 시 permissions 사전 체크 루틴** + `defaultMode: "bypassPermissions"` 유지.

### 실적용 방법

**세션 시작 시 체크리스트**:

1. `.claude/settings.local.json`의 `permissions.defaultMode` 가 `"bypassPermissions"` 인지 확인
   ```bash
   cat .claude/settings.local.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('permissions',{}).get('defaultMode','MISSING'))"
   ```
   → 결과가 `bypassPermissions` 가 아니면 수정

2. `permissions.allow` 배열에 프로젝트 경로 포함 여부 확인
   ```bash
   cat .claude/settings.local.json | python3 -c "import sys,json; d=json.load(sys.stdin); [print(p) for p in d.get('permissions',{}).get('allow',[]) if 'RummiArena' in p or 'Read' in p or 'Edit' in p]"
   ```
   → `Read`, `Edit`, `Write`, `Bash`, `Glob`, `Grep` 와일드카드 패턴이 있어야 함

3. 없으면 즉시 추가 (Day 3 오후 2차 수정 시 추가한 광범위 패턴):
   ```json
   {
     "permissions": {
       "defaultMode": "bypassPermissions",
       "allow": [
         "Read", "Edit", "Write", "Glob", "Grep", "Bash",
         "Read(**)", "Edit(**)", "Write(**)"
       ]
     }
   }
   ```

4. 변경 후 **새 세션에서 반영**됨 (기존 세션은 스냅샷 유지)

### 구현 체크리스트

- [ ] Team Lead: 모든 세션 시작 시 위 3단계 체크 수행 (상시 루틴)
- [ ] DevOps: `scripts/agent-team-prelude.sh` (Day 5 예정)에 permissions 체크 로직 포함
- [ ] 예외: 외부 시스템(GitHub push, K8s 프로덕션)에 영향 주는 에이전트는 `mode: "default"` 유지

### 피해 방지 효과

- Day 3 오후: 수십 회 Y/N 프롬프트 → 사용자 고통 + 세션 시간 낭비
- Day 4 이후: 사전 체크로 0회 → 완전 비동기 Agent Teams 가동 가능
- **토큰 측면 효과**: 간접적. Y/N 대기 중에는 세션 아이들이지만 **컨텍스트 유지 비용**은 계속 발생

---

## 6. 오늘(Day 4) 실적용 현황

| # | 조치 | 오늘 적용 여부 | 근거 |
|---|------|--------------|------|
| 1 | 프롬프트 파일 참조화 | ✅ 부분 적용 | Day 4는 Agent Teams 대규모 가동 없음, 다음 대규모 가동 시 첫 실전 |
| 2 | 완료 보고 5줄 압축 | ✅ 적용 | AI Engineer Round 6 중간 보고 / Node Dev 활성화 보고 모두 5줄 지시 |
| 3 | 병렬 상한 3명 | ✅ 자연 충족 | 오늘 동시 가동 에이전트 ≤ 3 (AI Engineer + QA + Go Dev 모니터링) |
| 4 | 날 성격별 모델 선택 | ⚠️ 의식만 | Team Lead는 Opus 4.6 유지 (답변 길이로 보완). Day 5+ 템플릿 개편 후 진짜 적용 |
| 5 | permissions 사전 체크 | ✅ 확인 완료 | `defaultMode: bypassPermissions` + 광범위 allow 패턴 유지 |

## 7. 효과 측정 계획

**Day 4 마감 스크럼에서 확인할 지표**:

1. 오늘 세션 종료 시점 토큰 사용량 (`/status`)
2. Y/N 승인 프롬프트 발생 횟수 (목표: 0건)
3. Round 6 대전 중 Team Lead 답변 평균 길이 (목표: < 10줄/응답)
4. AI Engineer 중간 보고 평균 길이 (목표: < 5줄)
5. Day 3 오후 대비 토큰 사용률 (목표: 50% 이하)

**Day 5+ 추적**:
- 주간 토큰 사용량 (`/status` weekly)
- Agent Teams 가동 시 파일 참조 방식 효과 (비교 실측)
- 모델 선택 효과 (Sonnet 전환 시 실제 비용 절감)

## 8. 반론 및 트레이드오프

### 반론 1: "파일 참조하면 에이전트가 Read 도구로 파일을 읽는 비용은?"

**답변**: 에이전트가 파일을 1회 Read하는 비용 << Team Lead 컨텍스트에 매 turn 누적되는 비용. 특히 여러 에이전트가 **같은 참조 문서**를 읽으면 각 에이전트 컨텍스트에만 1회씩 들어가고 Team Lead 컨텍스트는 짧은 경로 지시만 유지됨.

### 반론 2: "5줄 보고는 정보 손실 아닌가?"

**답변**: 상세 로그는 **파일에 전체 유지**됨. 5줄 압축은 Team Lead ↔ 에이전트 간 return 메시지에만 적용. 추후 분석 시 파일에서 전체 로그 열람 가능.

### 반론 3: "병렬 3명은 속도 손해 아닌가?"

**답변**: 맞음. 시간 ~50% 증가 예상. 하지만 **토큰 한도 소진 → 세션 강제 중단**의 리스크가 훨씬 크다. "조금 느리지만 완주" > "빠르지만 중단".

### 반론 4: "Sonnet으로 전환하면 품질 저하 아닌가?"

**답변**: 작업 성격에 따라 다름. 설계/복잡 추론은 Opus 유지, 실행/보일러는 Sonnet/Haiku. Anthropic이 2026-04-09에 공식 발표한 Advisor Strategy도 정확히 이 권고.

## 9. 연계 문서

- `work_logs/insights/2026-04-14-agent-teams-token-economics-essay.md` — 원본 에세이 6장
- `docs/01-planning/20-sprint6-day4-execution-plan.md` — Day 4 실행 계획
- `work_logs/scrums/2026-04-15-01.md` — Day 4 킥오프 스크럼 (이 조치들을 합의한 회의록)
- `work_logs/scrums/2026-04-14-02.md` — Day 3 마감 스크럼 (부주제 최초 논의)
- `work_logs/vibe/2026-04-14.md` — "도구 자체가 흔들리는 날" 서술형 기록
- [Claude Platform Advisor Strategy 공식 발표 (2026-04-09)](https://blockchain.news/ainews/claude-platform-advisor-strategy-pair-opus-with-sonnet-or-haiku-for-near-opus-intelligence-at-lower-cost-2026-analysis)
- `feedback_agent_teams_permissions_precheck.md` — permissions 사전 체크 feedback 메모리

## 10. 다음 업데이트

- **Day 4 마감 시**: 오늘 적용한 2/5의 실제 효과 기록
- **Day 5 Agent Teams 가동 시**: 나머지 3/5의 첫 실전 기록
- **Sprint 6 회고**: 5가지 조치 전체의 누적 효과 분석
