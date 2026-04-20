# PR 운영 가이드 (PR Workflow Operations Guide)

> RummiArena 프로젝트의 PR 생성 → 리뷰 → merge 전 과정의 표준 절차와 관련 SKILLS.

- **작성일**: 2026-04-21
- **작성 배경**: PR #33/#34 사고 (Claude main 이 merge 정책을 임의 default 로 결정 → 사용자 통제권 박탈) 재발 방지
- **적용 대상**: Claude main, Frontend Dev / Backend Dev / DevOps 에이전트, 사용자 (애벌레)

---

## 1. 전체 흐름

```mermaid
flowchart LR
    A["사용자 위임\n(기능/수정 요청)"] --> B["Phase 0\n사전 합의 (L1~L6)"]
    B --> C["에이전트 작업\n(branch/commit/push)"]
    C --> D["PR 생성 (L4+)"]
    D --> E["보조 SKILL\n(pr-enhance/review/\nsecurity-review)"]
    E --> F{"merge 권한?"}
    F -->|사용자 직접| G["GitHub UI\nmerge"]
    F -->|에이전트 위임 (L6)| H["gh pr merge\n(에이전트)"]
    G --> I["branch 정리\n(delete)"]
    H --> I
```

---

## 2. 산출 범위 (Scope Levels)

**모든 PR 작업은 시작 전 L1~L6 중 하나로 합의**해야 한다. default 금지.

| Level | 의미 | 범위 | 위험도 |
|-------|------|------|--------|
| **L1** | Local only | 파일 수정만, commit 없음 | 🟢 낮음 |
| **L2** | Commit only | 로컬 commit, push 없음 | 🟢 낮음 |
| **L3** | Push to branch | 새/기존 branch push, PR 없음 | 🟡 중간 |
| **L4** | PR draft | PR 생성 (draft 상태), merge 없음 | 🟡 중간 |
| **L5** | PR ready | PR 생성 (ready for review), merge 없음 | 🟡 중간 |
| **L6** | Merge 포함 | merge 완료 (사용자 사전 승인 필수) | 🔴 높음 |

### 합의 템플릿 (사용자 위임 시)
```
사용자: "PR 5 E2E 테스트 작성해줘, L5 까지, branch feat/pr5-e2e, terse 보고"
```
또는 에이전트가 묻기:
```
에이전트: "Phase 0 확인합니다.
  (1) Scope (L1~L6)?
  (2) Branch 명명?
  (3) merge 권한 (사용자/에이전트)?
  (4) 보고 형식 (terse/detailed)?"
```

---

## 3. GitHub 웹 UI 로 직접 merge 하기 (사용자용)

### 3.1 PR 페이지 열기
각 PR 링크로 이동:
- 형식: `https://github.com/<owner>/<repo>/pull/<number>`
- CLI 로 확인: `gh pr view <number> --json url | jq -r .url`

### 3.2 상태 확인
PR 페이지 상단에서 다음을 확인:
- **Conversation / Files changed / Commits / Checks** 탭
- **mergeable 배지**:
  - ✅ `This branch has no conflicts with the base branch` (CLEAN / MERGEABLE)
  - ⚠️ `This branch has conflicts that must be resolved` → 해결 후 재시도
  - ⏳ `Checking...` → 몇 초 대기

### 3.3 변경 검토
1. **`Files changed` 탭** 클릭
2. 변경 라인별로 `+` / `-` 확인
3. 의문점이 있으면 해당 라인에 인라인 코멘트 (선택)
4. **`Conversation` 탭** 으로 복귀

### 3.4 Merge 실행
페이지 하단 스크롤 → 초록 **`Merge pull request`** 버튼:

| Merge 방식 | 언제 쓰나 | 결과 |
|-----------|----------|------|
| **Create a merge commit** (기본) | 여러 커밋 히스토리 보존 필요 | main 에 merge commit 1개 추가, 개별 커밋 보존 |
| **Squash and merge** ⭐ | 작은 PR, 히스토리 깔끔 원함 | 여러 커밋을 1개로 압축하여 main 에 추가 |
| **Rebase and merge** | 개별 커밋을 깔끔히 main 에 얹기 | merge commit 없이 개별 커밋 append |

