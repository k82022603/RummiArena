# Claude Code Insights Report

- **분석 기간**: 2026-03-04 ~ 2026-04-03
- **작성일**: 2026-04-04
- **작성 근거**: Claude Code `/insights` 자동 분석

---

## 요약 통계

| 지표 | 값 |
|------|-----|
| 총 세션 | 62 (분석 대상 48) |
| 메시지 수 | 897 |
| 누적 작업 시간 | ~96시간 |
| 커밋 수 | 110 |
| 코드 변경량 | +18,372 / -1,128 lines |
| 변경 파일 수 | 321 |
| 활동 일수 | 21일 |
| 일평균 메시지 | 42.7 |
| 응답 시간 중앙값 | 44.4초 |

---

## 작업 영역 분석

### 1. 게임 개발 및 버그 수정 (~15 세션)

UI 버그, 클라이언트-서버 desync, WebSocket 프론트엔드 연결, displayName 아키텍처, 한국어 로컬라이제이션 불일치 수정 등. Frontend(TypeScript)와 Backend(Go) 멀티 파일 편집, turnNumber 버그 등 게임 로직 디버깅, 배포까지 수행.

### 2. E2E/단위 테스트 및 QA 자동화 (~10 세션)

E2E 테스트 153 → 362개 확장, 실패 80건 → 0건 해결, 에이전트 팀 QA 캠페인(66 TC, 100% PASS), Sprint QA 검증. 병렬 테스트 수정, flaky 테스트 진단, test-results 문서화 및 CI 통합.

### 3. CI/CD 파이프라인 및 K8s 인프라 (~10 세션)

GitLab CI/CD 안정화(gocover-cobertura 경로, lint-go 스테이지), ArgoCD K8s 배포 관리, 깨진 Pod 수정, Docker 이미지/컨테이너 이슈, GitLab Runner 설정. 파이프라인 실패 반복 디버깅, K8s 설정 이슈 진단, ArgoCD 싱크 충돌 관리.

### 4. WSL/Docker 환경 및 MCP 설정 (~10 세션)

WSL2 메모리 과다 할당(노트북 과열), .wslconfig 튜닝, Docker 리소스 모니터링, MCP 서버 설정/헬스 체크, GitHub CLI 설정, 크로스 프로젝트 토큰 관리. 시스템 진단, 설정 파일 편집, MCP → docker-compose 전환.

### 5. 프로젝트 관리 및 문서/일일 운영 (~15 세션)

10+ 에이전트 팀 스탠드업 미팅, 데일리/세션/바이브 로그 유지, PLAN.md/MEMORY.md 업데이트, Sprint 백로그 관리, 스크럼 로그, 일일 마감(git commit/push). 에이전트 팀 오케스트레이션, Markdown 문서 작성, 프로젝트 의식 워크플로우 관리.

---

## 도구 사용 현황

### Top 도구

| 도구 | 호출 수 |
|------|--------|
| Bash | 1,798 |
| Read | 699 |
| Edit | 399 |
| Agent | 213 |
| Write | 155 |
| Glob | 89 |

### 주요 언어

| 언어 | 파일 수 |
|------|--------|
| Markdown | 699 |
| TypeScript | 158 |
| YAML | 84 |
| Python | 53 |
| JSON | 36 |
| Go | 33 |

### 세션 유형

| 유형 | 세션 수 |
|------|--------|
| Multi Task | 30 |
| Single Task | 10 |
| Iterative Refinement | 6 |
| Quick Question | 2 |

---

## 사용 패턴 분석

> **핵심 패턴**: "high-delegation, low-tolerance for mistakes"
>
> 10+ 에이전트 팀 스탠드업, 병렬 작업 스트림, E2E 테스트 스위트, CI/CD 디버깅, 일일 마감 의식(세션 로그, 바이브 로그, MEMORY.md, 커밋/푸시)까지 Claude를 PM, 스크럼 마스터, 엔지니어링 팀으로 동시에 활용하는 매우 야심찬 멀티 에이전트 오케스트레이션 워크플로우.

**지배적 패턴: 압박 속 반복 정제(iterative refinement under pressure)**

