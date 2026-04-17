# Agent Model Change Checklist (에이전트 모델 변경 체크리스트)

> "한 곳만 고치면 SSOT 가 깨진다. 두 곳을 동시에 고쳐야 SSOT 다."

## Purpose

`.claude/agents/*-agent.md` 의 `model:` 필드와 `CLAUDE.md` §Agent Model Policy 는
**같은 사실을 가리키는 두 개의 기록** 이다. 한쪽만 수정하면 SSOT 가 즉시 깨진다.

이 체크리스트는 에이전트 모델 변경 요청이 들어왔을 때 **두 지점의 동기화**를
누락 없이 검증할 수 있도록 순서와 검증 명령을 고정한다.

**적용 대상**: `.claude/agents/*-agent.md` 의 `model:` 필드를 변경하는 모든 작업
(단일 에이전트 변경, 복수 에이전트 일괄 변경 공통 적용)

**호출 관계**: 본 문서는 `SKILL.md` §예외 §에이전트 모델 변경 에서 참조된다.

---

## SSOT 지점 (두 곳)

| # | 위치 | 역할 |
|---|------|------|
| 1 | `.claude/agents/{name}-agent.md` frontmatter `model:` | 런타임 에이전트 구동에 실제로 사용되는 값 |
| 2 | `CLAUDE.md` §Agent Model Policy (표 + 이력) | 인간이 읽는 정책·근거 기록 |

두 값이 **반드시** 일치해야 한다. 불일치 시 에이전트는 실제 (1) 대로 구동되지만
문서(2)는 거짓말을 하게 되어, 향후 담당자가 잘못된 판단을 내린다.

---

## Phase 0: 사전 확인 (변경 직전)

- [ ] **현재 상태 스냅샷**: 아래 명령으로 변경 전 상태를 기록한다
  ```bash
  cd <repo-root>
  grep -E "^model:" .claude/agents/*-agent.md
  ```
- [ ] **변경 요청 범위 확정**: 어떤 에이전트(들)가 어떤 모델로 바뀌는지 명확히
  - 대상 에이전트 목록: ________________
  - 이전 모델(prev): ________________
  - 새 모델(new): ________________
  - 변경 사유(reason, 한 줄): ________________

---

## Phase 1: `.claude/agents/*-agent.md` 수정

각 대상 에이전트마다 아래를 수행한다.

- [ ] **(1-1)** `model:` 값을 새 모델로 교체
- [ ] **(1-2)** `model:` 라인 옆 주석에 이력 체인 **추가**(기존 주석 덮어쓰지 말고 뒤에 이어붙이기)
  - **주석 형식**: `# YYYY-MM-DD: {prev} → {new} ({사유})`
  - **기존 이력 보존**: 이전 주석이 있으면 콤마로 이어 붙여 체인을 유지한다
  - **예시**:
    ```yaml
    # 기존
    model: opus  # 2026-03-30 sonnet → opus

    # 변경 후 (체인 유지)
    model: claude-sonnet-4-6  # 2026-03-30 sonnet → opus, 2026-04-17 opus → sonnet-4-6 (구현 중심 작업, 비용 최적화)
    ```
- [ ] **(1-3)** 에이전트가 여러 개인 경우 **전원** 수정했는지 파일별로 체크
  - designer, devops, frontend-dev, go-dev, node-dev 처럼 그룹 일괄 변경 시 누락 잦음

---

## Phase 2: `CLAUDE.md` §Agent Model Policy 수정

- [ ] **(2-1)** 표의 `에이전트` 열을 실제 상태와 일치시킨다
  - "구현·설정" 행에 추가된 에이전트는 "추론·전략" 행에서 **제거**되어야 함 (한 에이전트가 양쪽에 있으면 오류)
  - 한 에이전트가 어느 행에도 없는 상태를 만들지 말 것
- [ ] **(2-2)** `## Agent Model Policy` 헤더 옆의 `(YYYY-MM-DD 갱신)` 날짜를 변경일로 업데이트
- [ ] **(2-3)** `### 이력` 섹션에 새 항목을 **추가**(기존 항목 삭제 금지)
  - **형식**: `- **YYYY-MM-DD**: {대상 에이전트} {prev} → {new} ({사유})`
  - **예시**: `- **2026-04-17**: 구현 중심 5개 에이전트 opus → claude-sonnet-4-6 다운시프트. 추론/전략 5개 에이전트 + 메인 세션은 **Opus 4.7 xhigh** 로 명시`
- [ ] **(2-4)** 변경으로 인해 "운영 원칙" 섹션의 규칙이 바뀌어야 하는지 확인 (보통 불필요, 원칙 자체가 바뀔 때만)

---

## Phase 3: 교차 검증 (Grep-based Verification)

Phase 1~2 완료 직후 반드시 수행. **눈으로 훑지 말고 명령으로 검증**한다.

- [ ] **(3-1)** 모든 에이전트의 현재 model 값 확인
  ```bash
  grep -E "^model:" .claude/agents/*-agent.md
  ```
  - 출력에서 에이전트별 모델 값을 CLAUDE.md 표와 **한 줄씩 대조**