**RummiArena 권장**: **Squash and merge** (작은 PR 기준)

### 3.5 Confirm
1. 드롭다운으로 merge 방식 선택
2. commit message 편집 (필요 시)
3. **`Confirm squash and merge`** (또는 선택한 방식) 클릭

### 3.6 Branch 정리
merge 성공 후 **`Delete branch`** 버튼이 나타남 → 클릭하여 feature branch 제거.

로컬에서도 정리:
```bash
git checkout main
git pull origin main
git branch -d <feature-branch>      # merged 면 정상 삭제
# git branch -D <feature-branch>    # force 삭제 (주의)
```

---

## 4. CLI 로 merge 하기 (에이전트 위임 / L6)

사용자가 L6 (에이전트 merge 권한) 를 사전 승인한 경우만 사용.

```bash
# squash merge + branch 삭제
gh pr merge <number> --squash --delete-branch

# merge commit + branch 삭제
gh pr merge <number> --merge --delete-branch

# rebase + branch 삭제
gh pr merge <number> --rebase --delete-branch
```

**주의**:
- `--auto` 플래그는 **CI 통과 대기 후 자동 merge** — 일반적으로 쓰지 않음
- `--admin` 플래그는 **필수 체크 우회** — 금지
- `main` / `master` 에 직접 force push 금지

---

## 5. 관련 SKILLS

### 5.1 프로젝트 SKILL (신규, 2026-04-21)

#### `pr-workflow` — PR 작업 가드레일
- **경로**: `.claude/skills/pr-workflow/SKILL.md`
- **역할**: Phase 0 사전 합의 + 단계별 가드레일 + 합의 위반 시 즉시 보고
- **Trigger**: "PR 만들어", "PR 진행", "merge 해줘", "branch 파서", "push 해줘"
- **핵심**: 산출 범위 L1~L6 명시 없이 작업 거부

**Phase 구조**:
| Phase | 내용 |
|-------|------|
| Phase 0 | 사전 합의 (Scope / Branch / Merge 권한 / 사후 보고) |
| Phase 1 | 작업 실행 (변경 파악 → branch → commit → push → PR 생성 → merge) |
| Phase 2 | 사후 보고 (산출 범위 / commits / PR URL / 외부 변경 보고) |

### 5.2 글로벌 SKILL (기존, 보조 활용)

| SKILL | 용도 | 사용 시점 |
|-------|------|----------|
| **`tools:pr-enhance`** | PR 본문 품질 개선 (description, test plan 작성) | PR 생성 직후 |
| **`review`** | 작성된 PR 의 코드 리뷰 | merge 전 |
| **`security-review`** | PR 변경분 보안 점검 (secret / injection / auth) | 외부 공개 전 / 민감 영역 변경 |
| **`workflows:full-review`** | 종합 리뷰 (코드 + 보안 + 디자인) | 큰 PR / 릴리스 전 |

### 5.3 SKILL 조합 시나리오

#### 시나리오 A — 작은 PR (컴포넌트 추가)
```
Phase 0 합의 (L5)
  ↓
pr-workflow Phase 1~2
  ↓
tools:pr-enhance (본문 품질)
  ↓
사용자 직접 merge (GitHub UI, squash)
```

#### 시나리오 B — 보안 민감 PR (auth 변경)
```
Phase 0 합의 (L4 draft)
  ↓
pr-workflow Phase 1~2
  ↓
security-review (민감 영역 점검)
  ↓
review (일반 코드 리뷰)
  ↓
사용자 직접 merge
```

#### 시나리오 C — 대형 리팩터 (multi-file)
```
Phase 0 합의 (L5)
  ↓
pr-workflow Phase 1~2
  ↓
workflows:full-review (종합)
  ↓
사용자 직접 merge
```

---

## 6. 사용자 vs 에이전트 merge 의사결정 매트릭스