- 상세한 사전 스펙 없이 "파이프라인 고쳐", "스탠드업 돌려", "일일 마감" 같은 넓은 지시 → Claude가 전체 절차를 알고 있을 것을 기대
- 19건의 잘못된 접근, 12건의 요청 오해 발생 시 빠른 개입으로 교정
- Bash 1,798회 + Agent 213회 → Go, TypeScript, Python, YAML, Markdown에 걸친 자동화 중심 인프라 워크플로우
- 세션 마지막에 문서화 의식과 git 작업 → "close the loop" 마인드셋

### 시간대별 활동

| 시간대 | 메시지 수 |
|--------|----------|
| 오전 (6-12) | 159 |
| 오후 (12-18) | 472 |
| 저녁 (18-24) | 195 |
| 심야 (0-6) | 71 |

> 오후 시간대(12~18시)에 전체 메시지의 53%가 집중되어 있음.

---

## 잘한 점 (Impressive Things)

### 1. 멀티 에이전트 팀 오케스트레이션

10+ 에이전트 팀(PM, AI Engineer, Designer, QA, Frontend, Backend, Infra, DevOps, Security, Data)을 스탠드업, 병렬 태스크, 프로젝트 리뷰에 활용. Sprint 스토리를 에이전트 팀으로 실행하고, 66 TC QA 100% PASS, 스크럼 로그까지 관리하는 성숙한 팀 시뮬레이션 접근법.

### 2. 체계적 E2E 테스트 확장

E2E 테스트 153 → 338 → 362개(전량 PASS). 한 세션에서 80건 실패를 0으로 해결, 한국어 로컬라이제이션 불일치 디버깅. CI 파이프라인 그린 유지에 대한 규율 있는 품질 의지.

### 3. 문서화 규율

14개 세션이 문서/일일 로그/바이브 로그/세션 로그/계획 업데이트에 집중. PLAN.md, MEMORY.md, 스크럼 로그, 커밋까지 포함하는 일관된 일일 마감 의식 → 멀티 세션 워크플로우의 컨텍스트 유지.

### 도움이 된 Claude 역량

| 역량 | 횟수 |
|------|------|
| Multi-file Changes | 23 |
| Good Debugging | 10 |
| Proactive Help | 4 |
| Good Explanations | 2 |

### 성과 달성률

| 결과 | 세션 수 |
|------|--------|
| Fully Achieved | 19 |
| Mostly Achieved | 18 |
| Partially Achieved | 4 |
| Not Achieved | 7 |

> 전체의 77%가 대부분 이상 달성 (Fully + Mostly).

---

## 마찰 분석 (Where Things Go Wrong)

### 마찰 유형 분포

| 유형 | 건수 |
|------|------|
| Wrong Approach | 19 |
| Misunderstood Request | 12 |
| Buggy Code | 10 |
| Excessive Changes | 5 |
| API Error | 4 |
| Tool Limitation | 3 |
| **합계** | **53** |

### 1. 잘못된 접근 및 결정 번복 (19건)

Claude가 잘못된 기술적 접근을 선택하거나 자기 결정을 여러 번 뒤집는 패턴.

- displayName에 대해 잘못된 아키텍처(JWT name claim) 반복 제안 → 세션 폐기
- 테스트 실패를 타임아웃으로 오진 (실제로는 텍스트 불일치/게임 플로우 문제), lint-go 올바른 go build 전처리 찾기까지 여러 번 반복

**대응**: CLAUDE.md에 아키텍처 제약 강화, 잘못된 방향 조기 차단.

### 2. 프로젝트 규약/도구 무시 (12건)

기존 프로젝트 커맨드, 스킬, 에이전트, 선호 도구를 문서화되어 있어도 사용하지 않는 패턴.

- 일일 마감 절차에 기존 커맨드/스킬/에이전트 무시 → 반복 프롬프팅 필요
- MCP push 요청 시 git bash push 사용, 'test MCP push'를 '문서 업데이트 후 push'로 오해

**대응**: CLAUDE.md에 명시적 도구 선호도 및 필수 워크플로우 강화.

### 3. Rate Limit 및 리소스 고갈 (7+ 세션 손실)

API rate limit, 사용량 한도, WSL 메모리, 이미지 크기 제한으로 작업 완전 중단.