- [ ] **(3-2)** 각 모델별 에이전트 수 집계
  ```bash
  grep -E "^model:" .claude/agents/*-agent.md | awk '{print $2}' | sort | uniq -c
  ```
  - 예상: 표의 "구현·설정" 행 에이전트 수 = `claude-sonnet-4-6` 카운트
  - 예상: 표의 "추론·전략" 행 에이전트 수 = `opus` 카운트
- [ ] **(3-3)** CLAUDE.md 표의 에이전트 목록 = `.claude/agents/*-agent.md` 실제 파일 집합
  ```bash
  ls .claude/agents/*-agent.md | sed 's#.*/\(.*\)-agent.md#\1#' | sort
  ```
  - 위 목록 전원이 CLAUDE.md 표 어딘가에 등장하는지 확인 (메인 세션 제외)
- [ ] **(3-4)** 주석 체인 형식 검증
  ```bash
  grep -E "^model:.*→" .claude/agents/*-agent.md
  ```
  - 이력이 있는 에이전트의 주석이 `YYYY-MM-DD prev → new` 형식을 지키는지 육안 확인
- [ ] **(3-5)** 표기 일관성: `opus` vs `Opus 4.7 xhigh` 불일치 점검
  - frontmatter 는 내부적으로 `opus` 로 표기 (Claude Code 런타임 식별자)
  - CLAUDE.md 본문은 사용자에게 **Opus 4.7 xhigh** 라고 노출 (Extended Thinking High budget 명시)
  - **이 차이는 의도된 것**이며, frontmatter 에 `Opus 4.7 xhigh` 로 쓰면 런타임이 파싱하지 못한다

---

## Phase 4: 이력 기록 (변경 직후 당일)

- [ ] **(4-1)** 오늘의 스크럼 로그(`work_logs/scrums/YYYY-MM-DD.md`) 또는 일일 로그(`work_logs/daily/`) 에 변경 사실을 한 줄 기재
  - **형식**: `- 에이전트 모델 변경: {대상} {prev} → {new} ({사유})`
- [ ] **(4-2)** git commit 메시지에 변경 에이전트 이름 명시
  - **형식 예시**: `chore(agents): {에이전트 목록} model → {new} (사유)`
- [ ] **(4-3)** 다음 작업 세션에서 해당 에이전트를 호출할 때, 체감 품질 변화를 관찰 가능한 시점에 한 번 돌아보기 (선택)

---

## 흔한 실수 패턴

| 증상 | 원인 | 방지책 |
|------|------|--------|
| frontmatter 만 수정, CLAUDE.md 표가 옛날 상태 | "고치고 나서 문서화는 나중에" 라는 생각 | Phase 1 + 2 를 **한 커밋**으로 묶는다 |
| 주석을 덮어써서 이전 이력 소실 | `replace_all` 로 `# 2026-03-30 ...` 를 `# 2026-04-17 ...` 로 단순 치환 | 기존 주석 뒤에 **콤마로 이어붙여** 체인 유지 |
| 표의 에이전트 목록이 양쪽 행에 중복 존재 | 한 행에 추가하고 원래 행에서 제거를 빼먹음 | Phase 2 `(2-1)` 에서 "추가=제거" 동시 확인 |
| 에이전트 1명만 수정, 실제는 그룹 일괄 변경 | 대상 목록을 사전에 확정 안 함 | Phase 0 에서 대상 명시 + Phase 3 `(3-2)` 카운트 검증 |
| `opus` → `Opus 4.7 xhigh` frontmatter 에 잘못 기입 | 본문 표기와 frontmatter 표기 혼동 | Phase 3 `(3-5)` 경고 내재화 |

---

## 변경 FAQ

**Q. 한 에이전트만 바꿀 때도 이 체크리스트 전부 적용해야 하나?**
A. 예. 한 에이전트만 바뀌어도 CLAUDE.md 표·이력 동기화는 동일하게 필요하다.
Phase 0~4 전체가 한 에이전트 변경에도 유효하다.

**Q. 에이전트 파일을 새로 추가하거나 삭제할 때는?**
A. 이 체크리스트는 **기존 에이전트의 model 변경** 에 한정된다. 에이전트 추가/삭제는
CLAUDE.md 표 구조와 `Agent Execution Policy` 섹션 전반에 영향을 주므로
별도 절차(추후 필요 시 본 디렉터리에 `agent-lifecycle-checklist.md` 로 추가)가 필요하다.

**Q. 모델 값 오타 (예: `claude-sonnet-4-6` → `claude-sonnet-4.6`) 수정도 이 절차를 따라야 하나?**
A. 주석의 "이력 체인" 은 불필요(사유가 동일 모델 오타 수정이므로). 단 Phase 3
교차 검증은 해야 한다. 주석에는 `# YYYY-MM-DD: typo fix` 한 줄로 충분.

---

## 최근 적용 이력

- **2026-04-17**: 구현 중심 5개 에이전트 (go-dev, node-dev, frontend-dev, devops, designer)
  `opus` → `claude-sonnet-4-6` 일괄 다운시프트. 본 체크리스트 신설 계기.
- **2026-03-30**: 전 에이전트 `sonnet` → `opus` 일괄 승격 (체크리스트 수립 전).