| 영역 | 사용자 직접 merge 권장 | 에이전트 위임 (L6) 권장 |
|------|----------------------|----------------------|
| 프로덕션 배포 트리거 | ✅ | ❌ |
| main / master 브랜치 | ✅ | ❌ |
| Helm / K8s / Infra 변경 | ✅ | ❌ (DevOps 검토 필수) |
| DB 마이그레이션 | ✅ | ❌ |
| auth / OAuth / secret 변경 | ✅ | ❌ |
| UI 컴포넌트 추가/수정 | 둘 다 가능 | ✅ (CI 통과 + 테스트 확증 시) |
| 문서 / README / 주석 | 둘 다 가능 | ✅ |
| E2E / 단위 테스트 추가 | 둘 다 가능 | ✅ |
| dependency 업데이트 | ✅ (보안 검토) | ❌ |

> **default 원칙**: 모호하면 **사용자 직접 merge**. 에이전트 merge 는 명시적 사전 승인 (L6) 있을 때만.

---

## 7. Anti-patterns (금지 사항)

### ❌ 임의 default 적용
```
사용자: "PR 만들어"
에이전트: [임의로 "merge 는 사용자 직접" default 적용, 묻지 않음]
```
→ **올바른 대응**: Phase 0 4가지 질문 후 진행.

### ❌ 정당화된 임의 결정
```
에이전트: "안전을 위해 PR draft 까지만 만들었습니다"
```
→ **문제**: "안전" 은 사용자 의사결정 권리 침해의 명분. default 박기 전에 묻는다.

### ❌ Force push / amend / no-verify
- `git push --force` (사용자 명시 요청 없는 한)
- `git commit --amend` (published commit 에 대해)
- `git commit --no-verify` / `--no-gpg-sign`
- `gh pr merge --admin` (필수 체크 우회)

### ❌ main / master 직접 commit
- 반드시 feature branch → PR → merge 경로

### ❌ CI 실패 상태에서 merge
- `mergeStateStatus` 가 CLEAN 이 아니면 확인 후 진행
- 실패 원인을 `gh pr checks <num>` 로 확인

---

## 8. 체크리스트

### 8.1 에이전트 (Phase 0 합의 전)
- [ ] 사용자 위임 문장에서 L1~L6 명시 확인
- [ ] branch 컨벤션 확인 (기존 / 신규)
- [ ] merge 권한 확인 (사용자 / 에이전트)
- [ ] 보고 형식 확인 (terse / detailed)
- [ ] 4가지 중 하나라도 모호하면 **묻기**

### 8.2 에이전트 (Phase 1 실행 중)
- [ ] `git status` 로 현재 상태 1줄 보고
- [ ] 새 branch 면 명명 규칙 확인 후 checkout
- [ ] 의미 있는 단위로 commit 분리
- [ ] `--no-verify` / `--amend` / `--force` 미사용
- [ ] push 전후 상태 1줄씩 보고 (L3+)
- [ ] PR 생성 시 title 70자 이하, body 에 Summary + Test plan

### 8.3 사용자 (merge 전)
- [ ] `Files changed` 탭에서 변경 검토
- [ ] `mergeStateStatus: CLEAN` 확인
- [ ] CI (Checks 탭) 통과 확인
- [ ] merge 방식 선택 (Squash / Merge commit / Rebase)
- [ ] merge 후 `Delete branch` 클릭
- [ ] 로컬에서 `git pull` + `git branch -d` 로 정리

### 8.4 사용자 (merge 후)
- [ ] main 빌드 확인 (CI 그린 유지)
- [ ] 후속 PR 있으면 rebase 필요 검토
- [ ] 관련 이슈 close 또는 링크

---

## 9. RummiArena 실사례

### 9.1 사례 A — PR #34 RoundHistoryTable E2E (L5 → 사용자 merge)
**타임라인 (2026-04-20)**

| 시각 | 주체 | 액션 | 비고 |
|------|------|------|------|
| Day 11 위임 | 애벌레 | "PR 5 E2E 테스트 작성해줘" | Phase 0 미합의 ❌ |
| 작업 | Frontend Dev + QA | branch `feat/pr5-round-history-table-e2e` → commit `596704b` → PR 생성 | E2E 10/10 PASS |
| 사고 | Claude main | prompt 에 "merge 금지" 임의 default | **사고 지점** |
| 08:34:56 | 애벌레 | GitHub UI 에서 **Squash and merge** 클릭 | merge commit `fc6bedd` |
| — | — | branch 자동 삭제 | — |