- 3개 연속 세션이 rate limit으로 출력 0
- 스크린샷 분석이 이미지 크기 제한으로 완전 차단

**대응**: 작은 요청 배치, 대규모 세션 체크포인트, 파일 크기 사전 검증.

### 도구 에러 분포

| 에러 유형 | 건수 |
|----------|------|
| Command Failed | 81 |
| Other | 67 |
| User Rejected | 17 |
| File Not Found | 14 |
| Edit Failed | 3 |
| File Changed | 2 |

### 추정 만족도

| 수준 | 메시지 수 |
|------|----------|
| Happy | 2 |
| Satisfied | 22 |
| Likely Satisfied | 97 |
| Dissatisfied | 18 |
| Frustrated | 9 |

---

## 제안 사항

### CLAUDE.md 추가 권장

#### 1. Daily Close Procedure

```markdown
## Daily Close Procedure
When asked to do 'daily close', 'end of day', or 'session close', always:
1) Update session logs
2) Update daily/vibe logs
3) Update MEMORY.md
4) Update PLAN.md
5) git add ALL files including test-results
6) Commit and push to ALL remotes.
Never exclude test-results or generated artifacts from commits unless explicitly told to.
```

> 15+ 세션에서 반복된 워크플로우. Claude가 단계 누락, 파일 제외, 기본 마감 절차 프롬프팅 필요.

#### 2. Agent Teams

```markdown
## Agent Teams
This project uses 10+ agent teams (PM, AI Engineer, Designer, QA, Frontend,
Backend, Infra, DevOps, Security, Data). When asked to 'run standup',
'activate all agents', or 'project review with all teams', include ALL
agents -- never omit PM, AI Engineer, or Designer.
```

> 전체 팀 스탠드업/리뷰 시 PM, AI Engineer, Designer 누락 반복.

#### 3. Decision Making

```markdown
## Decision Making
Act autonomously on debugging and fixes -- do not ask the user for direction
when you can diagnose and fix issues yourself. When making architectural
decisions, commit to ONE approach and implement it fully. Do not flip-flop
between approaches.
```

> CI/CD 수정 시 방향 묻기, displayName 아키텍처 결정 번복으로 사용자 불만.

#### 4. Git Operations

```markdown
## Git Operations
- Always include ALL files (including test-results/) in commits unless explicitly excluded
- After committing, always push to ALL configured remotes
- When asked to push, verify the push actually succeeded before reporting done
- Use MCP push when user specifically asks for MCP push, not git bash
```

> 5+ 세션에서 test-results 제외, push 완료 허위 보고, 잘못된 push 방법 사용.

### 시도해볼 기능

#### 1. Custom Skills: `/close`

일일 마감 절차를 스킬로 자동화하여 단계 누락 방지.

```bash
# .claude/skills/close/SKILL.md
# Daily Close Procedure
1. Update session log with summary of work done
2. Update daily log and vibe log
3. Update MEMORY.md with key learnings
4. Update PLAN.md with current status
5. git add -A (include ALL files, especially test-results/)
6. Commit with message: "docs: daily close YYYY-MM-DD - [summary]"
7. Push to ALL configured remotes
8. Confirm all pushes succeeded
```

#### 2. Custom Skills: `/standup`

에이전트 팀 목록을 명시하여 누락 방지.

```bash
# .claude/skills/standup/SKILL.md
# Standup Meeting
Activate ALL agent teams for status reports:
- PM, AI Engineer, Designer, QA, Frontend, Backend, Infra, DevOps, Security, Data
Collect status from each, write scrum log, identify blockers.
Never omit any agent team.
```

#### 3. Hooks: 파일 편집 후 자동 린트

Go/TypeScript 파일 편집 시 자동으로 `go vet` / `tsc --noEmit` 실행.

```json
{
  "hooks": {
    "postToolUse": [
      {
        "matcher": "Edit|Write",
        "command": "if echo $CLAUDE_FILE | grep -q '\\.go$'; then cd $(git rev-parse --show-toplevel) && go vet ./... 2>&1 | head -20; fi"
      },
      {
        "matcher": "Edit|Write",
        "command": "if echo $CLAUDE_FILE | grep -q '\\.ts$'; then cd $(git rev-parse --show-toplevel) && npx tsc --noEmit 2>&1 | head -20; fi"
      }
    ]
  }
}
```

