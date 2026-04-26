# 커밋+푸시 표준 (Commit & Push)

> "origin(GitHub)이 main이고, GitLab은 GitHub을 따라간다."

## 언제 사용하나

- 모든 `git commit` + `git push` 시점
- 일일마감(daily-close) 6단계
- E2E 이터레이션 수정 후 커밋 시

## 핵심 흐름

1. **브랜치 확인** — 코드 변경은 feature branch, 로그/마감은 main 허용
2. **커밋** — type(scope): 한글 요약 + Co-Authored-By
3. **origin push** — GitHub (SSOT)
4. **gitlab push** — GitLab 미러 (`--force` 허용)
5. **양쪽 SHA 일치 확인**

## 관련 문서

- `feedback_pr_workflow_default.md` (feature branch 의무)
- `feedback_daily_close_complete.md` (origin + gitlab push)
- `feedback_commit_proactively.md` (커밋 자율, push 명시)

## 변경 이력

| 날짜 | 버전 | 내용 |
|------|------|------|
| 2026-04-26 | 1.0 | 신설 (origin+gitlab 누락 + main 직접 커밋 위반 경험) |
