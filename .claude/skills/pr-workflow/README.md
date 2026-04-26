# PR 작업 가드레일

> "에이전트가 'PR 까지 갈지, merge 까지 갈지'를 임의로 결정하면 사용자 통제권이 사라진다."

## 언제 사용하나

- PR 생성/push/merge 등 Git 원격 작업을 수행할 때
- 에이전트에게 PR 관련 작업을 위임할 때
- merge 후 로컬/원격 branch 정리가 필요할 때

## 핵심 흐름

1. **Phase 0 -- 사전 합의**: 산출 범위(L1~L6), branch 정책, merge 권한, 사후 정리 방식 확인
2. **Phase 1 -- 작업 실행**: 변경 파악, branch 작업, commit, push, PR 생성 (합의 범위 내)
3. **Phase 2 -- 사후 보고**: 산출 보고 (scope, branch, commits, PR URL, 외부 변경 건수)
4. **Phase 3 -- PR 후속 정리**: `scripts/check-merged-pr.sh`로 merged branch 삭제 + main 동기화

## 관련 문서

- `scripts/check-merged-pr.sh` -- merged PR branch 정리 스크립트
- `.claude/skills/code-fix/SKILL.md` -- 코드 수정 워크플로우 (PR 전 단계)

## 변경 이력

| 날짜 | 버전 | 내용 |
|------|------|------|
| 2026-04-21 | v1.0 | 최초 작성 (PR #33/#34 사용자 통제권 누락 사고 반영) |
| 2026-04-21 | v1.1 | Phase 3 추가 (merged PR 정리 스크립트) |