- **결과**: ✅ 정상 merge. 10개 테스트 케이스 (TC-DASH-RH-001~010) main 반영
- **교훈**: Phase 0 미합의가 사용자에게 추가 클릭 부담 전가 — 사용자 반응 "내가 직접 PR하고 MERGE까지 해야하는 상황인가요?"

### 9.2 사례 B — PR #33 ModelCardGrid (사고 → 리뷰 → 패치 → merge → 배포)
**타임라인 (2026-04-20, 전체 체인)**

| 단계 | 시각 | 주체 | 액션 | 커밋/PR |
|------|------|------|------|---------|
| ① 초기 위임 | Day 11 | 애벌레 | "PR 4 마감" | Phase 0 미합의 ❌ |
| ② 1차 작업 | — | Frontend Dev | 잔여 10% (5항목) 완성 + branch `feat/pr4-model-card-grid-complete` push + PR #33 생성 | commit `4d09b44` |
| ③ 리뷰 | — | Designer | PR #33 에 코멘트 (`#issuecomment-4278416333`) — 3항목 검토 (OK 1 / 조정 권장 2) | — |
| ④ 리뷰 확인 | — | 애벌레 | GitHub Web UI 에서 Designer 코멘트 확인 | "조정 권장 2건 있는데 merge 하면?" 질문 |
| ⑤ 의사결정 | — | 애벌레 + Claude main | **옵션 B 선택** (merge 전 패치 → push → 사용자 merge) | — |
| ⑥ 2차 위임 | — | 애벌레 | "Frontend Dev 위임. Designer 권장 2건 적용 후 push" | **Phase 0 명시** ✅ |
| ⑦ 패치 | — | Frontend Dev | 같은 branch 에 `w-64`→`w-72`, `opacity-40 grayscale`→`opacity-50` 단독 | commit `f5a74de` |
| ⑧ PR 갱신 | — | — | PR #33 자동 업데이트 (코멘트 `#issuecomment-4279087289`) | — |
| ⑨ Merge | 08:38:13 | 애벌레 | GitHub UI 에서 **Squash and merge** 클릭 | main 반영 |
| ⑩ 빌드 | — | DevOps | `docker build -t rummiarena/admin:main-fc6bedd -f src/admin/Dockerfile .` | 3.8s (멀티스테이지 캐시 히트) |
| ⑪ 배포 | — | DevOps | `kubectl set image deployment/admin -n rummikub admin=rummiarena/admin:main-fc6bedd` + `kubectl rollout status` | 1/1 Ready, Restarts 0 |
| ⑫ 검증 | — | DevOps | `curl http://localhost:30001/tournament` → HTTP 200 | 사용자 육안 확인 대기 |

- **최종 결과**: ✅ main 에 5항목 + Designer 패치 + K8s 배포 + 엔드포인트 도달까지 한 번에
- **Phase 0 합의 효과** (⑥ 이후): 동일 패턴 사고 없이 2차 작업 완결

### 9.3 사례 B 의 Phase 0 합의 (실제 텍스트)
⑥ 단계에서 사용자가 보낸 명령:
```
Frontend Dev 위임. PR #33 branch feat/pr4-model-card-grid-complete 에
Designer 권장 2건 적용 후 push.
```

에이전트 prompt 내 Phase 0 확정 표기:
```yaml
Scope: L3 (push only, merge 금지)
Branch: feat/pr4-model-card-grid-complete (기존)
Merge 권한: 사용자 직접 (에이전트 금지)
보고: terse
```

에이전트 사후 보고 (terse 형식):
```
Scope: L3 (push only)
Branch: feat/pr4-model-card-grid-complete
Commit: f5a74de / style(admin/dashboard): PR #33 Designer 권장 반영 — 모바일 w-72 / 비활성 opacity-50
Push: 성공 (4d09b44..f5a74de)
변경 파일: src/admin/src/components/tournament/ModelCardGrid.tsx (+2 -2)
  - L373: opacity-40 grayscale → opacity-50
  - L523: w-64 → w-72
빌드: exit 0 (Next.js 16.1.6, TS 에러 0)
E2E 영향: 없음 (TC-DASH-MC-001~007 전부 data-testid/aria-* 기반)
다음 단계: 사용자 GitHub UI Merge 버튼 클릭
```

