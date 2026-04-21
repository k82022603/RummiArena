---
name: pr-workflow
description: PR 작업 가드레일. branch/commit/push/PR/merge 단계별 사전 합의 + 사용자 통제권 보호.
---

# PR Workflow (PR 작업 가드레일)

> "에이전트가 'PR 까지 갈지, merge 까지 갈지' 를 임의로 결정하면 사용자 통제권이 사라진다."

## Purpose

PR 관련 작업에서 **에이전트의 임의 판단을 차단**하고, 작업 시작 전 **산출 범위를 명시적으로 합의**한다.

**적용 대상**: Frontend Dev, Backend Dev (go-dev, node-dev), DevOps, 그리고 Claude main 의 에이전트 위임 prompt 작성.

**왜 필요한가**: 2026-04-21 사고 — Claude main 이 "merge 는 사용자 직접" 을 임의 default 로 잡아, PR 2건이 생성되었으나 사용자는 merge 까지 갈 의도였음. 사전 합의 부재가 원인.

---

## Phase 0: 사전 합의 (작업 위임 전 필수)

PR 관련 작업 prompt 를 만들기 전에 사용자에게 **다음 4가지를 명시적으로 확인**한다.

### 0.1 산출 범위 (Scope)
| 옵션 | 의미 | 위험도 |
|------|------|--------|
| **L1 — Local only** | 로컬 변경만, commit/push 금지 | 🟢 낮음 |
| **L2 — Commit only** | 로컬 commit, push 금지 | 🟢 낮음 |
| **L3 — Push to branch** | 새/기존 branch push, PR 생성 금지 | 🟡 중간 |
| **L4 — PR draft** | PR 생성 (draft 상태), merge 금지 | 🟡 중간 |
| **L5 — PR ready for review** | PR 생성 + ready 상태, merge 금지 | 🟡 중간 |
| **L6 — Merge included** | merge 까지 완료 (사용자 사전 승인 필수) | 🔴 높음 |

**default 금지** — 사용자가 명시하지 않으면 **물어본다**. "기본은 L4" 같은 추정 금지.

### 0.2 Branch 정책
- 새 branch 인가, 기존 branch 인가
- 새 branch 라면 명명 규칙 (`feat/`, `fix/`, `docs/` 등 — 프로젝트 컨벤션 따름)
- main 직접 변경 금지 (반드시 feature branch)

### 0.3 Merge 권한 (L6 인 경우만)
- 누가 merge 하는가 (사용자 직접 / 에이전트 / CI 자동)
- merge 방식 (merge commit / squash / rebase)
- 충돌 발생 시 처리 (사용자 호출 / 에이전트 자동 해결 시도)

### 0.4 사후 정리
- 변경된 파일 목록 보고 형식 (terse / detailed)
- 외부 시스템 변경 (PR 생성/comment/merge) 시 작업 전후 상태 보고 의무
- branch 정리 (merge 후 delete 여부)

---

## Phase 1: 작업 실행

### 1.1 변경 파악
- `git status --short` + `git diff --stat` 로 현재 상태 보고
- 의도한 변경 외 미스테리한 파일이 staged / modified 면 사용자 확인 후 진행

### 1.2 Branch 작업 (L3 이상)
- 현재 branch 확인 (`git branch --show-current`)
- main / master 면 새 branch 로 checkout
- branch 이름은 Phase 0.2 합의 따름

### 1.3 Commit
- 의미 있는 단위로 분리 (한 commit = 한 의도)
- WIP commit / 빈 commit 금지
- 메시지: 프로젝트 컨벤션 따름 (RummiArena 는 한글 OK, type prefix 권장)
- **never use** `--no-verify` / `--no-gpg-sign` (사용자 명시 요청 없는 한)

### 1.4 Push (L3 이상만)
- 새 branch: `git push -u origin <branch>`
- 기존 branch: `git push` (force push 금지, 사용자 명시 요청 없는 한)
- 작업 전: "push 합니다" 1줄 보고
- 작업 후: 결과 1줄 보고 (성공 / 실패)

### 1.5 PR 생성 (L4 이상만)
- 기존 PR 활용 가능한지 먼저 확인 (`gh pr list --head <branch>`)
- 새 PR: `gh pr create --title "..." --body "$(cat <<'EOF'...EOF)"`
- title 70자 이하, body 에 Summary + Test plan + 외부 영향 명시
- Draft 옵션 (Phase 0.1 L4) 시 `--draft` 플래그

### 1.6 Merge (L6 만)
- **사전 합의 없이 절대 금지**
- merge 전 CI/test 통과 확인
- main/master 직접 force push 금지
- 충돌 시 즉시 사용자 호출

---

## Phase 2: 사후 보고 (필수)

### 2.1 산출 보고 형식
```
## PR 작업 결과
- **Scope**: L4 (PR draft)
- **Branch**: feat/xyz (신규)
- **Commits**: 2개 (해시 / 제목 1줄)
- **PR**: #42 OPEN — URL
- **외부 변경**: PR 생성 1건 (작업 전 0개 → 작업 후 1개)
- **다음 단계**: 사용자 review 대기 (merge 권한 = 사용자)
```

### 2.2 합의 위반 시
- 합의 범위 (예: L4) 를 초과한 작업 (예: merge) 을 했다면 **즉시 사용자에게 보고 + 가능하면 rollback**
- 정당화 금지 — "내 판단으로는 그게 맞아서" 같은 변명 금지

---

## Anti-patterns (금지 사항)

### ❌ 임의 default 적용
- "merge 는 위험하니 PR draft 까지만" — 사용자 의도 모르고 결정 금지
- "branch 이름은 적당히" — 컨벤션 따르거나 사용자 확인

