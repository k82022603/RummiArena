---
name: commit-push
description: 커밋+푸시 표준 절차. origin(GitHub) + gitlab 양쪽 push 의무화. feature branch + PR 정식 프로세스 강제. 데일리 마감/세션 중 모든 커밋에 적용.
---

# Commit & Push 표준 절차

> "origin(GitHub)이 main이고, GitLab은 GitHub을 따라간다."
> — 애벌레 (2026-04-26)

## Purpose

모든 커밋+푸시에 일관된 정책을 적용한다. 오늘(2026-04-26) 세션에서 발견된 두 가지 위반을 구조적으로 방지:
1. **GitLab push 누락** — origin만 push하고 gitlab 빠뜨림
2. **main 직접 커밋** — feature branch + PR 프로세스 미준수

---

## Trigger

모든 `git commit` + `git push` 시점에 적용. 특히:
- 코드/문서 수정 후 커밋 시
- 일일마감(`daily-close`) 6단계
- 세션 중 중간 커밋 시
- E2E 이터레이션 수정 후 커밋 시

---

## 리모트 구조

```
origin  = https://github.com/k82022603/RummiArena.git   ← main (SSOT)
gitlab  = https://gitlab.com/k82022603/rummiarena.git    ← GitHub 미러
```

**GitHub(origin)이 단일 기준(SSOT)**. GitLab은 CI/CD용 미러.

---

## Phase 1: 커밋 전 점검

### 1.1 브랜치 확인
```bash
git branch --show-current
```
- **코드/문서 변경**: feature branch 사용 (`feat/`, `fix/`, `docs/`, `test/`)
- **일일마감/로그**: main 직접 커밋 허용 (예외)
- **긴급 핫픽스**: main 직접 허용, 사후 보고 필수

### 1.2 변경 내용 확인
```bash
git status --short
git diff --stat HEAD
```
- 시크릿 파일(.env, *.pem) 포함 여부 확인
- test-results/ 포함 여부 확인 (CLAUDE.md 정책: 포함)

---

## Phase 2: 커밋

### 2.1 커밋 메시지 규칙
```
<type>(<scope>): <한글 요약>

<상세 설명>

룰 ID: <관련 룰 ID>

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```

**type**: feat / fix / docs / test / chore / refactor
**scope**: frontend / game-server / ai-adapter / e2e / skill / session 등

### 2.2 커밋 실행
```bash
git add <specific files>   # git add -A 금지
git commit -m "$(cat <<'EOF'
<message>

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 3: 푸시 (양쪽 필수)

### 3.1 GitHub (origin) — 필수
```bash
git push origin <branch>
```

### 3.2 GitLab — 필수
```bash
git push gitlab <branch>
```

**GitLab push 실패 시 대응:**
- `non-fast-forward` → `git push gitlab <branch> --force` (GitHub이 SSOT이므로 force 허용)
- `protected branch` → GitLab Settings에서 force push 허용 필요 (사용자 조치)
- 네트워크 오류 → 재시도 1회, 실패 시 사용자에게 보고

### 3.3 양쪽 push 확인
```bash
echo "=== origin ===" && git log origin/<branch> --oneline -1
echo "=== gitlab ===" && git log gitlab/<branch> --oneline -1
```

두 SHA가 일치해야 한다.

---

## 예외 규칙

| 상황 | branch | main 직접 | origin push | gitlab push |
|------|--------|----------|------------|-------------|
| 코드 수정 | feature branch | ❌ 금지 | ✅ 필수 | ✅ 필수 |
| 일일마감 | main | ✅ 허용 | ✅ 필수 | ✅ 필수 |
| 세션 로그 | main | ✅ 허용 | ✅ 필수 | ✅ 필수 |
| 긴급 핫픽스 | main | ✅ 허용 (사후 보고) | ✅ 필수 | ✅ 필수 |

---

## 금지 사항

1. **origin만 push하고 gitlab 빠뜨리기 금지** (2026-04-26 교훈)
2. **main 직접 코드 커밋 금지** (일일마감/로그 예외)
3. **git add -A / git add .** 금지 — 파일 명시적 지정
4. **--no-verify** 금지
5. **main force push** 금지 (GitLab은 허용 — GitHub 미러이므로)

---

## 변경 이력

- **2026-04-26 v1.0**: 신설. origin+gitlab 양쪽 push 누락 + main 직접 커밋 위반 경험 기반.