#### 4. Headless Mode: CI/CD 자동화

GitLab CI에 pre-merge 작업으로 자동 린트/테스트 수정.

```yaml
# .gitlab-ci.yml
auto-fix:
  script:
    - claude -p "Fix all lint errors and type errors. Run tests and fix failures." \
      --allowedTools "Edit,Read,Bash,Write" --max-turns 20
```

---

## 사용 패턴 개선 제안

### 1. 세션 컨텍스트 사전 로딩

31/61 마찰 이벤트가 잘못된 접근 또는 요청 오해에서 발생. 세션 시작 시 구조화된 프롬프트로 목표, 제약, 선호 도구를 명시하면 절반으로 줄일 수 있음.

```
Goal: [목표]. Constraints: [X 변경 금지, Y 도구 사용].
Definition of done: [구체적 기준].
Preferred approach: [있다면].
Start by reading CLAUDE.md and PLAN.md for current project context.
```

### 2. 문서화 세션을 마감 워크플로우로 통합

48 세션 중 14개(29%)가 문서화/로깅 세션. `/close`와 `/standup` 스킬로 독립 세션 → 기능 작업 끝 2분 커맨드로 전환 가능.

```
Let's do feature work first, then daily close at the end.
Focus on [specific task]. When I say 'close', run the /close skill.
```

### 3. Rate Limit 복구 전략

4개 세션(8%)이 rate limiting으로 완전 손실. Headless mode 재시도 스크립트로 대응.

---

## 미래 전망 (On the Horizon)

### 1. Self-Healing CI/CD Pipeline Agent

4개 CI/CD 수정 세션 + 파이프라인 실패 반복 디버깅. 자율 에이전트가 파이프라인 모니터링 → 실패 진단 → 수정 적용 → 재트리거하는 루프. gocover-cobertura, lint-go, ArgoCD 싱크 이슈에 소비된 반복 작업 제거.

```
You are an autonomous CI/CD repair agent. Run the GitLab pipeline.
If any stage fails:
1) Read the full error log
2) Identify root cause
3) Apply the fix via Edit/Write
4) Re-run the pipeline
Loop until ALL stages pass or 5 fix cycles. Do not ask for guidance.
When green, commit all fixes with a summary.
```

### 2. Parallel Agent Teams with Guardrails

10+ 에이전트 팀 패턴을 명시적 에이전트 계약, 공유 컨텍스트 파일, 자동 결과 검증으로 진화. 5~7개 병렬 워크스트림이 자기 조율하며 충돌 없이 머지.

```
For each sprint story, spawn a separate Agent:
1) Read CLAUDE.md and PLAN.md first
2) Work only within assigned directory/files
3) Write status to /tmp/agent-status-{story-id}.md
4) Run relevant tests before marking complete
5) Do NOT modify shared configs without checking other agents' status
After all complete, run full E2E suite and report consolidated results.
```

### 3. Test-Driven Autonomous Bug Fixing Loop

80건 실패 → 0건 해결, 153 → 338 E2E 테스트를 fire-and-forget 워크플로우로 전환. 테스트 실행 → 실패 파싱 → 수정 → 재실행 루프.

```
Run full test suite. Parse all failures. Then loop:
1) Pick root-cause failure (not cascade)
2) Read source and test files
3) Fix the issue
4) Re-run only that test to verify
5) Re-run full suite for regressions
Repeat until 0 failures or 10 cycles.
Track: | Cycle | Test Fixed | Root Cause | Files Changed | Remaining |
```

---

## 에피소드

> "10인 에이전트 스탠드업 미팅을 작은 소프트웨어 회사처럼 운영했는데, Claude가 PM, AI Engineer, Designer 초대를 계속 까먹었다"
>
> 전체 프로젝트 리뷰 세션에서 10개 에이전트 팀 전원 소집을 요청했으나, Claude가 계속 에이전트를 빠뜨려서 하나하나 지적해야 했다 -- 필참 회의에 안 나타난 사람을 쫓아다니는 매니저처럼.