### ❌ 정당화된 임의 결정
- "안전을 위해 push 만 했습니다" — Phase 0 합의 없이 결정 금지

### ❌ 대화 단절
- 작업 중 의문 발생 시 침묵하고 추정 금지. 즉시 사용자에게 옵션 제시.

### ❌ Force push / amend / no-verify
- 사용자 명시 요청 없으면 **금지** (특히 published commit, main branch)

---

## Examples

### Good
> 사용자: "PR 5 E2E 테스트 작성해줘"
> 에이전트: "Phase 0 확인합니다. (1) 산출 범위 L1~L6 어디까지? (2) 새 branch 명명 규칙? (3) merge 권한? (4) 사후 보고 terse/detailed?"
> 사용자: "L6 까지, branch `feat/pr5-e2e`, 에이전트 merge OK, terse 보고"
> 에이전트: [작업 후] "L6 완료. PR #34 생성 → CI PASS → squash merge → branch delete. 외부 변경 4건."

### Bad
> 사용자: "PR 5 E2E 테스트 작성해줘"
> 에이전트: [임의로 L4 적용, PR draft 만 생성, merge 안 함]
> 사용자: "내가 직접 merge 까지 해야 하는 상황인가요?" ← 신뢰 손상

---

## Trigger

다음 키워드/문맥에서 본 SKILL 자동 적용:
- "PR 만들어", "PR 진행", "PR 올려"
- "merge 해줘", "머지"
- "branch 파서", "branch 만들어"
- "push 해줘"
- 에이전트 prompt 안에 PR/branch/merge 동작이 포함될 때

---

## 추천 보완 SKILL

본 SKILL 은 **사전 합의 + 가드레일** 에 집중. 다음 보완 SKILL 과 함께 사용:

| 보완 SKILL | 용도 |
|------------|------|
| `tools:pr-enhance` (글로벌) | PR 본문 품질 개선 (description, test plan 작성) |
| `review` (글로벌) | 작성된 PR 의 코드 리뷰 |
| `security-review` (글로벌) | PR 변경분 보안 점검 |
| `workflows:full-review` (글로벌) | 종합 리뷰 워크플로우 (코드 + 보안 + 디자인) |

---

## Phase 3: PR 후속 정리 (사용자 수동 스크립트)

Merge 후 로컬·원격 정리는 사용자가 직접 수동 실행한다. 자동화(remote cron·hook) 는 구현 비용 대비 실효성 낮아 보류.

### 스크립트

**경로**: `scripts/check-merged-pr.sh`

**사용법**:
```bash
# 실행 권한 1회만 필요
chmod +x scripts/check-merged-pr.sh

# 실제 정리 실행
./scripts/check-merged-pr.sh

# 삭제 없이 현재 상태만 확인 (dry-run)
./scripts/check-merged-pr.sh --dry-run
```

**동작 순서 (4단계)**:

1. `git fetch --all --prune` — 원격 상태 동기화
2. 로컬 branch 순회:
   - 내가 만든 PR (gh api user 기반 author) 중 **merged 상태**인 branch 감지
   - 해당 branch checkout 중이면 main 으로 먼저 전환
   - 로컬 삭제 (`git branch -D`)
   - 원격 삭제 (`git push origin --delete`, 이미 없으면 무시)
3. `main` 으로 checkout + `git pull --ff-only origin main`
4. 현재 내 열린 PR 목록 출력 (번호·제목·URL·리뷰 상태·생성일)

**예시 출력**:
```
===============================================
 PR Status Check — 2026-04-21 19:33:22
 User: k82022603
===============================================
[1/4] git fetch --all --prune
  ✓ 완료
[2/4] 로컬 branch 중 merged 탐지
  ✓ chore/day11-wrap-up — PR #35 merged
    → 로컬 삭제
    → 원격 삭제
  · feat/sprint7-closestcenter — 작업 중 (merged PR 없음)
[3/4] main 동기화
  ✓ main pull --ff-only 완료
[4/4] 현재 열린 PR (author=k82022603)
  #42 [fix/day12-p01-persistence] 게임 영속저장 복구
    https://github.com/.../pull/42
    review: APPROVED, 생성: 2026-04-22
===============================================
 요약: merged 정리 1 개 / 열린 PR 1 개
===============================================
```

### 언제 실행하는가

- 사용자가 GitHub 웹에서 PR 을 merge 한 직후
- 새 세션 시작해서 main 최신화 하고 싶을 때
- 로컬에 오래된 branch 잔재 정리하고 싶을 때

### Claude 메인 세션 연동

사용자가 PR merge 를 한 뒤 Claude 에게 "정리해줘" / "체크" 같은 요청 시:
- Claude 가 `./scripts/check-merged-pr.sh` 실행
- 결과를 사용자에게 보고
- 이미 정리된 상태면 "정리할 것 없음" 출력

### 제약

- **PC 켜져 있을 때만 감지 의미** — 사용자가 수동 실행하므로 당연
- **remote cron 자동화는 최소 주기 1시간이라 실효성 낮음** — 수동 스크립트가 더 빠름
- 다중 사용자 프로젝트 (k82022603 외 contributor) 에서는 author 필터 확장 필요

---

## 변경 이력

- **2026-04-21 v1.0**: 최초 작성. PR #33/#34 사고 (사용자 통제권 누락) 반영.
- **2026-04-21 v1.1**: Phase 3 추가. `scripts/check-merged-pr.sh` 수동 스크립트 기반 후속 정리 문서화. remote cron 자동화 (1시간 최소 주기) 는 실효성 낮아 보류.