### 9.4 사례 B 의 DevOps Phase 0 (빌드/배포)
⑩~⑫ 단계에서 사용자가 보낸 명령:
```
오늘 빌드/배포까지 완료해주세요.
```

Claude main 이 DevOps 에게 넘긴 Phase 0:
```yaml
Scope: 이미지 빌드 + K8s rollout (Docker Desktop K8s, rummikub namespace)
대상: admin 서비스 only (game-server/ai-adapter/frontend 건드리지 말 것)
롤백 계획: 실패 시 이전 태그 rummiarena/admin:pr5-e2e 로 역전 가능
외부 영향: 로컬 K8s 단독 (프로덕션 없음), 이미지 레지스트리 push skip
```

DevOps 사후 보고:
```
main HEAD: fc6bedd
이미지: rummiarena/admin:main-fc6bedd (77.3 MB, 3.8s)
Deployment: admin (1/1 Ready, Restarts 0, Pod admin-598d6894f9-8s2n6)
이전 이미지: rummiarena/admin:pr5-e2e → 교체 완료
Endpoint /: HTTP 200 / /tournament: HTTP 200
비정상 Pod: 0
```

### 9.5 교훈 정리

| # | 교훈 | 적용 |
|---|------|------|
| 1 | Phase 0 합의 없이는 에이전트 임의 default 가 사용자에게 클릭 부담 전가 | `pr-workflow` SKILL Phase 0 의무화 |
| 2 | 리뷰 코멘트 ≠ 코드 반영 — merge 전 "조정 권장" 확인은 사용자 몫 | 체크리스트 §8.3 |
| 3 | "merge 전 패치 → 같은 branch push → 사용자 merge" 는 안전한 2단계 패턴 | 사례 9.2 템플릿으로 재사용 |
| 4 | merge 후 **이미지 빌드 + K8s rollout + endpoint 검증** 을 한 체인으로 묶는 게 "오늘 배포 완료" 의 실체 | 사례 9.4 템플릿 |
| 5 | UI 수정 PR 이라도 E2E selector 영향 여부 사전 검증 필요 (CSS class 직접 참조 시 깨짐) | `data-testid` / `aria-*` 기반 selector 권장 |

### 9.6 다음 작업을 위한 재사용 템플릿 (Phase 0 합의 텍스트)

**Case — UI 수정 L3 + 사용자 merge + 배포**:
```
[에이전트명] 위임. PR #<num> branch <branch-name> 에 <변경사항> 적용 후 push.
Scope L3 (push only, merge 금지). Commit 1개로. 보고 terse.
이후 사용자 GitHub UI merge → 다음 메시지로 DevOps 배포 위임 예정.
```

**Case — 빌드/배포 L6**:
```
DevOps 위임. main HEAD 기준 <service> 빌드 + K8s rummikub ns rollout + endpoint 검증.
Scope L6 (이미지 빌드 → Deployment 업데이트 → curl 검증). 롤백 태그 <previous-tag>.
다른 서비스 건드리지 말 것. 보고 terse.
```

---

## 10. 참고 / 링크

- `pr-workflow` SKILL: `.claude/skills/pr-workflow/SKILL.md`
- 사고 회고 (Day 11 마감 스크럼): `work_logs/scrums/2026-04-20-02.md`
- 관련 결정문: `work_logs/decisions/2026-04-22-*.md` (Day 12 승격 예정)
- CLAUDE.md §Git Commit Policy
- CLAUDE.md §Agent Execution Policy (bypassPermissions 정책)

---

## 11. 변경 이력

- **2026-04-21 v1.0**: 최초 작성. PR #33/#34 사고 반영. `pr-workflow` SKILL 동시 출시.
- **2026-04-21 v1.1**: §9 실사례 대폭 보강 — PR #34 사용자 merge 여정 / PR #33 "사고 → 리뷰 → 패치 → merge → 빌드 → 배포" end-to-end 12단계 타임라인 / Phase 0 합의 실제 텍스트 / 재사용 템플릿 2종 추가. 교훈 5개 정리.
